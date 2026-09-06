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
  'image/bmp': [[0x42, 0x4D]],
  'image/x-icon': [[0x00, 0x00, 0x01, 0x00]],
  'audio/mpeg': [[0xFF, 0xFB], [0xFF, 0xFA], [0x49, 0x44, 0x33]],
  'video/webm': [[0x1A, 0x45, 0xDF, 0xA3]],
};

const RIFF_SUBTYPES = {
  'image/webp': [0x57, 0x45, 0x42, 0x50],
  'audio/wav': [0x57, 0x41, 0x56, 0x45],
};

const FTYPE_FORMATS = new Set(['video/mp4', 'video/quicktime']);

const SVG_DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /\bon\w+\s*=/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /<foreignobject[\s>]/i,
  /expression\s*\(/i,
  /<embed[\s>]/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /data\s*:\s*text\/html/i,
];

const UNSIGNABLE_TYPES = new Set([
  'image/svg+xml', 'audio/ogg', 'audio/aac',
  'audio/mp4', 'video/x-msvideo',
]);

const API_ROUTES = [
  '/upload', '/delete', '/clean', '/stats', '/my-images', '/all-images', '/renew', '/content',
  '/upload-folder/init', '/upload-folder/file', '/upload-folder/finish', '/upload-folder/abort',
  '/folder-files',
];

const ROUTE_METHODS = {
  '/upload': 'POST',
  '/delete': 'POST',
  '/clean': 'POST',
  '/stats': 'GET',
  '/my-images': 'GET',
  '/all-images': 'GET',
  '/renew': 'POST',
  '/content': 'GET',
  '/upload-folder/init': 'POST',
  '/upload-folder/file': 'POST',
  '/upload-folder/finish': 'POST',
  '/upload-folder/abort': 'POST',
  '/folder-files': 'GET',
};

const STATIC_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg',
  '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot',
]);

const RATE_LIMITS = {
  upload: { windowMs: 60000, max: 30 },
  // 文件夹上传逐文件请求，放宽限流（每个文件一次请求）
  folderUpload: { windowMs: 60000, max: 600 },
  api: { windowMs: 60000, max: 120 },
};

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const PERMANENT_EXPIRY = '2099-12-31T23:59:59Z';

const rateLimitStore = new Map();

let cachedConfig = null;

function checkRateLimit(ip, type) {
  const limit = RATE_LIMITS[type];
  if (!limit) return true;

  const now = Date.now();
  const key = `${ip}:${type}`;
  const record = rateLimitStore.get(key);

  if (!record || now - record.startTime > limit.windowMs) {
    rateLimitStore.set(key, { startTime: now, count: 1 });
    return true;
  }

  if (record.count >= limit.max) {
    return false;
  }

  record.count++;
  return true;
}

function cleanupRateLimits() {
  const now = Date.now();
  const maxWindow = 120000;
  for (const [key, record] of rateLimitStore) {
    if (now - record.startTime > maxWindow) {
      rateLimitStore.delete(key);
    }
  }
}

function isAPIRequest(pathname) {
  return API_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
}

function isStaticAsset(pathname) {
  const lower = pathname.toLowerCase();
  for (const ext of STATIC_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function getFileExtension(mimeType) {
  if (MIME_TO_EXT[mimeType]) return MIME_TO_EXT[mimeType];
  if (!mimeType || mimeType === 'application/octet-stream') return 'bin';
  const sub = mimeType.split('/')[1];
  return sub || 'bin';
}

function sanitizeOriginalName(name) {
  if (!name) return '';
  const dotIndex = name.lastIndexOf('.');
  let base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  base = base.replace(/[^\w\u4e00-\u9fa5-]/g, '_').replace(/_+/g, '_').replace(/^[-_]+|[-_]+$/g, '');
  return base.slice(0, 80);
}

function generateFileName(mimeType, originalExt, originalName) {
  const timestamp = Date.now();
  const random1 = Math.random().toString(36).substring(2, 10);
  let ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    const cleaned = originalExt ? originalExt.toLowerCase().replace(/^[.]+/, '') : '';
    ext = cleaned || getFileExtension(mimeType);
  }
  const base = sanitizeOriginalName(originalName);
  return base
    ? `${timestamp}-${random1}-${base}.${ext}`
    : `${timestamp}-${random1}.${ext}`;
}

/**
 * 校验 R2 key（支持文件夹路径）：
 * 允许 '/' 分隔的路径，拒绝控制字符、反斜杠、前导/末尾斜杠、空段、. 与 .. 段。
 */
function isValidKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.length > 512) return false;
  if (/[\x00-\x1f\x7f\\]/.test(key)) return false;
  if (key.startsWith('/') || key.endsWith('/')) return false;
  return key.split('/').every(seg => seg && seg !== '.' && seg !== '..');
}

/** 文件夹唯一 key（沿用单文件命名的 时间戳-随机 风格，显示名与 R2 一致） */
function generateFolderKey() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/** 类型白名单：按扩展名校验（与单文件上传一致），未开放类型直接跳过该文件 */
function isTypeAllowed(filename, CONFIG) {
  if (CONFIG.UNLIMITED_TYPES) return true;
  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
  return !!(ext && CONFIG.ALLOWED_TYPES.includes(ext));
}

/** 当前已用存储（单文件 + 有效文件夹），用于剩余空间校验与统计 */
async function getUsedStorage(db, now) {
  const isoNow = now || new Date().toISOString();
  const fileResult = await db.prepare(
    'SELECT COALESCE(SUM(size), 0) as s FROM images WHERE expire_at > ?'
  ).bind(isoNow).first();
  const folderResult = await db.prepare(
    "SELECT COALESCE(SUM(size), 0) as s FROM folders WHERE expire_at > ? AND status = ?"
  ).bind(isoNow, 'active').first();
  return (fileResult.s || 0) + (folderResult.s || 0);
}

