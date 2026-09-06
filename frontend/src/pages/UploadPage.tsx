import { useCallback, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button, Card, Icon, Input, Title } from 'animal-island-ui'
import { uploadFile, uploadFolder } from '../lib/api'
import { displayConfig } from '../lib/config'
import { copyText, formatBytes, hoursLeft } from '../lib/utils'
import { useToast } from '../components/Toast'
import { FileThumb } from '../components/FilePreview'
import type { LayoutContext } from '../components/Layout'

type Phase = 'idle' | 'uploading' | 'done'

interface UploadResultState {
  url: string
  markdown: string
  html: string
  expireAt: string
  /** 文件夹上传结果 */
  isFolder?: boolean
  folderKey?: string
  fileCount?: number
  size?: number
  /** 因类型白名单未开放被跳过的相对路径 */
  skipped?: string[]
}

interface FolderFileItem {
  file: File
  /** 相对路径（含递归子目录层级） */
  relPath: string
}

/**
 * 去掉相对路径中的原始文件夹名首段：
 * webkitRelativePath / fullPath 形如「原文件夹名/sub/a.css」，首段即所选文件夹的名字。
 * 上传后文件夹名与 R2 key 一致（不还原回原文件夹名称），成员文件保留其相对结构。
 */
function stripRootFolder(relPath: string): string {
  const slash = relPath.indexOf('/')
  return slash > 0 ? relPath.slice(slash + 1) : relPath
}

/** 递归读取拖拽的文件夹（webkitGetAsEntry），保留相对路径 */
function walkEntry(entry: unknown): Promise<FolderFileItem[]> {
  return new Promise((resolve, reject) => {
    const e = entry as {
      isFile: boolean
      isDirectory: boolean
      name: string
      fullPath?: string
      file: (cb: (f: File) => void, err?: (e: unknown) => void) => void
      createReader: () => { readEntries: (cb: (batch: unknown[]) => void, err?: (e: unknown) => void) => void }
    }
    if (e.isFile) {
      e.file((file) => {
        const relPath = stripRootFolder(String(e.fullPath || e.name || file.name).replace(/^\//, ''))
        resolve([{ file, relPath }])
      }, reject)
    } else if (e.isDirectory) {
      const reader = e.createReader()
      const all: unknown[] = []
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (batch.length === 0) {
            try {
              const nested = await Promise.all(all.map((en) => walkEntry(en)))
              resolve(nested.flat())
            } catch (err) {
              reject(err)
            }
          } else {
            all.push(...batch)
            readBatch()
          }
        }, reject)
      }
      readBatch()
    } else {
      resolve([])
    }
  })
}

