// Flyimg · 瞬图 - 最强省资源版
// 图片直接走R2公网，Worker只处理上传、统计和定时清理

export default {
  async fetch(request, env, ctx) {
    // 从环境变量获取所有配置
    const CONFIG = {
      R2_BUCKET: env.R2_BUCKET,
      R2_PUBLIC_DOMAIN: env.R2_PUBLIC_DOMAIN, // R2公有域名
      EXPIRE_HOURS: parseInt(env.EXPIRE_HOURS || '12'),
      MAX_FILE_SIZE: parseInt(env.MAX_FILE_SIZE || '20') * 1024 * 1024,
      MAX_STORAGE_SIZE: parseInt(env.MAX_STORAGE_SIZE || '1000') * 1024 * 1024,
      ALLOWED_TYPES: (env.ALLOWED_TYPES || 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml').split(','),
      CRON_SECRET: env.CRON_SECRET,
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(',') : null // 可选：限制允许的来源
    };

    // 将文件大小转换为MB用于前端显示
    CONFIG.MAX_FILE_SIZE_MB = CONFIG.MAX_FILE_SIZE / 1024 / 1024;
    // 将允许的类型转换为友好的显示格式
    CONFIG.ALLOWED_TYPES_DISPLAY = CONFIG.ALLOWED_TYPES.map(type => {
      const ext = type.split('/')[1].toUpperCase();
      return ext === 'SVG+XML' ? 'SVG' : ext;
    }).join('、');

    // CORS处理（支持跨域）
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      };
      
      // 如果配置了允许的来源，验证Origin；否则允许所有
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
    
    // 通用响应头（带CORS）
    const getResponseHeaders = () => {
      const headers = {
        'Content-Type': 'application/json'
      };
      
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
    
    // 获取公共配置接口
    if (request.method === 'GET' && url.pathname === '/config') {
      return jsonResponse({
        success: true,
        expireHours: CONFIG.EXPIRE_HOURS,
        maxFileSize: CONFIG.MAX_FILE_SIZE,
        maxFileSizeMB: CONFIG.MAX_FILE_SIZE_MB,
        allowedTypes: CONFIG.ALLOWED_TYPES,
        allowedTypesDisplay: CONFIG.ALLOWED_TYPES_DISPLAY,
        maxStorageSize: CONFIG.MAX_STORAGE_SIZE
      }, 200, {
        'Cache-Control': 'public, max-age=3600'
      });
    }
    
    // 上传图片
    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        // 检查速率限制
        const rateLimitCheck = checkRateLimit(env, 'upload');
        if (rateLimitCheck.limited) {
          return jsonResponse({ 
            error: '上传过于频繁，请稍后再试',
            rateLimited: true
          }, 429);
        }
        
        // 先检查存储容量
        const storageInfo = await getStorageInfo(env.R2_BUCKET);
        if (storageInfo.totalSize >= CONFIG.MAX_STORAGE_SIZE) {
          return jsonResponse({ 
            error: '存储空间已满，请等待过期图片自动清理后再试',
            storageFull: true
          }, 429);
        }
        
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          return jsonResponse({ error: '未上传文件' }, 400);
        }
        
        if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
          return jsonResponse({ error: `不支持的文件类型，仅支持：${CONFIG.ALLOWED_TYPES_DISPLAY}` }, 400);
        }
        
        if (file.size > CONFIG.MAX_FILE_SIZE) {
          return jsonResponse({ error: `文件大小超过${CONFIG.MAX_FILE_SIZE_MB}MB限制` }, 400);
        }
        
        // 生成唯一文件名
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const ext = getFileExtension(file.type);
        const fileName = `${timestamp}-${randomStr}.${ext}`;
        
        // 计算过期时间
        const expireAt = timestamp + CONFIG.EXPIRE_HOURS * 60 * 60 * 1000;
        
        // 上传到R2
        await env.R2_BUCKET.put(fileName, file.stream(), {
          httpMetadata: {
            contentType: file.type,
            cacheControl: 'public, max-age=31536000'
          },
          customMetadata: {
            expireAt: expireAt.toString()
          }
        });
        
        // 生成R2公网直链（强制使用https）
        const domain = CONFIG.R2_PUBLIC_DOMAIN.replace(/^http:\/\//i, 'https://');
        const imageUrl = `${domain}/${fileName}`;
        
        return jsonResponse({
          success: true,
          url: imageUrl,
          markdown: `![图片](${imageUrl})`,
          html: `<img src="${imageUrl}" alt="flyimg">`,
          expireAt: new Date(expireAt).toISOString(),
          expireHours: CONFIG.EXPIRE_HOURS
        });
        
      } catch (error) {
        console.error('上传失败:', error);
        return jsonResponse({ error: '上传失败' }, 500);
      }
    }
    
    // 获取存储统计信息
    if (request.method === 'GET' && url.pathname === '/stats') {
      try {
        const storageInfo = await getStorageInfo(env.R2_BUCKET);
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
    
    // 清理过期图片（由Cron触发或手动调用）
    if (request.method === 'POST' && url.pathname === '/cleanup') {
      // 验证请求是否来自Cloudflare Cron
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${CONFIG.CRON_SECRET}`) {
        return new Response('未授权', { status: 401 });
      }
      
      try {
        const deletedCount = await cleanupExpiredFiles(env.R2_BUCKET);
        
        return jsonResponse({
          success: true,
          message: `清理完成，删除了${deletedCount}张过期图片`
        });
        
      } catch (error) {
        console.error('清理失败:', error);
        return jsonResponse({ error: '清理失败' }, 500);
      }
    }
    
    return new Response('Flyimg · 瞬图 API', { status: 200 });
  },
  
  // Cron触发器 - 直接调用清理函数
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      cleanupExpiredFiles(env.R2_BUCKET)
        .then(count => console.log(`定时清理完成，删除了${count}张过期图片`))
        .catch(err => console.error('定时清理失败:', err))
    );
  }
};

// 从MIME类型获取文件扩展名
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

// 清理过期文件的核心函数
async function cleanupExpiredFiles(bucket) {
  let deletedCount = 0;
  let cursor = undefined;
  
  do {
    const listResult = await bucket.list({ cursor, include: ['customMetadata'] });
    
    const expiredKeys = [];
    for (const object of listResult.objects) {
      const expireAt = parseInt(object.customMetadata?.expireAt || '0');
      if (Date.now() > expireAt) {
        expiredKeys.push(object.key);
      }
    }
    
    // 批量删除过期文件
    if (expiredKeys.length > 0) {
      await Promise.all(expiredKeys.map(key => bucket.delete(key)));
      deletedCount += expiredKeys.length;
    }
    
    cursor = listResult.cursor;
  } while (cursor);
  
  return deletedCount;
}

// 简单的速率限制（使用KV存储或内存缓存）
function checkRateLimit(env, action) {
  // 如果没有配置KV，使用简单的内存限制（重启后重置）
  if (!globalThis.__rateLimits) {
    globalThis.__rateLimits = new Map();
  }
  
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分钟窗口
  const maxRequests = 10; // 每分钟最多10次上传
  
  const key = `${action}`;
  const limits = globalThis.__rateLimits.get(key) || [];
  
  // 清理过期记录
  const recentRequests = limits.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return { limited: true };
  }
  
  recentRequests.push(now);
  globalThis.__rateLimits.set(key, recentRequests);
  
  return { limited: false };
}

// 获取存储信息（复用函数）
async function getStorageInfo(bucket) {
  let totalFiles = 0;
  let totalSize = 0;
  let cursor = undefined;
  
  do {
    const listResult = await bucket.list({ cursor, include: ['customMetadata'] });
    
    for (const object of listResult.objects) {
      const expireAt = parseInt(object.customMetadata?.expireAt || '0');
      // 只统计未过期的文件
      if (Date.now() <= expireAt) {
        totalFiles++;
        totalSize += object.size;
      }
    }
    
    cursor = listResult.cursor;
  } while (cursor);
  
  return {
    totalFiles,
    totalSize,
    formattedSize: formatBytes(totalSize)
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
