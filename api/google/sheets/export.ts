import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildSheetPayload, requireSession, type ArtistSubmission } from '../../_lib/common'

type ExportRequest = {
  submissions?: ArtistSubmission[]
}

const SHEET_TITLE = 'RMS Review Votes'
const quotedSheetTitle = `'${SHEET_TITLE.replaceAll("'", "''")}'`
const clearRange = quotedSheetTitle
const appendRange = `${quotedSheetTitle}!A1`

type GoogleSpreadsheet = {
  spreadsheetId: string
  spreadsheetUrl?: string
}

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

  const session = requireSession(req, res)
  if (!session) return

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
