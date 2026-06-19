const DEFAULT_API_BASES = ['https://eu-api.jotform.com', 'https://api.jotform.com']

export type JotformApiResult<T> = {
  baseUrl: string
  ok: boolean
  status: number
  payload: T
  message?: string
}

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, '')

export const getJotformApiBases = () => {
  const configured = process.env.JOTFORM_API_BASE?.trim()
  return [
    ...(configured ? [configured] : []),
    ...DEFAULT_API_BASES,
  ]
    .map(normalizeBaseUrl)
    .filter((base, index, bases) => bases.indexOf(base) === index)
}

export const buildJotformHeaders = (apiKey: string): Record<string, string> => ({
  APIKEY: apiKey,
  ...(process.env.JOTFORM_TEAM_ID ? { 'jf-team-id': process.env.JOTFORM_TEAM_ID } : {}),
})

export const readJotformPayload = async <T>(response: Response): Promise<T & { message?: string }> => {
  const text = await response.text()
  if (!text) return {} as T & { message?: string }

  try {
    return JSON.parse(text) as T & { message?: string }
  } catch {
    return { message: text } as T & { message?: string }
  }
}

export const fetchFromJotformBases = async <T>(
  pathAndQuery: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Array<JotformApiResult<T>>> => {
  const bases = getJotformApiBases()

  return Promise.all(
    bases.map(async (baseUrl) => {
      try {
        const response = await fetch(`${baseUrl}${pathAndQuery}`, {
          ...init,
          headers: {
            ...buildJotformHeaders(apiKey),
            ...init.headers,
          },
        })
        const payload = await readJotformPayload<T>(response)
        return {
          baseUrl,
          ok: response.ok,
          status: response.status,
          payload,
          message: payload.message,
        }
      } catch (error) {
        return {
          baseUrl,
          ok: false,
          status: 0,
          payload: {} as T,
          message: error instanceof Error ? error.message : 'Jotform request failed.',
        }
      }
    }),
  )
}
