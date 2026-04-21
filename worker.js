export default {
  async fetch(request, env, ctx) {
    const CONFIG = {
      R2_BUCKET: env.R2_BUCKET,
      R2_PUBLIC_DOMAIN: env.R2_PUBLIC_DOMAIN,
      EXPIRE_HOURS: parseInt(env.EXPIRE_HOURS || '12'),
      MAX_FILE_SIZE: parseInt(env.MAX_FILE_SIZE || '20') * 1024 * 1024,
      MAX_STORAGE_SIZE: parseInt(env.MAX_STORAGE_SIZE || '1000') * 1024 * 1024,
      ALLOWED_TYPES: (env.ALLOWED_TYPES || 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml').split(','),
      CRON_SECRET: env.CRON_SECRET,
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(',') : null
    };

    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
        'Access-Control-Max-Age': '86400'
      };
      if (CONFIG.CORS_ALLOWED_ORIGINS) {
        if (CONFIG.CORS_ALLOWED_ORIGINS.includes(origin)) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers['Vary'] = 'Origin';
        } else {
          return new Response('Forbidden', { status: 403 });
        }
      } else {
        headers['Access-Control-Allow-Origin'] = '*';
      }
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    const getResponseHeaders = () => {
      const headers = { 'Content-Type': 'application/json' };
      if (CONFIG.CORS_ALLOWED_ORIGINS) {
        if (CONFIG.CORS_ALLOWED_ORIGINS.includes(origin)) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers['Vary'] = 'Origin';
        }
      } else {
        headers['Access-Control-Allow-Origin'] = '*';
      }
      return headers;
    };

    const jsonResponse = (data, status = 200, extraHeaders = {}) => {
      const headers = { ...getResponseHeaders(), ...extraHeaders };
      return new Response(JSON.stringify(data), { status, headers });
    };

    const verifyAdmin = () => {
      const secret = request.headers.get('X-Cron-Secret');
      return secret === CONFIG.CRON_SECRET;
    };

    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        const storageInfo = await getStorageInfo(env.DB);
        if (storageInfo.totalSize >= CONFIG.MAX_STORAGE_SIZE) {
          return jsonResponse({
            error: '存储空间已满，请等待过期图片自动清理后再试',
            storageFull: true
          }, 429);
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const userTag = formData.get('user_tag') || 'anonymous';
        const md5Hash = formData.get('md5') || null;

        if (!file) {
          return jsonResponse({ error: '未上传文件' }, 400);
        }

        if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
          const allowedDisplay = CONFIG.ALLOWED_TYPES.map(t => {
            const ext = getFileExtension(t);
            return ext.toUpperCase();
          }).join('、');
          return jsonResponse({ error: `不支持的文件类型，仅支持：${allowedDisplay}` }, 400);
        }

        if (file.size > CONFIG.MAX_FILE_SIZE) {
          const maxMB = CONFIG.MAX_FILE_SIZE / (1024 * 1024);
          return jsonResponse({ error: `文件大小超过${maxMB}MB限制` }, 400);
        }

        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const ext = getFileExtension(file.type);
        const fileName = md5Hash ? `${md5Hash}.${ext}` : `${timestamp}-${randomStr}.${ext}`;

        if (md5Hash) {
          const existing = await env.DB.prepare(
            'SELECT url, expire_at FROM images WHERE filename = ? LIMIT 1'
          ).bind(fileName).first();

          if (existing) {
            const expireAt = new Date(existing.expire_at).getTime();
            if (Date.now() < expireAt) {
              return jsonResponse({
                success: true,
                url: existing.url,
                markdown: `![图片](${existing.url})`,
                html: `<img src="${existing.url}" alt="flyimg">`,
                expireAt: new Date(expireAt).toISOString(),
                expireHours: CONFIG.EXPIRE_HOURS,
                cached: true
              });
            } else {
              await env.DB.prepare('DELETE FROM images WHERE filename = ?').bind(fileName).run();
            }
          }
        }

        const expireAt = timestamp + CONFIG.EXPIRE_HOURS * 60 * 60 * 1000;
        const expireAtISO = new Date(expireAt).toISOString();

        await env.R2_BUCKET.put(fileName, file.stream(), {
          httpMetadata: {
            contentType: file.type,
            cacheControl: 'public, max-age=43200'
          },
          customMetadata: {
            expireAt: expireAt.toString()
          }
        });

        const domain = CONFIG.R2_PUBLIC_DOMAIN.replace(/^http:\/\//i, 'https://');
        const imageUrl = `${domain}/${fileName}`;

        await env.DB.prepare(
          'INSERT INTO images (filename, url, size, user_tag, expire_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          fileName,
          imageUrl,
          file.size,
          userTag,
          expireAtISO,
          new Date(timestamp).toISOString()
        ).run();

        return jsonResponse({
          success: true,
          url: imageUrl,
          markdown: `![图片](${imageUrl})`,
          html: `<img src="${imageUrl}" alt="flyimg">`,
          expireAt: expireAtISO,
          expireHours: CONFIG.EXPIRE_HOURS,
          cached: false
        });

      } catch (error) {
        console.error('上传失败:', error);
        return jsonResponse({ error: '上传失败' }, 500);
      }
    }

    if (request.method === 'GET' && url.pathname === '/my-images') {
      try {
        const userTag = url.searchParams.get('user_tag');
        if (!userTag) {
          return jsonResponse({ error: '缺少user_tag参数' }, 400);
        }

        const now = new Date().toISOString();
        const { results } = await env.DB.prepare(
          'SELECT filename, url, size, expire_at, created_at FROM images WHERE user_tag = ? AND expire_at > ? ORDER BY created_at DESC'
        ).bind(userTag, now).all();

        return jsonResponse({
          success: true,
          images: results.map(img => ({
            ...img,
            expired: false
          }))
        });

      } catch (error) {
        console.error('查询失败:', error);
        return jsonResponse({ error: '查询失败' }, 500);
      }
    }

    if (request.method === 'GET' && url.pathname === '/all-images') {
      if (!verifyAdmin()) {
        return jsonResponse({ error: '未授权，请提供有效的X-Cron-Secret' }, 401);
      }

      try {
        const now = new Date().toISOString();
        const { results } = await env.DB.prepare(
          'SELECT filename, url, size, user_tag, expire_at, created_at FROM images ORDER BY created_at DESC'
        ).all();

        return jsonResponse({
          success: true,
          images: results.map(img => ({
            ...img,
            expired: img.expire_at < now
          }))
        });

      } catch (error) {
        console.error('查询失败:', error);
        return jsonResponse({ error: '查询失败' }, 500);
      }
    }

    if (request.method === 'POST' && url.pathname === '/delete') {
      if (!verifyAdmin()) {
        return jsonResponse({ error: '未授权，请提供有效的X-Cron-Secret' }, 401);
      }

      try {
        const { filename } = await request.json();
        if (!filename) {
          return jsonResponse({ error: '缺少filename参数' }, 400);
        }

        await env.R2_BUCKET.delete(filename);
        await env.DB.prepare('DELETE FROM images WHERE filename = ?').bind(filename).run();

        return jsonResponse({
          success: true,
          message: '文件已删除'
        });

      } catch (error) {
        console.error('删除失败:', error);
        return jsonResponse({ error: '删除失败' }, 500);
      }
    }

    if (request.method === 'POST' && url.pathname === '/clean') {
      if (!verifyAdmin()) {
        return jsonResponse({ error: '未授权，请提供有效的X-Cron-Secret' }, 401);
      }

      try {
        const deletedCount = await cleanupExpiredFiles(env);
        return jsonResponse({
          success: true,
          message: `清理完成，删除了${deletedCount}张过期图片`
        });

      } catch (error) {
        console.error('清理失败:', error);
        return jsonResponse({ error: '清理失败' }, 500);
      }
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      try {
        const storageInfo = await getStorageInfo(env.DB);
        const maxStorageFormatted = formatBytes(CONFIG.MAX_STORAGE_SIZE);
        const usagePercent = Math.round((storageInfo.totalSize / CONFIG.MAX_STORAGE_SIZE) * 100);

        return jsonResponse({
          success: true,
          totalFiles: storageInfo.totalFiles,
          totalSize: storageInfo.totalSize,
          formattedSize: storageInfo.formattedSize,
          maxStorageSize: CONFIG.MAX_STORAGE_SIZE,
          maxStorageFormatted: maxStorageFormatted,
          usagePercent: usagePercent,
          isFull: storageInfo.totalSize >= CONFIG.MAX_STORAGE_SIZE
        });

      } catch (error) {
        console.error('获取统计失败:', error);
        return jsonResponse({ error: '获取统计失败' }, 500);
      }
    }

    return new Response('Flyimg · 瞬传・瞬用', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      cleanupExpiredFiles(env)
        .then(count => console.log(`定时清理完成，删除了${count}张过期图片`))
        .catch(err => console.error('定时清理失败:', err))
    );
  }
};

function getFileExtension(mimeType) {
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'image/bmp': 'bmp'
  };
  return mimeToExt[mimeType] || mimeType.split('/')[1] || 'jpg';
}

async function cleanupExpiredFiles(env) {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    'SELECT filename FROM images WHERE expire_at <= ?'
  ).bind(now).all();

  if (results.length === 0) return 0;

  const filenames = results.map(r => r.filename);

  await Promise.all(filenames.map(key => env.R2_BUCKET.delete(key)));

  await env.DB.prepare(
    'DELETE FROM images WHERE expire_at <= ?'
  ).bind(now).run();

  return filenames.length;
}

async function getStorageInfo(db) {
  const now = new Date().toISOString();
  const result = await db.prepare(
    'SELECT COUNT(*) as totalFiles, COALESCE(SUM(size), 0) as totalSize FROM images WHERE expire_at > ?'
  ).bind(now).first();

  return {
    totalFiles: result.totalFiles,
    totalSize: result.totalSize,
    formattedSize: formatBytes(result.totalSize)
  };
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
