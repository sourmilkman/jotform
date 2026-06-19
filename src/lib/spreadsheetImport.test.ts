import { describe, expect, it } from 'vitest'
import { importSubmissionsFromSpreadsheet } from './spreadsheetImport'

describe('importSubmissionsFromSpreadsheet', () => {
  it('imports artist rows and artwork columns from CSV', async () => {
    const csv = [
      'email,name,date of birth,artwork 1 (image attachment),title of artwork 1,medium,votes - artwork 1,artwork 2 (image attachment),title of artwork 2,medium,votes - artwork 2',
      'artist@example.com,Ada Painter,2000-01-02,https://example.com/a.jpg,Blue Study,Oil,Yes: 2; Maybe: 1; No: 0,second-file.jpg,Red Study,Acrylic,Yes: 0; Maybe: 3; No: 1',
    ].join('\n')
    const file = new File([csv], 'submissions.csv', { type: 'text/csv' })

    const submissions = await importSubmissionsFromSpreadsheet(file)

    expect(submissions).toHaveLength(1)
    expect(submissions[0].source).toBe('import')
    expect(submissions[0].artistName).toBe('Ada Painter')
    expect(submissions[0].artworks).toHaveLength(2)
    expect(submissions[0].artworks[0]).toMatchObject({
      artworkNumber: 1,
      title: 'Blue Study',
      medium: 'Oil',
      imageUrl: 'https://example.com/a.jpg',
      voteCounts: { yes: 2, maybe: 1, no: 0 },
    })
    expect(submissions[0].artworks[1].imageUrl).toContain('data:image/svg+xml')
    expect(submissions[0].artworks[1].fileName).toBe('second-file.jpg')
  })
})
