import type {
  PeriodSummary,
  ProviderAdapter,
  ProviderFailure,
  ProviderLoadResult,
  ProviderIdentity,
  SafeRequestResult,
} from '../../core/model.js'
import type { IZenCredential } from './credential.js'

export const zenIdentity: ProviderIdentity = {
  id: 'opencode-zen',
  name: 'OpenCode Zen',
}

interface IZenUsage {
  readonly totalRequests?: string | number
  readonly totalInputTokens?: string | number
  readonly totalOutputTokens?: string | number
  readonly totalCacheReadTokens?: string | number
  readonly totalCacheWrite5mTokens?: string | number
  readonly totalCacheWrite1hTokens?: string | number
  readonly totalCostMicroCents?: string | number
}

export function createZenAdapter(
  input: { readonly now?: () => Date } = {}
): ProviderAdapter<IZenCredential> {
  const now = input.now ?? (() => new Date())
  return {
    load: async ({ credential, requester, signal }) => {
      const headers = {
        'Authorization': `Bearer ${credential.accessToken}`,
        'User-Agent': 'opencode-limits',
        'x-org-id': credential.organizationId,
      }
      const user = await requester.requestJson({
        path: '/api/user',
        headers,
        signal,
      })
      const userFailure = responseFailure(user)
      if (userFailure !== undefined) return failed(userFailure, credential)
      if (user.status !== 'response' || !isUser(user.json)) {
        return failed({ code: 'invalid-response' }, credential)
      }
      const userData = user.json

      const organization = await requester.requestJson({
        path: '/api/orgs',
        headers,
        signal,
      })
      const organizationFailure = responseFailure(organization)
      if (organizationFailure !== undefined)
        return failed(organizationFailure, credential)
      if (organization.status !== 'response') {
        return failed({ code: 'invalid-response' }, credential)
      }
      const organizationData = findOrganization(
        organization.json,
        credential.organizationId
      )
      if (organizationData === undefined) {
        return failed({ code: 'invalid-response' }, credential)
      }

      const current = now()
      const monthStart = new Date(
        Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)
      ).toISOString()
      const usagePath = (query: Record<string, string>): string => {
        const parameters = new URLSearchParams({
          userId: userData.id,
          ...query,
        })
        return `/api/usage/summary?${parameters.toString()}`
      }
      const [today, month] = await Promise.all([
        requester.requestJson({
          path: usagePath({ range: '24h' }),
          headers,
          signal,
        }),
        requester.requestJson({
          path: usagePath({ since: monthStart }),
          headers,
          signal,
        }),
      ])
      const usageFailure = responseFailure(today) ?? responseFailure(month)
      if (usageFailure !== undefined) return failed(usageFailure, credential)
      if (today.status !== 'response' || month.status !== 'response') {
        return failed({ code: 'network' }, credential)
      }
      const todayPeriod = parseUsage(today.json, 'Today')
      const monthPeriod = parseUsage(
        month.json,
        current.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
      )
      if (todayPeriod === undefined || monthPeriod === undefined) {
        return failed({ code: 'invalid-response' }, credential)
      }

      return {
        status: 'success',
        snapshot: {
          provider: zenIdentity,
          account: {
            identity: credential.account.identity,
            planOrOrganization: organizationData.name,
          },
          meters: [],
          periods: [todayPeriod, monthPeriod],
        },
      }
    },
  }
}

function responseFailure(
  response: SafeRequestResult
): ProviderFailure | undefined {
  if (response.status === 'network') return { code: 'network' }
  if (response.statusCode >= 200 && response.statusCode < 300) return undefined
  if (response.statusCode === 401) return { code: 'reauthentication-required' }
  if (response.statusCode === 403) return { code: 'permission-denied' }
  if (response.statusCode === 429) {
    return {
      code: 'rate-limited',
      ...(response.retryAt === undefined ? {} : { retryAt: response.retryAt }),
    }
  }
  return { code: 'unavailable' }
}

function failed(
  failure: ProviderFailure,
  credential: IZenCredential
): ProviderLoadResult {
  return {
    status: 'failure',
    provider: zenIdentity,
    failure,
    account: credential.account,
  }
}

function isUser(value: unknown): value is { readonly id: string } {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
}

function findOrganization(
  value: unknown,
  organizationId: string
): { readonly name: string } | undefined {
  if (!Array.isArray(value)) return undefined
  for (const candidate of value) {
    if (
      isRecord(candidate) &&
      candidate.id === organizationId &&
      typeof candidate.name === 'string' &&
      candidate.name.length > 0
    ) {
      return { name: candidate.name }
    }
  }
  return undefined
}

function parseUsage(value: unknown, label: string): PeriodSummary | undefined {
  if (!isRecord(value)) return undefined
  const usage = value as IZenUsage
  const recognizedValues = [
    usage.totalRequests,
    usage.totalInputTokens,
    usage.totalOutputTokens,
    usage.totalCacheReadTokens,
    usage.totalCacheWrite5mTokens,
    usage.totalCacheWrite1hTokens,
    usage.totalCostMicroCents,
  ]
  if (
    recognizedValues.every((entry) => entry === undefined) ||
    recognizedValues.some(
      (entry) => entry !== undefined && numericValue(entry) === undefined
    )
  )
    return undefined
  const requests = numericValue(usage.totalRequests) ?? 0
  const tokens =
    (numericValue(usage.totalInputTokens) ?? 0) +
    (numericValue(usage.totalOutputTokens) ?? 0) +
    (numericValue(usage.totalCacheReadTokens) ?? 0) +
    (numericValue(usage.totalCacheWrite5mTokens) ?? 0) +
    (numericValue(usage.totalCacheWrite1hTokens) ?? 0)
  const cost = (numericValue(usage.totalCostMicroCents) ?? 0) / 10_000_000
  return {
    label,
    values: [
      { label: 'Cost', value: cost, unit: 'USD' },
      { label: 'Requests', value: requests, unit: 'requests' },
      { label: 'Tokens', value: tokens, unit: 'tokens' },
    ],
  }
}

function numericValue(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
