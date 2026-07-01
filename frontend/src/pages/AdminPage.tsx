import { useEffect, useState } from 'react'
import { Button, Card, Input, Loading, Select, Table, Title, type CardColor, type TableColumn } from 'animal-island-ui'
import { cleanExpired, deleteFile, fetchAllImages, renewFile, type ImageItem, type RenewConfig, type StorageInfo } from '../lib/api'
import { displayConfig } from '../lib/config'
import { copyText, formatBytes, formatDate, formatExpireTime } from '../lib/utils'
import { useToast } from '../components/Toast'
import ModalShell from '../components/ModalShell'
import RenewModal from '../components/RenewModal'

interface ConfirmState {
  title: string
  message: string
  onOk: () => void
  confirmLabel?: string
  danger?: boolean
}

// 管理密钥本地缓存键与有效期（30 天）
const ADMIN_TOKEN_KEY = 'adminToken'
const ADMIN_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000

function readStoredToken(): string {
  try {
    const raw = localStorage.getItem(ADMIN_TOKEN_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { value: string; expireAt: number }
    if (Date.now() > parsed.expireAt) {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      return ''
    }
    return parsed.value
  } catch {
    return ''
  }
}

function writeStoredToken(value: string) {
  localStorage.setItem(
    ADMIN_TOKEN_KEY,
    JSON.stringify({ value, expireAt: Date.now() + ADMIN_TOKEN_TTL })
  )
}

function clearStoredToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export default function AdminPage() {
  const toast = useToast()
  const cachedToken = readStoredToken()
  const [token, setToken] = useState(cachedToken)
  const [tokenInput, setTokenInput] = useState('')
  const [logged, setLogged] = useState(!!cachedToken)

  const [images, setImages] = useState<ImageItem[]>([])
  const [renewConfig, setRenewConfig] = useState<RenewConfig>({
    max_count: displayConfig.renewMaxCount,
    durations: displayConfig.renewDurations,
  })
  const [storage, setStorage] = useState<StorageInfo>({})
  const [loading, setLoading] = useState(false)
  const [userFilter, setUserFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [renewTarget, setRenewTarget] = useState<ImageItem | null>(null)
  const [renewDuration, setRenewDuration] = useState('')
  const [renewing, setRenewing] = useState(false)

  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const login = () => {
    const t = tokenInput.trim()
    if (!t) {
      toast.show('请输入管理密钥')
      return
    }
    setToken(t)
    writeStoredToken(t)
    setLogged(true)
    toast.show('登录成功')
  }

  const logout = () => {
    setToken('')
    setLogged(false)
    setTokenInput('')
    setImages([])
    setSelected(new Set())
    clearStoredToken()
    toast.show('已退出登录')
  }

  const load = async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const { status, data } = await fetchAllImages(token)
      if (status === 401) {
        logout()
        toast.show('密钥无效，请重新登录')
        return
      }
      setImages(data.images || [])
      if (data.renew_config) setRenewConfig(data.renew_config)
      if (data.storage_info) setStorage(data.storage_info)
    } catch {
      toast.show('加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (logged) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged])

  const users = Array.from(new Set(images.map((i) => i.user_tag).filter(Boolean))) as string[]
  const filtered = userFilter ? images.filter((i) => i.user_tag === userFilter) : images

  const toggleSelect = (filename: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((i) => prev.has(i.filename))
      const next = new Set(prev)
      if (allSelected) filtered.forEach((i) => next.delete(i.filename))
      else filtered.forEach((i) => next.add(i.filename))
      return next
    })
  }

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.filename))

  const expiredCount = images.filter((i) => i.expired).length
  const activeCount = images.length - expiredCount
  const usedSize = images.filter((i) => !i.expired).reduce((s, i) => s + (i.size || 0), 0)

  const doDelete = (filename: string) => {
    setConfirm({
      title: '删除文件',
      message: `确定要删除「${filename}」吗？此操作不可恢复。`,
      confirmLabel: '删除',
      danger: true,
      onOk: async () => {
        try {
          const data = await deleteFile(filename, token)
          if (data.success) {
            toast.show('删除成功')
            load()
          } else toast.show(data.error || '删除失败')
        } catch {
          toast.show('删除失败')
        }
      },
    })
  }

  const batchDelete = () => {
    if (selected.size === 0) return
    const count = selected.size
    setConfirm({
      title: '批量删除',
      message: `确定要删除选中的 ${count} 个文件吗？此操作不可恢复。`,
      confirmLabel: '删除',
      danger: true,
      onOk: async () => {
        let ok = 0
        let fail = 0
        for (const fn of selected) {
          try {
            const d = await deleteFile(fn, token)
            d.success ? ok++ : fail++
          } catch {
            fail++
          }
        }
        toast.show(`删除完成：成功 ${ok} 个${fail > 0 ? `，失败 ${fail} 个` : ''}`)
        load()
      },
    })
  }

  const deleteByUser = () => {
    if (!userFilter) {
      toast.show('请先选择一个用户')
      return
    }
    const userImages = images.filter((i) => i.user_tag === userFilter)
    if (userImages.length === 0) {
      toast.show('该用户没有文件')
      return
    }
    setConfirm({
      title: '删除用户',
      message: `确定要删除「${userFilter}」吗？此操作不可恢复。`,
      confirmLabel: '删除',
      danger: true,
      onOk: async () => {
        let ok = 0
        let fail = 0
        for (const img of userImages) {
          try {
            const d = await deleteFile(img.filename, token)
            d.success ? ok++ : fail++
          } catch {
            fail++
          }
        }
        toast.show(`删除完成：成功 ${ok} 个${fail > 0 ? `，失败 ${fail} 个` : ''}`)
        load()
      },
    })
  }

  const doClean = () => {
    setConfirm({
      title: '清理过期文件',
      message: '确定要清理所有过期文件吗？此操作不可恢复。',
      confirmLabel: '确认',
      danger: true,
      onOk: async () => {
        try {
          const data = await cleanExpired(token)
          if (data.success) {
            toast.show(data.message)
            load()
          } else toast.show(data.error || '清理失败')
        } catch {
          toast.show('清理失败')
        }
      },
    })
  }

  const openRenew = (img: ImageItem) => {
    setRenewTarget(img)
  }

  const confirmRenew = async () => {
    if (!renewTarget) return
    setRenewing(true)
    try {
      const data = await renewFile(renewTarget.filename, parseInt(renewDuration, 10), renewTarget.user_tag || '', token)
      if (data.success) {
        toast.show(data.message)
        setRenewTarget(null)
        load()
      } else toast.show(data.error || '续期失败')
    } catch {
      toast.show('续期失败')
    } finally {
      setRenewing(false)
    }
  }

  const doCopy = async (text: string) => {
    const ok = await copyText(text)
    toast.show(ok ? '复制成功！' : '复制失败')
  }

  const columns: TableColumn[] = [
    {
      title: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />,
      dataIndex: 'filename',
      width: 40,
      render: (_v, record) => {
        const r = record as unknown as ImageItem
        return <input type="checkbox" checked={selected.has(r.filename)} onChange={() => toggleSelect(r.filename)} />
      },
    },
    {
      title: '预览',
      dataIndex: 'url',
      width: 64,
      render: (_v, record) => {
        const r = record as unknown as ImageItem
        return (
          <img
            src={r.url}
            alt=""
            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, opacity: r.expired ? 0.5 : 1 }}
            loading="lazy"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        )
      },
    },
    {
      title: '文件信息',
      render: (_v, record) => {
        const r = record as unknown as ImageItem
        return (
          <div style={{ minWidth: 0 }}>
            <p title={r.filename} style={{ fontSize: '0.8rem', fontFamily: 'monospace', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5a4632' }}>
              {r.filename}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#8a7a66', margin: '2px 0' }}>
              用户: {r.user_tag} · {formatBytes(r.size)} · {formatDate(r.created_at)}
            </p>
          </div>
        )
      },
    },
    {
      title: '过期状态',
      width: 160,
      render: (_v, record) => {
        const r = record as unknown as ImageItem
        return (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: r.expired ? '#b91c1c' : '#0f766e' }}>
            {formatExpireTime(r.expire_at)} {r.renew_count > 0 && <span style={{ color: '#3d2e1e' }}>(已续{r.renew_count}次)</span>}
          </span>
        )
      },
    },
    {
      title: '操作',
      width: 150,
      render: (_v, record) => {
        const r = record as unknown as ImageItem
        return (
          <div className="flex gap-1 flex-wrap">
            <Button size="small" onClick={() => doCopy(r.url)}>
              复制
            </Button>
            <Button size="small" onClick={() => openRenew(r)}>
              续期
            </Button>
            <Button size="small" danger onClick={() => doDelete(r.filename)}>
              删除
            </Button>
          </div>
        )
      },
    },
  ]

  if (!logged) {
    return (
      <div className="max-w-md mx-auto" style={{ marginTop: '3rem' }}>
        <Card color="app-orange" style={{ padding: '2rem' }}>
          <Title size="middle" color="app-yellow">
            管理后台
          </Title>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            请输入管理密钥（CRON_SECRET）
          </p>
          <Input
            placeholder="管理密钥"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            type="password"
            size="large"
            style={{ width: '100%', display: 'flex', alignItems: 'center' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') login()
            }}
          />
          <Button type="primary" block style={{ marginTop: '1.25rem' }} onClick={login}>
            登录
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Title size="middle" color="app-orange">
          管理后台
        </Title>
        <Button type="text" size="small" onClick={logout}>
          退出登录
        </Button>
      </div>

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <StatCard label="文件总数" value={String(images.length)} color="app-blue" />
        <StatCard label="有效" value={String(activeCount)} color="app-green" />
        <StatCard label="已过期" value={String(expiredCount)} color="app-red" />
        <StatCard label="已用空间" value={formatBytes(usedSize)} color="app-yellow" />
        <StatCard label="总空间" value={storage.maxStorageFormatted || formatBytes(displayConfig.maxStorageSizeMB * 1024 * 1024)} color="app-teal" />
      </div>

      <Card style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={userFilter}
            onChange={setUserFilter}
            options={[{ key: '', label: '全部用户' }, ...users.map((u) => ({ key: u, label: u }))]}
          />
          <Button size="small" onClick={load}>
            刷新
          </Button>
          <Button size="small" onClick={doClean}>
            清理过期
          </Button>
          <Button size="small" onClick={toggleSelectAll}>
            {allSelected ? '取消全选' : '全选'}
          </Button>
          <Button size="small" danger disabled={selected.size === 0} onClick={batchDelete}>
            批量删除 ({selected.size})
          </Button>
          <Button size="small" danger onClick={deleteByUser}>
            删除用户
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-8">
          <Loading active />
        </div>
      ) : (
        <div className="table-scroll-wrap">
          <Table
            columns={columns}
            dataSource={filtered as unknown as Record<string, unknown>[]}
            rowKey="filename"
            striped
            emptyText="暂无文件"
          />
        </div>
      )}

      <RenewModal
        open={!!renewTarget}
        target={renewTarget}
        renewConfig={renewConfig}
        duration={renewDuration}
        onDurationChange={setRenewDuration}
        onConfirm={confirmRenew}
        onClose={() => setRenewTarget(null)}
        loading={renewing}
        isAdmin
      />

      <ModalShell
        open={!!confirm}
        title={confirm?.title || ''}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const fn = confirm?.onOk
          setConfirm(null)
          fn?.()
        }}
        confirmLabel={confirm?.confirmLabel || '确认'}
        danger={confirm?.danger}
      >
        {confirm && (
          <p style={{ fontSize: '0.875rem', color: '#5a4632', marginBottom: '1rem' }}>{confirm.message}</p>
        )}
      </ModalShell>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: CardColor }) {
  return (
    <Card color={color} style={{ padding: '0.75rem', textAlign: 'center' }}>
      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>{value}</div>
    </Card>
  )
}
