import type { ReactNode } from 'react'
import { Button, Modal } from 'animal-island-ui'

interface ModalShellProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  /** 确认按钮文字 */
  confirmLabel?: string
  /** 确认按钮类型；danger 时渲染为红色危险按钮 */
  danger?: boolean
  /** 确认按钮 loading 状态 */
  loading?: boolean
  /** 确认回调；不传则不显示确认按钮（仅关闭） */
  onConfirm?: () => void
  /** 是否禁用确认 */
  confirmDisabled?: boolean
  width?: number | string
  children?: ReactNode
}

/**
 * 统一弹窗骨架：
 * - 关闭打字机效果（typewriter=false）
 * - 自定义底部（footer=null）：取消=primary block + 确认=可配 danger/primary block
 * - title 与 children 透传，各业务弹窗自行填内容
 */
export default function ModalShell({
  open,
  title,
  onClose,
  confirmLabel = '确认',
  danger = false,
  loading = false,
  onConfirm,
  confirmDisabled = false,
  width = 380,
  children,
}: ModalShellProps) {
  return (
    <Modal open={open} title={title} onClose={onClose} footer={null} width={width} typewriter={false}>
      {children}
      <div className="flex gap-2" style={{ marginTop: '1rem' }}>
        <Button type="primary" block onClick={onClose}>
          取消
        </Button>
        {onConfirm && (
          <Button
            type="primary"
            danger={danger || undefined}
            block
            loading={loading}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        )}
      </div>
    </Modal>
  )
}
