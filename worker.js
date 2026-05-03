const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/bmp': 'bmp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi'
};

const FILE_SIGNATURES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'image/bmp': [[0x42, 0x4D]],
  'image/x-icon': [[0x00, 0x00, 0x01, 0x00]],
  'audio/mpeg': [[0xFF, 0xFB], [0xFF, 0xFA], [0x49, 0x44, 0x33]],
  'audio/wav': [[0x52, 0x49, 0x46, 0x46]],
  'video/mp4': [[0x00, 0x00, 0x00], [0x66, 0x74, 0x79, 0x70]],
  'video/webm': [[0x1A, 0x45, 0xDF, 0xA3]],
  'video/quicktime': [[0x00, 0x00, 0x00], [0x66, 0x74, 0x79, 0x70]],
};

const API_ROUTES = ['/upload', '/delete', '/clean', '/stats', '/my-images', '/all-images'];

const STATIC_EXTENSIONS = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot'];

let cachedConfig = null;

function isAPIRequest(pathname) {
  return API_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
}

function isStaticAsset(pathname) {
  return STATIC_EXTENSIONS.some(ext => pathname.toLowerCase().endsWith(ext));
}

function isValidUserTag(tag) {
  if (!tag || tag.length > 32) return false;
  return /^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/.test(tag);
}

function isUserTagRoute(pathname) {
  if (pathname === '/' || pathname === '') return false;
  const segments = pathname.split('/').filter(s => s.length > 0);
  if (segments.length !== 1) return false;
  const tag = segments[0];
  return isValidUserTag(tag);
}

function getUserTagFromPath(pathname) {
  const segments = pathname.split('/').filter(s => s.length > 0);
  return segments[0] || null;
}

async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const bufferA = encoder.encode(a);
  const bufferB = encoder.encode(b);
  
  if (bufferA.length !== bufferB.length) {
    return !crypto.subtle.timingSafeEqual(bufferA, bufferA);
  }
  
  return crypto.subtle.timingSafeEqual(bufferA, bufferB);
}

function sanitizeR2Domain(domain) {
  if (!domain) return '';
  let cleaned = domain.trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  cleaned = cleaned.replace(/^http:\/\//i, 'https://');
  try {
    const url = new URL(cleaned);
    return url.origin;
  } catch {
    console.error('Invalid R2_PUBLIC_DOMAIN:', domain);
    return '';
  }
}

function sanitizeUserTag(tag) {
  if (!tag) return 'default';
  const cleaned = String(tag).trim().slice(0, 32);
  if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/.test(cleaned)) {
    return 'default';
  }
  return cleaned || 'default';
}

