import { useEffect } from 'react';
import './ConfirmDialog.css';

/**
 * props:
 *   open        – boolean
 *   title       – string
 *   message     – string (optional)
 *   confirmLabel – string (default "OK")
 *   danger      – boolean (red confirm button, default false)
 *   onConfirm   – () => void
 *   onCancel    – () => void
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  danger = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="cdialog-overlay" onClick={onCancel}>
      <div className="cdialog-panel" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="cdialog-header">
          <span className="cdialog-title">{title}</span>
          <button className="cdialog-close" onClick={onCancel} aria-label="Close">×</button>
        </div>
        {message && <p className="cdialog-message">{message}</p>}
        <div className="cdialog-actions">
          <button className="cdialog-cancel" onClick={onCancel}>Cancel</button>
          <button
            className={`cdialog-confirm ${danger ? 'danger' : ''}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
