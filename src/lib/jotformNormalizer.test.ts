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

  it('does not use question id digits when matching artwork numbers', () => {
    const result = normalizeJotformSubmissions([
      {
        id: '456',
        answers: {
          '61': { name: 'q61_artworkUpload5', text: 'Artwork upload 5', answer: ['https://files.jotform.com/five.jpg'] },
          '62': { name: 'q62_title5', text: 'Title 5', answer: 'Fifth title' },
          '63': { name: 'q63_medium5', text: 'Medium and base 5', answer: 'Ink' },
        },
      },
    ])

    expect(result[0].artworks).toHaveLength(1)
    expect(result[0].artworks[0]).toMatchObject({
      artworkNumber: 5,
      title: 'Fifth title',
      medium: 'Ink',
      imageUrl: 'https://files.jotform.com/five.jpg',
    })
  })

  it('maps Tom reviewer vote fields onto artworks', () => {
    const result = normalizeJotformSubmissions([
      {
        id: '789',
        answers: {
          '10': { name: 'artworkUpload1', text: 'Artwork upload 1', answer: ['https://files.jotform.com/one.jpg'] },
          '11': { name: 'tomM1', text: 'Tom M 1', answer: 'Maybe' },
        },
      },
    ])

    expect(result[0].artworks[0]).toMatchObject({
      artworkNumber: 1,
      myVote: 'maybe',
      jotformReviewerVoteFieldId: '11',
    })
  })
})
