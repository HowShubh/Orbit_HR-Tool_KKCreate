// Client-safe code helpers (no node imports; used by the in-page QR scanner).

// Unambiguous alphabet: no 0/O, 1/I/L. Codes are printed tiny on QR stickers
// and read aloud over the phone, so every character must be unmistakable.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** Extract an item code from raw QR content: either a bare code ("AB3K7Q")
 *  or any URL whose path ends in /e/{code}. Returns null when unrecognized. */
export function parseScannedCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/i.test(trimmed)) return trimmed.toUpperCase()
  const match = trimmed.match(/\/e\/([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})\/?(\?.*)?$/i)
  return match ? match[1].toUpperCase() : null
}
