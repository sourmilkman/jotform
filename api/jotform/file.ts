import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildJotformHeaders } from '../_lib/jotform.js'

const allowedHosts = new Set(['eu.jotform.com', 'www.jotform.com', 'jotform.com'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JOTFORM_API_KEY
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : ''

  if (!apiKey) {
    res.status(500).json({ message: 'JOTFORM_API_KEY is not configured.' })
    return
  }

  let fileUrl: URL
  try {
    fileUrl = new URL(rawUrl)
  } catch {
    res.status(400).json({ message: 'A valid Jotform file URL is required.' })
    return
  }

  if (!allowedHosts.has(fileUrl.hostname) || !fileUrl.pathname.startsWith('/uploads/')) {
    res.status(400).json({ message: 'Only Jotform upload URLs can be proxied.' })
    return
  }

  const response = await fetch(fileUrl, {
    headers: {
      ...buildJotformHeaders(apiKey),
      'User-Agent': 'Mozilla/5.0',
    },
    redirect: 'follow',
  })

  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
    res.status(502).json({
      message: `Jotform returned ${response.status} ${contentType || 'unknown content type'} instead of an image.`,
    })
    return
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.setHeader('Content-Type', contentType)
  res.status(200).send(bytes)
}
