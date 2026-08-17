import type { ArtistSubmission, Artwork, VoteCounts } from '../types.js'

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

const getAnswerLabel = (answer: JotformAnswer) => normalizeKey(answer.text || answer.name || '')

const getArtworkNumberFromLabel = (answer: JotformAnswer) => {
  const label = normalizeKey(`${answer.text ?? ''} ${answer.name ?? ''}`)
  const artworkMatch = label.match(/artwork(?:upload)?(\d)/)
  if (artworkMatch) return Number(artworkMatch[1])
  const reviewerMatch = normalizeKey(answer.text || answer.name || '').match(/(\d)$/)
  return reviewerMatch ? Number(reviewerMatch[1]) : 1
}

const getNumericFieldId = (fieldId: string) => {
  const numeric = Number(fieldId)
  return Number.isFinite(numeric) ? numeric : 0
}

const parseSingleVote = (value: string): keyof VoteCounts | '' => {
  const normalized = value.toLowerCase().trim()
  const compact = normalized.replace(/[^a-z]/g, '')
  if (['y', 'yes'].includes(compact) || normalized.match(/^y(?:es)?\b/)) return 'yes'
  if (['m', 'maybe'].includes(compact) || normalized.match(/^m(?:aybe)?\b/)) return 'maybe'
  if (['n', 'no'].includes(compact) || normalized.match(/^n(?:o)?\b/)) return 'no'
  return ''
}

const parseVoteOptionMap = () => {
  const runtimeProcess = (globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }).process
  const configured = runtimeProcess?.env?.JOTFORM_VOTE_OPTION_MAP ?? ''
  return configured
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, keyof VoteCounts>>((map, entry) => {
      const [rawCode, rawVote] = entry.split('=').map((part) => part?.trim())
      const vote = parseSingleVote(rawVote ?? '')
      if (rawCode && vote) map[rawCode.toLowerCase()] = vote
      return map
    }, {})
}

const parseReviewerVote = (value: string): keyof VoteCounts | '' => {
  const directVote = parseSingleVote(value)
  if (directVote) return directVote

  const optionMap = parseVoteOptionMap()
  const normalized = value.toLowerCase().trim()
  const compact = normalized.replace(/[{}\s]/g, '')
  return optionMap[normalized] ?? optionMap[`{${compact}}`] ?? optionMap[compact] ?? ''
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

const mergeVoteCounts = (primary: VoteCounts, secondary: VoteCounts): VoteCounts => ({
  yes: primary.yes + secondary.yes,
  maybe: primary.maybe + secondary.maybe,
  no: primary.no + secondary.no,
})

const getVoteTotal = (counts: VoteCounts) => counts.yes + counts.maybe + counts.no

const findArtworkField = (
  answers: Record<string, JotformAnswer>,
  artworkNumber: number,
  kind: 'image' | 'title' | 'medium' | 'votes',
) => {
  const matches = Object.entries(answers).filter(([, answer]) => {
    const label = getAnswerLabel(answer)
    const fieldNumber = getArtworkNumberFromLabel(answer)
    if (fieldNumber !== artworkNumber) return false

    if (kind === 'image') {
      return (
        label.includes('artwork') &&
        !label.includes('title') &&
        !label.includes('medium') &&
        !label.includes('base') &&
        !label.includes('vote')
      )
    }
    if (kind === 'title') return label.includes('title')
    if (kind === 'medium') return label.includes('medium') || label.includes('base')
    return label.includes('vote')
  })

  if (kind === 'image') {
    return (
      matches.find(([, answer]) => getImageUrl(answer) && getAnswerLabel(answer).includes('ongrid'))?.[1] ??
      matches.find(([, answer]) => getImageUrl(answer))?.[1] ??
      matches[0]?.[1]
    )
  }

  return matches[0]?.[1]
}

const findArtworkFieldEntry = (
  answers: Record<string, JotformAnswer>,
  artworkNumber: number,
  kind: 'image' | 'title' | 'medium' | 'votes',
) =>
  Object.entries(answers).find(([, answer]) => answer === findArtworkField(answers, artworkNumber, kind))

const findArtworkMetadataField = (
  answers: Record<string, JotformAnswer>,
  artworkNumber: number,
  kind: 'title' | 'medium',
) => {
  const gridImageEntry = Object.entries(answers).find(([, answer]) => {
    const label = getAnswerLabel(answer)
    return (
      getArtworkNumberFromLabel(answer) === artworkNumber &&
      label.includes('artwork') &&
      label.includes('upload') &&
      label.includes('ongrid')
    )
  })
  const gridImageId = gridImageEntry ? getNumericFieldId(gridImageEntry[0]) : 0
  const siblingOffset = kind === 'medium' ? 1 : 2
  const sibling = gridImageId ? answers[String(gridImageId + siblingOffset)] : undefined
  if (sibling) return sibling

  return findArtworkField(answers, artworkNumber, kind)
}

const defaultReviewerLabels = ['tom m', 'tom mulliner']

const getReviewerLabels = () => {
  const runtimeProcess = (globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }).process
  const configured =
    typeof runtimeProcess?.env?.JOTFORM_REVIEWER_LABELS === 'string'
      ? runtimeProcess.env.JOTFORM_REVIEWER_LABELS
      : ''
  return (configured ? configured.split(',') : defaultReviewerLabels)
    .map((label: string) => normalizeKey(label))
    .filter(Boolean)
}

