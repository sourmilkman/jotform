# RMS Jotform Review

Private PWA for reviewing RMS exhibition submissions from Jotform without living inside Jotform Tables.

## What Is Included

- React + Vite + TypeScript PWA review workspace.
- Demo submissions so the judging flow works before live Jotform entries exist.
- Per-artwork aggregate council vote counts for `Yes`, `Maybe`, and `No`, plus notes.
- Jotform EU API sync endpoint, configurable with `JOTFORM_FORM_ID`.
- Google OAuth endpoints restricted by `GOOGLE_ALLOWED_EMAIL`.
- Google Sheets export endpoint that writes one row per artist with up to six artwork groups.

## Local Development

```bash
npm install
npm run dev
```

The plain Vite dev server is enough for demo data and UI work. Use Vercel dev when testing API routes:

```bash
npm run dev:vercel
```

Copy `.env.example` to `.env.local` and fill in the API values before testing live sync or Sheets export.

## Environment

```bash
JOTFORM_API_KEY=
JOTFORM_FORM_ID=233391657291361
JOTFORM_API_BASE=
JOTFORM_TEAM_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_ALLOWED_EMAIL=
GOOGLE_REDIRECT_URI=
GOOGLE_SHEET_ID=
```

`GOOGLE_SHEET_ID` is optional. If it is omitted, the export endpoint creates a new spreadsheet called `RMS Review Votes YYYY-MM-DD`.

`JOTFORM_API_KEY` must belong to a Jotform account that can read submissions for `JOTFORM_FORM_ID`. If Jotform returns `You're not authorized to use (/form-id-submissions)`, either the API key is from the wrong account or the configured ID is not the actual form ID.

`JOTFORM_API_BASE` is optional. Leave it blank unless Jotform support or the app diagnostics show you need a specific API host, such as `https://api.jotform.com`, `https://eu-api.jotform.com`, or an Enterprise `/API` URL. `JOTFORM_TEAM_ID` is optional and only needed for forms that live inside a Jotform Team/workspace requiring the `jf-team-id` API header.

## Scripts

```bash
npm run lint
npm run test
npm run build
```

## Notes

The Jotform field mapper is centralized in `src/lib/jotformNormalizer.ts` so it can be adjusted once the first real submission confirms the exact field names and upload payload shape.
