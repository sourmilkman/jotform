import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookie } from '../_lib/session'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  clearSessionCookie(res)
  res.status(200).json({ ok: true })
}
