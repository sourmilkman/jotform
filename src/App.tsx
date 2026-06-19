import {
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  FileSpreadsheet,
  ImageIcon,
  ListChecks,
  LogOut,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Upload,
  X,
} from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { mockSubmissions } from './data/mockSubmissions'
import {
  exportVotes,
  fetchCurrentUser,
  fetchJotformForms,
  fetchLiveSubmissions,
  signOut,
  submitVotesToJotform,
} from './lib/apiClient'
import { buildVote, getReviewProgress, upsertVote } from './lib/reviewState'
import { importSubmissionsFromSpreadsheet } from './lib/spreadsheetImport'
import type { ArtistSubmission, ReviewState, SyncState, VoteCounts } from './types'

const voteOptions: Array<{
  key: keyof VoteCounts
  label: string
  icon: typeof ThumbsUp
}> = [
  { key: 'yes', label: 'Yes', icon: ThumbsUp },
  { key: 'maybe', label: 'Maybe', icon: Sparkles },
  { key: 'no', label: 'No', icon: ThumbsDown },
]

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

const LAST_SHEET_URL_KEY = 'rms-review:last-sheet-url'

const readCookie = (name: string) =>
  document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)

type ExportDialog =
  | { status: 'idle' }
  | { status: 'working'; title?: string; message: string }
  | { status: 'success'; title?: string; message: string; spreadsheetUrl?: string }
  | { status: 'error'; title?: string; message: string }

