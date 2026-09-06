import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import cpp from 'highlight.js/lib/languages/cpp'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import yaml from 'highlight.js/lib/languages/yaml'
import markdownLang from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import 'highlight.js/styles/github.css'
import DOMPurify from 'dompurify'
import { getFileKind, getFileExt, type FileKind } from '../lib/utils'
import { fetchFileText, fetchFileTextWithSource, fileSources, fileUrl, type FileSourceKind } from '../lib/api'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('php', php)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdownLang)
hljs.registerLanguage('plaintext', plaintext)

const md = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(code, { language }).value
    },
  })
)

interface FilePreviewProps {
  /** 文件直链（R2 公共域名） */
  url: string
  /** 文件名（用于类型检测与内容直链读取） */
  filename: string
  /** 预览区最大高度，默认 520px */
  maxHeight?: number | string
}

const mutedColor = '#8a7a66'

function PreviewLoading() {
  return <div style={{ textAlign: 'center', padding: '2rem 0', color: mutedColor, fontSize: '0.875rem' }}>加载中…</div>
}

function PreviewError({ message }: { message: string }) {
  return <div style={{ textAlign: 'center', padding: '2rem 0', color: '#b91c1c', fontSize: '0.875rem' }}>{message}</div>
}

/** 预览来源标记：直链 / 代理 */
function SourceBadge({ source }: { source: FileSourceKind }) {
  const direct = source === 'direct'
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
      <span
        style={{
          fontSize: '0.6875rem', lineHeight: 1.4, padding: '0.15rem 0.5rem', borderRadius: '9999px',
          border: `1px solid ${direct ? '#99f6e4' : '#fcd34d'}`,
          color: direct ? '#0f766e' : '#b45309',
          background: direct ? '#f0fdfa' : '#fffbeb',
        }}
      >
        {direct ? '直链' : '代理'}
      </span>
    </div>
  )
}

/**
 * 音视频预览：直链优先，直链无法加载时自动回退到 worker 同源代理。
 * 媒体标签加载本身不需要 CORS，但直链域名异常时代理兜底保证可播放。
 */
function MediaPreview({ filename, kind, maxHeight = 520, onSource }: {
  filename: string
  kind: 'video' | 'audio'
  maxHeight?: number | string
  onSource?: (s: FileSourceKind) => void
}) {
  const [srcIdx, setSrcIdx] = useState(0)
  const sources = fileSources(filename)
  const src = sources[srcIdx]
  const heightStyle = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight

  // 媒体元数据就绪即确认当前源可用：index 0 为直链，其余为代理
  const onLoadedMetadata = () => onSource?.(srcIdx === 0 ? 'direct' : 'proxy')

  const commonProps = {
    controls: true,
    preload: 'metadata' as const,
    src,
    onLoadedMetadata,
    onError: () => {
      if (srcIdx + 1 < sources.length) setSrcIdx(srcIdx + 1)
    },
  }

  if (kind === 'video') {
    return (
      <video
        {...commonProps}
        playsInline
        style={{ width: '100%', maxHeight: heightStyle, borderRadius: '0.5rem', background: '#000' }}
      />
    )
  }
  return <audio {...commonProps} style={{ width: '100%' }} />
}

