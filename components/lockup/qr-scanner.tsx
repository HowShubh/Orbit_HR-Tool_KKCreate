'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, KeyboardIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { parseScannedCode } from '@/lib/lockup/scan'

/**
 * In-page camera QR scanner (jsQR over getUserMedia frames). Calls onCode for
 * each freshly decoded item code, with a per-code cooldown so holding the
 * camera over one sticker doesn't fire repeatedly. Falls back to manual code
 * entry when the camera is unavailable or denied.
 */
export function QrScanner({
  onCode,
  paused = false,
}: {
  onCode: (code: string) => void
  paused?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastSeen = useRef<Map<string, number>>(new Map())
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    let stream: MediaStream | null = null
    let rafId = 0
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not available in this browser.')
        setManual(true)
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      } catch {
        setCameraError('Camera access was denied. Type the code from the sticker instead.')
        setManual(true)
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play().catch(() => undefined)

      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d', { willReadFrequently: true })

      const tick = () => {
        if (cancelled) return
        if (!pausedRef.current && video.readyState === video.HAVE_ENOUGH_DATA && canvas && ctx) {
          const w = Math.min(video.videoWidth, 640)
          const h = Math.floor((video.videoHeight / video.videoWidth) * w) || 480
          canvas.width = w
          canvas.height = h
          ctx.drawImage(video, 0, 0, w, h)
          const imageData = ctx.getImageData(0, 0, w, h)
          const result = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' })
          if (result?.data) {
            const code = parseScannedCode(result.data)
            if (code) {
              const now = Date.now()
              const last = lastSeen.current.get(code) ?? 0
              // Long enough that holding the camera over one sticker does not
              // keep re-reporting it; the consumer also refuses repeats.
              if (now - last > 6000) {
                lastSeen.current.set(code, now)
                onCodeRef.current(code)
              }
            }
          }
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }

    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const submitManual = useCallback(() => {
    const code = parseScannedCode(manualCode)
    if (code) {
      onCodeRef.current(code)
      setManualCode('')
    }
  }, [manualCode])

  return (
    <div className="space-y-2">
      {!cameraError && (
        <div className="relative overflow-hidden rounded-xl bg-black aspect-[4/3]">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          {/* viewfinder */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-40 w-40 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute bottom-2 inset-x-0 text-center text-[11px] font-medium text-white/90">
            Point at the QR sticker
          </div>
        </div>
      )}

      {cameraError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex items-center gap-2">
          <Camera className="h-4 w-4 shrink-0" />
          {cameraError}
        </div>
      )}

      {!manual && !cameraError ? (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="mx-auto flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <KeyboardIcon className="h-3.5 w-3.5" /> Type the code instead
        </button>
      ) : (
        <div className="flex gap-2">
          <Input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            placeholder="6-character code, e.g. AB3K7Q"
            className="font-mono tracking-widest uppercase"
            maxLength={6}
            onKeyDown={(e) => e.key === 'Enter' && submitManual()}
          />
          <Button type="button" variant="secondary" onClick={submitManual} disabled={!parseScannedCode(manualCode)}>
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
