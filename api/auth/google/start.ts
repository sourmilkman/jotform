import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    res.status(500).json({ message: 'Google OAuth is not configured.' })
    return
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/spreadsheets',
    ].join(' '),
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
