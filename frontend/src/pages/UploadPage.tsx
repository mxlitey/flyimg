import { useCallback, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'
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

  // 直链二维码：hover 图标弹出浮窗预览，点击图标下载 PNG
  const [qrOpen, setQrOpen] = useState(false)
  const qrTimerRef = useRef<number | undefined>(undefined)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  const openQr = useCallback(() => {
    if (qrTimerRef.current) window.clearTimeout(qrTimerRef.current)
    setQrOpen(true)
  }, [])

  const scheduleCloseQr = useCallback(() => {
    if (qrTimerRef.current) window.clearTimeout(qrTimerRef.current)
    qrTimerRef.current = window.setTimeout(() => setQrOpen(false), 150)
  }, [])

  // 触屏无 hover，统一通过点击切换浮窗展开/收起；下载入口在浮窗内
  const toggleQr = useCallback(() => setQrOpen((prev) => !prev), [])

  const downloadQr = useCallback(() => {
    const canvas = qrCanvasRef.current
    if (!canvas) {
      toast.show('二维码尚未生成，请重试')
      return
    }
    const href = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = href
    a.download = `flyimg-qr-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setQrOpen(false)
  }, [toast])

  // 二维码图标（UI 库未内置，使用内联 SVG）
  const qrIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2v3h-3v2h3v3h2v-3h3v-2h-3v-3h-2zm1-2h2v2h-2v-2z" />
    </svg>
  )

  // 结果区三行右端动作区等宽：直链行为“复制+二维码图标”，其余行复制按钮加长以保持右端对齐
  const QR_ACTION_WIDTH = 172
  const QR_ICON_WIDTH = 46

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
              { label: '直链', value: result.url, hasQr: true },
              { label: 'Markdown', value: result.markdown, hasQr: false },
              { label: 'HTML', value: result.html, hasQr: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#5a4632', minWidth: 64 }}>{item.label}</label>
                <Input value={item.value} readOnly style={{ flex: 1 }} />
                {item.hasQr ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'stretch', width: QR_ACTION_WIDTH, flexShrink: 0 }}>
                      <Button size="small" type="primary" style={{ flex: 1 }} onClick={() => doCopy(item.value)}>复制</Button>
                      <div
                        style={{ position: 'relative', marginLeft: 8, flexShrink: 0 }}
                        onMouseEnter={openQr}
                        onMouseLeave={scheduleCloseQr}
                        title="显示直链二维码"
                      >
                        <Button size="small" type="primary" icon={qrIcon} style={{ width: QR_ICON_WIDTH, padding: 0 }} onClick={toggleQr} />
                        {qrOpen && (
                          <div
                            onMouseEnter={openQr}
                            onMouseLeave={scheduleCloseQr}
                            style={{
                              position: 'absolute', right: 0, bottom: 'calc(100% + 12px)', zIndex: 60,
                              background: '#ffffff', borderRadius: 14, padding: 12,
                              boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                              width: 180,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                              <button
                                onClick={() => setQrOpen(false)}
                                aria-label="关闭二维码"
                                style={{ cursor: 'pointer', background: 'none', border: 'none', lineHeight: 1, fontSize: '0.85rem', color: '#8a7a66' }}
                              >
                                ✕
                              </button>
                            </div>
                            <QRCodeSVG value={item.value} size={148} level="M" marginSize={1} />
                            <span style={{ fontSize: '0.75rem', color: '#8a7a66', textAlign: 'center' }}>手机扫码打开直链</span>
                            <Button size="small" type="primary" block onClick={downloadQr}>下载二维码图片</Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 常驻隐藏 Canvas：用于点击图标时导出 PNG，浮窗关闭时依旧可靠 */}
                    <QRCodeCanvas ref={qrCanvasRef} value={item.value} size={256} level="M" marginSize={1} style={{ position: 'fixed', left: -9999, top: 0 }} />
                  </>
                ) : (
                  <Button size="small" type="primary" style={{ width: QR_ACTION_WIDTH, flexShrink: 0 }} onClick={() => doCopy(item.value)}>复制</Button>
                )}
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
