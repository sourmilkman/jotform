import { createHmac } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export type GoogleSession = {
  email: string
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

const COOKIE_NAME = 'rms_review_session'

const secret = () => process.env.GOOGLE_CLIENT_SECRET ?? 'dev-only-secret'

const sign = (payload: string) =>
  createHmac('sha256', secret()).update(payload).digest('base64url')

export const encodeSession = (session: GoogleSession) => {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export const decodeSession = (cookie?: string): GoogleSession | null => {
  if (!cookie) return null
  const [payload, signature] = cookie.split('.')
  if (!payload || !signature) return null

  const expected = sign(payload)
  if (signature !== expected) return null

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleSession
  } catch {
    return null
  }
}

export const getSession = (req: VercelRequest) => {
  const cookies = req.headers.cookie?.split(';').map((part) => part.trim()) ?? []
  const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))
  return decodeSession(sessionCookie?.slice(COOKIE_NAME.length + 1))
}

export const setSessionCookie = (res: VercelResponse, session: GoogleSession) => {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeSession(session)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
  )
}

export const clearSessionCookie = (res: VercelResponse) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
}

export const requireSession = (req: VercelRequest, res: VercelResponse) => {
  const session = getSession(req)
  if (!session) {
    res.status(401).json({ message: 'Sign in with Google before exporting to Sheets.' })
    return null
  }
  return session
}
