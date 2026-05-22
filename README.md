# RMS Jotform Review

Private PWA for reviewing RMS exhibition submissions from Jotform without living inside Jotform Tables.

## What Is Included

- React + Vite + TypeScript PWA review workspace.
- Demo submissions so the judging flow works before live Jotform entries exist.
- Per-artwork aggregate council vote counts for `Yes`, `Maybe`, and `No`, plus notes.
- Jotform EU API sync endpoint for form `233391657291361`.
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
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_ALLOWED_EMAIL=
GOOGLE_REDIRECT_URI=
GOOGLE_SHEET_ID=
```

`GOOGLE_SHEET_ID` is optional. If it is omitted, the export endpoint creates a new spreadsheet called `RMS Review Votes YYYY-MM-DD`.

## Scripts

```bash
npm run lint
npm run test
npm run build
```

## Notes

The Jotform field mapper is centralized in `src/lib/jotformNormalizer.ts` so it can be adjusted once the first real submission confirms the exact field names and upload payload shape.
