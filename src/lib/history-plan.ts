const KEY = 'manus-marketing:plan'

export interface HistoryPlan {
  profit: number
  operations: number
}

const DEFAULT_PLAN: HistoryPlan = { profit: 250, operations: 18 }

export function loadHistoryPlan(): HistoryPlan {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PLAN
    const parsed = JSON.parse(raw) as Partial<HistoryPlan>
    const profit = Number(parsed.profit)
    const operations = Math.floor(Number(parsed.operations))
    if (!(profit > 0) || !(operations >= 1)) return DEFAULT_PLAN
    return { profit, operations: Math.min(240, operations) }
  } catch {
    return DEFAULT_PLAN
  }
}

export function saveHistoryPlan(plan: HistoryPlan): void {
  localStorage.setItem(KEY, JSON.stringify({
    profit: plan.profit,
    operations: plan.operations,
  }))
}
