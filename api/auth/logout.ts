import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Set-Cookie', [
    'rms_review_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    'rms_review_email=; Secure; SameSite=Lax; Path=/; Max-Age=0',
  ])
  res.status(200).json({ ok: true })
}
