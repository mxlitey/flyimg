import { useEffect } from 'react'
import { formatDurationLabel } from '../lib/utils'
import type { ImageItem, RenewConfig } from '../lib/api'
import ModalShell from './ModalShell'

interface RenewModalProps {
  open: boolean
  /** 续期目标文件 */
  target: ImageItem | null
  /** 续期配置 */
  renewConfig: RenewConfig
  /** 当前选中的时长（分钟） */
  duration: string
  onDurationChange: (v: string) => void
  /** 确认续期 */
  onConfirm: () => void
  onClose: () => void
  /** 确认中 */
  loading?: boolean
  /** 管理员模式：上限显示 ∞ 且不受次数限制 */
  isAdmin?: boolean
}

/**
 * 续期弹窗（管理员与普通用户共用）：
 * - 都显示文件名
 * - 续期次数统一为"已续 N / 上限"格式；管理员上限显示 ∞
 * - 复用 ModalShell 骨架
 * - 使用原生 select 以兼容移动端（animal-island-ui Select 下拉在 Modal overflow:hidden 内被裁剪）
 */
export default function RenewModal({
  open,
  target,
  renewConfig,
  duration,
  onDurationChange,
  onConfirm,
  onClose,
  loading = false,
  isAdmin = false,
}: RenewModalProps) {
  // 打开时默认选中第一个时长
  useEffect(() => {
    if (open && renewConfig.durations.length > 0) {
      onDurationChange(String(renewConfig.durations[0]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <ModalShell
      open={open}
      title={isAdmin ? '续期资源（管理员）' : '续期资源'}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="确认续期"
      loading={loading}
      width={isAdmin ? 400 : 380}
    >
      {target && (
        <div>
          <p
            title={target.filename}
            style={{
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              marginBottom: '0.5rem',
              color: '#5a4632',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {target.filename}
          </p>
          <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: '#5a4632' }}>
            已续期次数：<b>{target.renew_count || 0}</b> / {isAdmin ? '∞' : renewConfig.max_count}
          </p>
          <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem', color: '#5a4632' }}>
            选择续期时长
          </label>
          <select
            value={duration}
            onChange={(e) => onDurationChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 13px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#725d42',
              background: '#fff',
              border: '2px solid #e8dcc8',
              borderRadius: '12px',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'auto',
              WebkitAppearance: 'auto',
            }}
          >
            {renewConfig.durations.map((d) => (
              <option key={d} value={String(d)}>
                {formatDurationLabel(d)}
              </option>
            ))}
          </select>
        </div>
      )}
    </ModalShell>
  )
}
