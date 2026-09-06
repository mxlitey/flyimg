import { useCallback, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button, Card, Icon, Input, Title } from 'animal-island-ui'
import { uploadFile } from '../lib/api'
import { displayConfig } from '../lib/config'
import { copyText, hoursLeft } from '../lib/utils'
import { useToast } from '../components/Toast'
import type { LayoutContext } from '../components/Layout'

type Phase = 'idle' | 'uploading' | 'done'

export default function UploadPage() {
  const { userTag, setUserTag } = useOutletContext<LayoutContext>()
  const toast = useToast()

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{
    url: string
    markdown: string
    html: string
    expireAt: string
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) doUpload(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
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
  }

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
          <p style={{ fontWeight: 700, fontSize: '1.25rem', color: '#ffffff', marginBottom: '0.5rem' }}>拖拽文件到这里上传</p>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem' }}>或者点击选择文件，也可以按 Ctrl+V 粘贴剪贴板中的内容</p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            支持 {displayConfig.allowedTypesDisplay} 格式，最大 {displayConfig.maxFileSizeMB}MB
          </p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
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

          {result.url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i) && (
            <div className="text-center mb-6">
              <img src={result.url} alt="预览" style={{ maxWidth: '100%', maxHeight: '20rem', borderRadius: '0.75rem', objectFit: 'contain' }} />
            </div>
          )}

          <div className="space-y-3" style={{ textAlign: 'left' }}>
            {[
              { label: '直链', value: result.url },
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

          <Button type="default" block style={{ marginTop: '1.5rem' }} icon={<Icon name="icon-camera" size={18} />} onClick={reset}>
            继续上传
          </Button>
        </Card>
      )}
    </div>
  )
}
