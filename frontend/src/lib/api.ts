import { apiBase, fileBaseUrl, siteDomain } from './config'

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

/** 文件夹条目：作为一个整体展示与预览（不把成员文件独立列出） */
export interface FolderItem {
  kind: 'folder'
  folder_key: string
  /** 与单文件一致：文件名即 R2 key（文件夹显示名与 R2 保持一致，不还原原文件夹名） */
  filename: string
  name: string
  size: number
  file_count: number
  index_path?: string | null
  url: string
  user_tag?: string
  renew_count: number
  expire_at: string
  created_at: string
  expired?: boolean
}

export interface FolderFileItem {
  rel_path: string
  size: number
  url: string
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

export interface FolderUploadResult {
  success: boolean
  folderKey: string
  /** index.html 直链（若文件夹根目录存在）；不存在时为空字符串 */
  url: string
  size: number
  fileCount: number
  /** 因类型白名单未开放等原因被跳过的相对路径 */
  skipped: string[]
  expireAt: string
  expireHours: number
  error?: string
}

interface UploadFileItem {
  file: File
  /** 相对路径，如 sub/a.css（递归子文件夹层级保留） */
  relPath: string
}

/** 文件夹上传（XHR 逐文件，规避单请求体量上限；类型未开放的文件跳过不中断） */
export async function uploadFolder(
  files: UploadFileItem[],
  userTag: string,
  onProgress?: (percent: number) => void,
  folderName = ''
): Promise<FolderUploadResult> {
  const totalBytes = files.reduce((s, f) => s + f.file.size, 0)

  const initResp = await fetch(`${apiBase}/upload-folder/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_tag: userTag, total_size: totalBytes, file_count: files.length, name: folderName }),
  })
  const initData = (await initResp.json()) as { success: boolean; folder_key: string; error?: string }
  if (!initData.success) throw new Error(initData.error || '初始化上传失败')
  const folderKey = initData.folder_key

  const skipped: string[] = []
  let uploadedBytes = 0

  const postFile = (item: UploadFileItem) =>
    new Promise<{ success: boolean; skipped?: boolean; error?: string }>((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', item.file)
      formData.append('folder_key', folderKey)
      formData.append('rel_path', item.relPath)
      formData.append('user_tag', userTag)

      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(5 + ((uploadedBytes + e.loaded) / totalBytes) * 85)
        }
      })
      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText) as { success: boolean; skipped?: boolean; error?: string }
          if (xhr.status === 200) resolve(data)
          else reject(new Error(data.error || `上传失败 (${xhr.status})`))
        } catch {
          reject(new Error(`上传失败 (${xhr.status})`))
        }
      })
      xhr.addEventListener('error', () => reject(new Error('上传失败，请检查网络连接')))
      xhr.timeout = 120000
      xhr.open('POST', `${apiBase}/upload-folder/file`)
      xhr.send(formData)
    })

  try {
    for (const item of files) {
      const data = await postFile(item)
      uploadedBytes += item.file.size
      if (data.success === false) {
        if (data.skipped) skipped.push(item.relPath)
        else throw new Error(data.error || `上传失败：${item.relPath}`)
      }
    }

    const finishResp = await fetch(`${apiBase}/upload-folder/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_key: folderKey, user_tag: userTag }),
    })
    const finishData = (await finishResp.json()) as {
      success: boolean
      folder_key: string
      size: number
      file_count: number
      index_url: string | null
      expire_at: string
      expire_hours: number
      error?: string
    }
    if (!finishData.success) throw new Error(finishData.error || '完成上传失败')

    onProgress?.(100)
    return {
      success: true,
      folderKey,
      url: finishData.index_url || '',
      size: finishData.size,
      fileCount: finishData.file_count,
      skipped,
      expireAt: finishData.expire_at,
      expireHours: finishData.expire_hours,
    }
  } catch (err) {
    try {
      await fetch(`${apiBase}/upload-folder/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_key: folderKey, user_tag: userTag }),
      })
    } catch {
      // 忽略取消失败，残留由服务端定时清理
    }
    throw err
  }
}

/** 文件夹成员列表（相对路径 + 直链），供文件夹整体预览的文件树使用 */
export async function fetchFolderFiles(folderKey: string, userTag: string): Promise<FolderFileItem[]> {
  const resp = await fetch(`${apiBase}/folder-files?folder_key=${encodeURIComponent(folderKey)}&user_tag=${encodeURIComponent(userTag)}`)
  const data = (await resp.json()) as { success: boolean; files?: FolderFileItem[]; error?: string }
  if (!data.success) throw new Error(data.error || '获取文件列表失败')
  return data.files || []
}

/** 存储统计（/stats 为公开接口），用于文件夹上传前剩余空间预检 */
export async function fetchStorageInfo(): Promise<StorageInfo> {
  try {
    const resp = await fetch(`${apiBase}/stats`)
    const data = (await resp.json()) as StorageInfo & { success?: boolean }
    if (data.success === false) return {}
    return data
  } catch {
    return {}
  }
}

export async function fetchMyImages(userTag: string) {
  const resp = await fetch(`${apiBase}/my-images?user_tag=${encodeURIComponent(userTag)}`)
  return resp.json() as Promise<{
    success: boolean
    images: ImageItem[]
    folders: FolderItem[]
    renew_config?: RenewConfig
    error?: string
  }>
}

export async function fetchAllImages(token: string) {
  const resp = await fetch(`${apiBase}/all-images`, { headers: { 'X-Cron-Secret': token } })
  const data = await resp.json() as {
    success?: boolean
    images?: ImageItem[]
    folders?: FolderItem[]
    renew_config?: RenewConfig
    storage_info?: StorageInfo
    error?: string
  }
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
// 按路径段编码，保留 '/' 让文件夹目录结构与递归子目录的 key 正确解析
export function fileUrl(filename: string): string {
  const segments = filename.split('/').map(encodeURIComponent).join('/')
  return `${fileBaseUrl}/${segments}`
}

/** 文件夹成员直链 */
export function folderFileUrl(folderKey: string, relPath: string): string {
  return fileUrl(`${folderKey}/${relPath}`)
}

/**
 * 是否启用直链预览：
 * - 配置了项目域名（SITE_DOMAIN）时，仅当前页面运行在该域名（或其子域）下返回 true，
 *   R2 CORS 已按该域名配置，fetch/canvas 可直连 R2；
 * - 未配置项目域名时也返回 true（只要配置了 R2 直链前缀）：允许尝试直链，
 *   若桶 CORS 允许当前来源则直链成功，否则读取时自动回退到 worker 代理。
 */
export function directLinkEnabled(): boolean {
  if (!fileBaseUrl) return false
  if (!siteDomain) return true
  const host = window.location.hostname.toLowerCase()
  const domain = siteDomain.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()
  return host === domain || host.endsWith(`.${domain}`)
}

// 候选读取源：R2 直链优先（启用时），worker 同源代理兜底
// （直链未配 CORS 时浏览器会拦截 fetch / canvas 读取，报 "Load failed"，代理不受影响）
export function fileSources(filename: string): string[] {
  const candidates: string[] = []
  if (directLinkEnabled()) candidates.push(fileUrl(filename))
  candidates.push(`${apiBase}/content?filename=${encodeURIComponent(filename)}`)
  return candidates
}

/**
 * 内容读取：
 * - 配置了项目域名且当前页面匹配时，优先 R2 直链（桶 CORS 已按项目域名配置），
 *   直链异常时回退到 worker 同源代理 /content；
 * - 未配置项目域名时，直接走代理，不发起直链请求。
 * 返回实际命中的源（直链 / 代理），供界面标记展示。
 */
export type FileSourceKind = 'direct' | 'proxy'

async function fetchFileBinary(filename: string): Promise<{ resp: Response; source: FileSourceKind }> {
  if (directLinkEnabled()) {
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
