import type { ArtistSubmission, ReviewState } from '../types'

export const SHEET_HEADERS = [
  'Submission ID',
  'Artist',
  'Email',
  'Artwork #',
  'Title',
  'Medium',
  'Image URL',
  'Vote',
  'Notes',
  'Updated At',
]

export const buildSheetRows = (submissions: ArtistSubmission[], votes: ReviewState) =>
  submissions.flatMap((submission) =>
    submission.artworks.map((artwork) => {
      const vote = votes[artwork.id]
      return [
        submission.id,
        submission.artistName,
        submission.email,
        String(artwork.artworkNumber),
        artwork.title,
        artwork.medium,
        artwork.imageUrl,
        vote?.value ?? '',
        vote?.notes ?? '',
        vote?.updatedAt ?? '',
      ]
    }),
  )

export const buildSheetPayload = (submissions: ArtistSubmission[], votes: ReviewState) => ({
  headers: SHEET_HEADERS,
  rows: buildSheetRows(submissions, votes),
})
