/**
 * Physical feedback for scanning at the shelf.
 *
 * Someone scanning gear is looking at the sticker, not the screen, so a silent
 * list update is easy to miss: they either scan the same thing twice or walk
 * off without it registering. A phone can buzz; a laptop cannot, so both get a
 * short tone as well. Callers pair this with the on-screen flash.
 */

export type ScanOutcome = 'added' | 'duplicate' | 'error'

/** Distinct buzz per outcome: one tap for good, a stutter for anything else. */
const VIBRATION: Record<ScanOutcome, number | number[]> = {
  added: 35,
  duplicate: [20, 60, 20],
  error: [60, 50, 60],
}

/** Rising for success, flat for a repeat, low for a problem. */
const TONE: Record<ScanOutcome, { freq: number; ms: number }> = {
  added: { freq: 880, ms: 90 },
  duplicate: { freq: 520, ms: 110 },
  error: { freq: 220, ms: 180 },
}

let audioContext: AudioContext | null = null

function beep(outcome: ScanOutcome) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    // Created lazily and reused: browsers only allow this after a gesture, and
    // opening the scanner is one.
    audioContext = audioContext ?? new Ctor()
    if (audioContext.state === 'suspended') void audioContext.resume()

    const { freq, ms } = TONE[outcome]
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // Short fade so it clicks rather than pops.
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.09, audioContext.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + ms / 1000)
    osc.connect(gain).connect(audioContext.destination)
    osc.start()
    osc.stop(audioContext.currentTime + ms / 1000 + 0.02)
  } catch {
    // Audio is a nicety; never let it break a scan.
  }
}

/** Buzz (phones) and beep (everything) for one scan result. */
export function scanFeedback(outcome: ScanOutcome) {
  try {
    navigator.vibrate?.(VIBRATION[outcome])
  } catch {
    // Unsupported or blocked; the tone still lands.
  }
  beep(outcome)
}
