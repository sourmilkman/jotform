import { describe, expect, it } from 'vitest'
import { normalizeJotformSubmissions } from './jotformNormalizer'

describe('normalizeJotformSubmissions', () => {
  it('maps Jotform answers into an artist submission with artwork rows', () => {
    const result = normalizeJotformSubmissions([
      {
        id: '123',
        created_at: '2026-04-29T10:51:00.000Z',
        answers: {
          '1': { name: 'email', text: 'E-mail', answer: 'artist@example.com' },
          '2': { name: 'name', text: 'Name', answer: 'Ada Painter' },
          '3': { name: 'artwork1', text: 'Artwork 1', answer: ['https://files.jotform.com/a.jpg'] },
          '4': { name: 'titleOfArtwork1', text: 'Title of artwork 1', answer: 'Morning Tide' },
          '5': { name: 'medium1', text: 'Medium 1', answer: 'Oil' },
        },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: '123',
      artistName: 'Ada Painter',
      email: 'artist@example.com',
      source: 'jotform',
    })
    expect(result[0].artworks[0]).toMatchObject({
      id: '123-artwork-1',
      artworkNumber: 1,
      title: 'Morning Tide',
      medium: 'Oil',
      imageUrl: 'https://files.jotform.com/a.jpg',
    })
  })

  it('keeps an empty artwork list when no file uploads are present', () => {
    const result = normalizeJotformSubmissions([
      {
        id: 'empty',
        answers: {
          '1': { name: 'name', text: 'Name', answer: 'No Files' },
        },
      },
    ])

    expect(result[0].artworks).toEqual([])
  })
})
