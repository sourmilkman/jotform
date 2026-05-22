import { describe, expect, it } from 'vitest'
import { mockSubmissions } from '../data/mockSubmissions'
import { buildVote, upsertVote } from './reviewState'
import { SHEET_HEADERS, buildSheetPayload } from './sheetsExport'

describe('buildSheetPayload', () => {
  it('creates headers and one row per artist with six artwork column groups', () => {
    const first = mockSubmissions[0]
    const artwork = first.artworks[0]
    const votes = upsertVote(
      {},
      buildVote(first.id, artwork.id, { yes: 7, maybe: 4, no: 2 }, 'Needs a second look', '2026-05-22T09:00:00.000Z'),
    )
    const payload = buildSheetPayload([first], votes)

    expect(payload.headers).toEqual(SHEET_HEADERS)
    expect(payload.headers).toHaveLength(27)
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0].slice(0, 7)).toEqual([
      first.email,
      first.artistName,
      first.dateOfBirth,
      artwork.imageUrl,
      artwork.title,
      artwork.medium,
      'Yes: 7; Maybe: 4; No: 2',
    ])
    expect(payload.rows[0]).toHaveLength(27)
  })
})
