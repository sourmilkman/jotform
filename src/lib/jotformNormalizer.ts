import type { ArtistSubmission, Artwork, VoteCounts } from '../types'

type JotformAnswer = {
  name?: string
  text?: string
  answer?: unknown
  prettyFormat?: string
}

export type JotformSubmission = {
  id: string
  created_at?: string
  answers?: Record<string, JotformAnswer>
}

const ARTWORK_LIMIT = 6

const valueToString = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim()
  }
  if (Array.isArray(value)) return value.map(valueToString).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('url' in record && typeof record.url === 'string') return record.url
    if ('name' in record && typeof record.name === 'string') return record.name
    return Object.values(record).map(valueToString).filter(Boolean).join(' ')
  }
  return ''
}

const normalizeKey = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const getAnswer = (answers: Record<string, JotformAnswer>, candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeKey)
  const match = Object.values(answers).find((answer) => {
    const names = [answer.name, answer.text].map(normalizeKey)
    return names.some((name) => normalizedCandidates.some((candidate) => name.includes(candidate)))
  })

  return valueToString(match?.answer ?? match?.prettyFormat)
}

const getImageUrl = (answer: JotformAnswer | undefined): string => {
  const raw = answer?.answer
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const first = raw.find(Boolean)
    return typeof first === 'string' ? first : valueToString(first)
  }
  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    return valueToString(record.url ?? record[0] ?? raw)
  }
  return ''
}

export const parseVoteCounts = (value: string): VoteCounts => {
  const lower = value.toLowerCase()
  const findCount = (label: 'yes' | 'maybe' | 'no') => {
    const match = lower.match(new RegExp(`${label}\\s*:?\\s*(\\d+)`))
    return match ? Number(match[1]) : 0
  }

  return {
    yes: findCount('yes'),
    maybe: findCount('maybe'),
    no: findCount('no'),
  }
}

export const formatVoteCountsForJotform = (counts: VoteCounts) =>
  `Yes: ${counts.yes}; Maybe: ${counts.maybe}; No: ${counts.no}`

export const addVoteToCounts = (counts: VoteCounts, vote?: keyof VoteCounts): VoteCounts => ({
  ...counts,
  ...(vote ? { [vote]: counts[vote] + 1 } : {}),
})

const findArtworkField = (
  answers: Record<string, JotformAnswer>,
  artworkNumber: number,
  kind: 'image' | 'title' | 'medium' | 'votes',
) => {
  const synonyms = {
    image: ['artwork', 'file', 'attachment', 'image', 'upload'],
    title: ['title'],
    medium: ['medium'],
    votes: ['votes', 'vote'],
  }[kind]

  return Object.values(answers).find((answer) => {
    const key = normalizeKey(`${answer.name ?? ''} ${answer.text ?? ''}`)
    return key.includes(String(artworkNumber)) && synonyms.some((word) => key.includes(word))
  })
}

const findArtworkFieldEntry = (
  answers: Record<string, JotformAnswer>,
  artworkNumber: number,
  kind: 'image' | 'title' | 'medium' | 'votes',
) =>
  Object.entries(answers).find(([, answer]) => answer === findArtworkField(answers, artworkNumber, kind))

export const normalizeJotformSubmissions = (
  submissions: JotformSubmission[],
): ArtistSubmission[] =>
  submissions.map((submission) => {
    const answers = submission.answers ?? {}
    const artistName =
      getAnswer(answers, ['name', 'artistname', 'full name']) || `Submission ${submission.id}`

    const artworks: Artwork[] = Array.from({ length: ARTWORK_LIMIT }, (_, index): Artwork | null => {
      const artworkNumber = index + 1
      const imageField = findArtworkField(answers, artworkNumber, 'image')
      const imageUrl = getImageUrl(imageField)
      if (!imageUrl) return null

      const title =
        valueToString(findArtworkField(answers, artworkNumber, 'title')?.answer) ||
        `Artwork ${artworkNumber}`
      const medium =
        valueToString(findArtworkField(answers, artworkNumber, 'medium')?.answer) ||
        getAnswer(answers, ['medium']) ||
        'Medium not supplied'
      const voteFieldEntry = findArtworkFieldEntry(answers, artworkNumber, 'votes')

      const fileName = imageUrl.split('/').pop()
      return {
        id: `${submission.id}-artwork-${artworkNumber}`,
        submissionId: submission.id,
        artworkNumber,
        title,
        medium,
        imageUrl,
        voteCounts: parseVoteCounts(
          valueToString(voteFieldEntry?.[1].answer),
        ),
        ...(voteFieldEntry?.[0] ? { jotformVoteFieldId: voteFieldEntry[0] } : {}),
        ...(fileName ? { fileName } : {}),
      }
    }).filter((artwork): artwork is Artwork => artwork !== null)

    return {
      id: submission.id,
      submittedAt: submission.created_at ?? new Date().toISOString(),
      artistName,
      email: getAnswer(answers, ['email', 'e mail']),
      phone: getAnswer(answers, ['phone', 'telephone']),
      dateOfBirth: getAnswer(answers, ['dateofbirth', 'date of birth', 'dob']),
      address: getAnswer(answers, ['address']),
      notes: getAnswer(answers, ['notes', 'comments']),
      source: 'jotform',
      artworks,
    }
  })
