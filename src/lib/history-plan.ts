const KEY = 'manus-marketing:plan'

export interface HistoryPlan {
  profit: number
  operations: number
  payout: number
}

const DEFAULT_PLAN: HistoryPlan = { profit: 250, operations: 18, payout: 0.87 }

export function loadHistoryPlan(): HistoryPlan {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PLAN
    const parsed = JSON.parse(raw) as Partial<HistoryPlan>
    const profit = Number(parsed.profit)
    const operations = Math.floor(Number(parsed.operations))
    const payout = Number(parsed.payout)
    if (!(profit > 0) || !(operations >= 1)) return DEFAULT_PLAN
    return {
      profit,
      operations: Math.min(240, operations),
      payout: payout >= 0.5 && payout <= 0.95 ? payout : DEFAULT_PLAN.payout,
    }
  } catch {
    return DEFAULT_PLAN
  }
}

export function saveHistoryPlan(plan: HistoryPlan): void {
  localStorage.setItem(KEY, JSON.stringify({
    profit: plan.profit,
    operations: plan.operations,
    payout: plan.payout,
  }))
}
