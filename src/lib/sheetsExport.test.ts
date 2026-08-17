import { describe, expect, it } from 'vitest'
import { mockSubmissions } from '../data/mockSubmissions'
import { SHEET_HEADERS, buildSheetPayload } from './sheetsExport'

describe('buildSheetPayload', () => {
  it('creates headers and one row per artist with six artwork column groups', () => {
    const first = mockSubmissions[0]
    const artwork = first.artworks[0]
    const payload = buildSheetPayload([first])

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
      'Yes: 4; Maybe: 2; No: 1',
    ])
    expect(payload.rows[0]).toHaveLength(27)
  })

  it('exports raw council vote code totals when vote options are unmapped', () => {
    const first = {
      ...mockSubmissions[0],
      artworks: [
        {
          ...mockSubmissions[0].artworks[0],
          voteCounts: { yes: 0, maybe: 0, no: 0 },
          rawVoteCounts: { '{yesid}': 2, '{maybeid}': 1 },
        },
      ],
    }
    const payload = buildSheetPayload([first])

    expect(payload.rows[0][6]).toBe('Unmapped votes - {yesid}: 2; {maybeid}: 1')
  })
})
