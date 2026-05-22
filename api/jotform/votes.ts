import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  addVoteToCounts,
  formatVoteCountsForJotform,
} from '../../src/lib/jotformNormalizer'
import type { ArtistSubmission, ReviewState } from '../../src/types'

type VoteRequest = {
  submissions?: ArtistSubmission[]
  votes?: ReviewState
}

type FieldMap = Record<string, string>

const readVoteFieldMap = (): FieldMap => {
  if (process.env.JOTFORM_VOTE_FIELD_IDS) {
    return JSON.parse(process.env.JOTFORM_VOTE_FIELD_IDS) as FieldMap
  }

  return Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => {
      const artworkNumber = index + 1
      return [String(artworkNumber), process.env[`JOTFORM_VOTE_FIELD_${artworkNumber}`] ?? '']
    }).filter(([, value]) => value),
  )
}

const FORM_ID = '233391657291361'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Use POST to submit votes to Jotform.' })
    return
  }

  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  let fieldMap: FieldMap
  try {
    fieldMap = readVoteFieldMap()
  } catch {
    res.status(500).json({ message: 'JOTFORM_VOTE_FIELD_IDS is not valid JSON.' })
    return
  }

  if (Object.keys(fieldMap).length === 0) {
    res.status(500).json({
      message: 'Jotform vote fields are not configured. Add JOTFORM_VOTE_FIELD_1 through JOTFORM_VOTE_FIELD_6 or JOTFORM_VOTE_FIELD_IDS.',
    })
    return
  }

  const body = req.body as VoteRequest
  const submissions = body.submissions ?? []
  const votes = body.votes ?? {}
  let updatedSubmissions = 0

  for (const submission of submissions.filter((item) => item.source === 'jotform')) {
    const params = new URLSearchParams()

    for (const artwork of submission.artworks) {
      const vote = votes[artwork.id]
      const fieldId = fieldMap[String(artwork.artworkNumber)]
      if (!vote || !fieldId) continue

      const updatedCounts = addVoteToCounts(artwork.voteCounts, vote.value)
      params.set(`submission[${fieldId}]`, formatVoteCountsForJotform(updatedCounts))
    }

    if (params.size === 0) continue

    const response = await fetch(`https://eu-api.jotform.com/submission/${submission.id}`, {
      method: 'POST',
      headers: {
        APIKEY: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null
      res.status(response.status).json({
        message: payload?.message ?? `Could not update Jotform submission ${submission.id}.`,
      })
      return
    }

    updatedSubmissions += 1
  }

  res.status(200).json({ formId: FORM_ID, updatedSubmissions })
}
