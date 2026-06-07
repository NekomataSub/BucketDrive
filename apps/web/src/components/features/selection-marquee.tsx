import { useEffect, useRef } from "react"

export interface SelectionMarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

interface SelectionMarqueeProps {
  rect: SelectionMarqueeRect | null
}

export function SelectionMarquee({ rect }: SelectionMarqueeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !rect) return

    const ratio = window.devicePixelRatio || 1
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = width * ratio
    canvas.height = height * ratio

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.scale(ratio, ratio)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = "rgb(0 104 214 / 0.12)"
    ctx.strokeStyle = "rgb(0 104 214 / 0.9)"
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height)
    ctx.strokeRect(rect.left + 0.5, rect.top + 0.5, rect.width, rect.height)
  }, [rect])

  if (!rect) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-screen w-screen"
    />
  )
}
