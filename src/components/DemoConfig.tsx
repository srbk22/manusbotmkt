import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../lib/currency'
import { DEMO_PAIRS, planSession } from '../lib/demo-session'

export interface DemoConfigInput {
  profit: number
  operations: number
  payout: number
  startBalance: number
  pair: string
}

interface Props {
  initial: DemoConfigInput
  onApply: (input: DemoConfigInput) => void
  onClose: () => void
}

export default function DemoConfig({ initial, onApply, onClose }: Props) {
  const [profit, setProfit] = useState(String(initial.profit))
  const [operations, setOperations] = useState(String(initial.operations))
  const [payout, setPayout] = useState(String(Math.round(initial.payout * 100)))
  const [startBalance, setStartBalance] = useState(String(initial.startBalance))
  const [pair, setPair] = useState(initial.pair)

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

  const plan = useMemo(() => {
    const p = Number(profit.replace(',', '.'))
    const n = Number(operations)
    const rate = Number(payout.replace(',', '.')) / 100
    return planSession(p, n, rate)
  }, [profit, operations, payout])

  const entryHigh = plan.possible && plan.entry > 400
  const canApply = plan.possible && plan.operations >= 1 && plan.operations <= 240

  function apply() {
    if (!canApply) return
    onApply({
      profit: plan.profit,
      operations: plan.operations,
      payout: plan.payout,
      startBalance: Number(startBalance.replace(',', '.')) || 0,
      pair,
    })
  }

  return createPortal(
    <div className="bot-config-overlay" onClick={onClose} role="presentation">
      <div
        className="bot-config-sheet"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="demo-config-title"
        aria-modal="true"
      >
        <div className="bot-config-accent" aria-hidden />
        <header className="bot-config-header">
          <div className="bot-config-header-text">
            <p className="bot-config-eyebrow">Exibição</p>
            <h2 id="demo-config-title" className="bot-config-title">
              Histórico e <span className="bot-config-title-manus">lucro</span>
            </h2>
            <p className="bot-config-sub">
              Defina o lucro e a quantidade de operações. O restante é calculado para a sessão fechar nesse valor.
            </p>
          </div>
          <button type="button" className="bot-config-close" onClick={onClose} aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="bot-config-body">
          <div className="bot-config-grid">
            <section className="bot-config-panel">
              <h3 className="bot-config-panel-title">Sessão</h3>

              <label className="bot-config-field">
                <span className="bot-config-label">Lucro da sessão (R$)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={profit}
                  onChange={e => setProfit(e.target.value)}
                />
              </label>

              <label className="bot-config-field bot-config-field--compact">
                <span className="bot-config-label">Operações</span>
                <input
                  type="number"
                  min="1"
                  max="240"
                  step="1"
                  value={operations}
                  onChange={e => setOperations(e.target.value)}
                />
              </label>

              <label className="bot-config-field bot-config-field--compact">
                <span className="bot-config-label">Saldo inicial (R$)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={startBalance}
                  onChange={e => setStartBalance(e.target.value)}
                />
              </label>
            </section>

            <section className="bot-config-panel">
              <h3 className="bot-config-panel-title">Mercado</h3>

              <label className="bot-config-field">
                <span className="bot-config-label">Par</span>
                <select value={pair} onChange={e => setPair(e.target.value)}>
                  {DEMO_PAIRS.map(p => (
                    <option key={p.ticker} value={p.ticker}>{p.ticker}</option>
                  ))}
                </select>
              </label>

              <label className="bot-config-field bot-config-field--compact">
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
                  {plan.wins} vitórias · {plan.losses} derrotas · entrada {formatCurrency(plan.entry, 'BRL')} · lucro {formatCurrency(plan.profit, 'BRL')}
                </p>
              ) : (
                <p className="bot-config-inline-warn" role="alert">
                  Com esse payout não fecha lucro positivo. Aumente as operações ou o payout.
                </p>
              )}
              {entryHigh && (
                <p className="bot-config-hint">
                  A entrada ficou alta. Mais operações deixam o histórico mais natural.
                </p>
              )}
            </section>
          </div>
        </div>

        <footer className="bot-config-footer">
          <button
            type="button"
            className="btn-start bot-config-start"
            onClick={apply}
            disabled={!canApply}
          >
            Gerar histórico
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
