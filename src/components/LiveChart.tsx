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
}

function toBar(c: Candle) {
  return {
    time: c.from as UTCTimestamp,
    open: c.open,
    high: c.max,
    low: c.min,
    close: c.close,
  }
}

export default function LiveChart({ activeId, activeTicker }: Props) {
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

  useEffect(() => {
    if (!activeTicker) {
      seriesRef.current?.setData([])
      setNote(null)
      return
    }

    setNote(null)
    let stopped = false
    const source = new EventSource(`/api/chart/stream?ticker=${encodeURIComponent(activeTicker)}`)

    source.addEventListener('history', (event) => {
      const candles = JSON.parse((event as MessageEvent).data) as Candle[]
      if (!seriesRef.current) return
      seriesRef.current.setData((candles ?? []).map(toBar))
      chartRef.current?.timeScale().scrollToRealTime()
      setNote(null)
    })

    source.addEventListener('candle', (event) => {
      const candle = JSON.parse((event as MessageEvent).data) as Candle
      seriesRef.current?.update(toBar(candle))
    })

    source.addEventListener('status', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { error?: string }
      if (payload.error) {
        stopped = true
        seriesRef.current?.setData([])
        setNote(payload.error)
        source.close()
      }
    })

    source.onerror = () => {
      if (stopped) return
      stopped = true
      setNote('Não foi possível abrir o gráfico ao vivo deste ativo.')
      source.close()
    }

    return () => source.close()
  }, [activeTicker])

  return (
    <div className="chart-wrap">
      <div className="chart-header">
        <span className="chart-pair">{activeTicker ?? '—'}</span>
        <span className="chart-tf">M1</span>
      </div>
      <div ref={containerRef} className="chart-container" />
      {(!activeId || note) && (
        <div className="chart-placeholder">
          {note ?? 'Escolha o ativo para ver o gráfico ao vivo'}
        </div>
      )}
    </div>
  )
}
