import type { ArtistSubmission, ArtworkVote, ReviewState, VoteCounts } from '../types'

export const emptyVoteCounts = (): VoteCounts => ({
  yes: 0,
  maybe: 0,
  no: 0,
})

export const getVoteTotal = (counts: VoteCounts) => counts.yes + counts.maybe + counts.no

export const buildVote = (
  submissionId: string,
  artworkId: string,
  value: keyof VoteCounts,
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
      count +
      submission.artworks.filter((artwork) => {
        const vote = votes[artwork.id]
        return Boolean(vote?.value)
      }).length,
    0,
  )

  return { total, reviewed, remaining: Math.max(total - reviewed, 0) }
}
