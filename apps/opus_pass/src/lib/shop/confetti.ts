// Lightweight, dependency-free confetti burst for the checkout success moment.
// Renders to a throwaway full-screen canvas that self-removes, so nothing stays
// mounted. Honours prefers-reduced-motion.
export function fireConfetti(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  // Robust dimensions — fall back through clientWidth/screen so a transient
  // 0-size viewport (mid-transition) never yields an empty burst.
  const W = window.innerWidth || document.documentElement.clientWidth || window.screen?.width || 1280
  const H = window.innerHeight || document.documentElement.clientHeight || window.screen?.height || 720
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.scale(dpr, dpr)
  document.body.appendChild(canvas)

  const COLORS = ['#9FE870', '#5d3a78', '#FFD166', '#EF476F', '#118AB2', '#1A1A1A']
  type Particle = {
    x: number
    y: number
    vx: number
    vy: number
    rot: number
    vr: number
    w: number
    h: number
    color: string
  }
  const parts: Particle[] = []

  // Two corner cannons firing inward-up — the classic confetti pop.
  const cannon = (originX: number, dir: number) => {
    for (let i = 0; i < 90; i++) {
      const angle = -Math.PI / 2 + dir * Math.random() * 0.6 + (Math.random() - 0.5) * 0.4
      const speed = 9 + Math.random() * 9
      parts.push({
        x: originX,
        y: H * 0.72,
        vx: Math.cos(angle) * speed + dir * 3,
        vy: Math.sin(angle) * speed - 3,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      })
    }
  }
  cannon(0, 1)
  cannon(W, -1)

  const GRAVITY = 0.28
  const start = performance.now()
  const DURATION = 4200

  const frame = (now: number) => {
    const elapsed = now - start
    ctx.clearRect(0, 0, W, H)
    let alive = false
    for (const p of parts) {
      p.vy += GRAVITY
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      if (p.y < H + 20) alive = true
      // Fade out over the last second.
      ctx.globalAlpha = elapsed > DURATION - 1000 ? Math.max(0, (DURATION - elapsed) / 1000) : 1
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    if (alive && elapsed < DURATION) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }
  requestAnimationFrame(frame)
}
