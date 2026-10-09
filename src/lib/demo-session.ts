import type { BotStatus, TradeRecord } from '../types'

export interface DemoCandle {
  from: number
  open: number
  close: number
  min: number
  max: number
}

export interface DemoPair {
  ticker: string
  price: number
  pip: number
}

export const DEMO_PAIRS: DemoPair[] = [
  { ticker: 'EURUSD-OTC', price: 1.08642, pip: 0.00008 },
  { ticker: 'GBPUSD-OTC', price: 1.27318, pip: 0.0001 },
  { ticker: 'USDJPY-OTC', price: 149.236, pip: 0.012 },
  { ticker: 'EURJPY-OTC', price: 162.418, pip: 0.014 },
  { ticker: 'AUDCAD-OTC', price: 0.91246, pip: 0.00008 },
]

const STRATEGIES = ['q5', 'alt', 'last2'] as const

export interface SessionPlan {
  profit: number
  operations: number
  payout: number
  wins: number
  losses: number
  entry: number
  possible: boolean
}

export interface DemoScene {
  status: BotStatus
  candles: DemoCandle[]
  logs: string[]
  balance: number
  plan: SessionPlan
  pair: string
  startBalance: number
  seed: number
}

function money(n: number): number {
  return Math.round(n * 100) / 100
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

function pickWins(operations: number, payout: number): number {
  const minWins = Math.ceil((operations + 1e-9) / (1 + payout))
  let chosen = Math.min(operations, Math.max(minWins, Math.round(operations * 0.66)))
  while (chosen < operations && chosen * payout - (operations - chosen) <= 0) chosen += 1
  return chosen
}

export function planSession(profit: number, operations: number, payout = 0.87): SessionPlan {
  const n = Math.max(1, Math.floor(operations))
  const p = money(profit)
  const rate = Math.min(0.95, Math.max(0.5, payout))
  if (!(p > 0) || !Number.isFinite(p)) {
    return { profit: p, operations: n, payout: rate, wins: 0, losses: n, entry: 0, possible: false }
  }
  const wins = pickWins(n, rate)
  const losses = n - wins
  const denom = wins * rate - losses
  const possible = denom > 0
  const entry = possible ? money(p / denom) : 0
  return { profit: p, operations: n, payout: rate, wins, losses, entry, possible }
}

function layoutResults(wins: number, losses: number, rng: () => number): Array<'WIN' | 'LOSS'> {
  const out: Array<'WIN' | 'LOSS'> = []
  let w = wins
  let l = losses
  let streak = 0
  while (w + l > 0) {
    const canLoss = l > 0 && streak < 2
    const canWin = w > 0
    let loss = false
    if (!canWin) loss = true
    else if (!canLoss) loss = false
    else loss = rng() < (l / (w + l)) * 0.9
    if (loss) {
      out.push('LOSS')
      l -= 1
      streak += 1
    } else {
      out.push('WIN')
      w -= 1
      streak = 0
    }
  }
  return out
}

function profitsFor(results: Array<'WIN' | 'LOSS'>, entry: number, payout: number, target: number): number[] {
  const winBase = money(entry * payout)
  const profits = results.map(r => (r === 'WIN' ? winBase : -entry))
  const winIdx = results.map((r, i) => (r === 'WIN' ? i : -1)).filter(i => i >= 0)
  let diff = money(target - profits.reduce((a, b) => a + b, 0))
  let guard = 0
  let k = 0
  while (Math.abs(diff) >= 0.01 && winIdx.length && guard < 20000) {
    const i = winIdx[k % winIdx.length]
    const step = diff > 0 ? 0.01 : -0.01
    const next = money(profits[i] + step)
    if (next >= 0.01) {
      profits[i] = next
      diff = money(diff - step)
    }
    k += 1
    guard += 1
  }
  if (Math.abs(diff) >= 0.01 && winIdx.length) {
    profits[winIdx[0]] = money(profits[winIdx[0]] + diff)
  }
  return profits
}

function buildTimes(n: number, rng: () => number, now: number): number[] {
  let cursor = now - (120 + Math.floor(rng() * 360)) * 1000
  const desc: number[] = []
  for (let i = 0; i < n; i++) {
    const roll = rng()
    const gapSec = roll < 0.62
      ? 70 + Math.floor(rng() * 90)
      : roll < 0.88
        ? 180 + Math.floor(rng() * 220)
        : 480 + Math.floor(rng() * 520)
    cursor -= gapSec * 1000
    const d = new Date(cursor)
    d.setSeconds(4 + Math.floor(rng() * 50))
    d.setMilliseconds(0)
    desc.push(d.getTime())
  }
  const times = desc.reverse()
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= times[i - 1] + 50_000) {
      times[i] = times[i - 1] + (62 + Math.floor(rng() * 48)) * 1000
    }
  }
  const last = times[times.length - 1] ?? now
  if (last > now - 30_000) {
    const shift = last - (now - 90_000)
    for (let i = 0; i < times.length; i++) times[i] -= shift
  }
  return times
}

function roundPx(price: number, pip: number): number {
  const decimals = pip < 0.001 ? 5 : 3
  return Number(price.toFixed(decimals))
}

