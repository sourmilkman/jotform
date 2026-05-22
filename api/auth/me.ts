import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/session'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSession(req)
  res.status(200).json({
    authenticated: Boolean(session),
    email: session?.email,
  })
}
