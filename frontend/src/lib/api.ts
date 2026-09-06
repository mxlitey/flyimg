import { apiBase, fileBaseUrl } from './config'

export interface ImageItem {
  filename: string
  url: string
  size: number
  user_tag?: string
  renew_count: number
  expire_at: string
  created_at: string
  expired?: boolean
}

export interface RenewConfig {
  max_count: number
  durations: number[]
}

export interface StorageInfo {
  totalFiles?: number
  totalSize?: number
  formattedSize?: string
  maxStorageFormatted?: string
  maxStorageSize?: number
}

export interface UploadResult {
  success: boolean
  url: string
  markdown: string
  html: string
  expireAt: string
  expireHours: number
  error?: string
}

// 上传文件（XHR 以支持上传进度）
export function uploadFile(
  file: File,
  userTag: string,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('user_tag', userTag || 'default')

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(10 + (e.loaded / e.total) * 80)
      }
    })
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText) as UploadResult
        if (xhr.status === 200 && data.success) resolve(data)
        else reject(new Error(data.error || `上传失败 (${xhr.status})`))
      } catch {
        reject(new Error(`上传失败 (${xhr.status})`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('上传失败，请检查网络连接')))
    xhr.addEventListener('timeout', () => reject(new Error('上传超时，请重试')))
    xhr.timeout = 60000
    xhr.open('POST', `${apiBase}/upload`)
    xhr.send(formData)
  })
}

export async function fetchMyImages(userTag: string) {
  const resp = await fetch(`${apiBase}/my-images?user_tag=${encodeURIComponent(userTag)}`)
  return resp.json() as Promise<{
    success: boolean
    images: ImageItem[]
    renew_config?: RenewConfig
    error?: string
  }>
}

export async function fetchAllImages(token: string) {
  const resp = await fetch(`${apiBase}/all-images`, { headers: { 'X-Cron-Secret': token } })
  const data = await resp.json()
  return { status: resp.status, data }
}

export async function deleteFile(filename: string, token: string) {
  const resp = await fetch(`${apiBase}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': token },
    body: JSON.stringify({ filename }),
  })
  return resp.json()
}

export async function cleanExpired(token: string) {
  const resp = await fetch(`${apiBase}/clean`, {
    method: 'POST',
    headers: { 'X-Cron-Secret': token },
  })
  return resp.json()
}

export async function renewFile(filename: string, duration: number, userTag: string, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-Cron-Secret'] = token
  const resp = await fetch(`${apiBase}/renew`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ filename, duration, user_tag: userTag }),
  })
  return resp.json()
}

// R2 直链（要求桶已配置 CORS，否则浏览器会拦截）
export function fileUrl(filename: string): string {
  return `${fileBaseUrl}/${encodeURIComponent(filename)}`
}

// 候选读取源：R2 直链优先，worker 同源代理兜底
// （直链未配 CORS 时浏览器会拦截 fetch / canvas 读取，报 "Load failed"，代理不受影响）
export function fileSources(filename: string): string[] {
  const candidates: string[] = []
  if (fileBaseUrl) candidates.push(fileUrl(filename))
  candidates.push(`${apiBase}/content?filename=${encodeURIComponent(filename)}`)
  return candidates
}

/**
 * 内容读取：优先 R2 直链（需桶已配 CORS），
 * 直链被浏览器拦截（未配 CORS）或失败时，自动回退到 worker 同源代理 /content，
 * 保证 HTML/MD/文本源码预览在任何环境下可用。
 * 返回实际命中的源（直链 / 代理），供界面标记展示。
 */
export type FileSourceKind = 'direct' | 'proxy'

async function fetchFileBinary(filename: string): Promise<{ resp: Response; source: FileSourceKind }> {
  if (fileBaseUrl) {
    try {
      const resp = await fetch(fileUrl(filename), { mode: 'cors' })
      if (resp.ok) return { resp, source: 'direct' }
    } catch {
      // 直链跨域被拦截 → 走代理兜底
    }
  }
  const proxy = await fetch(`${apiBase}/content?filename=${encodeURIComponent(filename)}`)
  if (!proxy.ok) throw new Error(`读取文件失败 (${proxy.status})`)
  return { resp: proxy, source: 'proxy' }
}

export async function fetchFileText(filename: string): Promise<string> {
  return (await fetchFileBinary(filename)).resp.text()
}

/** 读取文件文本并返回实际使用的源（直链 / 代理），预览界面标记用 */
export async function fetchFileTextWithSource(filename: string): Promise<{ text: string; source: FileSourceKind }> {
  const { resp, source } = await fetchFileBinary(filename)
  return { text: await resp.text(), source }
}
