// 由 /config.js（部署时生成）注入的全局运行时配置
interface DisplayConfig {
  expireHours: number
  maxFileSizeMB: number
  maxStorageSizeMB: number
  allowedTypesDisplay: string
  renewMaxCount: number
  renewDurations: number[]
}

interface Window {
  DISPLAY_CONFIG: DisplayConfig
  API_BASE: string
}