function App() {
  const [submissions, setSubmissions] = useState<ArtistSubmission[]>([])
  const [reviewState, setReviewState] = useState<ReviewState>({})
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('')
  const [selectedArtworkId, setSelectedArtworkId] = useState('')
  const [query, setQuery] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(() => {
    const email = readCookie('rms_review_email')
    return email ? decodeURIComponent(email) : null
  })
  const [lastSheetUrl, setLastSheetUrl] = useState<string | null>(() =>
    window.localStorage.getItem(LAST_SHEET_URL_KEY),
  )
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [exportDialog, setExportDialog] = useState<ExportDialog>({ status: 'idle' })
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'ready',
    message: 'Ready to pull from Jotform',
    syncedAt: new Date().toISOString(),
  })
  const [exportState, setExportState] = useState('Ready to export')
  const isSyncing = syncState.status === 'syncing'

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
  const hasImportedData = submissions.some((submission) => submission.source === 'import')

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => {
        if (user.email) setUserEmail(user.email)
      })
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

  const advanceAfterVote = () => {
    if (!selectedSubmission || !selectedArtwork) return

    const currentArtworkIndex = selectedSubmission.artworks.findIndex(
      (artwork) => artwork.id === selectedArtwork.id,
    )
    const nextArtwork = selectedSubmission.artworks[currentArtworkIndex + 1]
    if (nextArtwork) {
      setSelectedArtworkId(nextArtwork.id)
      return
    }

    const currentSubmissionIndex = submissions.findIndex(
      (submission) => submission.id === selectedSubmission.id,
    )
    const nextSubmission = submissions[currentSubmissionIndex + 1]
    if (nextSubmission) {
      selectSubmission(nextSubmission)
    }
  }

  const selectedVoteKey = selectedVote
    ? selectedVote.value
    : undefined

  const setVote = (key: keyof VoteCounts) => {
    if (!selectedArtwork || !selectedSubmission) return
    const nextVote = buildVote(
      selectedSubmission.id,
      selectedArtwork.id,
      key,
      selectedVote?.notes ?? '',
    )
    setReviewState((state) => upsertVote(state, nextVote))
    setExportState('Unsynced voting changes')
    advanceAfterVote()
  }

  const setNotes = (notes: string) => {
    if (!selectedArtwork || !selectedSubmission) return
    const nextVote = buildVote(
      selectedSubmission.id,
      selectedArtwork.id,
      selectedVote?.value ?? 'maybe',
      notes,
    )
    setReviewState((state) => upsertVote(state, nextVote))
    setExportState('Unsynced voting changes')
  }

  const handleSync = async () => {
    setDemoMode(false)
    setSubmissions([])
    setSelectedSubmissionId('')
    setSelectedArtworkId('')
    setSyncState({ status: 'syncing', message: 'Pulling Jotform submissions' })
    setExportDialog({
      status: 'working',
      title: 'Pulling from Jotform',
      message: 'Fetching the latest artist submissions from Jotform...',
    })
    try {
      const result = await fetchLiveSubmissions()
      const artworkCount = result.submissions.reduce(
        (total, submission) => total + submission.artworks.length,
        0,
      )
      setSubmissions(result.submissions)
      setReviewState({})
      if (result.submissions[0]) selectSubmission(result.submissions[0])
      setSyncState({
        status: 'ready',
        message:
          artworkCount > 0
            ? `${result.submissions.length} live submissions loaded`
            : `${result.submissions.length} live submissions found, but no artwork attachments were recognized`,
        syncedAt: new Date().toISOString(),
      })
      setExportDialog({
        status: 'success',
        title: 'Jotform pull complete',
        message:
          artworkCount > 0
            ? `Loaded ${result.submissions.length} live submissions and ${artworkCount} artworks.`
            : `Found ${result.submissions.length} live submissions, but no artwork attachments were recognized. The Jotform field mapping needs updating.`,
        spreadsheetUrl: 'https://eu.jotform.com/tables/233391657291361',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync Jotform'
      setSyncState({
        status: 'error',
        message,
      })
      setExportDialog({
        status: 'error',
        title: 'Jotform pull failed',
        message,
      })
    }
  }

  const handleLoadDemo = () => {
    setDemoMode(true)
    setSubmissions(mockSubmissions)
    setReviewState({})
    if (mockSubmissions[0]) selectSubmission(mockSubmissions[0])
    setSyncState({
      status: 'ready',
      message: `${mockSubmissions.length} demo artists loaded`,
      syncedAt: new Date().toISOString(),
    })
    setExportState('Demo data loaded')
  }

  const handleSpreadsheetImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setExportDialog({
      status: 'working',
      title: 'Importing spreadsheet',
      message: `Reading ${file.name}...`,
    })
    try {
      const importedSubmissions = await importSubmissionsFromSpreadsheet(file)
      if (importedSubmissions.length === 0) {
        throw new Error('No artwork rows were found. Export from Jotform Tables as CSV/XLSX and include the artwork/title/medium columns.')
      }

      setDemoMode(false)
      setSubmissions(importedSubmissions)
      setReviewState({})
      selectSubmission(importedSubmissions[0])
      setSyncState({
        status: 'ready',
        message: `${importedSubmissions.length} artists imported from ${file.name}`,
        syncedAt: new Date().toISOString(),
      })
      setExportState('Imported spreadsheet data loaded')
      setExportDialog({
        status: 'success',
        title: 'Spreadsheet imported',
        message: `Loaded ${importedSubmissions.length} artists and ${importedSubmissions.reduce(
          (total, submission) => total + submission.artworks.length,
          0,
        )} artworks from ${file.name}.`,
      })
    } catch (error) {
      setExportDialog({
        status: 'error',
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'Could not import spreadsheet.',
      })
    }
  }

  const handleFindForms = async () => {
    setExportDialog({
      status: 'working',
      title: 'Checking Jotform forms',
      message: 'Asking Jotform which forms this API key can access...',
    })
    try {
      const result = await fetchJotformForms()
      const formLines = result.forms
        .slice(0, 12)
        .map((form) => `${form.id} - ${form.title}${form.status ? ` (${form.status})` : ''}`)
      const diagnosticLines = (result.diagnostics ?? [])
        .map((diagnostic) => {
          const count = typeof diagnostic.formCount === 'number' ? `${diagnostic.formCount} forms` : 'no count'
          const message = diagnostic.message ? ` - ${diagnostic.message}` : ''
          return `${diagnostic.baseUrl}: ${diagnostic.status}, ${count}${message}`
        })
      setExportDialog({
        status: 'success',
        title: `${result.forms.length} accessible Jotform forms`,
        message:
          formLines.length > 0
            ? `Using ${result.baseUrl ?? 'Jotform API'}.\n\nSet JOTFORM_FORM_ID in Vercel to the matching ID:\n\n${formLines.join('\n')}`
            : `Jotform accepted the API key, but this key cannot see any forms on the checked API hosts.\n\n${diagnosticLines.join('\n') || 'No diagnostics returned.'}`,
      })
    } catch (error) {
      setExportDialog({
        status: 'error',
        title: 'Could not list Jotform forms',
        message: error instanceof Error ? error.message : 'Jotform form lookup failed.',
      })
    }
  }

  const handleExport = async () => {
    setExportState('Exporting to Google Sheet')
    setExportDialog({ status: 'working', message: 'Pulling latest Jotform data, then exporting to Google Sheets...' })
    try {
      const latestSubmissions = demoMode || hasImportedData
        ? submissions
        : (await fetchLiveSubmissions()).submissions
      if (!demoMode && !hasImportedData) {
        setSubmissions(latestSubmissions)
        if (latestSubmissions[0]) selectSubmission(latestSubmissions[0])
      }
      const result = await exportVotes(latestSubmissions, {})
      setExportState(`Exported ${result.updatedRows} rows`)
      setExportDialog({
        status: 'success',
        message: `Exported ${result.updatedRows} artist rows to Google Sheets.`,
        spreadsheetUrl: result.spreadsheetUrl,
      })
      window.localStorage.setItem(LAST_SHEET_URL_KEY, result.spreadsheetUrl)
      setLastSheetUrl(result.spreadsheetUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Sheet export failed'
      setExportState(message)
      setExportDialog({ status: 'error', message })
    }
  }

  const handleSignOut = async () => {
    await signOut().catch(() => undefined)
    setUserEmail(null)
  }

  const handleSubmitVotes = async () => {
    if (hasImportedData) {
      setExportDialog({
        status: 'error',
        title: 'Cannot submit imported data to Jotform',
        message: 'Spreadsheet imports are a local fallback. You can review and export them to Google Sheets, but Jotform submission requires API access to the original form.',
      })
      return
    }

    setExportState('Submitting votes to Jotform')
    setExportDialog({ status: 'working', message: 'Submitting your votes to Jotform...' })
    try {
      const result = await submitVotesToJotform(submissions, reviewState)
      const latestSubmissions = demoMode ? submissions : (await fetchLiveSubmissions()).submissions
      if (!demoMode) setSubmissions(latestSubmissions)
      setReviewState({})
      setExportState(`Submitted votes for ${result.updatedSubmissions} submissions`)
      setExportDialog({
        status: 'success',
        message: `Submitted your votes to ${result.updatedSubmissions} Jotform submissions, then refreshed the UI.`,
        spreadsheetUrl: 'https://eu.jotform.com/tables/233391657291361',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Jotform vote submit failed'
      setExportState(message)
      setExportDialog({ status: 'error', message })
    }
  }

  const statusDialog =
    exportDialog.status !== 'idle' ? (
      <div className="dialog-backdrop" role="presentation">
        <section
          className="export-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
        >
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
            {exportDialog.title ??
              (exportDialog.status === 'working'
                ? 'Working'
                : exportDialog.status === 'success'
                  ? 'Complete'
                  : 'Action failed')}
          </h2>
          <p className={exportDialog.status === 'error' ? 'dialog-error-message' : undefined}>
            {exportDialog.message || 'No error details were returned. Please try again.'}
          </p>
          {exportDialog.status === 'success' && exportDialog.spreadsheetUrl ? (
            <a className="primary-button dialog-link" href={exportDialog.spreadsheetUrl} target="_blank" rel="noreferrer">
              {exportDialog.spreadsheetUrl.includes('jotform') ? 'Open Jotform' : 'Open Google Sheet'}
            </a>
          ) : null}
        </section>
      </div>
    ) : null

  if (!selectedSubmission || !selectedArtwork) {
    return (
      <>
        <main className="empty-state">
          <ImageIcon aria-hidden="true" />
          <h1>No submissions yet</h1>
          <p>Pull live entries from Jotform, or load demo data when you want to test the voting flow.</p>
          <div className="empty-sync-status" role="status" aria-live="polite">
            <div className={`status-dot ${syncState.status}`} />
            <div>
              <strong>{syncState.message}</strong>
              <span>{syncState.syncedAt ? `Last update ${formatDate(syncState.syncedAt)}` : 'Waiting for Jotform'}</span>
            </div>
          </div>
          <div className="empty-actions">
            <button type="button" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? (
                <>
                  <RotateCw size={16} aria-hidden="true" />
                  Pulling from Jotform
                </>
              ) : (
                'Pull from Jotform'
              )}
            </button>
            <button type="button" className="demo-data-button" onClick={handleLoadDemo}>
              <Sparkles size={16} aria-hidden="true" />
              Load demo data
            </button>
          <button type="button" className="secondary-button" onClick={handleFindForms}>
            <ListChecks size={16} aria-hidden="true" />
            Find Jotform forms
          </button>
          <label className="secondary-button import-button">
            <Upload size={16} aria-hidden="true" />
            Import CSV/XLSX
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="file-import-input"
              onChange={handleSpreadsheetImport}
            />
          </label>
        </div>
      </main>
        {statusDialog}
      </>
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
          <span className={demoMode ? 'data-source-pill demo' : 'data-source-pill'}>
            {demoMode ? 'Demo data loaded' : hasImportedData ? 'Imported spreadsheet' : 'Live Jotform data'}
          </span>
          <button type="button" className="demo-data-button" onClick={handleLoadDemo}>
            <Sparkles size={16} aria-hidden="true" />
            Load demo data
          </button>
          <button type="button" className="secondary-button" onClick={handleFindForms}>
            <ListChecks size={16} aria-hidden="true" />
            Find Jotform forms
          </button>
          <label className="secondary-button import-button">
            <Upload size={16} aria-hidden="true" />
            Import CSV/XLSX
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="file-import-input"
              onChange={handleSpreadsheetImport}
            />
          </label>
          {userEmail ? (
            <>
              <span className="signed-in-pill" title={`Signed in as ${userEmail}`}>
                <ShieldCheck size={15} aria-hidden="true" />
                {userEmail}
              </span>
              <button type="button" className="secondary-button" onClick={handleSignOut}>
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </>
          ) : (
            <a className="signin-link" href="/api/auth/google/start">
              {isCheckingSession ? 'Checking sign-in' : 'Sign in with Google'}
            </a>
          )}
          <button type="button" className="secondary-button" onClick={handleSync} disabled={isSyncing}>
            <RotateCw size={16} aria-hidden="true" />
            {isSyncing ? 'Pulling' : 'Pull from Jotform'}
          </button>
          <button type="button" className="secondary-button" onClick={handleSubmitVotes}>
            <Check size={16} aria-hidden="true" />
            Submit to Jotform
          </button>
          <button type="button" className="primary-button" onClick={handleExport}>
            <Download size={16} aria-hidden="true" />
            Export to Google Sheet
          </button>
          <a
            className={`secondary-button sheet-link ${lastSheetUrl ? '' : 'disabled'}`}
            href={lastSheetUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!lastSheetUrl}
            title={lastSheetUrl ? 'Open your last exported Google Sheet' : 'Export first to create a Google Sheet link'}
          >
            <FileSpreadsheet size={16} aria-hidden="true" />
            Open Google Sheet
          </a>
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
                return Boolean(vote?.value)
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
            <div className="vote-grid">
              {voteOptions.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    type="button"
                    key={option.key}
                    className={selectedVoteKey === option.key ? 'vote-button active' : 'vote-button'}
                    onClick={() => setVote(option.key)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {option.label}
                  </button>
                )
              })}
            </div>
            <p className="vote-hint">Your vote is exported as one vote in the matching Yes, Maybe, or No total.</p>
            <div className="council-totals" aria-label="Current council totals from Jotform">
              <span>Current Jotform totals</span>
              <strong>Y {selectedArtwork.voteCounts.yes}</strong>
              <strong>M {selectedArtwork.voteCounts.maybe}</strong>
              <strong>N {selectedArtwork.voteCounts.no}</strong>
            </div>
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

      {statusDialog}
    </main>
  )
}

export default App
