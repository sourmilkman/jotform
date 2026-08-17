import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchFromJotformBases } from '../_lib/jotform.js'

type JotformQuestion = {
  name?: string
  text?: string
  type?: string
  options?: string
  special?: string
}

type JotformQuestionsResponse = {
  content?: Record<string, JotformQuestion>
  message?: string
}

const DEFAULT_FORM_ID = '233391657291361'
const reviewerPattern = /tom\s*(?:m|mulliner)/i

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  const results = await fetchFromJotformBases<JotformQuestionsResponse>(
    `/form/${process.env.JOTFORM_FORM_ID ?? DEFAULT_FORM_ID}/questions`,
    apiKey,
  )
  const successfulResult = results.find((result) => result.ok && result.payload.content)
  const questions = successfulResult?.payload.content ?? {}

  const fields = Object.entries(questions)
    .filter(([, question]) => reviewerPattern.test(question.text ?? '') || reviewerPattern.test(question.name ?? ''))
    .map(([id, question]) => ({
      id,
      name: question.name ?? '',
      text: question.text ?? '',
      type: question.type ?? '',
      options: question.options ?? '',
      special: question.special ?? '',
    }))

  res.setHeader('Cache-Control', 'no-store')
  res.status(successfulResult ? 200 : 502).json({ fields })
}
