import { describe, expect, it } from 'vitest'
import { mockSubmissions } from '../data/mockSubmissions'
import { buildVote, upsertVote } from './reviewState'
import { SHEET_HEADERS, buildSheetPayload } from './sheetsExport'

describe('buildSheetPayload', () => {
  it('creates headers and one row per artwork', () => {
    const first = mockSubmissions[0]
    const artwork = first.artworks[0]
    const votes = upsertVote({}, buildVote(first.id, artwork.id, 'Maybe', 'Needs a second look', '2026-05-22T09:00:00.000Z'))
    const payload = buildSheetPayload([first], votes)

    expect(payload.headers).toEqual(SHEET_HEADERS)
    expect(payload.rows).toHaveLength(first.artworks.length)
    expect(payload.rows[0]).toEqual([
      first.id,
      first.artistName,
      first.email,
      '1',
      artwork.title,
      artwork.medium,
      artwork.imageUrl,
      'Maybe',
      'Needs a second look',
      '2026-05-22T09:00:00.000Z',
    ])
  })
})