/** 文本类预览（txt/log/json/代码等），通过 R2 直链读取 */
function TextContentPreview({ filename, onSource }: { filename: string; onSource?: (s: FileSourceKind) => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    fetchFileTextWithSource(filename)
      .then(({ text, source }) => { if (!cancelled) { setContent(text); onSource?.(source) } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '读取失败') })
    return () => { cancelled = true }
  }, [filename, onSource])

  if (error) return <PreviewError message={error} />
  if (content === null) return <PreviewLoading />
  return (
    <pre
      style={{
        margin: 0, padding: '1rem', maxHeight: 520, overflow: 'auto',
        background: '#faf7f2', borderRadius: '0.5rem',
        fontSize: '0.8125rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      }}
    >
      {content}
    </pre>
  )
}

/** Markdown 渲染预览（marked + highlight.js 高亮 + DOMPurify 防 XSS） */
function MarkdownPreview({ filename, onSource }: { filename: string; onSource?: (s: FileSourceKind) => void }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    fetchFileTextWithSource(filename)
      .then(({ text, source }) => {
        if (cancelled) return
        setHtml(DOMPurify.sanitize(md.parse(text) as string))
        onSource?.(source)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '读取失败') })
    return () => { cancelled = true }
  }, [filename, onSource])

  if (error) return <PreviewError message={error} />
  if (html === null) return <PreviewLoading />
  return (
    <div
      className="markdown-body"
      style={{ maxHeight: 520, overflow: 'auto', padding: '0 0.25rem', fontSize: '0.875rem', lineHeight: 1.7 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/**
 * 给 HTML 源码注入 <base>，让源码里的相对路径子资源（css/图片/字体等）
 * 相对该文件的直链解析；源码已有 <base> 时不注入，避免覆盖作者设置。
 */
function htmlWithBase(html: string, filename: string): string {
  if (/<base\s/i.test(html)) return html
  const baseTag = `<base href="${fileUrl(filename)}">`
  const head = html.match(/<head([^>]*)>/i)
  return head ? html.replace(head[0], `${head[0]}${baseTag}`) : `${baseTag}${html}`
}

/**
 * HTML 预览：源码 / 渲染 两种模式。
 * 渲染模式：直链 CORS 读取 HTML 内容，再通过 sandbox iframe 的 srcDoc 内联渲染。
 * 直链域名响应带 X-Frame-Options 帧嵌入限制，跨域 iframe 会被浏览器屏蔽（“内容被屏蔽”），
 * 而 srcDoc 不向直链域名发起请求，可绕开该限制且内容仍由直链读取。
 * sandbox 禁脚本；注入 <base> 后相对路径子资源按直链解析。
 */
function HtmlPreview({ filename, onSource }: { filename: string; onSource?: (s: FileSourceKind) => void }) {
  const [mode, setMode] = useState<'source' | 'render'>('render')
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    if (mode !== 'render') return
    fetchFileTextWithSource(filename)
      .then(({ text, source }) => { if (!cancelled) { setHtml(text); onSource?.(source) } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'HTML 读取失败') })
    return () => { cancelled = true }
  }, [filename, mode, onSource])

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setMode('render')}
          style={{
            padding: '0.25rem 0.875rem', borderRadius: '9999px', border: '1px solid #d8cec0',
            background: mode === 'render' ? '#0f766e' : '#fff', color: mode === 'render' ? '#fff' : '#5a4632',
            fontSize: '0.8125rem', cursor: 'pointer',
          }}
        >
          渲染
        </button>
        <button
          type="button"
          onClick={() => setMode('source')}
          style={{
            padding: '0.25rem 0.875rem', borderRadius: '9999px', border: '1px solid #d8cec0',
            background: mode === 'source' ? '#0f766e' : '#fff', color: mode === 'source' ? '#fff' : '#5a4632',
            fontSize: '0.8125rem', cursor: 'pointer',
          }}
        >
          源码
        </button>
      </div>
      {mode === 'source' ? (
        <TextContentPreview filename={filename} />
      ) : error ? (
        <PreviewError message={error} />
      ) : html === null ? (
        <PreviewLoading />
      ) : (
        <div>
          <iframe
            title="HTML 渲染预览"
            sandbox=""
            srcDoc={htmlWithBase(html, filename)}
            style={{ width: '100%', height: 520, border: '1px solid #e8e0d4', borderRadius: '0.5rem', background: '#fff' }}
          />
          <p style={{ color: mutedColor, fontSize: '0.75rem', margin: '0.5rem 0 0' }}>
            渲染为安全沙箱模式（脚本已禁用）；相对路径的 css/图片 已按直链解析。
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * HTML 缩略图：直链读取 HTML 内容后以 sandbox iframe srcDoc 渲染页面预览，
 * 绕开直链域名的帧嵌入限制；读取失败时回退为文档卡片。
 * pointerEvents:none 保证不拦截点击。
 */
function HtmlThumb({ filename }: { filename: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setFailed(false)
    fetchFileText(filename)
      .then((text) => { if (!cancelled) setHtml(text) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [filename])

  if (failed) return <OtherThumb filename={filename} />
  if (html === null) return <ThumbLoading />

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#fff', position: 'relative' }}>
      <iframe
        title=""
        sandbox=""
        srcDoc={htmlWithBase(html, filename)}
        loading="lazy"
        style={{
          width: '400%', height: '400%', border: 'none',
          transform: 'scale(0.25)', transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

/** 缩放容器：内容放大 4 倍再缩回 0.25，模拟整页缩略图效果 */
function ScaledFrame({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#fff', position: 'relative' }}>
      <div
        style={{
          width: '400%', height: '400%', transform: 'scale(0.25)', transformOrigin: '0 0',
          pointerEvents: 'none', fontSize: '0.8125rem', lineHeight: 1.5,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function ThumbLoading() {
  return <div style={{ width: '100%', height: '100%', background: '#f7f3ec' }} />
}

/** Markdown 缩略图：渲染清洗后的 HTML */
function MdThumb({ filename }: { filename: string }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setHtml(null)
    fetchFileText(filename)
      .then((text) => { if (!cancelled) setHtml(DOMPurify.sanitize(md.parse(text) as string)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [filename])
  if (html === null) return <ThumbLoading />
  return (
    <ScaledFrame>
      <div className="markdown-body" style={{ padding: '0.5rem' }} dangerouslySetInnerHTML={{ __html: html }} />
    </ScaledFrame>
  )
}

/** 文本缩略图：展示开头若干字符 */
function TextThumb({ filename }: { filename: string }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setText(null)
    fetchFileText(filename)
      .then((t) => { if (!cancelled) setText(t) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [filename])
  if (text === null) return <ThumbLoading />
  const preview = text.length > 600 ? `${text.slice(0, 600)}…` : text
  return (
    <ScaledFrame>
      <pre
        style={{
          margin: 0, padding: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        }}
      >
        {preview}
      </pre>
    </ScaledFrame>
  )
}

/** 音频缩略图：静态波形条视觉预览 */
function AudioThumb() {
  const bars = [0.35, 0.65, 0.45, 0.85, 0.55, 0.75, 0.4, 0.6, 0.9, 0.5, 0.7, 0.45, 0.8, 0.55, 0.65, 0.4]
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 3, padding: '0 12%', background: 'linear-gradient(180deg, #f7f3ec, #efe7db)',
      }}
    >
      {bars.map((h, i) => (
        <div key={i} style={{ width: 4, height: `${h * 100}%`, maxHeight: '55%', borderRadius: 2, background: '#0f766e', opacity: 0.85 }} />
      ))}
    </div>
  )
}

/** 主预览组件：按文件类型分发渲染，顶部显示直链/代理来源标记 */
export default function FilePreview({ url, filename, maxHeight = 520 }: FilePreviewProps) {
  const kind: FileKind = getFileKind(filename)
  const heightStyle = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight
  const [source, setSource] = useState<FileSourceKind | null>(null)

  // 图片始终走直链展示（<img> 加载不需要 CORS），直接标记为直链
  useEffect(() => {
    if (kind === 'image') setSource('direct')
  }, [kind])

  let content: ReactNode
  if (kind === 'image') {
    content = (
      <div style={{ textAlign: 'center', maxHeight: heightStyle, overflow: 'hidden' }}>
        <img src={url} alt={filename} style={{ maxWidth: '100%', maxHeight: heightStyle, objectFit: 'contain', borderRadius: '0.75rem' }} />
      </div>
    )
  } else if (kind === 'video') {
    content = <MediaPreview filename={filename} kind="video" maxHeight={heightStyle} onSource={setSource} />
  } else if (kind === 'audio') {
    content = <MediaPreview filename={filename} kind="audio" onSource={setSource} />
  } else if (kind === 'markdown') {
    content = <MarkdownPreview filename={filename} onSource={setSource} />
  } else if (kind === 'html') {
    content = <HtmlPreview filename={filename} onSource={setSource} />
  } else if (kind === 'text') {
    content = <TextContentPreview filename={filename} onSource={setSource} />
  } else {
    // PDF 与 zip 等类型不做窗口预览：显示"暂不支持在线预览"并提供打开原文件
    content = (
      <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
        <p style={{ color: mutedColor, margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
          该类型暂不支持在线预览
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0f766e', fontSize: '0.875rem', fontWeight: 600 }}
        >
          打开原文件
        </a>
      </div>
    )
  }

  return (
    <div>
      {source && <SourceBadge source={source} />}
      {content}
    </div>
  )
}

/**
 * 视频缩略图：通过 R2 直链（桶已配 CORS）加载视频，
 * 随机定位到中段一帧并绘制到 canvas 作为缩略图；失败时回退为"视频"占位。
 * 全程 muted + 无 autoplay，不会真正播放。
 */
const MAX_SEEK_TRIES = 3
const SEEK_TIMEOUT_MS = 8000

function VideoThumb({ filename }: { filename: string }) {
  const [frame, setFrame] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [srcIdx, setSrcIdx] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 直链优先；直链未配 CORS 被浏览器拦截时，换 worker 同源代理再试
  const sources = fileSources(filename)
  const src = sources[srcIdx]

  useEffect(() => {
    const video = videoRef.current
    if (!video || frame) return

    let tries = 0
    let timer: number | undefined
    const fail = () => setFailed(true)
    const pickTime = () => {
      const d = video.duration
      if (!isFinite(d) || d <= 0) { fail(); return }
      // 取 10% ~ 90% 区间内的随机时间，避开开头黑场/结尾字幕
      const t = d * 0.1 + Math.random() * d * 0.8
      try { video.currentTime = Math.max(Math.min(t, d - 0.25), 0) } catch { fail() }
    }
    const retry = () => {
      tries += 1
      if (tries >= MAX_SEEK_TRIES) { fail(); return }
      pickTime()
    }
    const onMeta = () => { timer = window.setTimeout(fail, SEEK_TIMEOUT_MS); pickTime() }
    const onSeeked = () => {
      const canvas = canvasRef.current
      if (!canvas || !video.videoWidth || !video.videoHeight) { retry(); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { retry(); return }
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        setFrame(canvas.toDataURL('image/jpeg', 0.6))
        if (timer) window.clearTimeout(timer)
      } catch { retry() }
    }
    const onError = () => {
      // 当前源加载失败（如直链未配 CORS 被浏览器拦截）→ 换下一个源重试
      if (srcIdx + 1 < sources.length) {
        setSrcIdx(srcIdx + 1)
        return
      }
      retry()
    }

    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    return () => {
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      if (timer) window.clearTimeout(timer)
    }
  }, [filename, frame, srcIdx, sources.length])

  if (frame) {
    return <img src={frame} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  }

  return (
    <>
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f5f0e8', color: '#a08d72', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.05em',
        }}
      >
        {failed ? '视频' : '加载中…'}
      </div>
      <video
        ref={videoRef}
        crossOrigin="anonymous"
        preload="metadata"
        muted
        playsInline
        src={src}
        style={{ display: 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  )
}

/** 其他类型缩略图：文档卡片（扩展名徽标），非纯占位 */
export function OtherThumb({ filename }: { filename: string }) {
  const ext = (getFileExt(filename) || 'file').toUpperCase().slice(0, 5)
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #fbf8f3, #efe7db)',
      }}
    >
      <div
        style={{
          width: 48, height: 58, borderRadius: 6, background: '#fff', border: '1px solid #ddd2c2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)', color: '#0f766e',
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em',
        }}
      >
        {ext}
      </div>
    </div>
  )
}

/**
 * 列表缩略图：图片显示缩略图，视频随机取帧，其余类型渲染真实内容预览
 * （视频/音频均为静态，不会自动播放）。
 * 传入 onClick 后支持点击放大预览，悬停显示"点击预览"提示。
 */
export function FileThumb({ url, filename, onClick }: { url: string; filename: string; onClick?: () => void }) {
  const kind = getFileKind(filename)

  const overlay = onClick ? <span className="thumb-zoom-overlay">点击预览</span> : null

  const inner =
    kind === 'image' ? (
      <img
        src={url}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        loading="lazy"
        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
      />
    ) : kind === 'video' ? (
      <VideoThumb filename={filename} />
    ) : kind === 'html' ? (
      <HtmlThumb filename={filename} />
    ) : kind === 'markdown' ? (
      <MdThumb filename={filename} />
    ) : kind === 'text' ? (
      <TextThumb filename={filename} />
    ) : kind === 'audio' ? (
      <AudioThumb />
    ) : (
      <OtherThumb filename={filename} />
    )

  // 无 onClick（静态展示，如上传成功页）：渲染普通 div，避免出现按钮指针光标
  if (!onClick) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        {inner}
      </div>
    )
  }
  return (
    <button type="button" className="thumb-zoom" onClick={onClick} aria-label="放大预览" tabIndex={0}>
      {inner}
      {overlay}
    </button>
  )
}
