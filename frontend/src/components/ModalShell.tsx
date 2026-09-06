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
  /** 是否隐藏底部"取消"按钮（纯预览/提示弹窗用，右上角叉号关闭） */
  hideCancel?: boolean
  width?: number | string
  children?: ReactNode
}

/**
 * 统一弹窗骨架：
 * - 关闭打字机效果（typewriter=false）
 * - 自定义底部（footer=null）：取消=primary block + 确认=可配 danger/primary block
 * - 关闭叉号固定在弹窗右上角（相对 .animal-modal 绝对定位），标题自动换行（移动端字号自适应）
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
  hideCancel = false,
  width = 380,
  children,
}: ModalShellProps) {
  return (
    <Modal
      open={open}
      title={
        <div style={{ width: '100%' }}>
          <span
            style={{
              display: 'block',
              fontSize: 'clamp(0.875rem, 2.6vw, 1.0625rem)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </span>
          {/* 固定在弹窗右上角：.animal-modal 为 position:relative 定位上下文 */}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1.25rem', lineHeight: 1, color: '#8a7760',
              padding: '0.25rem', borderRadius: '0.375rem',
            }}
          >
            ×
          </button>
        </div>
      }
      onClose={onClose}
      footer={null}
      width={width}
      typewriter={false}
    >
      {children}
      {!hideCancel && (
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
      )}
    </Modal>
  )
}