function buildCandles(
  trades: TradeRecord[],
  pair: DemoPair,
  rng: () => number,
): DemoCandle[] {
  if (!trades.length) return []
  const chronological = [...trades].sort((a, b) => a.enteredAt - b.enteredAt)
  const start = Math.floor(chronological[0].enteredAt / 60_000) * 60 - 40 * 60
  const end = Math.floor(chronological[chronological.length - 1].enteredAt / 60_000) * 60 + 3 * 60
  const byMinute = new Map<number, TradeRecord>()
  for (const t of chronological) {
    byMinute.set(Math.floor(t.enteredAt / 60_000) * 60, t)
  }

  let price = pair.price
  const candles: DemoCandle[] = []
  for (let t = start; t <= end; t += 60) {
    const trade = byMinute.get(t)
    const open = price
    let delta: number
    if (trade) {
      const up = (trade.direction === 'CALL' && trade.result === 'WIN')
        || (trade.direction === 'PUT' && trade.result === 'LOSS')
      const body = pair.pip * (5 + rng() * 11)
      delta = up ? body : -body
    } else {
      delta = pair.pip * (rng() - 0.48) * 6
    }
    const close = roundPx(open + delta, pair.pip)
    const wick = pair.pip * (1 + rng() * 4)
    const high = roundPx(Math.max(open, close) + wick, pair.pip)
    const low = roundPx(Math.min(open, close) - wick * (0.6 + rng() * 0.8), pair.pip)
    candles.push({
      from: t,
      open: roundPx(open, pair.pip),
      close,
      max: high,
      min: Math.min(low, roundPx(open, pair.pip), close),
    })
    price = close
  }
  return candles
}

function moneyLabel(n: number): string {
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}R$ ${abs}`
}

export function buildScene(input: {
  profit: number
  operations: number
  payout?: number
  startBalance: number
  pair: string
  seed?: number
}): DemoScene {
  const plan = planSession(input.profit, input.operations, input.payout ?? 0.87)
  const seed = input.seed ?? (Date.now() >>> 0)
  const rng = rngOf(seed || 1)
  const pair = DEMO_PAIRS.find(p => p.ticker === input.pair) ?? DEMO_PAIRS[0]
  const startBalance = money(Math.max(0, input.startBalance))

  if (!plan.possible) {
    return {
      status: {
        running: false,
        activeId: 0,
        activeTicker: pair.ticker,
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
      },
      candles: [],
      logs: ['[SISTEMA] Não foi possível montar essa sessão. Aumente as operações ou o payout.'],
      balance: startBalance,
      plan,
      pair: pair.ticker,
      startBalance,
      seed,
    }
  }

  const results = layoutResults(plan.wins, plan.losses, rng)
  const profits = profitsFor(results, plan.entry, plan.payout, plan.profit)
  const times = buildTimes(plan.operations, rng, Date.now())
  const directions: Array<'CALL' | 'PUT'> = []
  let same = 0
  let last: 'CALL' | 'PUT' | null = null
  for (let i = 0; i < plan.operations; i++) {
    let dir: 'CALL' | 'PUT' = rng() < 0.5 ? 'CALL' : 'PUT'
    if (last && dir === last && same >= 3) dir = last === 'CALL' ? 'PUT' : 'CALL'
    if (dir === last) same += 1
    else same = 1
    last = dir
    directions.push(dir)
  }

  const chronological: TradeRecord[] = results.map((result, i) => ({
    id: `mkt-${seed}-${i}`,
    strategy: STRATEGIES[Math.floor(rng() * STRATEGIES.length)],
    direction: directions[i],
    amount: plan.entry,
    enteredAt: times[i],
    result,
    profit: profits[i],
  }))

  const wins = chronological.filter(t => t.result === 'WIN').length
  const losses = chronological.length - wins
  const totalPnl = money(chronological.reduce((a, t) => a + t.profit, 0))
  const balance = money(startBalance + totalPnl)
  const candles = buildCandles(chronological, pair, rng)

  const logs: string[] = ['[SISTEMA] Bot iniciado']
  for (const t of chronological) {
    const name = t.strategy === 'q5' ? 'FT5' : t.strategy === 'alt' ? 'Opostos' : 'P2'
    logs.push(`[ENTRADA] ${name} → ${t.direction} ${moneyLabel(t.amount)}`)
    logs.push(`[${t.result}] ${name} ${t.direction} ${t.profit >= 0 ? '+' : ''}${moneyLabel(t.profit)}`)
  }

  const trades = [...chronological].reverse()

  return {
    status: {
      running: true,
      activeId: 1,
      activeTicker: pair.ticker,
      instrument: 'digital',
      balanceStart: startBalance,
      balanceCurrent: balance,
      totalPnl,
      wins,
      losses,
      consecLosses: 0,
      winRate: chronological.length ? Math.round((wins / chronological.length) * 100) : 0,
      trades,
      currency: 'BRL',
    },
    candles,
    logs: logs.reverse(),
    balance,
    plan: { ...plan, profit: totalPnl },
    pair: pair.ticker,
    startBalance,
    seed,
  }
}
