export type VoteValue = 'Yes' | 'Maybe' | 'No' | null

export type Artwork = {
  id: string
  submissionId: string
  artworkNumber: number
  title: string
  medium: string
  imageUrl: string
  fileName?: string
}

export type ArtistSubmission = {
  id: string
  submittedAt: string
  artistName: string
  email: string
  phone?: string
  dateOfBirth?: string
  address?: string
  notes?: string
  source: 'jotform' | 'demo'
  artworks: Artwork[]
}

export type ArtworkVote = {
  artworkId: string
  submissionId: string
  value: VoteValue
  notes: string
  updatedAt: string
}

export type ReviewState = Record<string, ArtworkVote>

export type SyncState = {
  status: 'idle' | 'syncing' | 'error' | 'ready'
  message: string
  syncedAt?: string
}
