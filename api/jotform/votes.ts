import type { VercelRequest, VercelResponse } from '@vercel/node'

type VoteCounts = {
  yes: number
  maybe: number
  no: number
}

type ArtistSubmission = {
  id: string
  source: 'jotform' | 'demo'
  artworks: Array<{
    id: string
    artworkNumber: number
    voteCounts: VoteCounts
    jotformVoteFieldId?: string
  }>
}

type ArtworkVote = {
  artworkId: string
  submissionId: string
  value: keyof VoteCounts
}

type ReviewState = Record<string, ArtworkVote>

type VoteRequest = {
  submissions?: ArtistSubmission[]
  votes?: ReviewState
}

type FieldMap = Record<string, string>
type JotformQuestion = {
  qid?: string
  name?: string
  text?: string
  order?: string
}
type JotformQuestionsResponse = {
  content?: Record<string, JotformQuestion>
  message?: string
}

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

const normalizeKey = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const findArtworkVoteField = (questions: Record<string, JotformQuestion>, artworkNumber: number) => {
  const candidates = Object.entries(questions).map(([id, question]) => ({
    id,
    key: normalizeKey(`${question.text ?? ''} ${question.name ?? ''}`),
  }))

  return candidates.find(({ key }) => (
    key.includes('vote') &&
    key.includes('artwork') &&
    key.includes(String(artworkNumber))
  ))?.id
}

const fetchVoteFieldMap = async (apiKey: string): Promise<FieldMap> => {
  const explicitMap = readVoteFieldMap()
  if (Object.keys(explicitMap).length > 0) return explicitMap

  const response = await fetch(`https://eu-api.jotform.com/form/${FORM_ID}/questions`, {
    headers: { APIKEY: apiKey },
  })
  const payload = await response.json().catch(() => null) as JotformQuestionsResponse | null

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Could not read Jotform form questions.')
  }

  const questions = payload?.content ?? {}
  return Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => {
      const artworkNumber = index + 1
      return [String(artworkNumber), findArtworkVoteField(questions, artworkNumber) ?? '']
    }).filter(([, value]) => value),
  )
}

const addVoteToCounts = (counts: VoteCounts, vote?: keyof VoteCounts): VoteCounts => ({
  ...counts,
  ...(vote ? { [vote]: counts[vote] + 1 } : {}),
})

const formatVoteCounts = (counts: VoteCounts) =>
  `Yes: ${counts.yes}; Maybe: ${counts.maybe}; No: ${counts.no}`

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

  const body = req.body as VoteRequest
  const submissions = body.submissions ?? []
  const votes = body.votes ?? {}
  const fieldMapFromSubmissions = Object.fromEntries(
    submissions
      .flatMap((submission) => submission.artworks)
      .filter((artwork) => artwork.jotformVoteFieldId)
      .map((artwork) => [String(artwork.artworkNumber), artwork.jotformVoteFieldId as string]),
  )
  let fieldMap: FieldMap = fieldMapFromSubmissions

  if (Object.keys(fieldMap).length === 0) {
    try {
      fieldMap = await fetchVoteFieldMap(apiKey)
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Could not map Jotform vote fields.',
      })
      return
    }
  }

  if (Object.keys(fieldMap).length === 0) {
    res.status(500).json({
      message: 'Could not find Jotform vote fields. Pull from Jotform first so the app can read the vote field IDs.',
    })
    return
  }
  let updatedSubmissions = 0

  for (const submission of submissions.filter((item) => item.source === 'jotform')) {
    const params = new URLSearchParams()

    for (const artwork of submission.artworks) {
      const vote = votes[artwork.id]
      const fieldId = artwork.jotformVoteFieldId ?? fieldMap[String(artwork.artworkNumber)]
      if (!vote || !fieldId) continue

      const updatedCounts = addVoteToCounts(artwork.voteCounts, vote.value)
      params.set(`submission[${fieldId}]`, formatVoteCounts(updatedCounts))
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
