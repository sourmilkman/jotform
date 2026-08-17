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

  it('maps real RMS upload fields with sibling title and medium fields', () => {
    const result = normalizeJotformSubmissions([
      {
        id: 'rms',
        answers: {
          '94': { name: 'artworkUpload', text: 'Artwork upload 1 on Grid', answer: [] },
          '95': { name: 'mediumAnd95', text: 'Medium and base', answer: 'Acrylic' },
          '96': { name: 'title', text: 'Title', answer: 'First title' },
          '97': { name: 'artworkUpload97', text: 'Artwork upload 2 on Grid', answer: [] },
          '98': { name: 'mediumAnd98', text: 'Medium and base', answer: 'Watercolour' },
          '99': { name: 'title99', text: 'Title', answer: 'Second title' },
          '145': { name: 'artworkUpload145', text: 'Artwork upload 1 without grid', answer: ['https://files.jotform.com/one.jpg'] },
          '146': { name: 'artworkUpload146', text: 'Artwork upload 2 without Grid', answer: ['https://files.jotform.com/two.jpg'] },
          '110': { name: 'rayWinder110', text: 'Tom M 1', answer: 'Yes' },
          '114': { name: 'rayWinder114', text: 'Tom M 2', answer: 'No' },
        },
      },
    ])

    expect(result[0].artworks).toHaveLength(2)
    expect(result[0].artworks[0]).toMatchObject({
      artworkNumber: 1,
      title: 'First title',
      medium: 'Acrylic',
      imageUrl: 'https://files.jotform.com/one.jpg',
      myVote: 'yes',
    })
    expect(result[0].artworks[1]).toMatchObject({
      artworkNumber: 2,
      title: 'Second title',
      medium: 'Watercolour',
      imageUrl: 'https://files.jotform.com/two.jpg',
      myVote: 'no',
    })
  })
})
