import type { VercelRequest, VercelResponse } from '@vercel/node'

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

const readJotformJson = async (response: Response): Promise<JotformFormsResponse> => {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text) as JotformFormsResponse
  } catch {
    return { message: text }
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  const response = await fetch('https://eu-api.jotform.com/user/forms?limit=1000', {
    headers: { APIKEY: apiKey },
  })
  const payload = await readJotformJson(response)

  if (!response.ok) {
    res.status(response.status).json({ message: payload.message ?? 'Could not read Jotform forms.' })
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    forms: (payload.content ?? []).map((form) => ({
      id: form.id ?? '',
      title: form.title ?? 'Untitled form',
      status: form.status ?? '',
      url: form.url ?? '',
      createdAt: form.created_at ?? '',
      updatedAt: form.updated_at ?? '',
    })),
  })
}
