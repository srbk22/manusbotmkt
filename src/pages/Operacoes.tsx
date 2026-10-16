import { useEffect, useRef, useState } from 'react'
import type { BotStatus } from '../types'
import DemoConfig, { type DemoConfigInput } from '../components/DemoConfig'
import ScoreBoard from '../components/ScoreBoard'
import TradeLog from '../components/TradeLog'
import LiveChart from '../components/LiveChart'
import LogConsole from '../components/LogConsole'
import { buildScene, DEMO_STRATEGIES, layoutResults, planSession, profitsFor, type DemoCandle, type DemoScene, type DemoStrategy } from '../lib/demo-session'
import { createLiveSession, mergeCandles } from '../lib/live-demo'

const STORAGE_KEY = 'manus-marketing:scene'

const DEFAULT_INPUT: DemoConfigInput = {
  profit: 250,
  operations: 18,
  payout: 0.87,
  startBalance: 1000,
  pair: 'EURUSD-OTC',
  strategy: 'hard',
  mode: 'static',
}

function savedStrategy(scene: DemoScene | null): DemoStrategy {
  if (!scene) return 'hard'
  if (scene.strategy === 'hard' || scene.strategy === 'q5' || scene.strategy === 'alt' || scene.strategy === 'last2') {
    return scene.strategy
  }
  const ids = new Set(scene.status.trades.map(t => t.strategy))
  if (ids.size === 1) {
    const id = [...ids][0]
    if (id === 'hard' || id === 'q5' || id === 'alt' || id === 'last2') return id
  }
  return 'hard'
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

function rngOf(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
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
  const [liveBars, setLiveBars] = useState<DemoCandle[]>([])
  const liveRef = useRef<ReturnType<typeof createLiveSession> | null>(null)
  const rawRef = useRef<DemoCandle[]>([])
  const adaptRef = useRef<DemoCandle[]>([])
  const runningRef = useRef(false)
  const [form, setForm] = useState<DemoConfigInput>(saved
    ? {
        profit: saved.plan.profit,
        operations: saved.plan.operations,
        payout: saved.plan.payout,
        startBalance: saved.startBalance,
        pair: saved.pair,
        strategy: savedStrategy(saved),
        mode: saved.mode === 'live' ? 'live' : 'static',
      }
    : DEFAULT_INPUT)

  runningRef.current = status?.running ?? false

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

  useEffect(() => {
    if (form.mode !== 'live' || !status?.running) return
    const id = window.setInterval(() => {
      const session = liveRef.current
      const raw = rawRef.current
      if (!session || !runningRef.current || raw.length === 0) return
      applyLive(session.ingest(raw), raw)
    }, 500)
    return () => window.clearInterval(id)
  }, [form.mode, status?.running])

  function applyLive(step: ReturnType<ReturnType<typeof createLiveSession>['ingest']>, raw: DemoCandle[]) {
    adaptRef.current = step.adaptations
    setLiveBars(mergeCandles(raw, step.adaptations))
    setLogs(step.logs)
    setStatus(prev => {
      if (!prev) return prev
      const wins = step.trades.filter(t => t.result === 'WIN').length
      const losses = step.trades.filter(t => t.result === 'LOSS').length
      const totalPnl = Math.round(step.trades.reduce((sum, t) => sum + t.profit, 0) * 100) / 100
      const balanceCurrent = Math.round((prev.balanceStart + totalPnl) * 100) / 100
      return {
        ...prev,
        running: step.done ? false : prev.running,
        totalPnl,
        balanceCurrent,
        wins,
        losses,
        winRate: step.trades.length ? Math.round((wins / step.trades.length) * 100) : 0,
        trades: step.trades,
      }
    })
    setBalance(prev => {
      const start = status?.balanceStart ?? prev
      return Math.round((start + step.trades.reduce((sum, t) => sum + t.profit, 0)) * 100) / 100
    })
    if (step.done) liveRef.current = null
  }

  function onStream(candles: DemoCandle[]) {
    rawRef.current = candles
    const session = liveRef.current
    if (!session || !runningRef.current) {
      setLiveBars(mergeCandles(candles, adaptRef.current))
      return
    }
    applyLive(session.ingest(candles), candles)
  }

  function applyConfig(input: DemoConfigInput) {
    if (input.mode === 'live') {
      const plan = planSession(input.profit, input.operations, input.payout)
      const seed = Date.now() >>> 0
      const label = DEMO_STRATEGIES.find(s => s.id === input.strategy)?.label ?? 'Prime'
      const startBalance = Math.round(Math.max(0, input.startBalance) * 100) / 100
      if (!plan.possible) return
      const results = layoutResults(plan.wins, plan.losses, rngOf(seed || 1))
      const profits = profitsFor(results, plan.entry, plan.payout, plan.profit)
      liveRef.current = createLiveSession({
        strategy: input.strategy,
        label,
        entry: plan.entry,
        seed,
        results: results.map((result, i) => ({ result, profit: profits[i] })),
      })
      rawRef.current = []
      adaptRef.current = []
      setLiveBars([])
      const statusNext: BotStatus = {
        running: true,
        activeId: 1,
        activeTicker: input.pair,
        instrument: 'digital',
        balanceStart: startBalance,
        balanceCurrent: startBalance,
        totalPnl: 0,
        wins: 0,
        losses: 0,
        consecLosses: 0,
        winRate: 0,
        trades: [],
        currency: 'BRL',
      }
      const next: DemoScene = {
        status: statusNext,
        candles: [],
        logs: ['[SISTEMA] Aguardando o gatilho no gráfico ao vivo'],
        balance: startBalance,
        plan,
        pair: input.pair,
        startBalance,
        seed,
        strategy: input.strategy,
        mode: 'live',
      }
      setForm(input)
      setScene(next)
      setStatus(statusNext)
      setLogs(next.logs)
      setCandles([])
      setBalance(startBalance)
      setConfigOpen(false)
      return
    }

    liveRef.current = null
    const next = buildScene({ ...input, seed: Date.now() >>> 0 })
    setForm(input)
    setScene(next)
    setStatus(next.status)
    setLogs(next.logs)
    setCandles(next.candles)
    setLiveBars([])
    setBalance(next.balance)
    setConfigOpen(false)
  }

  function handleStop() {
    liveRef.current = null
    setStatus(prev => (prev ? { ...prev, running: false } : prev))
    setScene(prev => (prev ? { ...prev, status: { ...prev.status, running: false } } : prev))
    setLogs(prev => ['[SISTEMA] Bot parado', ...prev].slice(0, 200))
  }

  const isRunning = status?.running ?? false
  const configured = (status?.trades.length ?? 0) > 0
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
        {configured && (
          <div className="operacoes-bar-right">
            <button
              type="button"
              className="demo-history-btn"
              onClick={() => setConfigOpen(true)}
              aria-label="Configurar histórico"
              title="Configurar histórico"
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="5" cy="4" r="1.4" fill="currentColor" />
                <circle cx="11" cy="8" r="1.4" fill="currentColor" />
                <circle cx="7" cy="12" r="1.4" fill="currentColor" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="operacoes-body">
        <div className="operacoes-left">
          <LiveChart
            activeId={form.mode === 'live' ? (status?.activeTicker ? 1 : 1) : (candles.length ? 1 : 0)}
            activeTicker={status?.activeTicker || form.pair}
            bars={form.mode === 'live' ? liveBars : candles}
            stream={form.mode === 'live'}
            onStream={onStream}
          />
          <LogConsole logs={logs} />
        </div>
        <aside className="operacoes-panel">
          <ScoreBoard status={status} activeBalance={balance} currency={currency} />
          {(isRunning || !configured) && (
            <div className="operacoes-panel-actions">
              {isRunning ? (
                <button type="button" className="btn-stop btn-stop--panel" onClick={handleStop}>
                  ■ Parar Bot
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-start btn-start--panel"
                  onClick={() => setConfigOpen(true)}
                >
                  Configurar histórico
                </button>
              )}
            </div>
          )}
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
