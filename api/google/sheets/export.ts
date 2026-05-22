import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../_lib/session'
import { buildSheetPayload } from '../../../src/lib/sheetsExport'
import type { ArtistSubmission, ReviewState } from '../../../src/types'

type ExportRequest = {
  submissions?: ArtistSubmission[]
  votes?: ReviewState
}

const SHEET_TITLE = 'RMS Review Votes'

const ensureSpreadsheet = async (accessToken: string) => {
  if (process.env.GOOGLE_SHEET_ID) return process.env.GOOGLE_SHEET_ID

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

  if (!response.ok) throw new Error('Could not create Google Sheet.')
  const sheet = (await response.json()) as { spreadsheetId: string }
  return sheet.spreadsheetId
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
  const votes = body.votes ?? {}
  const payload = buildSheetPayload(submissions, votes)

  try {
    const spreadsheetId = await ensureSpreadsheet(session.accessToken)
    const values = [payload.headers, ...payload.rows]
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        SHEET_TITLE,
      )}!A1:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      },
    )

    if (!response.ok) throw new Error('Could not clear existing sheet rows.')

    const update = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        SHEET_TITLE,
      )}!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      },
    )

    if (!update.ok) throw new Error('Could not append rows to Google Sheet.')
    res.status(200).json({ spreadsheetId, updatedRows: payload.rows.length })
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Google Sheet export failed.',
    })
  }
}
