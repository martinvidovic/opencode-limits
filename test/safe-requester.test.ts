import { describe, expect, it } from 'vitest'

import { createSafeRequester } from '../src/core/safe-requester.js'

describe('SafeRequester', () => {
  it('binds requests to its origin and follows only same-origin redirects', async () => {
    const requests: string[] = []
    const requester = createSafeRequester({
      baseUrl: 'https://chatgpt.com',
      fetch: (input) => {
        const url = String(input)
        requests.push(url)
        if (url.endsWith('/start')) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: '/complete' },
            })
          )
        }
        return Promise.resolve(Response.json({ complete: true }))
      },
    })

    await expect(
      requester.requestJson({
        path: '/start',
        headers: { Authorization: 'Bearer secret-canary' },
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({
      status: 'response',
      statusCode: 200,
      json: { complete: true },
    })
    expect(requests).toEqual([
      'https://chatgpt.com/start',
      'https://chatgpt.com/complete',
    ])
  })

  it('rejects cross-origin paths and redirects without exposing request data', async () => {
    const requester = createSafeRequester({
      baseUrl: 'https://chatgpt.com',
      fetch: () =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: 'https://elsewhere.test/path?user=canary' },
          })
        ),
    })

    await expect(
      requester.requestJson({
        path: '/start',
        headers: { Authorization: 'Bearer secret-canary' },
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ status: 'network' })
    await expect(
      requester.requestJson({
        path: 'https://elsewhere.test/path',
        headers: {},
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ status: 'network' })
  })

  it('keeps requests and redirects under a base path', async () => {
    const requests: string[] = []
    const requester = createSafeRequester({
      baseUrl: 'https://opencode.ai/console/',
      fetch: (input) => {
        const url = String(input)
        requests.push(url)
        if (url.includes('/api/start')) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: '/console/api/complete' },
            })
          )
        }
        return Promise.resolve(Response.json({ complete: true }))
      },
    })

    await expect(
      requester.requestJson({
        path: '/api/start?range=24h',
        headers: {},
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({ status: 'response', statusCode: 200 })
    await expect(
      requester.requestJson({
        path: '/../api/user',
        headers: {},
        signal: new AbortController().signal,
      })
    ).resolves.toEqual({ status: 'network' })
    expect(requests).toEqual([
      'https://opencode.ai/console/api/start?range=24h',
      'https://opencode.ai/console/api/complete',
    ])
  })
})
