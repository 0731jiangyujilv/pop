import { useEffect, useRef } from 'react'
import { shareOnXUrl } from '@/lib/utils'

interface TxToastProps {
  open: boolean
  onClose: () => void
  explorerUrl: string
  txHash: string
  shareText: string
  shareUrl: string
  title?: string
  showShare?: boolean
  error?: boolean
  message?: string
}

export function TxToast({
  open,
  onClose,
  explorerUrl,
  txHash,
  shareText,
  shareUrl,
  title = 'Transaction confirmed',
  showShare = true,
  error = false,
  message = '',
}: TxToastProps) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => onCloseRef.current(), error ? 5000 : 3000)
    return () => clearTimeout(t)
  }, [open, txHash, error, message])

  if (!open) return null

  return (
    <div className={`pp-toast ${error ? 'pp-toast-err' : ''}`} role="status">
      <div className="pp-toast-head">
        <span className="pp-toast-title">{error ? '✕' : '✓'} {title}</span>
        <button className="pp-toast-x" aria-label="Dismiss" onClick={onClose}>×</button>
      </div>
      {error ? (
        message && <div className="pp-toast-msg">{message}</div>
      ) : (
        <div className="pp-toast-actions">
          {txHash && (
            <a className="pp-toast-btn" href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              View on Scan
            </a>
          )}
          {showShare && (
            <a className="pp-toast-btn" href={shareOnXUrl(shareText, shareUrl)} target="_blank" rel="noopener noreferrer">
              Share on X
            </a>
          )}
        </div>
      )}
    </div>
  )
}
