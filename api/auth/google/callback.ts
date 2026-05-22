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

type GoogleError = {
  error?: string
  error_description?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const queryCode = req.query.code
    const code = Array.isArray(queryCode) ? queryCode[0] : queryCode
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
      const error = (await tokenResponse.json().catch(() => ({}))) as GoogleError
      res.status(401).json({
        message: error.error_description ?? error.error ?? 'Google sign-in failed.',
      })
      return
    }

    const token = (await tokenResponse.json()) as TokenResponse
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })

    if (!userResponse.ok) {
      res.status(401).json({ message: 'Could not read Google account details.' })
      return
    }

    const user = (await userResponse.json()) as GoogleUser
    const email = user.email?.toLowerCase()

    if (!email || email !== allowedEmail) {
      res.status(403).json({ message: 'This Google account is not allowed to access RMS Review.' })
      return
    }

    setSessionCookie(res, {
      email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    })
    res.redirect('/')
  } catch (error) {
    console.error('Google OAuth callback failed', error)
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Google OAuth callback failed.',
    })
  }
}