/** 按 key 前缀删除 R2 对象（文件夹整体删除 / 清理用），自动翻页 */
async function deleteR2Prefix(env, prefix) {
  const searchPrefix = `${prefix}/`;
  let cursor;
  do {
    const listed = await env.R2_BUCKET.list({ prefix: searchPrefix, cursor });
    await Promise.allSettled(listed.objects.map(o => env.R2_BUCKET.delete(o.key)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  if (aBuf.length !== bBuf.length) {
    crypto.subtle.timingSafeEqual(aBuf, aBuf);
    return false;
  }

  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

async function verifyAdmin(request, CONFIG) {
  const secret = request.headers.get('X-Cron-Secret') || '';
  return timingSafeEqual(secret, CONFIG.CRON_SECRET);
}

async function verifyFileSignature(file, mimeType) {
  if (UNSIGNABLE_TYPES.has(mimeType)) return true;

  if (RIFF_SUBTYPES[mimeType]) {
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) {
      return false;
    }
    const subtype = RIFF_SUBTYPES[mimeType];
    for (let i = 0; i < subtype.length; i++) {
      if (bytes[8 + i] !== subtype[i]) return false;
    }
    return true;
  }

  if (FTYPE_FORMATS.has(mimeType)) {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  }

  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures) return true;

  try {
    const buffer = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    for (const sig of signatures) {
      let match = true;
      for (let i = 0; i < sig.length; i++) {
        if (bytes[i] !== sig[i]) { match = false; break; }
      }
      if (match) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function verifySvgContent(text) {
  for (const pattern of SVG_DANGEROUS_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  return true;
}

function sanitizeR2Domain(domain) {
  if (!domain) return '';
  let cleaned = domain.trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  cleaned = cleaned.replace(/^http:\/\//i, 'https://');
  try {
    return new URL(cleaned).origin;
  } catch {
    return '';
  }
}

function sanitizeUserTag(tag) {
  if (!tag) return 'default';
  const cleaned = String(tag).trim().slice(0, 32);
  if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/.test(cleaned)) return 'default';
  return cleaned || 'default';
}

function getConfig(env) {
  if (cachedConfig) return cachedConfig;

  const expireHours = parseInt(env.EXPIRE_HOURS || '12', 10);
  const renewOptionsRaw = env.RENEW_OPTIONS || '3;60;180;360;720';
  const renewParts = renewOptionsRaw.split(';').map(s => parseInt(s.trim(), 10));
  const maxRenewCount = renewParts[0] || 3;
  const renewDurations = renewParts.slice(1).filter(n => !isNaN(n) && n >= 0);

  const allowedTypesRaw = (env.ALLOWED_TYPES || 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml').trim();
  const unlimitedTypes = allowedTypesRaw === '*';

  cachedConfig = {
    R2_BUCKET: env.R2_BUCKET,
    R2_PUBLIC_DOMAIN: sanitizeR2Domain(env.R2_PUBLIC_DOMAIN),
    EXPIRE_HOURS: expireHours,
    MAX_FILE_SIZE: parseInt(env.MAX_FILE_SIZE || '20', 10) * 1024 * 1024,
    MAX_STORAGE_SIZE: parseInt(env.MAX_STORAGE_SIZE || '1000', 10) * 1024 * 1024,
    ALLOWED_TYPES: unlimitedTypes ? [] : allowedTypesRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
    UNLIMITED_TYPES: unlimitedTypes,
    CRON_SECRET: env.CRON_SECRET || '',
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(',').map(t => t.trim()) : null,
    CACHE_MAX_AGE: expireHours * 3600,
    MAX_RENEW_COUNT: maxRenewCount,
    RENEW_DURATIONS: renewDurations,
  };

  return cachedConfig;
}

function getResponseHeaders(origin, CONFIG) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

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

function parsePagination(url) {
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || String(DEFAULT_PAGE_LIMIT), 10), 1),
    MAX_PAGE_LIMIT
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
  return { limit, offset };
}

async function handleOptions(request, CONFIG) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
    'Access-Control-Max-Age': '86400',
  };

  if (CONFIG.CORS_ALLOWED_ORIGINS) {
    if (origin && CONFIG.CORS_ALLOWED_ORIGINS.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Vary'] = 'Origin';
    }
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return new Response(null, { headers });
}

async function handleUpload(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const rawUserTag = formData.get('user_tag');
    const userTag = sanitizeUserTag(rawUserTag);

    if (!file) {
      return jsonResponse({ error: '未上传文件' }, 400, origin, CONFIG);
    }

    const originalName = file.name || '';
    const originalExt = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.') + 1).toLowerCase()
      : '';
    const mimeType = file.type || 'application/octet-stream';

    if (!CONFIG.UNLIMITED_TYPES
        && !(originalExt && CONFIG.ALLOWED_TYPES.includes(originalExt))) {
      const allowedDisplay = CONFIG.ALLOWED_TYPES.map(t => t.toUpperCase()).join('、');
      return jsonResponse({ error: `不支持的文件类型，仅支持：${allowedDisplay}` }, 400, origin, CONFIG);
    }

    if (file.size > CONFIG.MAX_FILE_SIZE) {
      const maxMB = CONFIG.MAX_FILE_SIZE / (1024 * 1024);
      return jsonResponse({ error: `文件大小超过${maxMB}MB限制` }, 400, origin, CONFIG);
    }

    if (mimeType === 'image/svg+xml') {
      const svgText = await file.text();
      if (!verifySvgContent(svgText)) {
        return jsonResponse({ error: 'SVG文件包含不安全内容（脚本或事件处理器）' }, 400, origin, CONFIG);
      }
      if (!await verifyFileSignature(file, mimeType)) {
        return jsonResponse({ error: '文件内容与声明类型不匹配' }, 400, origin, CONFIG);
      }

      const usedStorage = await getUsedStorage(env.DB);

      if (usedStorage + file.size > CONFIG.MAX_STORAGE_SIZE) {
        return jsonResponse({ error: '存储空间已满，请等待过期文件自动清理后再试', storageFull: true }, 429, origin, CONFIG);
      }

      const fileName = generateFileName(mimeType, originalExt, originalName);
      const timestamp = Date.now();
      const expireAt = new Date(timestamp + CONFIG.EXPIRE_HOURS * 3600000).toISOString();

      try {
        await env.R2_BUCKET.put(fileName, svgText, {
          httpMetadata: { contentType: mimeType, cacheControl: `public, max-age=${CONFIG.CACHE_MAX_AGE}` },
          customMetadata: { userTag },
        });
      } catch {
        return jsonResponse({ error: '文件存储失败，请稍后重试' }, 500, origin, CONFIG);
      }

      await env.DB.prepare(
        'INSERT INTO images (filename, size, user_tag, expire_at, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(fileName, file.size, userTag, expireAt, new Date(timestamp).toISOString()).run();

      const imageUrl = `${CONFIG.R2_PUBLIC_DOMAIN}/${fileName}`;
      return jsonResponse({
        success: true,
        url: imageUrl,
        markdown: `![文件](${imageUrl})`,
        html: `<img src="${escapeHtml(imageUrl)}" alt="flyimg">`,
        expireAt,
        expireHours: CONFIG.EXPIRE_HOURS,
      }, 200, origin, CONFIG);
    }

    if (!await verifyFileSignature(file, mimeType)) {
      return jsonResponse({ error: '文件内容与声明类型不匹配，可能存在安全风险' }, 400, origin, CONFIG);
    }

    const usedStorage = await getUsedStorage(env.DB);

    if (usedStorage + file.size > CONFIG.MAX_STORAGE_SIZE) {
      return jsonResponse({ error: '存储空间已满，请等待过期文件自动清理后再试', storageFull: true }, 429, origin, CONFIG);
    }

    const fileName = generateFileName(mimeType, originalExt, originalName);
    const timestamp = Date.now();
    const expireAt = new Date(timestamp + CONFIG.EXPIRE_HOURS * 3600000).toISOString();

    try {
      await env.R2_BUCKET.put(fileName, file.stream(), {
        httpMetadata: { contentType: mimeType, cacheControl: `public, max-age=${CONFIG.CACHE_MAX_AGE}` },
        customMetadata: { userTag },
      });
    } catch {
      return jsonResponse({ error: '文件存储失败，请稍后重试' }, 500, origin, CONFIG);
    }

    await env.DB.prepare(
      'INSERT INTO images (filename, size, user_tag, expire_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(fileName, file.size, userTag, expireAt, new Date(timestamp).toISOString()).run();

    const imageUrl = `${CONFIG.R2_PUBLIC_DOMAIN}/${fileName}`;
    return jsonResponse({
      success: true,
      url: imageUrl,
      markdown: `![文件](${imageUrl})`,
      html: `<img src="${escapeHtml(imageUrl)}" alt="flyimg">`,
      expireAt,
      expireHours: CONFIG.EXPIRE_HOURS,
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Upload failed:', error);
    return jsonResponse({ error: '上传失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

/**
 * 文件夹上传 - 初始化：校验总大小不超项目剩余空间，生成文件夹 key（改名），
 * 状态 uploading，随后逐文件上传，全部完成后 finish 转为 active。
 */
async function handleUploadFolderInit(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const body = await request.json();
    const userTag = sanitizeUserTag(body.user_tag);
    const totalSize = parseInt(body.total_size, 10);
    const fileCount = parseInt(body.file_count, 10);
    const name = String(body.name || '').slice(0, 200);

    if (!isFinite(totalSize) || totalSize <= 0) {
      return jsonResponse({ error: '无效的文件夹大小' }, 400, origin, CONFIG);
    }
    if (!isFinite(fileCount) || fileCount <= 0 || fileCount > 5000) {
      return jsonResponse({ error: '无效的文件数量' }, 400, origin, CONFIG);
    }

    const usedStorage = await getUsedStorage(env.DB);
    if (usedStorage + totalSize > CONFIG.MAX_STORAGE_SIZE) {
      return jsonResponse({
        error: '文件夹总大小超过项目剩余空间，请等待过期文件自动清理后再试',
        storageFull: true,
      }, 429, origin, CONFIG);
    }

    const folderKey = generateFolderKey();
    const timestamp = Date.now();
    const expireAt = new Date(timestamp + CONFIG.EXPIRE_HOURS * 3600000).toISOString();

    await env.DB.prepare(
      'INSERT INTO folders (folder_key, name, user_tag, size, file_count, renew_count, expire_at, created_at, status) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?)'
    ).bind(folderKey, name, userTag, expireAt, new Date(timestamp).toISOString(), 'uploading').run();

    return jsonResponse({ success: true, folder_key: folderKey, expire_at: expireAt }, 200, origin, CONFIG);
  } catch (error) {
    console.error('Upload folder init failed:', error);
    return jsonResponse({ error: '初始化上传失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

/**
 * 文件夹上传 - 逐文件：每个文件一次请求（规避单请求 100MB 上限）。
 * 类型白名单未开放的文件跳过（返回 skipped，不影响整体），其余写入 R2 与 folder_files。
 */
async function handleUploadFolderFile(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folderKey = String(formData.get('folder_key') || '');
    const relPath = String(formData.get('rel_path') || '');
    const userTag = sanitizeUserTag(formData.get('user_tag'));

    if (!file) {
      return jsonResponse({ error: '缺少文件' }, 400, origin, CONFIG);
    }
    if (!isValidKey(folderKey)) {
      return jsonResponse({ error: '无效的文件夹' }, 400, origin, CONFIG);
    }
    if (!isValidKey(relPath)) {
      return jsonResponse({ error: '无效的文件路径' }, 400, origin, CONFIG);
    }

    const folder = await env.DB.prepare('SELECT folder_key, status, user_tag FROM folders WHERE folder_key = ?')
      .bind(folderKey).first();
    if (!folder) {
      return jsonResponse({ error: '文件夹不存在或已过期' }, 404, origin, CONFIG);
    }
    if (folder.status !== 'uploading') {
      return jsonResponse({ error: '文件夹状态异常，无法继续上传' }, 400, origin, CONFIG);
    }
    if (folder.user_tag !== userTag) {
      return jsonResponse({ error: '无权限操作此文件夹' }, 403, origin, CONFIG);
    }

    // 类型白名单：未开放的类型跳过该文件，不导致整体失败
    if (!isTypeAllowed(relPath, CONFIG)) {
      return jsonResponse({ success: false, skipped: true, message: `跳过不支持的类型：${relPath}` }, 200, origin, CONFIG);
    }

    const mimeType = file.type || 'application/octet-stream';

    if (mimeType === 'image/svg+xml') {
      const svgText = await file.text();
      if (!verifySvgContent(svgText)) {
        return jsonResponse({ success: false, skipped: true, message: `SVG包含不安全内容，已跳过：${relPath}` }, 200, origin, CONFIG);
      }
    }

    if (!await verifyFileSignature(file, mimeType)) {
      return jsonResponse({ success: false, skipped: true, message: `文件内容与声明类型不匹配，已跳过：${relPath}` }, 200, origin, CONFIG);
    }

    const r2Key = `${folderKey}/${relPath}`;
    try {
      await env.R2_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: mimeType, cacheControl: `public, max-age=${CONFIG.CACHE_MAX_AGE}` },
        customMetadata: { userTag },
      });
    } catch {
      return jsonResponse({ error: '文件存储失败，请稍后重试' }, 500, origin, CONFIG);
    }

    await env.DB.prepare(
      'INSERT INTO folder_files (folder_key, rel_path, size) VALUES (?, ?, ?) ON CONFLICT(folder_key, rel_path) DO UPDATE SET size = excluded.size'
    ).bind(folderKey, relPath, file.size).run();

    return jsonResponse({ success: true, rel_path: relPath, size: file.size }, 200, origin, CONFIG);
  } catch (error) {
    console.error('Upload folder file failed:', error);
    return jsonResponse({ error: '上传失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

/** 文件夹上传 - 完成：汇总实际大小/文件数，标记 active，记录根目录 index.html 作为整体预览入口 */
async function handleUploadFolderFinish(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const body = await request.json();
    const folderKey = String(body.folder_key || '');
    const userTag = sanitizeUserTag(body.user_tag);

    if (!isValidKey(folderKey)) {
      return jsonResponse({ error: '无效的文件夹' }, 400, origin, CONFIG);
    }

    const folder = await env.DB.prepare('SELECT folder_key, user_tag, expire_at FROM folders WHERE folder_key = ?')
      .bind(folderKey).first();
    if (!folder) {
      return jsonResponse({ error: '文件夹不存在' }, 404, origin, CONFIG);
    }
    if (folder.user_tag !== userTag) {
      return jsonResponse({ error: '无权限操作此文件夹' }, 403, origin, CONFIG);
    }

    const agg = await env.DB.prepare(
      'SELECT COALESCE(SUM(size), 0) as totalSize, COUNT(*) as fileCount FROM folder_files WHERE folder_key = ?'
    ).bind(folderKey).first();

    const rootIndex = await env.DB.prepare(
      "SELECT rel_path FROM folder_files WHERE folder_key = ? AND rel_path IN ('index.html', 'index.htm') ORDER BY rel_path LIMIT 1"
    ).bind(folderKey).first();

    await env.DB.prepare(
      'UPDATE folders SET status = ?, size = ?, file_count = ?, index_path = ? WHERE folder_key = ?'
    ).bind('active', agg.totalSize, agg.fileCount, rootIndex ? rootIndex.rel_path : null, folderKey).run();

    const indexUrl = rootIndex
      ? `${CONFIG.R2_PUBLIC_DOMAIN}/${folderKey}/${rootIndex.rel_path}`
      : null;

    return jsonResponse({
      success: true,
      folder_key: folderKey,
      size: agg.totalSize,
      file_count: agg.fileCount,
      index_url: indexUrl,
      expire_at: folder.expire_at,
      expire_hours: CONFIG.EXPIRE_HOURS,
    }, 200, origin, CONFIG);
  } catch (error) {
    console.error('Upload folder finish failed:', error);
    return jsonResponse({ error: '完成上传失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

/** 文件夹上传 - 中止：删除已上传部分（R2 前缀 + DB 记录） */
async function handleUploadFolderAbort(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const body = await request.json();
    const folderKey = String(body.folder_key || '');
    const userTag = sanitizeUserTag(body.user_tag);

    if (!isValidKey(folderKey)) {
      return jsonResponse({ error: '无效的文件夹' }, 400, origin, CONFIG);
    }

    const folder = await env.DB.prepare('SELECT folder_key, user_tag FROM folders WHERE folder_key = ?')
      .bind(folderKey).first();
    if (folder && folder.user_tag !== userTag) {
      return jsonResponse({ error: '无权限操作此文件夹' }, 403, origin, CONFIG);
    }

    await deleteR2Prefix(env, folderKey);
    await env.DB.prepare('DELETE FROM folder_files WHERE folder_key = ?').bind(folderKey).run();
    await env.DB.prepare('DELETE FROM folders WHERE folder_key = ?').bind(folderKey).run();

    return jsonResponse({ success: true, message: '已取消上传' }, 200, origin, CONFIG);
  } catch (error) {
    console.error('Upload folder abort failed:', error);
    return jsonResponse({ error: '取消失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

/** 文件夹成员列表：返回相对路径与直链，供文件夹整体预览（文件树）使用 */
async function handleFolderFiles(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const folderKey = url.searchParams.get('folder_key') || '';
    const userTag = sanitizeUserTag(url.searchParams.get('user_tag'));

    if (!isValidKey(folderKey)) {
      return jsonResponse({ error: '无效的文件夹' }, 400, origin, CONFIG);
    }

    const folder = await env.DB.prepare(
      "SELECT folder_key, user_tag FROM folders WHERE folder_key = ? AND status = ?"
    ).bind(folderKey, 'active').first();
    if (!folder) {
      return jsonResponse({ error: '文件夹不存在或已过期' }, 404, origin, CONFIG);
    }
    if (folder.user_tag !== userTag) {
      return jsonResponse({ error: '无权限查看此文件夹' }, 403, origin, CONFIG);
    }

    const { results } = await env.DB.prepare(
      'SELECT rel_path, size FROM folder_files WHERE folder_key = ? ORDER BY rel_path'
    ).bind(folderKey).all();

    return jsonResponse({
      success: true,
      folder_key: folderKey,
      files: results.map(f => ({
        ...f,
        url: `${CONFIG.R2_PUBLIC_DOMAIN}/${folderKey}/${f.rel_path}`,
      })),
    }, 200, origin, CONFIG);
  } catch (error) {
    console.error('Folder files failed:', error);
    return jsonResponse({ error: '查询失败，请稍后重试' }, 500, origin, CONFIG);
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
    const { limit, offset } = parsePagination(url);

    const countResult = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM images WHERE user_tag = ? AND expire_at > ?) +
        (SELECT COUNT(*) FROM folders WHERE user_tag = ? AND expire_at > ? AND status = ?) as total`
    ).bind(userTag, now, userTag, now, 'active').first();

    const { results } = await env.DB.prepare(
      'SELECT filename, size, renew_count, expire_at, created_at FROM images WHERE user_tag = ? AND expire_at > ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(userTag, now, limit, offset).all();

    const { results: folderResults } = await env.DB.prepare(
      'SELECT folder_key, name, size, file_count, index_path, renew_count, expire_at, created_at FROM folders WHERE user_tag = ? AND expire_at > ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(userTag, now, 'active', limit, offset).all();

    return jsonResponse({
      success: true,
      images: results.map(img => ({
        ...img,
        url: `${CONFIG.R2_PUBLIC_DOMAIN}/${img.filename}`,
        expired: false,
      })),
      folders: folderResults.map(f => ({
        kind: 'folder',
        folder_key: f.folder_key,
        filename: f.folder_key,
        name: f.name,
        size: f.size,
        file_count: f.file_count,
        index_path: f.index_path,
        url: f.index_path ? `${CONFIG.R2_PUBLIC_DOMAIN}/${f.folder_key}/${f.index_path}` : '',
        renew_count: f.renew_count,
        expire_at: f.expire_at,
        created_at: f.created_at,
        expired: false,
      })),
      pagination: {
        total: countResult.total,
        limit,
        offset,
        hasMore: offset + results.length + folderResults.length < countResult.total,
      },
      renew_config: { max_count: CONFIG.MAX_RENEW_COUNT, durations: CONFIG.RENEW_DURATIONS },
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
    const url = new URL(request.url);
    const now = new Date().toISOString();
    const { limit, offset } = parsePagination(url);

    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM images'
    ).first();

    const { results } = await env.DB.prepare(
      'SELECT filename, size, user_tag, renew_count, expire_at, created_at FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();

    const { results: folderResults } = await env.DB.prepare(
      'SELECT folder_key, name, size, file_count, index_path, user_tag, renew_count, expire_at, created_at FROM folders WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind('active', limit, offset).all();

    const storageInfo = await getStorageInfo(env.DB, now);

    return jsonResponse({
      success: true,
      images: results.map(img => ({
        ...img,
        url: `${CONFIG.R2_PUBLIC_DOMAIN}/${img.filename}`,
        expired: img.expire_at < now,
      })),
      folders: folderResults.map(f => ({
        kind: 'folder',
        folder_key: f.folder_key,
        filename: f.folder_key,
        name: f.name,
        size: f.size,
        file_count: f.file_count,
        index_path: f.index_path,
        user_tag: f.user_tag,
        url: f.index_path ? `${CONFIG.R2_PUBLIC_DOMAIN}/${f.folder_key}/${f.index_path}` : '',
        renew_count: f.renew_count,
        expire_at: f.expire_at,
        created_at: f.created_at,
        expired: f.expire_at < now,
      })),
      pagination: {
        total: countResult.total + folderResults.length,
        limit,
        offset,
        hasMore: offset + results.length + folderResults.length < countResult.total + folderResults.length,
      },
      renew_config: { max_count: CONFIG.MAX_RENEW_COUNT, durations: CONFIG.RENEW_DURATIONS },
      storage_info: {
        maxStorageFormatted: formatBytes(CONFIG.MAX_STORAGE_SIZE),
        maxStorageSize: CONFIG.MAX_STORAGE_SIZE,
        ...storageInfo,
      },
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Query failed:', error);
    return jsonResponse({ error: '查询失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

// 内容代理：按文件名从 R2 读取文件内容并返回（带 CORS 响应头），
// 供前端文本/Markdown/ZIP 预览使用（避免依赖 R2 公共域名的 CORS 配置）
async function handleContent(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get('filename') || '';

    if (!filename || !isValidKey(filename)) {
      return jsonResponse({ error: '无效的文件名' }, 400, origin, CONFIG);
    }

    const object = await env.R2_BUCKET.get(filename);
    if (!object) {
      return jsonResponse({ error: '文件不存在或已过期' }, 404, origin, CONFIG);
    }

    // 支持 Range 请求（媒体 seek / 视频缩略图随机取帧），透传给 R2 返回 206
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      const size = object.size;
      if (match && (match[1] !== '' || match[2] !== '')) {
        let start = match[1] !== '' ? parseInt(match[1], 10) : undefined;
        let end = match[2] !== '' ? parseInt(match[2], 10) : undefined;

        if (start !== undefined && start >= size) {
          const headers = getResponseHeaders(origin, CONFIG);
          headers['Content-Range'] = `bytes */${size}`;
          return new Response(null, { status: 416, headers });
        }
        if (end === undefined || end >= size) end = size - 1;
        if (start === undefined) start = Math.max(size - (end - 0), 0);

        const ranged = await env.R2_BUCKET.get(filename, { range: { offset: start, length: end - start + 1 } });
        if (!ranged) {
          return jsonResponse({ error: '文件不存在或已过期' }, 404, origin, CONFIG);
        }

        const headers = getResponseHeaders(origin, CONFIG);
        headers['Content-Type'] = object.httpMetadata?.contentType || 'application/octet-stream';
        if (filename.toLowerCase().endsWith('.html')) headers['Content-Type'] = 'text/html; charset=utf-8';
        if (filename.toLowerCase().endsWith('.pdf')) headers['Content-Type'] = 'application/pdf';
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        headers['Accept-Ranges'] = 'bytes';
        headers['Content-Length'] = String(end - start + 1);
        headers['X-Frame-Options'] = 'SAMEORIGIN';
        return new Response(ranged.body, { status: 206, headers });
      }
    }

    const headers = getResponseHeaders(origin, CONFIG);
    headers['Content-Type'] = object.httpMetadata?.contentType || 'application/octet-stream';
    if (filename.toLowerCase().endsWith('.html')) headers['Content-Type'] = 'text/html; charset=utf-8';
    if (filename.toLowerCase().endsWith('.pdf')) headers['Content-Type'] = 'application/pdf';
    headers['Cache-Control'] = object.httpMetadata?.cacheControl || `public, max-age=${CONFIG.CACHE_MAX_AGE}`;
    headers['Accept-Ranges'] = 'bytes';
    headers['X-Frame-Options'] = 'SAMEORIGIN';
    return new Response(object.body, { headers });

  } catch (error) {
    console.error('Content failed:', error);
    return jsonResponse({ error: '读取文件失败，请稍后重试' }, 500, origin, CONFIG);
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

    if (!isValidKey(filename)) {
      return jsonResponse({ error: '无效的文件名' }, 400, origin, CONFIG);
    }

    // 文件夹整体删除：按前缀删 R2 + 两张表记录
    const folder = await env.DB.prepare('SELECT folder_key FROM folders WHERE folder_key = ?')
      .bind(filename).first();
    if (folder) {
      await deleteR2Prefix(env, folder.folder_key);
      await env.DB.prepare('DELETE FROM folder_files WHERE folder_key = ?').bind(folder.folder_key).run();
      await env.DB.prepare('DELETE FROM folders WHERE folder_key = ?').bind(folder.folder_key).run();
      return jsonResponse({ success: true, message: '文件夹已删除' }, 200, origin, CONFIG);
    }

    try { await env.R2_BUCKET.delete(filename); } catch {}

    await env.DB.prepare('DELETE FROM images WHERE filename = ?').bind(filename).run();

    return jsonResponse({ success: true, message: '文件已删除' }, 200, origin, CONFIG);

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
    return jsonResponse({ success: true, message: `清理完成，删除了${deletedCount}个过期文件` }, 200, origin, CONFIG);
  } catch (error) {
    console.error('Clean failed:', error);
    return jsonResponse({ error: '清理失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function handleStats(request, env, CONFIG) {
  const origin = request.headers.get('Origin');

  try {
    const storageInfo = await getStorageInfo(env.DB);
    const usagePercent = Math.round((storageInfo.totalSize / CONFIG.MAX_STORAGE_SIZE) * 100);

    return jsonResponse({
      success: true,
      totalFiles: storageInfo.totalFiles,
      totalSize: storageInfo.totalSize,
      formattedSize: storageInfo.formattedSize,
      maxStorageSize: CONFIG.MAX_STORAGE_SIZE,
      maxStorageFormatted: formatBytes(CONFIG.MAX_STORAGE_SIZE),
      usagePercent,
      isFull: storageInfo.totalSize >= CONFIG.MAX_STORAGE_SIZE,
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Stats failed:', error);
    return jsonResponse({ error: '获取统计失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function handleRenew(request, env, CONFIG) {
  const origin = request.headers.get('Origin');
  const isAdmin = await verifyAdmin(request, CONFIG);

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '无效的请求体' }, 400, origin, CONFIG);
    }

    const { filename, duration, user_tag } = body;

    if (!filename) {
      return jsonResponse({ error: '缺少filename参数' }, 400, origin, CONFIG);
    }

    if (!isValidKey(filename)) {
      return jsonResponse({ error: '无效的文件名' }, 400, origin, CONFIG);
    }

    if (duration === undefined || duration === null) {
      return jsonResponse({ error: '缺少duration参数' }, 400, origin, CONFIG);
    }

    const durationMinutes = parseInt(duration, 10);
    if (isNaN(durationMinutes) || durationMinutes < 0) {
      return jsonResponse({ error: '无效的续期时长' }, 400, origin, CONFIG);
    }

    // 时长白名单仅约束普通用户；管理员不受限（可直接设为长期，duration=0）
    if (!isAdmin && !CONFIG.RENEW_DURATIONS.includes(durationMinutes)) {
      return jsonResponse({ error: '不支持的续期时长' }, 400, origin, CONFIG);
    }

    // 文件夹整体续期：更新文件夹过期时间，成员随之整体延续
    const folder = await env.DB.prepare('SELECT folder_key, user_tag, renew_count FROM folders WHERE folder_key = ?')
      .bind(filename).first();
    if (folder) {
      if (!isAdmin) {
        const userTag = sanitizeUserTag(user_tag);
        if (userTag !== folder.user_tag) {
          return jsonResponse({ error: '无权限续期此文件夹' }, 403, origin, CONFIG);
        }
        if (folder.renew_count >= CONFIG.MAX_RENEW_COUNT) {
          return jsonResponse({ error: `续期次数已达上限（${CONFIG.MAX_RENEW_COUNT}次）` }, 400, origin, CONFIG);
        }
      }

      const newExpireAt = durationMinutes === 0
        ? PERMANENT_EXPIRY
        : new Date(Date.now() + durationMinutes * 60000).toISOString();

      await env.DB.prepare(
        'UPDATE folders SET expire_at = ?, renew_count = renew_count + 1 WHERE folder_key = ?'
      ).bind(newExpireAt, filename).run();

      return jsonResponse({
        success: true,
        message: durationMinutes === 0 ? '已设为长期' : `续期成功，新过期时间：${newExpireAt}`,
        expire_at: newExpireAt,
        renew_count: folder.renew_count + 1,
        max_renew_count: CONFIG.MAX_RENEW_COUNT,
      }, 200, origin, CONFIG);
    }

    const image = await env.DB.prepare(
      'SELECT filename, user_tag, renew_count FROM images WHERE filename = ?'
    ).bind(filename).first();

    if (!image) {
      return jsonResponse({ error: '文件不存在' }, 404, origin, CONFIG);
    }

    if (!isAdmin) {
      const userTag = sanitizeUserTag(user_tag);
      if (userTag !== image.user_tag) {
        return jsonResponse({ error: '无权限续期此文件' }, 403, origin, CONFIG);
      }
      if (image.renew_count >= CONFIG.MAX_RENEW_COUNT) {
        return jsonResponse({ error: `续期次数已达上限（${CONFIG.MAX_RENEW_COUNT}次）` }, 400, origin, CONFIG);
      }
    }

    const newExpireAt = durationMinutes === 0
      ? PERMANENT_EXPIRY
      : new Date(Date.now() + durationMinutes * 60000).toISOString();

    await env.DB.prepare(
      'UPDATE images SET expire_at = ?, renew_count = renew_count + 1 WHERE filename = ?'
    ).bind(newExpireAt, filename).run();

    return jsonResponse({
      success: true,
      message: durationMinutes === 0 ? '已设为长期' : `续期成功，新过期时间：${newExpireAt}`,
      expire_at: newExpireAt,
      renew_count: image.renew_count + 1,
      max_renew_count: CONFIG.MAX_RENEW_COUNT,
    }, 200, origin, CONFIG);

  } catch (error) {
    console.error('Renew failed:', error);
    return jsonResponse({ error: '续期失败，请稍后重试' }, 500, origin, CONFIG);
  }
}

async function cleanupExpiredFiles(env) {
  const now = new Date().toISOString();

  const { results } = await env.DB.prepare(
    'SELECT filename FROM images WHERE expire_at <= ?'
  ).bind(now).all();

  if (results.length > 0) {
    await Promise.allSettled(results.map(r => env.R2_BUCKET.delete(r.filename)));
    await env.DB.prepare('DELETE FROM images WHERE expire_at <= ?').bind(now).run();
  }

  // 过期文件夹：按前缀删除成员对象与记录
  const { results: expiredFolders } = await env.DB.prepare(
    'SELECT folder_key FROM folders WHERE expire_at <= ?'
  ).bind(now).all();
  for (const f of expiredFolders) {
    await deleteR2Prefix(env, f.folder_key);
  }
  if (expiredFolders.length > 0) {
    await env.DB.prepare('DELETE FROM folders WHERE expire_at <= ?').bind(now).run();
  }

  // 挂起的上传（1 小时未完成）：清理残留
  const staleTime = new Date(Date.now() - 3600000).toISOString();
  const { results: staleFolders } = await env.DB.prepare(
    'SELECT folder_key FROM folders WHERE status = ? AND created_at < ?'
  ).bind('uploading', staleTime).all();
  for (const f of staleFolders) {
    await deleteR2Prefix(env, f.folder_key);
  }
  if (staleFolders.length > 0) {
    await env.DB.prepare('DELETE FROM folders WHERE status = ? AND created_at < ?').bind('uploading', staleTime).run();
  }

  // 兜底清理孤立成员记录
  await env.DB.prepare('DELETE FROM folder_files WHERE folder_key NOT IN (SELECT folder_key FROM folders)').run();

  return results.length + expiredFolders.length + staleFolders.length;
}

async function getStorageInfo(db, now) {
  const isoNow = now || new Date().toISOString();
  const result = await db.prepare(
    'SELECT COUNT(*) as totalFiles, COALESCE(SUM(size), 0) as totalSize FROM images WHERE expire_at > ?'
  ).bind(isoNow).first();
  const folderResult = await db.prepare(
    "SELECT COUNT(*) as totalFolders, COALESCE(SUM(size), 0) as totalSize FROM folders WHERE expire_at > ? AND status = ?"
  ).bind(isoNow, 'active').first();

  return {
    totalFiles: (result.totalFiles || 0) + (folderResult.totalFolders || 0),
    totalSize: (result.totalSize || 0) + (folderResult.totalSize || 0),
    formattedSize: formatBytes((result.totalSize || 0) + (folderResult.totalSize || 0)),
  };
}

function addSecurityHeaders(response, CONFIG) {
  const headers = new Headers(response.headers);
  const contentType = headers.get('Content-Type') || '';

  if (contentType.includes('text/html')) {
    // R2 公共域名（直链前缀）加入 CSP 白名单，直链预览依赖这些能力：
    // - connect-src：fetch 直链读取 HTML/文本/Markdown 内容（此前仅 'self' 导致
    //   跨域 fetch 被浏览器在 CORS 之前直接拦截，永远回退代理预览）
    // - base-uri：HTML 预览注入的 <base> 指向直链域名，否则相对路径子资源解析被拦
    // - style-src / font-src / media-src：相对路径的 css / 字体 / 音视频按直链解析
    // 未配置 R2 公共域名时保持原有仅同源策略。
    const r2 = CONFIG && CONFIG.R2_PUBLIC_DOMAIN ? CONFIG.R2_PUBLIC_DOMAIN : '';
    const self = `'self'${r2 ? ` ${r2}` : ''}`;
    headers.set('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self'; " +
      `style-src 'self' 'unsafe-inline'${r2 ? ` ${r2}` : ''}; ` +
      "img-src * data: blob:; " +
      `font-src ${self}; ` +
      `connect-src ${self}; ` +
      `media-src ${self}; ` +
      "frame-ancestors 'none'; " +
      `base-uri ${self}; ` +
      "form-action 'self'"
    );
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const CONFIG = getConfig(env);
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (isAPIRequest(url.pathname)) {
      if (request.method === 'OPTIONS') {
        return handleOptions(request, CONFIG);
      }

      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitType = url.pathname === '/upload'
        ? 'upload'
        : url.pathname.startsWith('/upload-folder/') ? 'folderUpload' : 'api';
      if (!checkRateLimit(clientIp, rateLimitType)) {
        return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, origin, CONFIG);
      }

      const exactRoute = API_ROUTES.find(route => url.pathname === route);
      if (exactRoute) {
        const allowedMethod = ROUTE_METHODS[exactRoute];
        if (request.method !== allowedMethod) {
          return jsonResponse({ error: 'Method Not Allowed' }, 405, origin, CONFIG, {
            'Allow': allowedMethod,
          });
        }
      }

      if (url.pathname === '/upload') return handleUpload(request, env, CONFIG);
      if (url.pathname === '/upload-folder/init') return handleUploadFolderInit(request, env, CONFIG);
      if (url.pathname === '/upload-folder/file') return handleUploadFolderFile(request, env, CONFIG);
      if (url.pathname === '/upload-folder/finish') return handleUploadFolderFinish(request, env, CONFIG);
      if (url.pathname === '/upload-folder/abort') return handleUploadFolderAbort(request, env, CONFIG);
      if (url.pathname === '/folder-files') return handleFolderFiles(request, env, CONFIG);
      if (url.pathname === '/my-images') return handleMyImages(request, env, CONFIG);
      if (url.pathname === '/all-images') return handleAllImages(request, env, CONFIG);
      if (url.pathname === '/delete') return handleDelete(request, env, CONFIG);
      if (url.pathname === '/clean') return handleClean(request, env, CONFIG);
      if (url.pathname === '/stats') return handleStats(request, env, CONFIG);
      if (url.pathname === '/renew') return handleRenew(request, env, CONFIG);
      if (url.pathname === '/content') return handleContent(request, env, CONFIG);

      return jsonResponse({ error: 'Not Found' }, 404, origin, CONFIG);
    }

    // 静态资源由 Cloudflare Assets 提供；SPA 回退（not_found_handling）负责将
    // 未知路径交由前端 react-router 处理（如 /:userTag、/admin）。
    const assetResponse = await env.ASSETS.fetch(request);
    return addSecurityHeaders(assetResponse, CONFIG);
  },

  async scheduled(event, env, ctx) {
    cleanupRateLimits();
    ctx.waitUntil(
      cleanupExpiredFiles(env)
        .then(count => console.log(`Cleanup completed: ${count} expired files deleted`))
        .catch(err => console.error('Cleanup failed:', err))
    );
  }
};
