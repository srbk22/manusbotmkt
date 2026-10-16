import type { TradeRecord } from '../types'
import type { DemoCandle, DemoStrategy } from './demo-session'

export interface PlannedTrade {
  result: 'WIN' | 'LOSS'
  profit: number
}

export interface LivePhase {
  kind: 'scan' | 'found' | 'entry' | 'idle'
  text: string
}

export interface LiveStep {
  trades: TradeRecord[]
  logs: string[]
  done: boolean
  candles: DemoCandle[]
  phase: LivePhase
}

interface Slot {
  at: number
  settleAt: number
  from: number
  direction: 'CALL' | 'PUT'
  result: 'WIN' | 'LOSS'
  profit: number
  amount: number
  found: boolean
  entered: boolean
  settled: boolean
}

/**
 * Sessão visual. Não envia ordem e não usa a conta de ninguém.
 * O relógio segue a estratégia da versão oficial. A vela da entrada
 * fecha no lado do resultado planejado.
 */
export function createLiveSession(input: {
  strategy: DemoStrategy
  label: string
  ticker: string
  price: number
  pip: number
  entry: number
  seed: number
  results: PlannedTrade[]
}) {
  const rng = rngOf(input.seed || 1)
  const slots = schedule(input, rng)
  const logs: string[] = [
    '✅ Monitorando ao vivo — identificando oportunidade',
    '🟢 Bot iniciado',
  ]
  const trades: TradeRecord[] = []
  const synthetic = new Map<number, DemoCandle>()
  let seeded = false

  function tick(now: number, market: DemoCandle[]): LiveStep {
    const base = market.length ? market : ensureSynthetic(now)
    for (const slot of slots) {
      if (!slot.found && now >= slot.at - 4_000 && !slot.entered) {
        slot.found = true
        logs.unshift(`✨ Oportunidade identificada · ${input.label} · ${side(slot.direction)}`)
      }
      if (!slot.entered && now >= slot.at) {
        slot.entered = true
        trades.unshift({
          id: `live-${slot.from}`,
          strategy: input.strategy,
          direction: slot.direction,
          amount: slot.amount,
          enteredAt: slot.at,
          result: 'PENDING',
          profit: 0,
        })
        logs.unshift(`📍 ${input.label}: ${slot.direction} | ${input.ticker} | ${slot.amount.toFixed(2)} BRL`)
      }
      if (slot.entered && !slot.settled && now >= slot.settleAt) {
        slot.settled = true
        const trade = trades.find(t => t.id === `live-${slot.from}`)
        if (trade) {
          trade.result = slot.result
          trade.profit = slot.profit
        }
        const sign = slot.profit >= 0 ? '+' : ''
        logs.unshift(`${slot.result === 'WIN' ? '✅ WIN' : '❌ LOSS'} | ${input.label} | ${slot.direction} | ${sign}${slot.profit.toFixed(2)}`)
        if (slots.every(s => s.settled)) logs.unshift('[SISTEMA] Sessão encerrada no lucro configurado')
        else logs.unshift('✅ Monitorando ao vivo — identificando oportunidade')
      }
    }

    const candles = base.map(c => {
      const slot = slots.find(s => s.entered && s.from === c.from)
      if (!slot) return c
      return paintResult(c, slot, now)
    })

    const active = slots.find(s => s.entered && !s.settled)
    if (active && !candles.some(c => c.from === active.from)) {
      const open = base[base.length - 1]?.close ?? input.price
      candles.push(paintResult({
        from: active.from,
        open,
        close: open,
        min: open,
        max: open,
      }, active, now))
    }

    return {
      trades: trades.map(t => ({ ...t })),
      logs: logs.slice(0, 200),
      done: slots.every(s => s.settled),
      candles: candles.sort((a, b) => a.from - b.from),
      phase: currentPhase(slots, now, input.label),
    }
  }

  function ensureSynthetic(now: number): DemoCandle[] {
    const minute = Math.floor(now / 1000 / 60) * 60
    if (!seeded) {
      let price = input.price
      for (let i = 90; i >= 1; i--) {
        const from = minute - i * 60
        const open = price
        const delta = (rng() - 0.48) * input.pip * 8
        const close = open + delta
        synthetic.set(from, {
          from,
          open,
          close,
          min: Math.min(open, close) - input.pip,
          max: Math.max(open, close) + input.pip,
        })
        price = close
      }
      seeded = true
    }
    const prev = synthetic.get(minute - 60)
    const open = prev?.close ?? input.price
    const current = synthetic.get(minute)
    const drift = (rng() - 0.5) * input.pip * 2
    const close = (current?.close ?? open) + drift
    synthetic.set(minute, {
      from: minute,
      open: current?.open ?? open,
      close,
      min: Math.min(current?.min ?? open, close),
      max: Math.max(current?.max ?? open, close),
    })
    return [...synthetic.values()].sort((a, b) => a.from - b.from)
  }

  return { tick }
}

