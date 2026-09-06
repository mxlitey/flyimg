import { useEffect, useRef, useState } from 'react'
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
import JSZip from 'jszip'
import { getFileKind, formatBytes, type FileKind } from '../lib/utils'
import { fetchFileText, fetchFileArrayBuffer, fileSources } from '../lib/api'

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
  /** 文件名（用于类型检测与内容代理读取） */
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

/** 文本类预览（txt/log/json/代码等），通过 /content 代理读取 */
function TextContentPreview({ filename }: { filename: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    fetchFileText(filename)
      .then((text) => { if (!cancelled) setContent(text) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '读取失败') })
    return () => { cancelled = true }
  }, [filename])

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
function MarkdownPreview({ filename }: { filename: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    fetchFileText(filename)
      .then((text) => {
        if (cancelled) return
        setHtml(DOMPurify.sanitize(md.parse(text) as string))
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '读取失败') })
    return () => { cancelled = true }
  }, [filename])

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

interface ZipEntryInfo {
  name: string
  size: number
  isDir: boolean
}

// JSZip 的 uncompressedSize 在内部 _data 上（类型未公开），运行时存在
function zipEntrySize(entry: JSZip.JSZipObject): number {
  if (entry.dir) return 0
  const data = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
  return data?.uncompressedSize || 0
}

/** ZIP 内容清单预览（JSZip 读取，不解压） */
function ZipPreview({ filename }: { filename: string }) {
  const [entries, setEntries] = useState<ZipEntryInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    fetchFileArrayBuffer(filename)
      .then((buf) => JSZip.loadAsync(buf))
      .then((zip) => {
        if (cancelled) return
        const list: ZipEntryInfo[] = []
        zip.forEach((name, entry) => {
          list.push({ name, size: zipEntrySize(entry), isDir: entry.dir })
        })
        setEntries(list)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'ZIP 解析失败') })
    return () => { cancelled = true }
  }, [filename])

  if (error) return <PreviewError message={error} />
  if (entries === null) return <PreviewLoading />
  if (entries.length === 0) return <div style={{ textAlign: 'center', padding: '2rem 0', color: mutedColor }}>压缩包为空</div>
  return (
    <div style={{ maxHeight: 520, overflow: 'auto', border: '1px solid #e8e0d4', borderRadius: '0.5rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#faf7f2' }}>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: '#5a4632' }}>文件名</th>
            <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: '#5a4632', whiteSpace: 'nowrap' }}>大小</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.name} style={{ borderTop: '1px solid #f0eae0' }}>
              <td style={{ padding: '0.4rem 0.75rem', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', wordBreak: 'break-all' }}>
                {e.isDir ? '[目录] ' : ''}{e.name}
              </td>
              <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: mutedColor, whiteSpace: 'nowrap' }}>
                {e.isDir ? '—' : formatBytes(e.size)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** HTML 预览：源码 / 渲染 两种模式；渲染模式走 sandbox iframe（禁脚本） */
function HtmlPreview({ url, filename }: { url: string; filename: string }) {
  const [mode, setMode] = useState<'source' | 'render'>('source')

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
      </div>
      {mode === 'source' ? (
        <TextContentPreview filename={filename} />
      ) : (
        <iframe
          src={url}
          title="HTML 渲染预览"
          sandbox=""
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: 520, border: '1px solid #e8e0d4', borderRadius: '0.5rem', background: '#fff' }}
        />
      )}
    </div>
  )
}

/** 主预览组件：按文件类型分发渲染 */
export default function FilePreview({ url, filename, maxHeight = 520 }: FilePreviewProps) {
  const kind: FileKind = getFileKind(filename)
  const heightStyle = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight

  if (kind === 'image') {
    return (
      <div style={{ textAlign: 'center', maxHeight: heightStyle, overflow: 'hidden' }}>
        <img src={url} alt={filename} style={{ maxWidth: '100%', maxHeight: heightStyle, objectFit: 'contain', borderRadius: '0.75rem' }} />
      </div>
    )
  }

  if (kind === 'video') {
    return <video controls preload="metadata" playsInline src={url} style={{ width: '100%', maxHeight: heightStyle, borderRadius: '0.5rem', background: '#000' }} />
  }

  if (kind === 'audio') {
    return <audio controls preload="metadata" src={url} style={{ width: '100%' }} />
  }

  if (kind === 'pdf') {
    return (
      <iframe
        src={url}
        title="PDF 预览"
        style={{ width: '100%', height: heightStyle, border: '1px solid #e8e0d4', borderRadius: '0.5rem', background: '#fff' }}
      />
    )
  }

  if (kind === 'markdown') return <MarkdownPreview filename={filename} />
  if (kind === 'html') return <HtmlPreview url={url} filename={filename} />
  if (kind === 'text') return <TextContentPreview filename={filename} />
  if (kind === 'zip') return <ZipPreview filename={filename} />

  return (
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

/**
 * 视频缩略图：通过 /content 代理（带 CORS/Range）加载视频，
 * 随机定位到中段一帧并绘制到 canvas 作为缩略图；失败时回退为"视频"占位。
 * 全程 muted + 无 autoplay，不会真正播放。
 */
const MAX_SEEK_TRIES = 3
const SEEK_TIMEOUT_MS = 8000

function VideoThumb({ filename }: { filename: string }) {
  const [frame, setFrame] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [srcIndex, setSrcIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 优先 R2 直链（桶已配 CORS 时生效），失败自动回退 worker 代理
  const sources = fileSources(filename)
  const src = sources[Math.min(srcIndex, sources.length - 1)]

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
      // 当前源加载失败（如直链未配 CORS 被浏览器拦截）→ 切换下一候选源；否则重试取帧
      if (srcIndex < sources.length - 1) {
        setSrcIndex(srcIndex + 1)
      } else {
        retry()
      }
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
  }, [filename, frame, srcIndex, sources.length])

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

/**
 * 列表缩略图：图片显示缩略图，视频随机取帧，其他类型显示类型占位
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
    ) : (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f5f0e8', color: '#a08d72', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.05em',
        }}
      >
        {kind === 'audio' ? '音频' : kind === 'pdf' ? 'PDF' : kind === 'zip' ? 'ZIP' : kind === 'markdown' ? 'MD' : kind === 'html' ? 'HTML' : kind === 'text' ? 'TXT' : '文件'}
      </div>
    )

  return (
    <button type="button" className="thumb-zoom" onClick={onClick} aria-label="放大预览" tabIndex={onClick ? 0 : -1}>
      {inner}
      {overlay}
    </button>
  )
}
