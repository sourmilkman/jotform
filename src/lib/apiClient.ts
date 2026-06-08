import type { ArtistSubmission, ReviewState } from '../types'

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 20000) => {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out. Try again, or reduce the Jotform sync size.', {
        cause: error,
      })
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

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
  readJson<{ submissions: ArtistSubmission[] }>(await fetchWithTimeout('/api/jotform/submissions'))

export const exportVotes = async (submissions: ArtistSubmission[], votes: ReviewState) =>
  readJson<{ spreadsheetId: string; spreadsheetUrl: string; updatedRows: number }>(
    await fetchWithTimeout('/api/google/sheets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions, votes }),
    }, 30000),
  )

export const submitVotesToJotform = async (submissions: ArtistSubmission[], votes: ReviewState) =>
  readJson<{ updatedSubmissions: number }>(
    await fetchWithTimeout('/api/jotform/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions, votes }),
    }, 30000),
  )

export const signOut = async () =>
  readJson<{ ok: boolean }>(
    await fetch('/api/auth/logout', {
      method: 'POST',
    }),
  )

export const fetchCurrentUser = async () =>
  readJson<{ authenticated: boolean; email?: string }>(await fetch('/api/auth/me'))
