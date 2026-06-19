import { parseVoteCounts } from './jotformNormalizer.js'
import type { ArtistSubmission, Artwork } from '../types.js'

const MAX_ARTWORKS = 6

type SpreadsheetRow = Record<string, unknown>

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')

const valueToString = (value: unknown) => {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

const createArtworkPlaceholder = (label: string) => {
  const safeLabel = label || 'Artwork attachment'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#eef5f1"/><rect x="120" y="110" width="960" height="680" rx="24" fill="#ffffff" stroke="#c9d8d2" stroke-width="4"/><text x="600" y="430" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#193b37">Artwork attachment</text><text x="600" y="495" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#61756f">${safeLabel.replace(/[<>&]/g, '')}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const isImageUrl = (value: string) =>
  /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || /^blob:/i.test(value)

const findField = (
  row: SpreadsheetRow,
  preferred: string[],
  fallback: (normalizedHeader: string, rawHeader: string) => boolean,
) => {
  const entries = Object.entries(row)
  const preferredKeys = preferred.map(normalizeKey)

  const preferredMatch = entries.find(([header]) =>
    preferredKeys.includes(normalizeKey(header)),
  )
  if (preferredMatch) return valueToString(preferredMatch[1])

  const fallbackMatch = entries.find(([header]) => fallback(normalizeKey(header), header))
  return fallbackMatch ? valueToString(fallbackMatch[1]) : ''
}

const findArtworkField = (
  row: SpreadsheetRow,
  artworkNumber: number,
  kind: 'image' | 'title' | 'medium' | 'votes',
) => {
  const number = String(artworkNumber)
  const preferred = {
    image: [
      `artwork ${number} (image attachment)`,
      `artwork${number} (image attachment)`,
      `artwork ${number}`,
      `artwork${number}`,
    ],
    title: [
      `title of artwork ${number}`,
      `title of artwork${number}`,
      `title artwork ${number}`,
      `artwork ${number} title`,
    ],
    medium: [
      `medium ${number}`,
      `medium and base ${number}`,
      `artwork ${number} medium`,
    ],
    votes: [
      `votes - artwork ${number}`,
      `votes artwork ${number}`,
      `votesartwork${number}`,
    ],
  }[kind]

  return findField(row, preferred, (key) => {
    const hasNumber = key.includes(number)
    if (!hasNumber) return false

    if (kind === 'image') {
      return (
        key.includes('artwork') &&
        !key.includes('title') &&
        !key.includes('medium') &&
        !key.includes('vote') &&
        !key.includes('size') &&
        !key.includes('ray')
      )
    }
    if (kind === 'title') return key.includes('title')
    if (kind === 'medium') return key.includes('medium') || key.includes('base')
    return key.includes('vote')
  })
}

const findArtworkNumberNearHeader = (headers: string[], index: number) => {
  const extract = (header: string) => {
    const normalized = normalizeKey(header)
    const match = normalized.match(/artwork(\d)/) ?? normalized.match(/votesartwork(\d)/)
    return match?.[1] ?? ''
  }

  for (let offset = 1; offset <= 3; offset += 1) {
    const previous = headers[index - offset]
    if (previous) {
      const previousNumber = extract(previous)
      if (previousNumber) return previousNumber
    }
  }

  for (let offset = 1; offset <= 3; offset += 1) {
    const next = headers[index + offset]
    if (next) {
      const nextNumber = extract(next)
      if (nextNumber) return nextNumber
    }
  }

  return ''
}

const contextualizeHeader = (headers: string[], index: number) => {
  const header = headers[index] || `column ${index + 1}`
  const key = normalizeKey(header)

  if (
    (key === 'medium' || key === 'mediumandbase' || key === 'title') &&
    !key.includes('artwork')
  ) {
    const artworkNumber = findArtworkNumberNearHeader(headers, index)
    return artworkNumber ? `${header} artwork ${artworkNumber}` : header
  }

  return header
}

const parseRows = async (buffer: ArrayBuffer): Promise<SpreadsheetRow[]> => {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
  })

  const headers = (matrix[0] ?? []).map(valueToString)
  return matrix.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((_, index) => [
        contextualizeHeader(headers, index),
        cells[index] ?? '',
      ]),
    ),
  )
}

export const importSubmissionsFromSpreadsheet = async (file: File): Promise<ArtistSubmission[]> => {
  const buffer = await file.arrayBuffer()
  const rows = await parseRows(buffer)

  return rows
    .map((row, index): ArtistSubmission => {
      const id =
        findField(row, ['submission id', 'submissionid', 'id'], (key) =>
          key === 'submissionid' || key === 'id',
        ) || `import-${index + 1}`
      const artistName =
        findField(row, ['name', 'artist name', 'artistname', 'full name'], (key) =>
          key.includes('name') && !key.includes('filename'),
        ) || `Imported artist ${index + 1}`
      const submittedAt =
        findField(row, ['submitted at', 'created at', 'created_at', 'submission date'], (key) =>
          key.includes('submitted') || key.includes('created'),
        ) || new Date().toISOString()

      const artworks: Artwork[] = Array.from({ length: MAX_ARTWORKS }, (_, artworkIndex): Artwork | null => {
        const artworkNumber = artworkIndex + 1
        const rawImage = findArtworkField(row, artworkNumber, 'image')
        const title = findArtworkField(row, artworkNumber, 'title')
        const medium = findArtworkField(row, artworkNumber, 'medium')
        const votes = findArtworkField(row, artworkNumber, 'votes')

        if (!rawImage && !title && !medium && !votes) return null

        const imageUrl = isImageUrl(rawImage)
          ? rawImage
          : createArtworkPlaceholder(rawImage || title || `Artwork ${artworkNumber}`)

        return {
          id: `${id}-artwork-${artworkNumber}`,
          submissionId: id,
          artworkNumber,
          title: title || `Artwork ${artworkNumber}`,
          medium: medium || 'Medium not supplied',
          imageUrl,
          voteCounts: parseVoteCounts(votes),
          ...(rawImage ? { fileName: rawImage.split(/[\\/]/).pop() } : {}),
        }
      }).filter((artwork): artwork is Artwork => artwork !== null)

      return {
        id,
        submittedAt,
        artistName,
        email: findField(row, ['email', 'e-mail', 'e mail'], (key) => key.includes('email')),
        phone: findField(row, ['phone', 'telephone'], (key) => key.includes('phone') || key.includes('telephone')),
        dateOfBirth: findField(row, ['date of birth', 'dateofbirth', 'dob'], (key) =>
          key.includes('dateofbirth') || key === 'dob',
        ),
        address: findField(row, ['address'], (key) => key.includes('address')),
        source: 'import',
        artworks,
      }
    })
    .filter((submission) => submission.artworks.length > 0)
}
