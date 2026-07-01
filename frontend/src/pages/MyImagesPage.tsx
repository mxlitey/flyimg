import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Loading, Select, Tag, Title } from 'animal-island-ui'
import { fetchMyImages, renewFile, type ImageItem, type RenewConfig } from '../lib/api'
import { displayConfig } from '../lib/config'
import { copyText, formatBytes, formatDate, formatDurationLabel, formatExpireTime } from '../lib/utils'
import { useToast } from '../components/Toast'
import ModalShell from '../components/ModalShell'

export default function MyImagesPage() {
  const { userTag = '' } = useParams()
  const decodedTag = decodeURIComponent(userTag)
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<ImageItem[]>([])
  const [renewConfig, setRenewConfig] = useState<RenewConfig>({
    max_count: displayConfig.renewMaxCount,
    durations: displayConfig.renewDurations,
  })

  const [renewTarget, setRenewTarget] = useState<ImageItem | null>(null)
  const [renewDuration, setRenewDuration] = useState<string>(String(displayConfig.renewDurations[0] ?? 60))
  const [renewing, setRenewing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchMyImages(decodedTag)
      if (!data.success) {
        toast.show(data.error || '加载失败')
        setImages([])
      } else {
        if (data.renew_config) setRenewConfig(data.renew_config)
        setImages(data.images || [])
      }
    } catch {
      toast.show('加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedTag])

  const openRenew = (img: ImageItem) => {
    setRenewTarget(img)
    setRenewDuration(String(renewConfig.durations[0] ?? 60))
  }

  const confirmRenew = async () => {
    if (!renewTarget) return
    setRenewing(true)
    try {
      const data = await renewFile(renewTarget.filename, parseInt(renewDuration, 10), decodedTag)
      if (data.success) {
        toast.show(data.message)
        setRenewTarget(null)
        load()
      } else {
        toast.show(data.error || '续期失败')
      }
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Title size="middle" color="app-blue">
          我的文件
        </Title>
        <Tag color="app-teal">
          {decodedTag} · {images.length} 个
        </Tag>
      </div>

      {loading && (
        <div className="text-center py-8">
          <Loading active />
        </div>
      )}

      {!loading && images.length === 0 && (
        <Card className="text-center" style={{ padding: '2rem' }}>
          <p style={{ color: '#8a7a66' }}>暂无文件</p>
        </Card>
      )}

      {!loading && images.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {images.map((img) => {
            const canRenew = (img.renew_count || 0) < renewConfig.max_count
            return (
              <Card key={img.filename} className="overflow-hidden" style={{ padding: 0 }}>
                <img
                  src={img.url}
                  alt="资源"
                  style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                />
                <div style={{ padding: '0.75rem' }}>
                  <p
                    title={img.filename}
                    style={{ fontSize: '0.8rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5a4632', margin: '0 0 4px' }}
                  >
                    {img.filename}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#8a7a66', margin: '2px 0' }}>{formatDate(img.created_at)}</p>
                  <p style={{ fontSize: '0.7rem', color: '#8a7a66', margin: '2px 0' }}>
                    {formatExpireTime(img.expire_at)} {img.renew_count > 0 && <span>(已续{img.renew_count}次)</span>}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#8a7a66', margin: '2px 0' }}>{formatBytes(img.size)}</p>
                  <div className="flex gap-2" style={{ marginTop: '0.5rem' }}>
                    <Button size="small" type="primary" block onClick={() => doCopy(img.url)}>
                      复制
                    </Button>
                    {canRenew && (
                      <Button size="small" type="primary" block onClick={() => openRenew(img)}>
                        续期
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ModalShell
        open={!!renewTarget}
        title="续期资源"
        onClose={() => setRenewTarget(null)}
        onConfirm={confirmRenew}
        confirmLabel="确认续期"
        loading={renewing}
      >
        {renewTarget && (
          <div>
            <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#5a4632' }}>
              剩余续期次数：<b>{renewConfig.max_count - (renewTarget.renew_count || 0)}</b> / {renewConfig.max_count}
            </p>
            <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem', color: '#5a4632' }}>
              选择续期时长
            </label>
            <Select
              value={renewDuration}
              onChange={setRenewDuration}
              options={renewConfig.durations.map((d) => ({ key: String(d), label: formatDurationLabel(d) }))}
            />
          </div>
        )}
      </ModalShell>
    </div>
  )
}
