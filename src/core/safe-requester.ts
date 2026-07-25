import type { SafeRequester, SafeRequestResult } from './model.js'

const defaultTimeoutMs = 8_000
const defaultMaximumResponseBytes = 1_000_000
const maximumRedirects = 3

export function createSafeRequester(input: {
  readonly origin: string
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
  readonly maximumResponseBytes?: number
}): SafeRequester {
  const {
    origin: originInput,
    fetch: suppliedFetch,
    timeoutMs: configuredTimeoutMs,
    maximumResponseBytes: configuredMaximumResponseBytes,
  } = input
  const { origin } = new URL(originInput)
  const performFetch = suppliedFetch ?? fetch
  const timeoutMs = configuredTimeoutMs ?? defaultTimeoutMs
  const maximumResponseBytes =
    configuredMaximumResponseBytes ?? defaultMaximumResponseBytes

  return {
    requestJson: async ({ path, headers, signal }) => {
      let url: URL
      try {
        url = new URL(path, origin)
      } catch {
        return { status: 'network' }
      }
      if (url.origin !== origin) return { status: 'network' }

      for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
        // eslint-disable-next-line no-await-in-loop
        const result = await requestOnce({
          url,
          headers,
          signal,
          fetch: performFetch,
          timeoutMs,
          maximumResponseBytes,
        })
        if (result.status !== 'redirect') return result

        const { location } = result
        if (location === undefined) return { status: 'network' }
        const nextUrl = new URL(location, url)
        if (nextUrl.origin !== origin) return { status: 'network' }
        url = nextUrl
      }

      return { status: 'network' }
    },
  }
}

async function requestOnce(input: {
  readonly url: URL
  readonly headers: Readonly<Record<string, string>>
  readonly signal: AbortSignal
  readonly fetch: typeof fetch
  readonly timeoutMs: number
  readonly maximumResponseBytes: number
}): Promise<
  | SafeRequestResult
  | { readonly status: 'redirect'; readonly location?: string }
> {
  try {
    const response = await input.fetch(input.url, {
      headers: input.headers,
      redirect: 'manual',
      signal: AbortSignal.any([
        input.signal,
        AbortSignal.timeout(input.timeoutMs),
      ]),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      return {
        status: 'redirect',
        ...(location === null ? {} : { location }),
      }
    }

    const bytes = await readBoundedBody(response, input.maximumResponseBytes)
    const json = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    const retry = retryAt(response.headers.get('retry-after'))
    return {
      status: 'response',
      statusCode: response.status,
      json,
      ...(retry === undefined ? {} : { retryAt: retry }),
    }
  } catch {
    return { status: 'network' }
  }
}

async function readBoundedBody(
  response: Response,
  maximumResponseBytes: number
): Promise<Uint8Array> {
  const body = response.body as ReadableStream<Uint8Array>
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const next = await reader.read()
      if (next.done) break
      const { value } = next
      size += value.byteLength
      if (size > maximumResponseBytes) throw new Error('Response exceeds bound')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function retryAt(value: string | null): string | undefined {
  if (value === null) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(Date.now() + seconds * 1_000).toISOString()
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}
