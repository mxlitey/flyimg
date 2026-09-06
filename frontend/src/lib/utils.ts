// 通用格式化工具（移植自原 common.js 的 Utils）

export function formatDate(date: string | number | Date): string {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function formatExpireTime(expireAt: string): string {
  const diff = new Date(expireAt).getTime() - Date.now()
  if (diff <= 0) return '已过期'
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (hours >= 24) return '>1天'
  if (hours > 0) return `${hours}小时${minutes}分后过期`
  return `${minutes}分钟后过期`
}

export function formatDurationLabel(d: number): string {
  if (d === 0) return '永不过期'
  const hours = Math.floor(d / 60)
  const mins = d % 60
  if (hours > 0) return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`
  return `${mins}分钟`
}

export function hoursLeft(expireAt: string): number {
  return Math.round((new Date(expireAt).getTime() - Date.now()) / 3600000)
}

// 复制前将文本中的 http(s) URL 内的中文百分号转义为 ASCII，
// 使复制出去的链接可安全粘贴（避免微信等 IM 截断中文）；存储用文件名不受影响
export function encodeUrlInText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>()]+/g, (m) => encodeURI(m))
}

// 复制文本到剪贴板，带 execCommand 回退
export async function copyText(text: string): Promise<boolean> {
  const encoded = encodeUrlInText(text)
  try {
    await navigator.clipboard.writeText(encoded)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = encoded
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}
