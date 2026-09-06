// 由 /config.js（部署时生成）注入的全局运行时配置
interface DisplayConfig {
  expireHours: number
  maxFileSizeMB: number
  maxStorageSizeMB: number
  allowedTypesDisplay: string
  renewMaxCount: number
  renewDurations: number[]
  /** R2 公共域名（直链前缀），部署时注入 */
  fileBaseUrl?: string
}

interface Window {
  DISPLAY_CONFIG: DisplayConfig
  API_BASE: string
}
