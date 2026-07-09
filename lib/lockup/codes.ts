import { randomInt } from 'crypto'
import { CODE_ALPHABET } from './scan'

// Server-only (node crypto). Client-safe code helpers live in lib/lockup/scan.ts.

/** One random 6-char item code, e.g. "AB3K7Q". Uniqueness is enforced by the
 *  UNIQUE constraint on equipment_items.code; callers retry on collision. */
export function generateItemCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}
