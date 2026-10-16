import type { TradeRecord } from '../types'
import type { DemoCandle, DemoStrategy } from './demo-session'

export interface PlannedTrade {
  result: 'WIN' | 'LOSS'
  profit: number
}

export interface LiveStep {
  trades: TradeRecord[]
  logs: string[]
  done: boolean
  adaptations: DemoCandle[]
}

interface OpenTrade {
  from: number
  direction: 'CALL' | 'PUT'
  result: 'WIN' | 'LOSS'
  profit: number
  amount: number
}

/**
 * Segue o relógio da estratégia oficial em cima das velas reais.
 * A direção sai do gatilho. A cor da vela de resultado segue o plano da sessão.
 */
export function createLiveSession(input: {
  strategy: DemoStrategy
  label: string
  entry: number
  seed: number
  results: PlannedTrade[]
}) {
  const raw = new Map<number, DemoCandle>()
  const adaptations = new Map<number, DemoCandle>()
  const trades: TradeRecord[] = []
  const logs: string[] = ['[SISTEMA] Aguardando o gatilho no gráfico ao vivo']
  let open: OpenTrade | null = null
  let index = 0
  let cooldownUntil = 0
  let lastEntryMs = 0
  let seenPrime = new Set<number>()
  let quadrantUsed = -1
  let loggedWait = false

  function rng() {
    input.seed = (input.seed + 0x6d2b79f5) | 0
    let t = Math.imul(input.seed ^ (input.seed >>> 15), 1 | input.seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function candleAt(from: number): DemoCandle | null {
    return raw.get(from) ?? null
  }

  function takePlan(): PlannedTrade | null {
    if (index >= input.results.length) return null
    const next = input.results[index]
    index += 1
    return next
  }

  function enter(from: number, direction: 'CALL' | 'PUT', now: number) {
    const plan = takePlan()
    if (!plan) return
    open = { from, direction, result: plan.result, profit: plan.profit, amount: input.entry }
    lastEntryMs = now
    const current = candleAt(from)
    if (current) adaptations.set(from, adaptCandle(current, direction, plan.result))
    logs.unshift(`[ENTRADA] ${input.label} → ${direction === 'CALL' ? 'COMPRA' : 'VENDA'}`)
  }

  function settle(now: number) {
    if (!open) return
    const trade: TradeRecord = {
      id: `live-${open.from}`,
      strategy: input.strategy,
      direction: open.direction,
      amount: open.amount,
      enteredAt: open.from * 1000 + 2_000,
      result: open.result,
      profit: open.profit,
    }
    trades.unshift(trade)
    const sign = open.profit >= 0 ? '+' : ''
    logs.unshift(`[${open.result}] ${input.label} ${open.direction === 'CALL' ? 'COMPRA' : 'VENDA'} ${sign}${moneyLabel(open.profit)}`)
    open = null
    const extra = 25_000 + rng() * 45_000
    cooldownUntil = now + extra
    if (index >= input.results.length) {
      logs.unshift('[SISTEMA] Sessão encerrada no lucro configurado')
    }
  }

  function considerPrime(now: number) {
    if (open || index >= input.results.length) return
    const minute = Math.floor(now / 60_000) * 60
    const age = now - minute * 1000
    if (seenPrime.has(minute)) return
    if (now < cooldownUntil) return
    if (age < 1_800 || age > 4_200) {
      if (!loggedWait && age < 1_800) {
        loggedWait = true
        logs.unshift(`[SISTEMA] ${input.label}: próxima entrada nesta vela`)
      }
      return
    }
    seenPrime.add(minute)
    loggedWait = false
    enter(minute, rng() < 0.5 ? 'CALL' : 'PUT', now)
  }

  function considerPattern(candle: DemoCandle, now: number) {
    if (open || index >= input.results.length) return
    if (now - lastEntryMs < 55_000) return
    const T = candle.from
    const qS = Math.floor(T / 300) * 300
    const pos = Math.floor((T - qS) / 60)

    if (input.strategy === 'q5' && pos === 3 && quadrantUsed !== qS) {
      const c0 = candleAt(qS)
      const c1 = candleAt(qS + 60)
      const c2 = candleAt(qS + 120)
      if (!c0 || !c1 || !c2) return
      const bulls = [c0, c1, c2].every(isBull)
      const bears = [c0, c1, c2].every(isBear)
      if (!bulls && !bears) return
      quadrantUsed = qS
      enter(T, bulls ? 'PUT' : 'CALL', now)
      return
    }

    if (input.strategy === 'alt' && quadrantUsed !== qS) {
      const c4 = candleAt(T - 240)
      const c3 = candleAt(T - 180)
      const c2 = candleAt(T - 120)
      const c1 = candleAt(T - 60)
      if (!c4 || !c3 || !c2 || !c1) return
      const alt =
        (isBull(c4) && isBear(c3) && isBull(c2) && isBear(c1))
        || (isBear(c4) && isBull(c3) && isBear(c2) && isBull(c1))
      if (!alt) return
      quadrantUsed = qS
      enter(T, isBull(c1) ? 'PUT' : 'CALL', now)
      return
    }

    if (input.strategy === 'last2' && pos === 0 && quadrantUsed !== qS) {
      const c1 = candleAt(T - 120)
      const c2 = candleAt(T - 60)
      if (!c1 || !c2) return
      const bulls = isBull(c1) && isBull(c2)
      const bears = isBear(c1) && isBear(c2)
      if (!bulls && !bears) return
      quadrantUsed = qS
      enter(T, bulls ? 'PUT' : 'CALL', now)
    }
  }

  return {
    ingest(candles: DemoCandle[], now = Date.now()): LiveStep {
      const ordered = [...candles].sort((a, b) => a.from - b.from)
      for (const candle of ordered) raw.set(candle.from, candle)

      if (open && ordered.some(c => c.from >= open!.from + 60)) settle(now)

      const latest = ordered[ordered.length - 1]
      if (latest && index < input.results.length) {
        if (input.strategy === 'hard') considerPrime(now)
        else considerPattern(latest, now)
      }

      if (open) {
        const current = candleAt(open.from)
        if (current) adaptations.set(open.from, adaptCandle(current, open.direction, open.result))
      }

      return {
        trades: [...trades],
        logs: logs.slice(0, 200),
        done: index >= input.results.length && !open,
        adaptations: [...adaptations.values()],
      }
    },
  }
}

export function adaptCandle(
  candle: DemoCandle,
  direction: 'CALL' | 'PUT',
  result: 'WIN' | 'LOSS',
): DemoCandle {
  const realWin = direction === 'CALL' ? candle.close >= candle.open : candle.close < candle.open
  if (realWin === (result === 'WIN') && candle.close !== candle.open) return candle
  const body = Math.max(Math.abs(candle.close - candle.open), Math.abs(candle.open) * 0.00004)
  const wantDown = (direction === 'PUT') === (result === 'WIN')
  const close = wantDown ? candle.open - body : candle.open + body
  return {
    from: candle.from,
    open: candle.open,
    close,
    min: Math.min(candle.min, candle.open, close),
    max: Math.max(candle.max, candle.open, close),
  }
}

export function mergeCandles(raw: DemoCandle[], adaptations: DemoCandle[]): DemoCandle[] {
  const patch = new Map(adaptations.map(c => [c.from, c]))
  return raw.map(c => patch.get(c.from) ?? c)
}

function isBull(c: DemoCandle): boolean {
  return c.close > c.open
}

function isBear(c: DemoCandle): boolean {
  return c.close < c.open
}

function moneyLabel(n: number): string {
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}R$ ${abs}`
}

