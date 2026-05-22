import type { ArtistSubmission, ArtworkVote, ReviewState, VoteValue } from '../types'

export const buildVote = (
  submissionId: string,
  artworkId: string,
  value: VoteValue,
  notes = '',
  updatedAt = new Date().toISOString(),
): ArtworkVote => ({
  submissionId,
  artworkId,
  value,
  notes,
  updatedAt,
})

export const upsertVote = (
  state: ReviewState,
  vote: ArtworkVote,
): ReviewState => ({
  ...state,
  [vote.artworkId]: vote,
})

export const getReviewProgress = (submissions: ArtistSubmission[], votes: ReviewState) => {
  const total = submissions.reduce((count, submission) => count + submission.artworks.length, 0)
  const reviewed = submissions.reduce(
    (count, submission) =>
      count + submission.artworks.filter((artwork) => Boolean(votes[artwork.id]?.value)).length,
    0,
  )

  return { total, reviewed, remaining: Math.max(total - reviewed, 0) }
}
