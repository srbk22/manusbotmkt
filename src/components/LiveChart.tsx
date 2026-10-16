import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  type UTCTimestamp,
} from 'lightweight-charts'

interface Candle {
  from: number
  open: number
  close: number
  min: number
  max: number
}

interface Props {
  activeId?: number
  activeTicker?: string
  bars?: Candle[]
  stream?: boolean
  onStream?: (candles: Candle[]) => void
  phase?: { kind: string; text: string } | null
}

type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number }

function toBar(c: Candle): Bar | null {
  const open = Number(c.open)
  const close = Number(c.close)
  const low = Number(c.min)
  const high = Number(c.max)
  const time = Number(c.from)
  if (![open, close, low, high, time].every(Number.isFinite)) return null
  if (open <= 0 || close <= 0 || low <= 0 || high <= 0 || high < low) return null
  const mid = (open + close) / 2
  if (high > mid * 1.25 || low < mid * 0.8) return null
  return { time: time as UTCTimestamp, open, high, low, close }
}

function framePrices(chart: ReturnType<typeof createChart>, bars: Bar[]) {
  if (bars.length < 2) return
  let slice = bars.slice(-90)
  const logical = chart.timeScale().getVisibleLogicalRange()
  if (logical) {
    const from = Math.max(0, Math.floor(logical.from))
    const to = Math.min(bars.length - 1, Math.ceil(logical.to))
    const visible = bars.slice(from, to + 1)
    if (visible.length > 5) slice = visible
  }
  const low = Math.min(...slice.map(bar => bar.low))
  const high = Math.max(...slice.map(bar => bar.high))
  const pad = Math.max((high - low) * 0.12, high * 0.00015)
  chart.priceScale('right').setVisibleRange({ from: low - pad, to: high + pad })
}

export default function LiveChart({ activeId, activeTicker, bars, stream, onStream, phase }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    const readSize = () => {
      const r = el.getBoundingClientRect()
      return {
        width: Math.max(80, Math.floor(r.width)),
        height: Math.max(200, Math.floor(r.height)),
      }
    }

    const { width, height } = readSize()

    const chart = createChart(el, {
      layout: {
        background: { color: '#050505' },
        textColor: '#7a7a7a',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#141414' },
        horzLines: { color: '#141414' },
      },
      crosshair: {
        vertLine: { color: '#ff5a1f' },
        horzLine: { color: '#ff5a1f' },
      },
      rightPriceScale: {
        borderColor: '#1f1f1f',
        autoScale: false,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: '#1f1f1f',
        timeVisible: true,
        barSpacing: 9,
        rightOffset: 4,
      },
      width,
      height,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3dd68c',
      downColor: '#ff4d4d',
      borderUpColor: '#3dd68c',
      borderDownColor: '#ff4d4d',
      wickUpColor: '#3dd68c',
      wickDownColor: '#ff4d4d',
    })

    chartRef.current = chart
    seriesRef.current = series
    series.setData([])

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return
      const { width: w, height: h } = readSize()
      chartRef.current.applyOptions({ width: w, height: h })
    })
    resizeObserver.observe(el)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  const onStreamRef = useRef(onStream)
  onStreamRef.current = onStream

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return
    const next = (bars ?? []).map(toBar).filter((bar): bar is Bar => bar !== null)
    if (!next.length) {
      seriesRef.current.setData([])
      return
    }
    const el = containerRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      chartRef.current.applyOptions({
        width: Math.max(80, Math.floor(rect.width)),
        height: Math.max(240, Math.floor(rect.height)),
      })
    }
    seriesRef.current.setData(next)
    chartRef.current.timeScale().scrollToRealTime()
    framePrices(chartRef.current, next)
  }, [bars])

  useEffect(() => {
    if (!stream || !activeTicker) {
      setNote(null)
      return
    }

    const ticker = activeTicker
    let stopped = false
    let painted = false
    let source: EventSource | null = null
    const candles: Candle[] = []

    const publish = () => {
      painted = candles.length > 0
      if (painted) setNote(null)
      onStreamRef.current?.(candles.map(c => ({ ...c })))
    }

    const upsert = (candle: Candle) => {
      const last = candles[candles.length - 1]
      if (last && last.from === candle.from) candles[candles.length - 1] = candle
      else if (!last || candle.from > last.from) candles.push(candle)
      publish()
    }

    const pullHistory = async () => {
      try {
        const response = await fetch(`/api/chart/history?ticker=${encodeURIComponent(ticker)}`)
        const payload = await response.json() as Candle[] | { error?: string }
        if (stopped) return
        if (response.status === 404) return
        if (!response.ok || !Array.isArray(payload)) {
          const message = !Array.isArray(payload) && payload.error
            ? payload.error
            : 'Não foi possível abrir o gráfico ao vivo deste ativo.'
          if (!painted) setNote(message)
          return
        }
        candles.splice(0, candles.length, ...payload)
        publish()
      } catch {
        if (!stopped && !painted) setNote('Não foi possível abrir o gráfico ao vivo deste ativo.')
      }
    }

    const listen = () => {
      source = new EventSource(`/api/chart/stream?ticker=${encodeURIComponent(ticker)}`)
      source.addEventListener('history', (event) => {
        const history = JSON.parse((event as MessageEvent).data) as Candle[]
        if (!history?.length) return
        candles.splice(0, candles.length, ...history)
        publish()
      })
      source.addEventListener('candle', (event) => {
        const candle = JSON.parse((event as MessageEvent).data) as Candle
        if (candle?.from) upsert(candle)
      })
      source.addEventListener('status', (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { error?: string }
        if (!payload.error || painted) return
        setNote(payload.error)
        source?.close()
      })
      source.onerror = () => {
        source?.close()
        if (stopped || painted) return
        window.setTimeout(() => {
          if (!stopped && !painted) void pullHistory()
        }, 1500)
      }
    }

    void pullHistory()
    listen()

    return () => {
      stopped = true
      source?.close()
    }
  }, [activeTicker, stream])

  const showNote = Boolean(note) && !(bars && bars.length)
  const showEmpty = !stream && !(bars && bars.length) && !note

  return (
    <div className="chart-wrap">
      <div className="chart-header">
        <span className="chart-pair">{activeTicker ?? '—'}</span>
        <span className="chart-tf">M1</span>
      </div>
      <div ref={containerRef} className="chart-container" />
      {phase && (
        <div className={`chart-phase chart-phase--${phase.kind}`}>{phase.text}</div>
      )}
      {(showNote || showEmpty) && (
        <div className="chart-placeholder">
          {note ?? 'Configure o histórico para exibir a sessão'}
        </div>
      )}
    </div>
  )
}
