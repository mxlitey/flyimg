import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Loading, Tag, Title } from 'animal-island-ui'
import { fetchMyImages, renewFile, type FolderItem, type ImageItem, type RenewConfig } from '../lib/api'
import { displayConfig } from '../lib/config'
import { copyText, formatBytes, formatDate, formatExpireTime } from '../lib/utils'
import { useToast } from '../components/Toast'
import ModalShell from '../components/ModalShell'
import RenewModal from '../components/RenewModal'
import FilePreview, { FileThumb, FolderPreview, FolderThumb } from '../components/FilePreview'

export default function MyImagesPage() {
  const { userTag = '' } = useParams()
  const decodedTag = decodeURIComponent(userTag)
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<ImageItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [renewConfig, setRenewConfig] = useState<RenewConfig>({
    max_count: displayConfig.renewMaxCount,
    durations: displayConfig.renewDurations,
  })

  const [renewTarget, setRenewTarget] = useState<(ImageItem | FolderItem) | null>(null)
  const [renewDuration, setRenewDuration] = useState<string>(String(displayConfig.renewDurations[0] ?? 60))
  const [renewing, setRenewing] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<(ImageItem | FolderItem) | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchMyImages(decodedTag)
      if (!data.success) {
        toast.show(data.error || '加载失败')
        setImages([])
        setFolders([])
      } else {
        if (data.renew_config) setRenewConfig(data.renew_config)
        setImages(data.images || [])
        setFolders(data.folders || [])
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

  const openRenew = (img: ImageItem | FolderItem) => {
    setRenewTarget(img)
  }

  const openFile = (img: ImageItem | FolderItem) => {
    setPreviewTarget(img)
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
          {decodedTag} · {images.length + folders.length} 个
        </Tag>
      </div>

      {loading && (
        <div className="text-center py-8">
          <Loading active />
        </div>
      )}

      {!loading && images.length === 0 && folders.length === 0 && (
        <Card className="text-center" style={{ padding: '2rem' }}>
          <p style={{ color: '#8a7a66' }}>暂无文件</p>
        </Card>
      )}

      {!loading && (images.length > 0 || folders.length > 0) && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {folders.map((f) => {
            const canRenew = (f.renew_count || 0) < renewConfig.max_count
            return (
              <Card key={f.folder_key} className="overflow-hidden" style={{ padding: 0 }}>
                <div style={{ height: 160 }}>
                  <FolderThumb folder={f} onClick={() => openFile(f)} />
                </div>
                <div style={{ padding: '0.75rem' }}>
                  <p
                    title={f.filename}
                    style={{ fontSize: '0.8rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5a4632', margin: '0 0 4px' }}
                  >
                    {f.filename}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#8a7a66', margin: '2px 0' }}>
                    {f.file_count} 个文件 · {formatBytes(f.size)}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#8a7a66', margin: '2px 0' }}>{formatDate(f.created_at)}</p>
                  <p style={{ fontSize: '0.7rem', color: '#8a7a66', margin: '2px 0' }}>
                    {formatExpireTime(f.expire_at)} {f.renew_count > 0 && <span>(已续{f.renew_count}次)</span>}
                  </p>
                  <div className="flex gap-2" style={{ marginTop: '0.5rem' }}>
                    <Button
                      size="small"
                      type="primary"
                      block
                      onClick={() => {
                        if (!f.url) {
                          toast.show('该文件夹无整体直链，可在预览中复制单个文件')
                          return
                        }
                        doCopy(f.url)
                      }}
                    >
                      复制
                    </Button>
                    {canRenew && (
                      <Button size="small" type="primary" block onClick={() => openRenew(f)}>
                        续期
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
          {images.map((img) => {
            const canRenew = (img.renew_count || 0) < renewConfig.max_count
            return (
              <Card key={img.filename} className="overflow-hidden" style={{ padding: 0 }}>
                <div style={{ height: 160 }}>
                  <FileThumb url={img.url} filename={img.filename} onClick={() => openFile(img)} />
                </div>
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

      <ModalShell open={!!previewTarget} title={previewTarget?.filename || ''} onClose={() => setPreviewTarget(null)} width={720} hideCancel className="preview-modal">
        {previewTarget &&
          ((previewTarget as FolderItem).kind === 'folder' ? (
            <FolderPreview folder={previewTarget as FolderItem} userTag={decodedTag} />
          ) : (
            <FilePreview url={previewTarget.url} filename={previewTarget.filename} />
          ))}
      </ModalShell>

      <RenewModal
        open={!!renewTarget}
        target={renewTarget}
        renewConfig={renewConfig}
        duration={renewDuration}
        onDurationChange={setRenewDuration}
        onConfirm={confirmRenew}
        onClose={() => setRenewTarget(null)}
        loading={renewing}
      />
    </div>
  )
}
