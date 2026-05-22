import { describe, expect, it } from 'vitest'
import { mockSubmissions } from '../data/mockSubmissions'
import { buildVote, getReviewProgress, upsertVote } from './reviewState'

describe('reviewState', () => {
  it('upserts votes and counts reviewed artworks', () => {
    const first = mockSubmissions[0]
    const artwork = first.artworks[0]
    const state = upsertVote(
      {},
      buildVote(first.id, artwork.id, 'yes', 'Strong piece', '2026-05-22T09:00:00.000Z'),
    )

    expect(state[artwork.id]).toMatchObject({
      value: 'yes',
      notes: 'Strong piece',
    })
    expect(getReviewProgress(mockSubmissions, state)).toMatchObject({
      reviewed: 1,
      total: 11,
      remaining: 10,
    })
  })
})
