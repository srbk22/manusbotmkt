import { useEffect, useRef, useState } from 'react'
import type { BotStatus, BalanceInfo, BotConfig } from '../types'
import ConfigPanel from '../components/ConfigPanel'
import ScoreBoard from '../components/ScoreBoard'
import TradeLog from '../components/TradeLog'
import LiveChart from '../components/LiveChart'
import LogConsole from '../components/LogConsole'
import { DEMO_PAIRS, DEMO_STRATEGIES, layoutResults, planSession, profitsFor, type DemoCandle, type DemoScene, type DemoStrategy } from '../lib/demo-session'
import { createLiveSession, overlayTrades } from '../lib/live-demo'
import { loadHistoryPlan } from '../lib/history-plan'
import type { DemoConfigInput } from '../components/DemoConfig'

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

function brokerTicker(raw: string): string {
  const ticker = raw.toUpperCase().replace(/\s*\(OTC\)/g, '-OTC').replace(/[^A-Z0-9-]/g, '')
  return ticker || raw
}

function strategyOf(config: BotConfig): DemoStrategy {
  if (config.strategies.hard) return 'hard'
  if (config.strategies.q5) return 'q5'
  if (config.strategies.alt) return 'alt'
  if (config.strategies.last2) return 'last2'
  return 'hard'
}
function accountAmount(list: BalanceInfo[]): number {
  const account = list.find(b => b.type === 'real') ?? list[0]
  return Math.round((account?.amount ?? 0) * 100) / 100
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
  const savedIsLive = saved?.mode === 'live'
  const [scene, setScene] = useState<DemoScene | null>(savedIsLive ? null : saved)
  const [status, setStatus] = useState<BotStatus | null>(savedIsLive ? null : saved?.status ?? null)
  const [logs, setLogs] = useState<string[]>(savedIsLive ? [] : saved?.logs ?? [])
  const [candles, setCandles] = useState<DemoCandle[]>([])
  const [balance, setBalance] = useState(savedIsLive ? 0 : saved?.balance ?? 0)
  const [configOpen, setConfigOpen] = useState(false)
  const [balances, setBalances] = useState<BalanceInfo[]>([])
  const [liveBase, setLiveBase] = useState<number | null>(null)
  const [liveBars, setLiveBars] = useState<DemoCandle[]>([])
  const liveRef = useRef<ReturnType<typeof createLiveSession> | null>(null)
  const rawRef = useRef<DemoCandle[]>([])
  const staticTrades = useRef(saved && !savedIsLive ? saved.status.trades : [])
  const runningRef = useRef(false)
  const liveTarget = useRef(0)
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
    void window.manusPro.sdkBalances().then(res => {
      if (res.ok && res.balances) setBalances(res.balances)
    }).catch(() => {})
  }, [])

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
      if (!session || !runningRef.current) return
      const step = session.tick(Date.now(), rawRef.current)
      setLiveBars(step.candles)
      setLogs(step.logs)
      setStatus(prev => {
        if (!prev) return prev
        const closed = step.trades.filter(t => t.result !== 'PENDING')
        const wins = closed.filter(t => t.result === 'WIN').length
        const losses = closed.filter(t => t.result === 'LOSS').length
        const totalPnl = step.done
          ? liveTarget.current
          : Math.round(closed.reduce((sum, t) => sum + t.profit, 0) * 100) / 100
        return {
          ...prev,
          running: step.done ? false : prev.running,
          totalPnl,
          balanceCurrent: Math.round((prev.balanceStart + totalPnl) * 100) / 100,
          wins,
          losses,
          winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
          trades: step.trades,
        }
      })
      setBalance(prev => {
        const start = status?.balanceStart ?? prev
        const pnl = step.trades.filter(t => t.result !== 'PENDING').reduce((sum, t) => sum + t.profit, 0)
        return Math.round((start + pnl) * 100) / 100
      })
      if (step.done) {
        liveRef.current = null
      }
    }, 300)
    return () => window.clearInterval(id)
  }, [form.mode, status?.running, status?.balanceStart])

  function onStream(next: DemoCandle[]) {
    rawRef.current = next
    if (liveRef.current) return
    const painted = staticTrades.current.length ? overlayTrades(next, staticTrades.current) : next
    setLiveBars(painted)
    if (staticTrades.current.length) setCandles(painted)
  }

  function startBot(config: BotConfig) {
    const history = loadHistoryPlan()
    const plan = planSession(history.profit, history.operations, 0.87)
    const strategy = strategyOf(config)
    const label = DEMO_STRATEGIES.find(s => s.id === strategy)?.label ?? 'Prime'
    const ticker = brokerTicker(config.activeTicker)
    const startBalance = accountAmount(balances)
    setConfigOpen(false)
    if (!plan.possible) {
      setLogs(prev => ['[SISTEMA] Ajuste o lucro e a quantidade de entradas.', ...prev].slice(0, 200))
      return
    }
    const seed = Date.now() >>> 0
    setLiveBase(startBalance)
    liveTarget.current = plan.profit
    const results = layoutResults(plan.wins, plan.losses, rngOf(seed || 1))
    const profits = profitsFor(results, plan.entry, plan.payout, plan.profit)
    const pair = DEMO_PAIRS.find(p => p.ticker === ticker) ?? DEMO_PAIRS[0]
    staticTrades.current = []
    liveRef.current = createLiveSession({
      strategy,
      label,
      ticker,
      price: pair.price,
      pip: pair.pip,
      entry: plan.entry,
      seed,
      results: results.map((result, i) => ({ result, profit: profits[i] })),
    })
    setLiveBars(rawRef.current)
    const statusNext: BotStatus = {
      running: true,
      activeId: config.activeId,
      activeTicker: ticker,
      instrument: config.instrument,
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
      logs: ['[SISTEMA] Bot iniciado'],
      balance: startBalance,
      plan,
      pair: ticker,
      startBalance,
      seed,
      strategy,
      mode: 'live',
    }
    setForm({
      profit: plan.profit,
      operations: plan.operations,
      payout: plan.payout,
      startBalance,
      pair: ticker,
      strategy,
      mode: 'live',
    })
    setScene(next)
    setStatus(statusNext)
    setLogs(next.logs)
    setCandles([])
    setBalance(startBalance)
  }

  function handleStop() {
    liveRef.current = null
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
          {isRunning && (
            <>
              <span className="pair-badge">{status?.activeTicker}</span>
              <span className="instrument-badge">{status?.instrument?.toUpperCase()}</span>
              <span className="running-dot active" />
              <span className="live-badge">● AO VIVO</span>
            </>
          )}
          {!isRunning && <span className="bar-idle">Bot aguardando configuração</span>}
        </div>
        </div>

      <div className="operacoes-body">
        <div className="operacoes-left">
          <LiveChart
            activeId={form.mode === 'live' ? 1 : (candles.length ? 1 : 0)}
            activeTicker={status?.activeTicker || form.pair}
            bars={form.mode === 'live' ? liveBars : (candles.length ? candles : liveBars)}
            stream={Boolean(status?.activeTicker || form.pair)}
            onStream={onStream}
          />
          <LogConsole logs={logs} forceOpen={form.mode === 'live' && isRunning} />
        </div>
        <aside className="operacoes-panel">
          <ScoreBoard
            status={status}
            activeBalance={
              form.mode === 'live' && liveBase !== null
                ? Math.round((liveBase + (status?.totalPnl ?? 0)) * 100) / 100
                : accountAmount(balances)
            }
            currency={balances.find(b => b.type === 'real')?.currency ?? balances[0]?.currency ?? currency}
          />
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
                ▶ Iniciar Bot
              </button>
            )}
          </div>
          <TradeLog trades={status?.trades ?? []} currency={currency} />
        </aside>
      </div>

      {configOpen && (
        <ConfigPanel
          balances={balances}
          onStart={startBot}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}
