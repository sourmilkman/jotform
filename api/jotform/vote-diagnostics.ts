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
  answers?: Record<string, JotformAnswer>
}

type JotformListResponse = {
  content?: JotformSubmission[]
  message?: string
}

const DEFAULT_FORM_ID = '233391657291361'
const DEFAULT_SYNC_LIMIT = 250
const JOTFORM_TIMEOUT_MS = 18000

const valueToString = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) return value.map(valueToString).filter(Boolean).join(', ')
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(valueToString).filter(Boolean).join(' ')
  return ''
}

const normalizeKey = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const getArtworkNumberFromLabel = (answer: JotformAnswer) => {
  const label = normalizeKey(`${answer.text ?? ''} ${answer.name ?? ''}`)
  const artworkMatch = label.match(/artwork(?:upload)?(\d)/)
  if (artworkMatch) return Number(artworkMatch[1])
  const reviewerMatch = normalizeKey(answer.text || answer.name || '').match(/(\d)$/)
  return reviewerMatch ? Number(reviewerMatch[1]) : 1
}

const isRawVoteValue = (value: string) => {
  const trimmed = value.trim()
  return /^(yes|maybe|no|y|m|n)$/i.test(trimmed) || /^\{[a-z0-9]+\}$/i.test(trimmed)
}

const isCouncilVoteField = (answer: JotformAnswer) => {
  const label = normalizeKey(answer.text || answer.name || '')
  if (
    label.includes('artwork') ||
    label.includes('upload') ||
    label.includes('title') ||
    label.includes('medium') ||
    label.includes('base') ||
    label.includes('size') ||
    label.includes('vote')
  ) {
    return false
  }
  return /\d$/.test(label)
}

const getSyncLimit = () => {
  const configured = Number(process.env.JOTFORM_SYNC_LIMIT ?? DEFAULT_SYNC_LIMIT)
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_SYNC_LIMIT
  return Math.min(Math.floor(configured), 1000)
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

    if (!bestResult?.ok || !Array.isArray(payload.content)) {
      res.status(bestResult?.status || 502).json({
        message: payload.message ?? 'Jotform vote diagnostics failed.',
      })
      return
    }

    const fields = payload.content.flatMap((submission, submissionIndex) =>
      Object.entries(submission.answers ?? {})
        .map(([fieldId, answer]) => ({
          submissionId: submission.id,
          submissionIndex,
          fieldId,
          fieldLabel: answer.text || answer.name || '',
          artworkNumber: getArtworkNumberFromLabel(answer),
          rawValue: valueToString(answer.answer ?? answer.prettyFormat),
        }))
        .filter((field) => isCouncilVoteField({ text: field.fieldLabel }) && isRawVoteValue(field.rawValue)),
    )

    const codeTotals = fields.reduce<Record<string, number>>((totals, field) => {
      totals[field.rawValue] = (totals[field.rawValue] ?? 0) + 1
      return totals
    }, {})

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      baseUrl: bestResult.baseUrl,
      fields,
      codeTotals,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      res.status(504).json({ message: 'Jotform vote diagnostics timed out after 18 seconds.' })
      return
    }
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Jotform vote diagnostics failed.',
    })
  } finally {
    clearTimeout(timeout)
  }
}
