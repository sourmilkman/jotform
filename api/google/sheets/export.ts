import { createHmac } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type VoteCounts = {
  yes: number
  maybe: number
  no: number
}

type ArtistSubmission = {
  artistName: string
  email: string
  dateOfBirth?: string
  artworks: Array<{
    artworkNumber: number
    title: string
    medium: string
    imageUrl: string
    voteCounts: VoteCounts
  }>
}

type GoogleSession = {
  email: string
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

type ExportRequest = {
  submissions?: ArtistSubmission[]
}

const SHEET_TITLE = 'RMS Review Votes'
const quotedSheetTitle = `'${SHEET_TITLE.replaceAll("'", "''")}'`
const clearRange = quotedSheetTitle
const appendRange = `${quotedSheetTitle}!A1`
const MAX_ARTWORKS = 6
const COOKIE_NAME = 'rms_review_session'

type GoogleSpreadsheet = {
  spreadsheetId: string
  spreadsheetUrl?: string
}

const sign = (payload: string) => {
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? 'dev-only-secret'
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

const getSession = (req: VercelRequest): GoogleSession | null => {
  const cookies = req.headers.cookie?.split(';').map((part) => part.trim()) ?? []
  const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))
  const encoded = sessionCookie?.slice(COOKIE_NAME.length + 1)
  if (!encoded) return null

  const [payload, signature] = encoded.split('.')
  if (!payload || !signature || signature !== sign(payload)) return null

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleSession
  } catch {
    return null
  }
}

const buildSheetPayload = (submissions: ArtistSubmission[]) => ({
  headers: [
    'email',
    'name',
    'date of birth',
    ...Array.from({ length: MAX_ARTWORKS }, (_, index) => {
      const artworkNumber = index + 1
      return [
        `artwork ${artworkNumber} (image attachment)`,
        `title of artwork ${artworkNumber}`,
        'medium',
        `votes - artwork ${artworkNumber}`,
      ]
    }).flat(),
  ],
  rows: submissions.map((submission) => [
    submission.email,
    submission.artistName,
    submission.dateOfBirth ?? '',
    ...Array.from({ length: MAX_ARTWORKS }, (_, index) => {
      const artworkNumber = index + 1
      const artwork = submission.artworks.find((item) => item.artworkNumber === artworkNumber)
      if (!artwork) return ['', '', '', '']
      return [
        artwork.imageUrl,
        artwork.title,
        artwork.medium,
        `Yes: ${artwork.voteCounts.yes}; Maybe: ${artwork.voteCounts.maybe}; No: ${artwork.voteCounts.no}`,
      ]
    }).flat(),
  ]),
})

const readGoogleError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string }
  } | null

  return payload?.error?.message ?? fallback
}

const canUseSpreadsheet = async (spreadsheetId: string, accessToken: string) => {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  return response.ok
}

const createSpreadsheet = async (accessToken: string) => {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: `${SHEET_TITLE} ${new Date().toISOString().slice(0, 10)}` },
      sheets: [{ properties: { title: SHEET_TITLE } }],
    }),
  })

  if (!response.ok) throw new Error(await readGoogleError(response, 'Could not create Google Sheet.'))
  return await response.json() as GoogleSpreadsheet
}

const ensureSpreadsheet = async (accessToken: string) => {
  const configuredSpreadsheetId = process.env.GOOGLE_SHEET_ID
  if (configuredSpreadsheetId && await canUseSpreadsheet(configuredSpreadsheetId, accessToken)) {
    return {
      spreadsheetId: configuredSpreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${configuredSpreadsheetId}/edit`,
    }
  }

  return createSpreadsheet(accessToken)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Use POST to export review votes.' })
    return
  }

  const session = getSession(req)
  if (!session) {
    res.status(401).json({ message: 'Sign in with Google before exporting to Sheets.' })
    return
  }

  const body = req.body as ExportRequest
  const submissions = body.submissions ?? []
  const payload = buildSheetPayload(submissions)

  try {
    const { spreadsheetId, spreadsheetUrl } = await ensureSpreadsheet(session.accessToken)
    const values = [payload.headers, ...payload.rows]
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        clearRange,
      )}:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      },
    )

    if (!response.ok) throw new Error(await readGoogleError(response, 'Could not clear existing sheet rows.'))

    const update = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        appendRange,
      )}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      },
    )

    if (!update.ok) throw new Error(await readGoogleError(update, 'Could not append rows to Google Sheet.'))
    res.status(200).json({ spreadsheetId, spreadsheetUrl, updatedRows: payload.rows.length })
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Google Sheet export failed.',
    })
  }
}
