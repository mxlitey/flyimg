// 本地开发占位配置；部署时由 GitHub Actions 覆盖为真实值
window.API_BASE = '';
window.DISPLAY_CONFIG = {
  expireHours: 12,
  maxFileSizeMB: 20,
  maxStorageSizeMB: 1000,
  allowedTypesDisplay: 'JPG、PNG、GIF、WEBP、SVG',
  renewMaxCount: 3,
  renewDurations: [60, 180, 360, 720]
};
