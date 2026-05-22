import type { ArtistSubmission, ReviewState } from '../types'

const readJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText })) as {
      message?: string
    }
    throw new Error(error.message ?? response.statusText)
  }
  return response.json() as Promise<T>
}

export const fetchLiveSubmissions = async () =>
  readJson<{ submissions: ArtistSubmission[] }>(await fetch('/api/jotform/submissions'))

export const exportVotes = async (submissions: ArtistSubmission[], votes: ReviewState) =>
  readJson<{ spreadsheetId: string; spreadsheetUrl: string; updatedRows: number }>(
    await fetch('/api/google/sheets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions, votes }),
    }),
  )

export const submitVotesToJotform = async (submissions: ArtistSubmission[], votes: ReviewState) =>
  readJson<{ updatedSubmissions: number }>(
    await fetch('/api/jotform/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions, votes }),
    }),
  )

export const fetchCurrentUser = async () =>
  readJson<{ authenticated: boolean; email?: string }>(await fetch('/api/auth/me'))
