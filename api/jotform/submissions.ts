import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchFromJotformBases } from '../_lib/jotform.js'

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

const DEFAULT_FORM_ID = '233391657291361'
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
    const results = await fetchFromJotformBases<JotformListResponse>(
      `/form/${process.env.JOTFORM_FORM_ID ?? DEFAULT_FORM_ID}/submissions?${params.toString()}`,
      apiKey,
      { signal: controller.signal },
    )
    const successfulResult = results.find((result) => result.ok && Array.isArray(result.payload.content))
    const bestResult = successfulResult ?? results[0]
    const payload = bestResult?.payload ?? {}

    if (!bestResult?.ok) {
      res.status(bestResult?.status || 502).json({
        message: payload.message ?? 'Jotform sync failed.',
        diagnostics: results.map((result) => ({
          baseUrl: result.baseUrl,
          status: result.status,
          message: result.message ?? '',
        })),
      })
      return
    }

    if (!Array.isArray(payload.content)) {
      res.status(502).json({
        message: 'Jotform returned an unexpected response. No submissions array was available.',
        diagnostics: results.map((result) => ({
          baseUrl: result.baseUrl,
          status: result.status,
          message: result.message ?? '',
        })),
      })
      return
    }

    const { normalizeJotformSubmissions } = await import('../../src/lib/jotformNormalizer.js')

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      baseUrl: bestResult.baseUrl,
      submissions: normalizeJotformSubmissions(payload.content),
    })
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
