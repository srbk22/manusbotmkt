import { useEffect, useState } from 'react'
import type { BotStatus } from '../types'
import DemoConfig, { type DemoConfigInput } from '../components/DemoConfig'
import ScoreBoard from '../components/ScoreBoard'
import TradeLog from '../components/TradeLog'
import LiveChart from '../components/LiveChart'
import LogConsole from '../components/LogConsole'
import { buildScene, type DemoCandle, type DemoScene } from '../lib/demo-session'

const STORAGE_KEY = 'manus-marketing:scene'

const DEFAULT_INPUT: DemoConfigInput = {
  profit: 250,
  operations: 18,
  payout: 0.87,
  startBalance: 1000,
  pair: 'EURUSD-OTC',
}

function loadScene(): DemoScene | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DemoScene
  } catch {
    return null
  }
}

export default function Operacoes() {
  const saved = loadScene()
  const [scene, setScene] = useState<DemoScene | null>(saved)
  const [status, setStatus] = useState<BotStatus | null>(saved?.status ?? null)
  const [logs, setLogs] = useState<string[]>(saved?.logs ?? [])
  const [candles, setCandles] = useState<DemoCandle[]>(saved?.candles ?? [])
  const [balance, setBalance] = useState(saved?.balance ?? 0)
  const [configOpen, setConfigOpen] = useState(false)
  const [opsPane, setOpsPane] = useState<'chart' | 'panel'>('chart')
  const [form, setForm] = useState<DemoConfigInput>(saved
    ? {
        profit: saved.plan.profit,
        operations: saved.plan.operations,
        payout: saved.plan.payout,
        startBalance: saved.startBalance,
        pair: saved.pair,
      }
    : DEFAULT_INPUT)

  useEffect(() => {
    if (!scene) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scene))
    } catch {
      /* storage cheio */
    }
  }, [scene])

  function applyConfig(input: DemoConfigInput) {
    const next = buildScene({ ...input, seed: Date.now() >>> 0 })
    setForm(input)
    setScene(next)
    setStatus(next.status)
    setLogs(next.logs)
    setCandles(next.candles)
    setBalance(next.balance)
    setConfigOpen(false)
    setOpsPane('chart')
  }

  function handleStop() {
    setStatus(prev => (prev ? { ...prev, running: false } : prev))
    setScene(prev => (prev ? { ...prev, status: { ...prev.status, running: false } } : prev))
    setLogs(prev => ['[SISTEMA] Bot parado', ...prev].slice(0, 200))
  }

  const isRunning = status?.running ?? false
  const currency = 'BRL'

  return (
    <div className="operacoes">
      <div className="operacoes-bar">
        <div className="operacoes-bar-left">
          {status?.activeId ? (
            <>
              <span className="pair-badge">{status.activeTicker}</span>
              <span className="instrument-badge">{status.instrument?.toUpperCase()}</span>
              {isRunning && <span className="running-dot active" />}
              {isRunning && <span className="live-badge">● AO VIVO</span>}
              {!isRunning && <span className="bar-idle">Sessão encerrada</span>}
            </>
          ) : (
            <span className="bar-idle">Configure o histórico para exibir a sessão</span>
          )}
        </div>
      </div>

      <div className="operacoes-mobile-tabs" role="tablist" aria-label="Painéis" data-pane={opsPane}>
        <button
          type="button"
          role="tab"
          aria-selected={opsPane === 'chart'}
          className={opsPane === 'chart' ? 'active' : ''}
          onClick={() => setOpsPane('chart')}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M2 12V8h2v4H2zm5 0V4h2v8H7zm5 0V6h2v6h-2z" fill="currentColor" />
          </svg>
          Gráfico
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={opsPane === 'panel'}
          className={opsPane === 'panel' ? 'active' : ''}
          onClick={() => setOpsPane('panel')}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z" fill="currentColor" />
          </svg>
          Painel
        </button>
      </div>

      <div className={`operacoes-body operacoes-body--${opsPane}`}>
        <div className="operacoes-left">
          <LiveChart
            activeId={status?.activeId}
            activeTicker={status?.activeTicker}
            candles={candles}
          />
          <LogConsole logs={logs} />
        </div>
        <aside className="operacoes-panel">
          <ScoreBoard status={status} activeBalance={balance} currency={currency} />
          <div className="operacoes-panel-actions">
            {isRunning && (
              <button type="button" className="btn-stop btn-stop--panel" onClick={handleStop}>
                ■ Parar Bot
              </button>
            )}
            <button
              type="button"
              className="btn-start btn-start--panel"
              onClick={() => setConfigOpen(true)}
            >
              Configurar histórico
            </button>
          </div>
          <TradeLog trades={status?.trades ?? []} currency={currency} />
        </aside>
      </div>

      {configOpen && (
        <DemoConfig
          initial={form}
          onApply={applyConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}
