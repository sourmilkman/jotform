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
const reviewerPattern = /tom\s*(?:m|mulliner)/i

const summarizeValue = (value: unknown) => {
  if (value == null) return { type: 'empty', preview: '' }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { type: typeof value, preview: String(value).slice(0, 80) }
  }
  if (Array.isArray(value)) {
    return { type: 'array', preview: value.map((item) => String(item)).join('|').slice(0, 80) }
  }
  if (typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.keys(value as Record<string, unknown>),
      preview: JSON.stringify(value).slice(0, 160),
    }
  }
  return { type: typeof value, preview: '' }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  const params = new URLSearchParams({ limit: '10', offset: '0', orderby: 'created_at' })
  const results = await fetchFromJotformBases<JotformListResponse>(
    `/form/${process.env.JOTFORM_FORM_ID ?? DEFAULT_FORM_ID}/submissions?${params.toString()}`,
    apiKey,
  )
  const successfulResult = results.find((result) => result.ok && Array.isArray(result.payload.content))
  const submissions = successfulResult?.payload.content ?? []
  const fields = submissions.flatMap((submission) =>
    Object.entries(submission.answers ?? {})
      .filter(([, answer]) => reviewerPattern.test(answer.text ?? '') || reviewerPattern.test(answer.name ?? ''))
      .map(([id, answer]) => ({
        submissionId: submission.id,
        id,
        name: answer.name ?? '',
        text: answer.text ?? '',
        answer: summarizeValue(answer.answer),
        prettyFormat: summarizeValue(answer.prettyFormat),
      })),
  )

  res.setHeader('Cache-Control', 'no-store')
  res.status(successfulResult ? 200 : 502).json({ fields })
}
