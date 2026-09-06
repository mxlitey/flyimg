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
  /** 项目域名（前端部署域名，可选）；配置后 R2 CORS 仅允许该域名直连，前端启用直链预览 */
  siteDomain?: string
}

/// <reference types="vite/client" />

declare module '*?url' {
  const src: string
  export default src
}

interface Window {
  DISPLAY_CONFIG: DisplayConfig
  API_BASE: string
}
