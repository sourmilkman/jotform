import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setSessionCookie } from '../../_lib/session'

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
}

type GoogleUser = {
  email?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = String(req.query.code ?? '')
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  const allowedEmail = process.env.GOOGLE_ALLOWED_EMAIL?.toLowerCase()

  if (!code || !clientId || !clientSecret || !redirectUri || !allowedEmail) {
    res.status(400).json({ message: 'Google OAuth callback is missing required configuration.' })
    return
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResponse.ok) {
    res.status(401).json({ message: 'Google sign-in failed.' })
    return
  }

  const token = (await tokenResponse.json()) as TokenResponse
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const user = (await userResponse.json()) as GoogleUser

  if (user.email?.toLowerCase() !== allowedEmail) {
    res.status(403).json({ message: 'This Google account is not allowed to access RMS Review.' })
    return
  }

  setSessionCookie(res, {
    email: user.email,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  })
  res.redirect('/')
}
