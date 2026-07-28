'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

const COLORS = ['#9FE870', '#C9A0DC', '#fbeed1', '#FFD166', '#06D6A0', '#EF476F', '#118AB2', '#F4978E']

type Piece = {
  id: number
  left: number
  delay: number
  duration: number
  color: string
  size: number
  rotate: number
  horizontal: number
  round: boolean
}

export default function Confetti({ count = 90, duration = 4500 }: { count?: number; duration?: number }) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(true)

  const pieces = useMemo<Piece[]>(() => {
    if (!mounted) return []
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 800,
      duration: 2400 + Math.random() * 2200,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 720 - 360,
      horizontal: (Math.random() - 0.5) * 240,
      round: Math.random() < 0.35,
    }))
  }, [count, mounted])

  useEffect(() => {
    setMounted(true)
    const t = setTimeout(() => setVisible(false), duration + 1500)
    return () => clearTimeout(t)
  }, [duration])

  if (!mounted || !visible) return null

  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <style>{`
        @keyframes opuspass-confetti-fall {
          0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translate3d(var(--cf-x, 0), 110vh, 0) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => {
        const style: CSSProperties & Record<'--cf-x', string> = {
          left: `${p.left}%`,
          top: '-20px',
          width: `${p.size}px`,
          height: `${p.size * 1.4}px`,
          backgroundColor: p.color,
          transform: `rotate(${p.rotate}deg)`,
          animation: `opuspass-confetti-fall ${p.duration}ms ${p.delay}ms cubic-bezier(.25,.7,.5,1) forwards`,
          opacity: 0.95,
          borderRadius: p.round ? '50%' : '2px',
          '--cf-x': `${p.horizontal}px`,
        }
        return <span key={p.id} className="absolute block" style={style} />
      })}
    </div>
  )
}
