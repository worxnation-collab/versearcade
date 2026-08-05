import { useEffect, useRef, useState } from 'react'
import { Sound } from '@/juice/sound'

// Numbers should never just "appear" — they count up and pop. Optionally ticks
// a coin sound as it climbs for that satisfying points-rolling feel.
export function CountUp({
  to,
  from = 0,
  duration = 900,
  prefix = '',
  suffix = '',
  tickSound = false,
  className,
  style,
}: {
  to: number
  from?: number
  duration?: number
  prefix?: string
  suffix?: string
  tickSound?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const [val, setVal] = useState(from)
  const raf = useRef<number>()
  const lastTick = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const delta = to - from
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3)
      const current = Math.round(from + delta * eased)
      setVal(current)
      if (tickSound && now - lastTick.current > 55 && p < 1) {
        Sound.tone(700 + Math.random() * 200, 0.03, { type: 'square', gain: 0.05 })
        lastTick.current = now
      }
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to])

  return (
    <span className={className} style={style}>
      {prefix}
      {val.toLocaleString()}
      {suffix}
    </span>
  )
}
