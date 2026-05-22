import { createHmac } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export type VoteCounts = {
  yes: number
  maybe: number
  no: number
}

export type Artwork = {
  id: string
  submissionId: string
  artworkNumber: number
  title: string
  medium: string
  imageUrl: string
  voteCounts: VoteCounts
}

export type ArtistSubmission = {
  id: string
  artistName: string
  email: string
  dateOfBirth?: string
  source: 'jotform' | 'demo'
  artworks: Artwork[]
}

export type ArtworkVote = {
  artworkId: string
  submissionId: string
  value: keyof VoteCounts
  notes: string
  updatedAt: string
}

export type ReviewState = Record<string, ArtworkVote>

export type GoogleSession = {
  email: string
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

const COOKIE_NAME = 'rms_review_session'

const sign = (payload: string) => {
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? 'dev-only-secret'
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export const getSession = (req: VercelRequest) => {
  const cookies = req.headers.cookie?.split(';').map((part) => part.trim()) ?? []
  const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))
  const encoded = sessionCookie?.slice(COOKIE_NAME.length + 1)
  if (!encoded) return null

  const [payload, signature] = encoded.split('.')
  if (!payload || !signature || signature !== sign(payload)) return null

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleSession
  } catch {
    return null
  }
}

export const requireSession = (req: VercelRequest, res: VercelResponse) => {
  const session = getSession(req)
  if (!session) {
    res.status(401).json({ message: 'Sign in with Google before exporting to Sheets.' })
    return null
  }
  return session
}

export const addVoteToCounts = (counts: VoteCounts, vote?: keyof VoteCounts): VoteCounts => ({
  ...counts,
  ...(vote ? { [vote]: counts[vote] + 1 } : {}),
})

export const formatVoteCounts = (counts: VoteCounts) =>
  `Yes: ${counts.yes}; Maybe: ${counts.maybe}; No: ${counts.no}`

const MAX_ARTWORKS = 6

export const buildSheetPayload = (submissions: ArtistSubmission[]) => ({
  headers: [
    'email',
    'name',
    'date of birth',
    ...Array.from({ length: MAX_ARTWORKS }, (_, index) => {
      const artworkNumber = index + 1
      return [
        `artwork ${artworkNumber} (image attachment)`,
        `title of artwork ${artworkNumber}`,
        'medium',
        `votes - artwork ${artworkNumber}`,
      ]
    }).flat(),
  ],
  rows: submissions.map((submission) => [
    submission.email,
    submission.artistName,
    submission.dateOfBirth ?? '',
    ...Array.from({ length: MAX_ARTWORKS }, (_, index) => {
      const artworkNumber = index + 1
      const artwork = submission.artworks.find((item) => item.artworkNumber === artworkNumber)
      if (!artwork) return ['', '', '', '']
      return [
        artwork.imageUrl,
        artwork.title,
        artwork.medium,
        formatVoteCounts(artwork.voteCounts),
      ]
    }).flat(),
  ]),
})
