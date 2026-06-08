import type { VercelRequest, VercelResponse } from '@vercel/node'

type JotformAnswer = {
  name?: string
  text?: string
  answer?: unknown
  prettyFormat?: string
}

type JotformSubmission = {
  id: string
  created_at?: string
  answers?: Record<string, JotformAnswer>
}

type JotformListResponse = {
  content?: JotformSubmission[]
  message?: string
}

const FORM_ID = '233391657291361'
const DEFAULT_SYNC_LIMIT = 250
const MAX_SYNC_LIMIT = 1000
const JOTFORM_TIMEOUT_MS = 18000

const getSyncLimit = () => {
  const configured = Number(process.env.JOTFORM_SYNC_LIMIT ?? DEFAULT_SYNC_LIMIT)
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_SYNC_LIMIT
  return Math.min(Math.floor(configured), MAX_SYNC_LIMIT)
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), JOTFORM_TIMEOUT_MS)

  try {
    const params = new URLSearchParams({
      limit: String(getSyncLimit()),
      offset: '0',
      orderby: 'created_at',
    })
    const response = await fetch(
      `https://eu-api.jotform.com/form/${FORM_ID}/submissions?${params.toString()}`,
      {
        headers: { APIKEY: apiKey },
        signal: controller.signal,
      },
    )
    const responseText = await response.text()
    const payload = responseText
      ? JSON.parse(responseText) as JotformListResponse
      : {}

    if (!response.ok) {
      res.status(response.status).json({ message: payload.message ?? 'Jotform sync failed.' })
      return
    }

    if (!Array.isArray(payload.content)) {
      res.status(502).json({
        message: 'Jotform returned an unexpected response. No submissions array was available.',
      })
      return
    }

    const { normalizeJotformSubmissions } = await import('../../src/lib/jotformNormalizer')

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ submissions: normalizeJotformSubmissions(payload.content) })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      res.status(504).json({ message: 'Jotform sync timed out after 18 seconds. Try again or lower JOTFORM_SYNC_LIMIT.' })
      return
    }
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Jotform sync failed.',
    })
  } finally {
    clearTimeout(timeout)
  }
}
