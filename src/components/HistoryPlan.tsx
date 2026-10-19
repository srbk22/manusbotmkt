import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../lib/currency'
import { planSession } from '../lib/demo-session'
import { loadHistoryPlan, saveHistoryPlan } from '../lib/history-plan'

interface Props {
  onClose: () => void
}

export default function HistoryPlan({ onClose }: Props) {
  const saved = loadHistoryPlan()
  const [profit, setProfit] = useState(String(saved.profit))
  const [operations, setOperations] = useState(String(saved.operations))
  const [payout, setPayout] = useState(String(Math.round(saved.payout * 100)))

  const plan = useMemo(() => {
    const value = Number(profit.replace(',', '.'))
    const count = Math.floor(Number(operations))
    const rate = Number(payout.replace(',', '.')) / 100
    return planSession(value, count, rate)
  }, [profit, operations, payout])

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
    if (!plan.possible) return
    saveHistoryPlan({
      profit: plan.profit,
      operations: plan.operations,
      payout: plan.payout,
    })
    onClose()
  }

  const canSave = plan.possible && plan.operations <= 240

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
            <label className="bot-config-field">
              <span className="bot-config-label">Payout (%)</span>
              <input
                type="number"
                min="50"
                max="95"
                step="1"
                value={payout}
                onChange={e => setPayout(e.target.value)}
              />
            </label>
            {plan.possible ? (
              <p className="bot-config-preview">
                Coloque {formatCurrency(plan.entry, 'BRL')} por entrada para chegar em {formatCurrency(plan.profit, 'BRL')}.
              </p>
            ) : (
              <p className="bot-config-inline-warn" role="alert">
                Com esse payout não fecha lucro positivo. Aumente as entradas ou o payout.
              </p>
            )}
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
