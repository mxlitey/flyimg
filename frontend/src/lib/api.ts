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

// R2 直链（依赖桶已配置 CORS；未配置时浏览器会拦截，见 fetchFileBinary 的回退逻辑）
export function fileUrl(filename: string): string {
  return `${fileBaseUrl}/${encodeURIComponent(filename)}`
}

// 通过 worker /content 代理读取文件内容（兜底方案，不依赖 R2 CORS）
export function contentUrl(filename: string): string {
  return `${apiBase}/content?filename=${encodeURIComponent(filename)}`
}

// 候选读取源：R2 直链优先（需桶已配 CORS），worker 代理兜底
export function fileSources(filename: string): string[] {
  return fileBaseUrl ? [fileUrl(filename), contentUrl(filename)] : [contentUrl(filename)]
}

// 内容读取：优先用直链（若 R2 已配 CORS），被浏览器拦截/失败时自动回退到 worker 代理
async function fetchFileBinary(filename: string): Promise<Response> {
  const candidates = fileSources(filename)
  let lastErr: Error | null = null

  for (const url of candidates) {
    try {
      const resp = await fetch(url, { mode: 'cors' })
      if (resp.ok) return resp
      lastErr = new Error(`读取文件失败 (${resp.status})`)
    } catch {
      // 直链跨域被拦或网络异常 → 尝试下一个候选源
      lastErr = new Error('读取文件失败，请检查网络连接')
    }
  }

  if (lastErr) {
    try {
      const resp = await fetch(contentUrl(filename))
      if (resp.ok) return resp
      const data = await resp.json()
      if (data.error) lastErr = new Error(data.error)
    } catch {
      // 保留默认错误信息
    }
  }
  throw lastErr || new Error('读取文件失败')
}

export async function fetchFileText(filename: string): Promise<string> {
  return (await fetchFileBinary(filename)).text()
}

export async function fetchFileArrayBuffer(filename: string): Promise<ArrayBuffer> {
  return (await fetchFileBinary(filename)).arrayBuffer()
}
