import {
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  ImageIcon,
  RotateCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { mockSubmissions } from './data/mockSubmissions'
import { exportVotes, fetchCurrentUser, fetchLiveSubmissions } from './lib/apiClient'
import { buildVote, emptyVoteCounts, getReviewProgress, upsertVote } from './lib/reviewState'
import type { ArtistSubmission, ReviewState, SyncState, VoteCounts } from './types'

const voteCountOptions: Array<{
  key: keyof VoteCounts
  label: string
}> = [
  { key: 'yes', label: 'Yes' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'no', label: 'No' },
]

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

type ExportDialog =
  | { status: 'idle' }
  | { status: 'working'; message: string }
  | { status: 'success'; message: string; spreadsheetUrl: string }
  | { status: 'error'; message: string }

function App() {
  const [submissions, setSubmissions] = useState<ArtistSubmission[]>(mockSubmissions)
  const [reviewState, setReviewState] = useState<ReviewState>({})
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(mockSubmissions[0]?.id ?? '')
  const [selectedArtworkId, setSelectedArtworkId] = useState(mockSubmissions[0]?.artworks[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [demoMode, setDemoMode] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [exportDialog, setExportDialog] = useState<ExportDialog>({ status: 'idle' })
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'ready',
    message: 'Demo submissions loaded',
    syncedAt: new Date().toISOString(),
  })
  const [exportState, setExportState] = useState('Ready to export')

  const filteredSubmissions = useMemo(() => {
    const trimmed = query.toLowerCase().trim()
    if (!trimmed) return submissions
    return submissions.filter((submission) => {
      const text = [
        submission.artistName,
        submission.email,
        submission.address,
        ...submission.artworks.flatMap((artwork) => [artwork.title, artwork.medium]),
      ]
        .join(' ')
        .toLowerCase()
      return text.includes(trimmed)
    })
  }, [query, submissions])

  const selectedSubmission =
    submissions.find((submission) => submission.id === selectedSubmissionId) ?? submissions[0]
  const selectedArtwork =
    selectedSubmission?.artworks.find((artwork) => artwork.id === selectedArtworkId) ??
    selectedSubmission?.artworks[0]
  const selectedVote = selectedArtwork ? reviewState[selectedArtwork.id] : undefined
  const progress = getReviewProgress(submissions, reviewState)

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => setUserEmail(user.email ?? null))
      .catch(() => setUserEmail(null))
      .finally(() => setIsCheckingSession(false))
  }, [])

  const selectSubmission = (submission: ArtistSubmission) => {
    setSelectedSubmissionId(submission.id)
    setSelectedArtworkId(submission.artworks[0]?.id ?? '')
  }

  const selectRelativeArtwork = (direction: -1 | 1) => {
    if (!selectedSubmission || !selectedArtwork) return
    const currentIndex = selectedSubmission.artworks.findIndex((artwork) => artwork.id === selectedArtwork.id)
    const nextIndex =
      (currentIndex + direction + selectedSubmission.artworks.length) % selectedSubmission.artworks.length
    setSelectedArtworkId(selectedSubmission.artworks[nextIndex].id)
  }

  const setVoteCount = (key: keyof VoteCounts, nextValue: number) => {
    if (!selectedArtwork || !selectedSubmission) return
    const currentCounts = selectedVote?.counts ?? emptyVoteCounts()
    const nextVote = buildVote(
      selectedSubmission.id,
      selectedArtwork.id,
      {
        ...currentCounts,
        [key]: Math.max(0, Math.min(13, nextValue)),
      },
      selectedVote?.notes ?? '',
    )
    setReviewState((state) => upsertVote(state, nextVote))
    setExportState('Unsynced voting changes')
  }

  const setNotes = (notes: string) => {
    if (!selectedArtwork || !selectedSubmission) return
    const nextVote = buildVote(
      selectedSubmission.id,
      selectedArtwork.id,
      selectedVote?.counts ?? emptyVoteCounts(),
      notes,
    )
    setReviewState((state) => upsertVote(state, nextVote))
    setExportState('Unsynced voting changes')
  }

  const handleSync = async () => {
    if (demoMode) {
      setSubmissions(mockSubmissions)
      selectSubmission(mockSubmissions[0])
      setSyncState({
        status: 'ready',
        message: 'Demo submissions refreshed',
        syncedAt: new Date().toISOString(),
      })
      return
    }

    setSyncState({ status: 'syncing', message: 'Pulling Jotform submissions' })
    try {
      const result = await fetchLiveSubmissions()
      setSubmissions(result.submissions)
      if (result.submissions[0]) selectSubmission(result.submissions[0])
      setSyncState({
        status: 'ready',
        message: `${result.submissions.length} live submissions loaded`,
        syncedAt: new Date().toISOString(),
      })
    } catch (error) {
      setSyncState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not sync Jotform',
      })
    }
  }

  const handleExport = async () => {
    setExportState('Exporting to Google Sheet')
    setExportDialog({ status: 'working', message: 'Exporting votes to Google Sheets...' })
    try {
      const result = await exportVotes(submissions, reviewState)
      setExportState(`Exported ${result.updatedRows} rows`)
      setExportDialog({
        status: 'success',
        message: `Exported ${result.updatedRows} artwork rows to Google Sheets.`,
        spreadsheetUrl: result.spreadsheetUrl,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Sheet export failed'
      setExportState(message)
      setExportDialog({ status: 'error', message })
    }
  }

  if (!selectedSubmission || !selectedArtwork) {
    return (
      <main className="empty-state">
        <ImageIcon aria-hidden="true" />
        <h1>No submissions yet</h1>
        <p>Use demo mode now, then sync Jotform after the first RMS entry arrives.</p>
        <button type="button" onClick={handleSync}>
          Load demo submissions
        </button>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="app-kicker">Private PWA</p>
          <div className="brand-row">
            <h1>RMS Review</h1>
            <span title={`Version ${__APP_VERSION__}, build ${__BUILD_REF__}`}>
              v{__APP_VERSION__} · {__BUILD_REF__}
            </span>
          </div>
        </div>
        <div className="topbar-actions" aria-label="Review actions">
          <label className="mode-toggle">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(event) => setDemoMode(event.target.checked)}
            />
            Demo data
          </label>
          {userEmail ? (
            <span className="signed-in-pill" title={`Signed in as ${userEmail}`}>
              <ShieldCheck size={15} aria-hidden="true" />
              {userEmail}
            </span>
          ) : (
            <a className="signin-link" href="/api/auth/google/start">
              {isCheckingSession ? 'Checking sign-in' : 'Sign in'}
            </a>
          )}
          <button type="button" className="secondary-button" onClick={handleSync}>
            <RotateCw size={16} aria-hidden="true" />
            Pull from Jotform
          </button>
          <button type="button" className="primary-button" onClick={handleExport}>
            <Download size={16} aria-hidden="true" />
            Export to Google Sheet
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="RMS submission review workspace">
        <aside className="sidebar" aria-label="Submissions">
          <div className="status-panel">
            <div className={`status-dot ${syncState.status}`} />
            <div>
              <strong>{syncState.message}</strong>
              <span>{syncState.syncedAt ? `Last sync ${formatDate(syncState.syncedAt)}` : 'Waiting'}</span>
            </div>
          </div>

          <div className="progress-panel">
            <div>
              <strong>{progress.reviewed}</strong>
              <span>reviewed</span>
            </div>
            <div>
              <strong>{progress.remaining}</strong>
              <span>remaining</span>
            </div>
            <div>
              <strong>{progress.total}</strong>
              <span>artworks</span>
            </div>
          </div>

          <label className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search artists or artworks"
            />
          </label>

          <div className="submission-list">
            {filteredSubmissions.map((submission) => {
              const reviewed = submission.artworks.filter((artwork) => {
                const vote = reviewState[artwork.id]
                return vote ? vote.counts.yes + vote.counts.maybe + vote.counts.no > 0 : false
              }).length
              return (
                <button
                  type="button"
                  key={submission.id}
                  className={submission.id === selectedSubmission.id ? 'submission-card active' : 'submission-card'}
                  onClick={() => selectSubmission(submission)}
                >
                  <span>
                    <strong>{submission.artistName}</strong>
                    <small>{submission.email}</small>
                  </span>
                  <em>
                    {reviewed}/{submission.artworks.length}
                  </em>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="viewer" aria-label="Selected artwork">
          <div className="viewer-header">
            <div>
              <p>{selectedSubmission.artistName}</p>
              <h2>{selectedArtwork.title}</h2>
            </div>
            <div className="viewer-controls">
              <button type="button" aria-label="Previous artwork" onClick={() => selectRelativeArtwork(-1)}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span>
                {selectedArtwork.artworkNumber} of {selectedSubmission.artworks.length}
              </span>
              <button type="button" aria-label="Next artwork" onClick={() => selectRelativeArtwork(1)}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="artwork-stage">
            <img src={selectedArtwork.imageUrl} alt={selectedArtwork.title} loading="lazy" />
          </div>

          <div className="artwork-meta">
            <span>{selectedArtwork.medium}</span>
            <span>{selectedArtwork.fileName ?? 'Jotform attachment'}</span>
            <span>Submitted {formatDate(selectedSubmission.submittedAt)}</span>
          </div>

          <div className="thumbnail-strip" aria-label="Artwork thumbnails">
            {selectedSubmission.artworks.map((artwork) => (
              <button
                type="button"
                key={artwork.id}
                className={artwork.id === selectedArtwork.id ? 'thumbnail active' : 'thumbnail'}
                onClick={() => setSelectedArtworkId(artwork.id)}
                aria-label={`View ${artwork.title}`}
              >
                <img src={artwork.imageUrl} alt="" loading="lazy" />
                {reviewState[artwork.id] ? <Check size={14} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </section>

        <aside className="inspector" aria-label="Vote and submission details">
          <section className="panel">
            <div className="panel-title">
              <ShieldCheck size={18} aria-hidden="true" />
              <h2>Artwork vote</h2>
            </div>
            <div className="vote-count-grid">
              {voteCountOptions.map((option) => {
                const count = selectedVote?.counts[option.key] ?? 0
                return (
                  <div className="vote-count-row" key={option.key}>
                    <span>{option.label}</span>
                    <div>
                      <button
                        type="button"
                        aria-label={`Decrease ${option.label} votes`}
                        onClick={() => setVoteCount(option.key, count - 1)}
                      >
                        -
                      </button>
                      <output aria-label={`${option.label} votes`}>{count}</output>
                      <button
                        type="button"
                        aria-label={`Increase ${option.label} votes`}
                        onClick={() => setVoteCount(option.key, count + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="vote-hint">Enter aggregate council totals. Counts are capped at 13.</p>
            <label className="notes-field">
              Notes
              <textarea
                value={selectedVote?.notes ?? ''}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Private judging notes"
              />
            </label>
            <p className="save-state">{exportState}</p>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Cloud size={18} aria-hidden="true" />
              <h2>Artist details</h2>
            </div>
            <dl className="details-list">
              <div>
                <dt>Name</dt>
                <dd>{selectedSubmission.artistName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{selectedSubmission.email || 'Not supplied'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{selectedSubmission.phone || 'Not supplied'}</dd>
              </div>
              <div>
                <dt>Date of birth</dt>
                <dd>{selectedSubmission.dateOfBirth || 'Not supplied'}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{selectedSubmission.address || 'Not supplied'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>

      {exportDialog.status !== 'idle' ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
            <button
              type="button"
              className="dialog-close"
              aria-label="Close export status"
              onClick={() => setExportDialog({ status: 'idle' })}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <div className={`dialog-status ${exportDialog.status}`}>
              {exportDialog.status === 'working' ? <RotateCw size={24} aria-hidden="true" /> : null}
              {exportDialog.status === 'success' ? <Check size={24} aria-hidden="true" /> : null}
              {exportDialog.status === 'error' ? <X size={24} aria-hidden="true" /> : null}
            </div>
            <h2 id="export-dialog-title">
              {exportDialog.status === 'working'
                ? 'Exporting'
                : exportDialog.status === 'success'
                  ? 'Export complete'
                  : 'Export failed'}
            </h2>
            <p>{exportDialog.message}</p>
            {exportDialog.status === 'success' ? (
              <a className="primary-button dialog-link" href={exportDialog.spreadsheetUrl} target="_blank" rel="noreferrer">
                Open Google Sheet
              </a>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