function schedule(input: {
  strategy: DemoStrategy
  entry: number
  results: PlannedTrade[]
}, rng: () => number): Slot[] {
  const now = Date.now()
  const times = entryTimes(input.strategy, input.results.length, now, rng)
  return times.map((at, i) => {
    const from = Math.floor(at / 60_000) * 60
    return {
      at,
      settleAt: from * 1000 + 60_000,
      from,
      direction: rng() < 0.5 ? 'CALL' : 'PUT',
      result: input.results[i].result,
      profit: input.results[i].profit,
      amount: input.entry,
      found: false,
      entered: false,
      settled: false,
    }
  })
}

function entryTimes(strategy: DemoStrategy, n: number, now: number, rng: () => number): number[] {
  const times: number[] = []
  let minute = Math.floor(now / 60_000) * 60_000

  if (strategy === 'hard') {
    let at = minute + 2_000
    if (at < now + 12_000) {
      minute += 60_000
      at = minute + 2_000
    }
    times.push(at)
    while (times.length < n) {
      minute += (rng() < 0.72 ? 2 : 3) * 60_000
      times.push(minute + 2_000 + Math.floor(rng() * 2_000))
    }
    return times
  }

  if (strategy === 'q5') {
    const pos = Math.floor((minute / 1000) % 300 / 60)
    let delta = (3 - pos + 5) % 5
    if (minute + delta * 60_000 + 2_000 < now + 12_000) delta += 5
    minute += delta * 60_000
    times.push(minute + 2_000)
    while (times.length < n) {
      const blocks = rng() < 0.55 ? 2 : rng() < 0.85 ? 1 : 3
      minute += blocks * 5 * 60_000
      times.push(minute + 2_000)
    }
    return times
  }

  if (strategy === 'last2') {
    const pos = Math.floor((minute / 1000) % 300 / 60)
    let delta = (5 - pos) % 5
    if (minute + delta * 60_000 + 2_000 < now + 12_000) delta += 5
    minute += delta * 60_000
    times.push(minute + 2_000)
    while (times.length < n) {
      minute += (1 + Math.floor(rng() * 3)) * 5 * 60_000
      times.push(minute + 2_000)
    }
    return times
  }

  let at = now + 12_000 + Math.floor(rng() * 8_000)
  times.push(at)
  while (times.length < n) {
    at += (5 + Math.floor(rng() * 4)) * 60_000
    times.push(at)
  }
  return times
}

function currentPhase(slots: Slot[], now: number, label: string): LivePhase {
  if (slots.every(s => s.settled)) return { kind: 'idle', text: 'Sessão encerrada' }
  const open = slots.find(s => s.entered && !s.settled)
  if (open) return { kind: 'entry', text: `Entrada · ${label} · ${side(open.direction)}` }
  const next = slots.find(s => !s.entered)
  if (!next) return { kind: 'idle', text: 'Sessão encerrada' }
  if (now >= next.at - 4_000) {
    return { kind: 'found', text: `Oportunidade identificada · ${side(next.direction)}` }
  }
  const sec = Math.max(1, Math.ceil((next.at - now) / 1000))
  return { kind: 'scan', text: `Identificando oportunidade · ${label} · ${sec}s` }
}

function paintResult(candle: DemoCandle, slot: Slot, now: number): DemoCandle {
  const span = Math.max(1_000, slot.settleAt - slot.at)
  const progress = Math.min(1, Math.max(0.15, (now - slot.at) / span))
  const body = Math.max(Math.abs(candle.open) * 0.00012, Math.abs(candle.close - candle.open)) * (0.45 + progress)
  const down = (slot.direction === 'PUT') === (slot.result === 'WIN')
  const close = down ? candle.open - body : candle.open + body
  return {
    from: candle.from,
    open: candle.open,
    close,
    min: Math.min(candle.min, candle.open, close),
    max: Math.max(candle.max, candle.open, close),
  }
}

function side(direction: 'CALL' | 'PUT'): string {
  return direction === 'CALL' ? 'COMPRA' : 'VENDA'
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