export default function UploadPage() {
  const { userTag, setUserTag } = useOutletContext<LayoutContext>()
  const toast = useToast()

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<UploadResultState | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const doUpload = useCallback(
    async (file: File) => {
      setPhase('uploading')
      setProgress(0)
      try {
        const data = await uploadFile(file, userTag.trim(), (p) => setProgress(p))
        setProgress(100)
        // 让用户至少看到 100% 满进度 0.5 秒
        await new Promise((r) => setTimeout(r, 500))
        setResult({ url: data.url, markdown: data.markdown, html: data.html, expireAt: data.expireAt })
        setPhase('done')
        toast.show('上传成功！')
      } catch (err: unknown) {
        toast.show(err instanceof Error ? err.message : '上传失败')
        setPhase('idle')
      }
    },
    [userTag, toast]
  )

  const doUploadFolder = useCallback(
    async (items: FolderFileItem[], folderName = '') => {
      setPhase('uploading')
      setProgress(0)
      try {
        const data = await uploadFolder(items, userTag.trim(), (p) => setProgress(p), folderName)
        setProgress(100)
        await new Promise((r) => setTimeout(r, 500))
        setResult({
          url: data.url,
          markdown: data.url ? `[文件夹](${data.url})` : '',
          html: data.url ? `<a href="${data.url}">文件夹</a>` : '',
          expireAt: data.expireAt,
          isFolder: true,
          folderKey: data.folderKey,
          fileCount: data.fileCount,
          size: data.size,
          skipped: data.skipped,
        })
        setPhase('done')
        const skippedMsg = data.skipped.length > 0 ? `，跳过 ${data.skipped.length} 个不支持类型的文件` : ''
        toast.show(`文件夹上传成功${skippedMsg}！`)
      } catch (err: unknown) {
        toast.show(err instanceof Error ? err.message : '上传失败')
        setPhase('idle')
      }
    },
    [userTag, toast]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) doUpload(f)
  }

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    // 原文件夹名 = webkitRelativePath 首段，用于后端生成与单文件一致规则的新 key
    const folderName = ((files[0] as File & { webkitRelativePath?: string })?.webkitRelativePath || '').split('/')[0] || ''
    const items = files
      .map((f) => ({
        file: f,
        relPath: stripRootFolder((f as File & { webkitRelativePath?: string }).webkitRelativePath || ''),
      }))
      .filter((it) => it.relPath)
    if (items.length > 0) doUploadFolder(items, folderName)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    // 优先识别拖入的文件夹（webkitGetAsEntry 递归读取）
    const items = e.dataTransfer.items
    const getEntry = (items as unknown as Array<{ webkitGetAsEntry?: () => unknown }> | undefined)
    if (getEntry && getEntry.length > 0 && getEntry[0].webkitGetAsEntry) {
      const entry = getEntry[0].webkitGetAsEntry()
      if (entry) {
        const isDir = (entry as { isDirectory?: boolean }).isDirectory
        const folderName = (entry as { name?: string }).name || ''
        const files = await walkEntry(entry)
        if (isDir && files.length > 0) {
          doUploadFolder(files, folderName)
          return
        }
      }
    }

    const f = e.dataTransfer.files[0]
    if (f) doUpload(f)
  }

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const f = e.clipboardData.files[0]
      if (f) doUpload(f)
    },
    [doUpload]
  )

  const doCopy = async (text: string) => {
    const ok = await copyText(text)
    toast.show(ok ? '复制成功！' : '复制失败')
  }

  const reset = () => {
    setPhase('idle')
    setResult(null)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  // 上传结果文件名（缩略图按文件名检测类型；文件夹传 index 完整 key 以正确解析相对资源）
  const resultFilename = result
    ? result.isFolder && result.folderKey
      ? result.url
        ? `${result.folderKey}/${decodeURIComponent(result.url.split('/').pop() || '')}`
        : result.folderKey
      : decodeURIComponent(result.url.split('/').pop() || '')
    : ''

  return (
    <div onPaste={handlePaste}>
      {/* 标题区 */}
      <div className="text-center mb-8">
        <Title size="large" color="app-blue">瞬传・瞬用</Title>
        <p style={{ color: '#8a7a66', marginTop: '0.5rem' }}>
          无需登录 · {displayConfig.expireHours}小时自动永久删除 · Cloudflare全球CDN加速
        </p>
      </div>

      {/* 用户名 */}
      <div className="flex items-center justify-center gap-2 mb-6" style={{ flexWrap: 'nowrap' }}>
        <span style={{ fontSize: '0.875rem', color: '#8a7a66', whiteSpace: 'nowrap', flexShrink: 0 }}>用户名：</span>
        <Input
          placeholder="输入用户名（用于查看已传图片）"
          value={userTag}
          onChange={(e) => setUserTag(e.target.value)}
          allowClear
          style={{ width: 280, minWidth: 0 }}
        />
      </div>

      {/* 上传区域 */}
      {phase === 'idle' && (
        <Card
          color="app-blue"
          className="text-center cursor-pointer"
          style={{ padding: '2.5rem', border: dragOver ? '2px dashed #ffffff' : '2px dashed rgba(255,255,255,0.5)', transition: 'border-color 0.2s' }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>☁️</div>
          <p style={{ fontWeight: 700, fontSize: '1.25rem', color: '#ffffff', marginBottom: '0.5rem' }}>拖拽文件或文件夹到这里上传</p>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem' }}>或者点击选择文件 / 文件夹，也可以按 Ctrl+V 粘贴剪贴板中的内容</p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            支持 {displayConfig.allowedTypesDisplay} 格式，单文件最大 {displayConfig.maxFileSizeMB}MB；文件夹整体上传、保留目录结构，文件夹中未开放类型的文件会被自动跳过
          </p>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <input
            ref={(el) => {
              folderInputRef.current = el
              // React 会把非标准布尔属性以空字符串赋值为 falsy，导致目录选择失效；显式置 true
              if (el && !el.webkitdirectory) el.webkitdirectory = true
            }}
            type="file"
            className="hidden"
            onChange={handleFolderChange}
          />
          <div className="flex justify-center gap-2" style={{ marginTop: '1rem' }}>
            <Button type="default" size="small" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
              选择文件
            </Button>
            <Button type="default" size="small" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}>
              选择文件夹
            </Button>
          </div>
        </Card>
      )}

      {/* 进度：loading 提供动效条纹 + 不可交互，::before 填充随进度增长，文字显示整数百分比 */}
      {phase === 'uploading' && (
        <Card color="app-teal" className="text-center" style={{ padding: '2.5rem' }}>
          <Button size="large" block loading className="ai-upload-progress-btn">
            <span style={{ position: 'relative', zIndex: 1 }}>{Math.round(progress)}%</span>
          </Button>
          <style>{`
            .ai-upload-progress-btn { position: relative; overflow: hidden; }
            .ai-upload-progress-btn::before {
              content: '';
              position: absolute;
              inset: 0;
              width: ${Math.round(progress)}%;
              background: rgba(255,255,255,0.35);
              transition: width 0.3s ease;
              z-index: 0;
            }
          `}</style>
        </Card>
      )}

      {/* 结果 */}
      {phase === 'done' && result && (
        <Card color="app-green" style={{ padding: '2.5rem' }}>
          <div className="flex items-center justify-center mb-4">
            <Icon name="icon-miles" size={28} style={{ marginRight: '0.5rem' }} />
            <span style={{ fontWeight: 600, fontSize: '1.125rem' }}>上传成功！</span>
            <span className="ml-auto" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', padding: '0.25rem 1rem', borderRadius: '9999px', fontSize: '0.8rem' }}>
              {hoursLeft(result.expireAt)}小时后过期
            </span>
          </div>

          {result.isFolder && result.fileCount === 0 && (
            <div className="text-center mb-6" style={{ padding: '1rem', background: '#fdf6e9', borderRadius: '0.75rem', color: '#b45309', fontSize: '0.875rem' }}>
              文件夹中没有可上传的文件（类型均未开放或为空）
            </div>
          )}

          {result.url && (
            <div className="mb-6">
              {/* 恢复之前的大预览尺寸：卡片全宽，最高 320px，内容铺满不缩放 */}
              <div
                style={{
                  width: '100%', height: '20rem', margin: '0 auto',
                  overflow: 'hidden', background: '#fff',
                  border: '1px solid #eee4d6', borderRadius: '0.75rem',
                }}
              >
                <FileThumb url={result.url} filename={resultFilename} />
              </div>
            </div>
          )}

          {result.isFolder && (
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#8a7a66', margin: '-0.25rem 0 1rem' }}>
              {result.folderKey} · {result.fileCount ?? 0} 个文件 · {formatBytes(result.size ?? 0)}
            </p>
          )}

          {result.skipped && result.skipped.length > 0 && (
            <div className="mb-4" style={{ padding: '0.75rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#92400e' }}>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>已跳过 {result.skipped.length} 个不支持类型的文件：</p>
              <p style={{ margin: 0, wordBreak: 'break-all', fontFamily: 'monospace' }}>{result.skipped.join('、')}</p>
            </div>
          )}

          {result.url ? (
            <div className="space-y-3" style={{ textAlign: 'left' }}>
              {[
                { label: result.isFolder ? '文件夹链接' : '直链', value: result.url },
                { label: 'Markdown', value: result.markdown },
                { label: 'HTML', value: result.html },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#5a4632', minWidth: 64 }}>{item.label}</label>
                  <Input value={item.value} readOnly style={{ flex: 1 }} />
                  <Button size="small" type="primary" onClick={() => doCopy(item.value)}>复制</Button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#8a7a66', marginBottom: '1rem' }}>
              该文件夹没有根目录 index.html，无整体直链；可在「我的文件」中预览并复制单个文件链接
            </p>
          )}

          <Button type="default" block style={{ marginTop: '1.5rem' }} icon={<Icon name="icon-camera" size={18} />} onClick={reset}>
            继续上传
          </Button>
        </Card>
      )}
    </div>
  )
}
