import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchFromJotformBases } from '../_lib/jotform.js'

type JotformForm = {
  id?: string
  title?: string
  status?: string
  url?: string
  created_at?: string
  updated_at?: string
}

type JotformFormsResponse = {
  content?: JotformForm[]
  message?: string
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  const results = await fetchFromJotformBases<JotformFormsResponse>('/user/forms?limit=1000', apiKey)
  const successfulResults = results.filter((result) => result.ok)
  const bestResult =
    successfulResults.find((result) => (result.payload.content ?? []).length > 0) ??
    successfulResults[0] ??
    results[0]

  if (!bestResult?.ok) {
    res.status(bestResult?.status || 502).json({
      message: bestResult?.message ?? 'Could not read Jotform forms.',
      diagnostics: results.map((result) => ({
        baseUrl: result.baseUrl,
        status: result.status,
        message: result.message ?? '',
      })),
    })
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    baseUrl: bestResult.baseUrl,
    diagnostics: results.map((result) => ({
      baseUrl: result.baseUrl,
      status: result.status,
      formCount: result.ok ? (result.payload.content ?? []).length : 0,
      message: result.message ?? '',
    })),
    forms: (bestResult.payload.content ?? []).map((form) => ({
      id: form.id ?? '',
      title: form.title ?? 'Untitled form',
      status: form.status ?? '',
      url: form.url ?? '',
      createdAt: form.created_at ?? '',
      updatedAt: form.updated_at ?? '',
    })),
  })
}
