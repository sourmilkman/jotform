import type { ArtistSubmission, ReviewState } from '../types'

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

export const formatVoteCounts = (vote = { counts: { yes: 0, maybe: 0, no: 0 } }) =>
  `Yes: ${vote.counts.yes}; Maybe: ${vote.counts.maybe}; No: ${vote.counts.no}`

export const buildSheetRows = (submissions: ArtistSubmission[], votes: ReviewState) =>
  submissions.map((submission) => {
    const artworkColumns = Array.from({ length: MAX_ARTWORKS }, (_, index) => {
      const artworkNumber = index + 1
      const artwork = submission.artworks.find((item) => item.artworkNumber === artworkNumber)
      if (!artwork) return ['', '', '', '']

      return [
        artwork.imageUrl,
        artwork.title,
        artwork.medium,
        formatVoteCounts(votes[artwork.id]),
      ]
    }).flat()

    return [
      submission.email,
      submission.artistName,
      submission.dateOfBirth ?? '',
      ...artworkColumns,
    ]
  })

export const buildSheetPayload = (submissions: ArtistSubmission[], votes: ReviewState) => ({
  headers: SHEET_HEADERS,
  rows: buildSheetRows(submissions, votes),
})
