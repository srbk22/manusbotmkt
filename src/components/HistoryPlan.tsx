import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadHistoryPlan, saveHistoryPlan } from '../lib/history-plan'

interface Props {
  onClose: () => void
}

export default function HistoryPlan({ onClose }: Props) {
  const saved = loadHistoryPlan()
  const [profit, setProfit] = useState(String(saved.profit))
  const [operations, setOperations] = useState(String(saved.operations))

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [onClose])

  function save() {
    const nextProfit = Number(profit.replace(',', '.'))
    const nextOps = Math.floor(Number(operations))
    if (!(nextProfit > 0) || !(nextOps >= 1) || nextOps > 240) return
    saveHistoryPlan({ profit: nextProfit, operations: nextOps })
    onClose()
  }

  const canSave = Number(profit.replace(',', '.')) > 0
    && Math.floor(Number(operations)) >= 1
    && Math.floor(Number(operations)) <= 240

  return createPortal(
    <div className="bot-config-overlay" onClick={onClose} role="presentation">
      <div
        className="bot-config-sheet"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="history-plan-title"
        aria-modal="true"
      >
        <div className="bot-config-accent" aria-hidden />
        <header className="bot-config-header">
          <div className="bot-config-header-text">
            <p className="bot-config-eyebrow">Sessão</p>
            <h2 id="history-plan-title" className="bot-config-title">
              Lucro e <span className="bot-config-title-manus">entradas</span>
            </h2>
          </div>
          <button type="button" className="bot-config-close" onClick={onClose} aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="bot-config-body">
          <section className="bot-config-panel">
            <label className="bot-config-field">
              <span className="bot-config-label">Lucro (R$)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={profit}
                onChange={e => setProfit(e.target.value)}
              />
            </label>
            <label className="bot-config-field">
              <span className="bot-config-label">Quantidade de entradas</span>
              <input
                type="number"
                min="1"
                max="240"
                step="1"
                value={operations}
                onChange={e => setOperations(e.target.value)}
              />
            </label>
          </section>
        </div>
        <footer className="bot-config-footer">
          <button type="button" className="btn-start bot-config-start" onClick={save} disabled={!canSave}>
            Salvar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
