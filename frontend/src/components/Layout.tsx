import { useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button, Cursor, Footer, Icon } from 'animal-island-ui'
import { displayConfig } from '../lib/config'

export interface LayoutContext {
  userTag: string
  setUserTag: (tag: string) => void
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [userTag, setUserTagState] = useState(() => localStorage.getItem('userTag') || '')

  const setUserTag = (tag: string) => {
    setUserTagState(tag)
    const trimmed = tag.trim()
    if (trimmed && trimmed !== 'default') localStorage.setItem('userTag', trimmed)
  }

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const goMyImages = () => {
    const tag = userTag.trim()
    if (!tag) {
      navigate('/')
      return
    }
    navigate(`/${encodeURIComponent(tag)}`)
  }

  const ctx: LayoutContext = { userTag, setUserTag }

  return (
    <Cursor>
      <div className="flex flex-col min-h-screen">
        <nav
          className="sticky top-0 z-50"
          style={{ backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.72)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="max-w-4xl mx-auto px-4 flex justify-between items-center" style={{ height: '4rem' }}>
            <Link to="/" className="flex items-center gap-2 no-underline">
              <img src="/favicon.png" alt="Logo" style={{ width: 36, height: 36 }} />
              <span style={{ fontWeight: 700, fontSize: '1.25rem', color: '#5a4632', fontFamily: 'Nunito, "Noto Sans SC", sans-serif' }}>Flyimg</span>
            </Link>
            <div className="flex items-center gap-1 flex-wrap">
              <Button type={isActive('/') ? 'primary' : 'text'} size="small" icon={<Icon name="icon-camera" size={16} />} onClick={() => navigate('/')}>
                上传
              </Button>
              {userTag && (
                <Button type={isActive('/' + userTag) ? 'primary' : 'text'} size="small" icon={<Icon name="icon-map" size={16} />} onClick={goMyImages}>
                  我的
                </Button>
              )}
              <Button type={isActive('/admin') ? 'primary' : 'text'} size="small" icon={<Icon name="icon-design" size={16} />} onClick={() => navigate('/admin')}>
                管理
              </Button>
            </div>
          </div>
        </nav>

        <main className="flex-grow ai-page">
          <Outlet context={ctx} />
        </main>

        <footer className="text-center text-sm py-4 w-full" style={{ color: '#8a7a66' }}>
          <p style={{ margin: '0.25rem 0' }}>Flyimg · 瞬传・瞬用 — 基于 Cloudflare R2 构建</p>
          <p style={{ margin: '0.25rem 0' }}>
            <a href="https://github.com/mxlitey/flyimg" target="_blank" rel="noopener" style={{ color: '#8a7a66' }}>GitHub</a>
            {' · '}
            <a href="https://github.com/guokaigdg/animal-island-ui" target="_blank" rel="noopener" style={{ color: '#8a7a66' }}>Animal-Island-UI</a>
          </p>
        </footer>
        <Footer type="sea" seamless />
      </div>
    </Cursor>
  )
}

// 给子页面使用的 context 类型导出
export type { ReactNode }