function getConfig(env) {
  if (cachedConfig) return cachedConfig;
  
  const expireHours = parseInt(env.EXPIRE_HOURS || '12', 10);
  
  cachedConfig = {
    R2_BUCKET: env.R2_BUCKET,
    R2_PUBLIC_DOMAIN: sanitizeR2Domain(env.R2_PUBLIC_DOMAIN),
    EXPIRE_HOURS: expireHours,
    MAX_FILE_SIZE: parseInt(env.MAX_FILE_SIZE || '20', 10) * 1024 * 1024,
    MAX_STORAGE_SIZE: parseInt(env.MAX_STORAGE_SIZE || '1000', 10) * 1024 * 1024,
    ALLOWED_TYPES: (env.ALLOWED_TYPES || 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml').split(',').map(t => t.trim()),
    CRON_SECRET: env.CRON_SECRET || '',
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(',').map(t => t.trim()) : null,
    CACHE_MAX_AGE: expireHours * 3600
  };
  
  return cachedConfig;
}

function getResponseHeaders(origin, CONFIG) {
  const headers = { 'Content-Type': 'application/json' };
  if (CONFIG.CORS_ALLOWED_ORIGINS) {
    if (origin && CONFIG.CORS_ALLOWED_ORIGINS.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Vary'] = 'Origin';
    }
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

function jsonResponse(data, status, origin, CONFIG, extraHeaders = {}) {
  const headers = { ...getResponseHeaders(origin, CONFIG), ...extraHeaders };
  return new Response(JSON.stringify(data), { status, headers });
}

async function verifyAdmin(request, CONFIG) {
  const secret = request.headers.get('X-Cron-Secret') || '';
  return timingSafeEqual(secret, CONFIG.CRON_SECRET);
}

function getFileExtension(mimeType) {
  return MIME_TO_EXT[mimeType] || mimeType.split('/')[1] || 'bin';
}

function generateFileName(mimeType) {
  const timestamp = Date.now();
  const random1 = Math.random().toString(36).substring(2, 10);
  const random2 = crypto.randomUUID().split('-')[0];
  const ext = getFileExtension(mimeType);
  return `${timestamp}-${random1}-${random2}.${ext}`;
}

async function verifyFileSignature(file, mimeType) {
  if (mimeType === 'image/svg+xml' || mimeType === 'audio/ogg' || 
      mimeType === 'audio/aac' || mimeType === 'audio/mp4' ||
      mimeType === 'video/x-msvideo') {
    return true;
  }

  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures) return true;

  try {
    const chunk = file.slice(0, 16);
    const buffer = await chunk.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    for (const sig of signatures) {
      let match = true;
      for (let i = 0; i < sig.length; i++) {
        if (bytes[i] !== sig[i]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function handleOptions(request, CONFIG) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
    'Access-Control-Max-Age': '86400'
  };
  
  if (CONFIG.CORS_ALLOWED_ORIGINS) {
    if (origin && CONFIG.CORS_ALLOWED_ORIGINS.includes(origin)) {
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

async function handleUpload(request, env, CONFIG) {
  const origin = request.headers.get('Origin');
  
  try {
    const storageCheck = await env.DB.prepare(
      'SELECT COALESCE(SUM(size), 0) as totalSize FROM images WHERE expire_at > ?'
    ).bind(new Date().toISOString()).first();

    if (storageCheck.totalSize >= CONFIG.MAX_STORAGE_SIZE) {
      return jsonResponse({
        error: '存储空间已满，请等待过期文件自动清理后再试',
        storageFull: true
      }, 429, origin, CONFIG);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const rawUserTag = formData.get('user_tag');
    const userTag = sanitizeUserTag(rawUserTag);

    if (!file) {
      return jsonResponse({ error: '未上传文件' }, 400, origin, CONFIG);
    }

    if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
      const allowedDisplay = CONFIG.ALLOWED_TYPES.map(t => {
        const ext = getFileExtension(t);
        return ext.toUpperCase();
      }).join('、');
      return jsonResponse({ error: `不支持的文件类型，仅支持：${allowedDisplay}` }, 400, origin, CONFIG);
    }

    if (file.size > CONFIG.MAX_FILE_SIZE) {
      const maxMB = CONFIG.MAX_FILE_SIZE / (1024 * 1024);
      return jsonResponse({ error: `文件大小超过${maxMB}MB限制` }, 400, origin, CONFIG);
    }

    if (!await verifyFileSignature(file, file.type)) {
      return jsonResponse({ error: '文件内容与声明类型不匹配，可能存在安全风险' }, 400, origin, CONFIG);
    }

    const fileName = generateFileName(file.type);
    const timestamp = Date.now();
    const expireAt = timestamp + CONFIG.EXPIRE_HOURS * 60 * 60 * 1000;
    const expireAtISO = new Date(expireAt).toISOString();
    const cacheControl = `public, max-age=${CONFIG.CACHE_MAX_AGE}`;

    try {
      await env.R2_BUCKET.put(fileName, file.stream(), {
        httpMetadata: {
          contentType: file.type,
          cacheControl: cacheControl
        },
        customMetadata: {
          userTag: userTag
        }
      });
    } catch (r2Error) {
      console.error('R2 upload failed:', r2Error);
      return jsonResponse({ error: '文件存储失败，请稍后重试' }, 500, origin, CONFIG);
    }

    await env.DB.prepare(
      'INSERT INTO images (filename, size, user_tag, expire_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      fileName,
      file.size,
      userTag,
      expireAtISO,
      new Date(timestamp).toISOString()
    ).run();

    const imageUrl = `${CONFIG.R2_PUBLIC_DOMAIN}/${fileName}`;

    return jsonResponse({
      success: true,
      url: imageUrl,
      markdown: `![图片](${imageUrl})`,
      html: `<img src="${imageUrl}" alt="flyimg">`,
      expireAt: expireAtISO,
      expireHours: CONFIG.EXPIRE_HOURS
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Upload failed:', error);
    return jsonResponse({ error: '上传失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function handleMyImages(request, env, CONFIG) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  
  try {
    const rawUserTag = url.searchParams.get('user_tag');
    const userTag = sanitizeUserTag(rawUserTag);
    
    if (userTag === 'default' && rawUserTag && rawUserTag !== 'default') {
      return jsonResponse({ error: '用户名只能包含字母、数字、下划线、横线和中文，最长32个字符' }, 400, origin, CONFIG);
    }

    const now = new Date().toISOString();
    const { results } = await env.DB.prepare(
      'SELECT filename, size, expire_at, created_at FROM images WHERE user_tag = ? AND expire_at > ? ORDER BY created_at DESC'
    ).bind(userTag, now).all();

    return jsonResponse({
      success: true,
      images: results.map(img => ({
        ...img,
        url: `${CONFIG.R2_PUBLIC_DOMAIN}/${img.filename}`,
        expired: false
      }))
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Query failed:', error);
    return jsonResponse({ error: '查询失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function handleAllImages(request, env, CONFIG) {
  const origin = request.headers.get('Origin');
  
  if (!await verifyAdmin(request, CONFIG)) {
    return jsonResponse({ error: '未授权，请提供有效的X-Cron-Secret' }, 401, origin, CONFIG);
  }

  try {
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare(
      'SELECT filename, size, user_tag, expire_at, created_at FROM images ORDER BY created_at DESC'
    ).all();

    return jsonResponse({
      success: true,
      images: results.map(img => ({
        ...img,
        url: `${CONFIG.R2_PUBLIC_DOMAIN}/${img.filename}`,
        expired: img.expire_at < now
      }))
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Query failed:', error);
    return jsonResponse({ error: '查询失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function handleDelete(request, env, CONFIG) {
  const origin = request.headers.get('Origin');
  
  if (!await verifyAdmin(request, CONFIG)) {
    return jsonResponse({ error: '未授权，请提供有效的X-Cron-Secret' }, 401, origin, CONFIG);
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '无效的请求体' }, 400, origin, CONFIG);
    }
    
    const { filename } = body;
    if (!filename) {
      return jsonResponse({ error: '缺少filename参数' }, 400, origin, CONFIG);
    }

    if (!/^[a-zA-Z0-9_\-.]+$/.test(filename)) {
      return jsonResponse({ error: '无效的文件名' }, 400, origin, CONFIG);
    }

    try {
      await env.R2_BUCKET.delete(filename);
    } catch (r2Error) {
      console.error('R2 delete failed:', r2Error);
    }

    await env.DB.prepare('DELETE FROM images WHERE filename = ?').bind(filename).run();

    return jsonResponse({
      success: true,
      message: '文件已删除'
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Delete failed:', error);
    return jsonResponse({ error: '删除失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function handleClean(request, env, CONFIG) {
  const origin = request.headers.get('Origin');
  
  if (!await verifyAdmin(request, CONFIG)) {
    return jsonResponse({ error: '未授权，请提供有效的X-Cron-Secret' }, 401, origin, CONFIG);
  }

  try {
    const deletedCount = await cleanupExpiredFiles(env);
    return jsonResponse({
      success: true,
      message: `清理完成，删除了${deletedCount}张过期图片`
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Clean failed:', error);
    return jsonResponse({ error: '清理失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function handleStats(request, env, CONFIG) {
  const origin = request.headers.get('Origin');
  
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
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Stats failed:', error);
    return jsonResponse({ error: '获取统计失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function cleanupExpiredFiles(env) {
  const now = new Date().toISOString();

  const { results } = await env.DB.prepare(
    'SELECT filename FROM images WHERE expire_at <= ?'
  ).bind(now).all();

  if (results.length === 0) return 0;

  await Promise.allSettled(results.map(r => env.R2_BUCKET.delete(r.filename)));
  await env.DB.prepare('DELETE FROM images WHERE expire_at <= ?').bind(now).run();

  return results.length;
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

export default {
  async fetch(request, env, ctx) {
    cachedConfig = null;
    const CONFIG = getConfig(env);
    const url = new URL(request.url);
    
    if (isAPIRequest(url.pathname)) {
      if (request.method === 'OPTIONS') {
        return handleOptions(request, CONFIG);
      }
      
      const origin = request.headers.get('Origin');
      
      if (url.pathname === '/upload' && request.method === 'POST') {
        return handleUpload(request, env, CONFIG);
      }
      
      if (url.pathname === '/my-images' && request.method === 'GET') {
        return handleMyImages(request, env, CONFIG);
      }
      
      if (url.pathname === '/all-images' && request.method === 'GET') {
        return handleAllImages(request, env, CONFIG);
      }
      
      if (url.pathname === '/delete' && request.method === 'POST') {
        return handleDelete(request, env, CONFIG);
      }
      
      if (url.pathname === '/clean' && request.method === 'POST') {
        return handleClean(request, env, CONFIG);
      }
      
      if (url.pathname === '/stats' && request.method === 'GET') {
        return handleStats(request, env, CONFIG);
      }
      
      return jsonResponse({ error: 'Not Found' }, 404, origin, CONFIG);
    }
    
    if (isUserTagRoute(url.pathname)) {
      const userTag = getUserTagFromPath(url.pathname);
      const assetUrl = new URL('/[usertag]/index.html', url.origin);
      const assetRequest = new Request(assetUrl, request);
      return env.ASSETS.fetch(assetRequest);
    }
    
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      cleanupExpiredFiles(env)
        .then(count => console.log(`Cleanup completed: ${count} expired files deleted`))
        .catch(err => console.error('Cleanup failed:', err))
    );
  }
};
