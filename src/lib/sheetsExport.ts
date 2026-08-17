import type { ArtistSubmission, Artwork, VoteCounts } from '../types.js'

const MAX_ARTWORKS = 6

export const SHEET_HEADERS = [
  'email',
  'name',
  'date of birth',
  ...Array.from({ length: MAX_ARTWORKS }, (_, index) => {
    const artworkNumber = index + 1
    return [
      `artwork ${artworkNumber} (image attachment)`,
      `title of artwork ${artworkNumber}`,
      'medium',
      `votes - artwork ${artworkNumber}`,
    ]
  }).flat(),
]

export const formatVoteCounts = (counts: VoteCounts) =>
  `Yes: ${counts.yes}; Maybe: ${counts.maybe}; No: ${counts.no}`

const getVoteTotal = (counts: VoteCounts) => counts.yes + counts.maybe + counts.no

export const formatArtworkVoteCounts = (artwork: Artwork) => {
  if (getVoteTotal(artwork.voteCounts) > 0 || !artwork.rawVoteCounts) {
    return formatVoteCounts(artwork.voteCounts)
  }

  const rawCounts = Object.entries(artwork.rawVoteCounts)
    .map(([code, count]) => `${code}: ${count}`)
    .join('; ')

  return rawCounts ? `Unmapped votes - ${rawCounts}` : formatVoteCounts(artwork.voteCounts)
}

export const buildSheetRows = (submissions: ArtistSubmission[]) =>
  submissions.map((submission) => {
    const artworkColumns = Array.from({ length: MAX_ARTWORKS }, (_, index) => {
      const artworkNumber = index + 1
      const artwork = submission.artworks.find((item) => item.artworkNumber === artworkNumber)
      if (!artwork) return ['', '', '', '']

      return [
        artwork.imageUrl,
        artwork.title,
        artwork.medium,
        formatArtworkVoteCounts(artwork),
      ]
    }).flat()

    return [
      submission.email,
      submission.artistName,
      submission.dateOfBirth ?? '',
      ...artworkColumns,
    ]
  })

export const buildSheetPayload = (submissions: ArtistSubmission[]) => ({
  headers: SHEET_HEADERS,
  rows: buildSheetRows(submissions),
})
