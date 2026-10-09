import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  type UTCTimestamp,
} from 'lightweight-charts'

export interface ChartCandle {
  from: number
  open: number
  close: number
  min: number
  max: number
}

interface Props {
  activeId?: number
  activeTicker?: string
  candles?: ChartCandle[]
}

function toSeries(candles: ChartCandle[]) {
  return candles.map(c => ({
    // O gráfico desenha o horário em UTC. O deslocamento faz o eixo bater com o relógio local.
    time: (c.from - new Date(c.from * 1000).getTimezoneOffset() * 60) as UTCTimestamp,
    open: c.open,
    high: c.max,
    low: c.min,
    close: c.close,
  }))
}

export default function LiveChart({ activeId, activeTicker, candles }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)

  useEffect(() => {
    if (candles?.length) return
    seriesRef.current?.setData([])
  }, [activeTicker, candles])

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
      },
      timeScale: {
        borderColor: '#1f1f1f',
        timeVisible: true,
        // Zoom padrão mais próximo: com 6h de histórico, barSpacing evita gap à esquerda.
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
    if (candles?.length) {
      series.setData(toSeries(candles))
      chart.timeScale().fitContent()
    } else {
      series.setData([])
    }

    let cancelled = false
    const api = window.manusPro
    if (!candles && api?.botChartSnapshot) {
      void api.botChartSnapshot().then((snap) => {
        if (cancelled || !seriesRef.current || !snap?.length) return
        seriesRef.current.setData(toSeries(snap))
        chartRef.current?.timeScale().scrollToRealTime()
      }).catch(() => { /* sem snapshot ainda */ })
    }

    const unsubHistory = api?.on?.('bot:candles_history', (incoming: ChartCandle[]) => {
      if (!seriesRef.current) return
      seriesRef.current.setData(toSeries(incoming ?? []))
      chartRef.current?.timeScale().scrollToRealTime()
    }) ?? (() => {})

    const unsubCandle = api?.on?.('bot:candle', (c: ChartCandle) => {
      if (!seriesRef.current) return
      seriesRef.current.update({
        time: (c.from - new Date(c.from * 1000).getTimezoneOffset() * 60) as UTCTimestamp,
        open: c.open,
        high: c.max,
        low: c.min,
        close: c.close,
      })
    }) ?? (() => {})

    const unsubReset = api?.on?.('bot:chart_reset', () => {
      seriesRef.current?.setData([])
    }) ?? (() => {})

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return
      const { width: w, height: h } = readSize()
      chartRef.current.applyOptions({ width: w, height: h })
    })
    resizeObserver.observe(el)

    return () => {
      cancelled = true
      unsubHistory()
      unsubCandle()
      unsubReset()
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [candles])

  return (
    <div className="chart-wrap">
      <div className="chart-header">
        <span className="chart-pair">{activeTicker ?? '—'}</span>
        <span className="chart-tf">M1</span>
      </div>
      <div ref={containerRef} className="chart-container" />
      {!activeId && (
        <div className="chart-placeholder">
          Configure o histórico para visualizar o gráfico
        </div>
      )}
    </div>
  )
}
