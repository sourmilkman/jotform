import type { VercelRequest, VercelResponse } from '@vercel/node'
import { normalizeJotformSubmissions, type JotformSubmission } from '../../src/lib/jotformNormalizer'

type JotformListResponse = {
  content?: JotformSubmission[]
  message?: string
}

const FORM_ID = '233391657291361'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  const response = await fetch(
    `https://eu-api.jotform.com/form/${FORM_ID}/submissions?limit=1000&orderby=created_at`,
    {
      headers: { APIKEY: apiKey },
    },
  )
  const payload = (await response.json()) as JotformListResponse

  if (!response.ok) {
    res.status(response.status).json({ message: payload.message ?? 'Jotform sync failed.' })
    return
  }

  res.status(200).json({ submissions: normalizeJotformSubmissions(payload.content ?? []) })
}
