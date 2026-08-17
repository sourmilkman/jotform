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

const hasValue = (value: unknown) => {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  const params = new URLSearchParams({
    limit: '1',
    offset: '0',
    orderby: 'created_at',
  })
  const results = await fetchFromJotformBases<JotformListResponse>(
    `/form/${process.env.JOTFORM_FORM_ID ?? DEFAULT_FORM_ID}/submissions?${params.toString()}`,
    apiKey,
  )
  const successfulResult = results.find((result) => result.ok && Array.isArray(result.payload.content))
  const payload = successfulResult?.payload ?? {}
  const submission = payload.content?.[0]

  res.setHeader('Cache-Control', 'no-store')
  res.status(successfulResult ? 200 : 502).json({
    baseUrl: successfulResult?.baseUrl,
    fields: Object.entries(submission?.answers ?? {}).map(([id, answer]) => ({
      id,
      name: answer.name ?? '',
      text: answer.text ?? '',
      hasAnswer: hasValue(answer.answer ?? answer.prettyFormat),
    })),
  })
}