const findReviewerVoteFieldEntry = (
  answers: Record<string, JotformAnswer>,
  artworkNumber: number,
) => {
  const reviewerLabels = getReviewerLabels()
  return Object.entries(answers).find(([, answer]) => {
    const label = getAnswerLabel(answer)
    if (getArtworkNumberFromLabel(answer) !== artworkNumber) return false
    return reviewerLabels.some((reviewerLabel) => label.includes(reviewerLabel))
  })
}

const isCouncilVoteField = (answer: JotformAnswer, artworkNumber: number) => {
  const label = getAnswerLabel(answer)
  if (getArtworkNumberFromLabel(answer) !== artworkNumber) return false
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
  return true
}

const collectCouncilVoteCounts = (
  answers: Record<string, JotformAnswer>,
  artworkNumber: number,
): VoteCounts =>
  Object.values(answers).reduce<VoteCounts>((counts, answer) => {
    if (!isCouncilVoteField(answer, artworkNumber)) return counts
    const vote = parseReviewerVote(valueToString(answer.answer ?? answer.prettyFormat))
    return vote ? addVoteToCounts(counts, vote) : counts
  }, { yes: 0, maybe: 0, no: 0 })

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
        valueToString(findArtworkMetadataField(answers, artworkNumber, 'title')?.answer) ||
        `Artwork ${artworkNumber}`
      const medium =
        valueToString(findArtworkMetadataField(answers, artworkNumber, 'medium')?.answer) ||
        getAnswer(answers, ['medium']) ||
        'Medium not supplied'
      const voteFieldEntry = findArtworkFieldEntry(answers, artworkNumber, 'votes')
      const fieldVoteCounts = parseVoteCounts(
        valueToString(voteFieldEntry?.[1].answer ?? voteFieldEntry?.[1].prettyFormat),
      )
      const councilVoteCounts = collectCouncilVoteCounts(answers, artworkNumber)
      const reviewerVoteFieldEntry = findReviewerVoteFieldEntry(answers, artworkNumber)
      const myVoteRaw = valueToString(
        reviewerVoteFieldEntry?.[1].answer ?? reviewerVoteFieldEntry?.[1].prettyFormat,
      )
      const myVote = parseReviewerVote(myVoteRaw)

      const fileName = imageUrl.split('/').pop()
      return {
        id: `${submission.id}-artwork-${artworkNumber}`,
        submissionId: submission.id,
        artworkNumber,
        title,
        medium,
        imageUrl,
        voteCounts: getVoteTotal(councilVoteCounts) > 0
          ? councilVoteCounts
          : mergeVoteCounts(fieldVoteCounts, councilVoteCounts),
        ...(myVote ? { myVote } : {}),
        ...(myVoteRaw ? { myVoteRaw } : {}),
        ...(voteFieldEntry?.[0] ? { jotformVoteFieldId: voteFieldEntry[0] } : {}),
        ...(reviewerVoteFieldEntry?.[0] ? { jotformReviewerVoteFieldId: reviewerVoteFieldEntry[0] } : {}),
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
