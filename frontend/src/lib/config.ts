// 读取由 /config.js 注入的运行时配置（部署时生成，本地开发使用 public/config.js 占位）
const defaultConfig: DisplayConfig = {
  expireHours: 12,
  maxFileSizeMB: 20,
  maxStorageSizeMB: 1000,
  allowedTypesDisplay: 'JPG、PNG、GIF、WEBP、SVG',
  renewMaxCount: 3,
  renewDurations: [60, 180, 360, 720],
}

export const displayConfig: DisplayConfig =
  typeof window !== 'undefined' && window.DISPLAY_CONFIG ? window.DISPLAY_CONFIG : defaultConfig

export const apiBase: string =
  typeof window !== 'undefined' && typeof window.API_BASE !== 'undefined' ? window.API_BASE : ''
