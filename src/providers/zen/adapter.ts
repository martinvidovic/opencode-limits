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

export function createZenAdapter(): ProviderAdapter<IZenCredential> {
  return {
    load: async ({ credential, requester, signal }) => {
      const headers = {
        'Authorization': `Bearer ${credential.accessToken}`,
        'User-Agent': 'opencode-limits',
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

      const organization = await requester.requestJson({
        path: `/api/orgs/${encodeURIComponent(credential.organizationId)}`,
        headers,
        signal,
      })
      const organizationFailure = responseFailure(organization)
      if (organizationFailure !== undefined)
        return failed(organizationFailure, credential)
      if (organization.status !== 'response') {
        return failed({ code: 'invalid-response' }, credential)
      }
      const organizationData = organization.json
      if (!isOrganization(organizationData)) {
        return failed({ code: 'invalid-response' }, credential)
      }

      const usage = await requester.requestJson({
        path: `/api/usage/summary?organization_id=${encodeURIComponent(credential.organizationId)}`,
        headers,
        signal,
      })
      const usageFailure = responseFailure(usage)
      if (usageFailure !== undefined) return failed(usageFailure, credential)
      if (usage.status !== 'response')
        return failed({ code: 'network' }, credential)
      const periods = parseUsage(usage.json)
      if (periods === undefined)
        return failed({ code: 'invalid-response' }, credential)

      return {
        status: 'success',
        snapshot: {
          provider: zenIdentity,
          account: {
            identity: credential.account.identity,
            planOrOrganization: organizationData.name,
          },
          meters: [],
          periods,
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

function isUser(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
}

function isOrganization(value: unknown): value is { readonly name: string } {
  return (
    isRecord(value) && typeof value.name === 'string' && value.name.length > 0
  )
}

function parseUsage(value: unknown): readonly PeriodSummary[] | undefined {
  if (!isRecord(value)) return undefined
  const today = parsePeriod(value.today, 'Today')
  const thirtyDays = parsePeriod(value.thirty_days, '30 days')
  return today === undefined || thirtyDays === undefined
    ? undefined
    : [today, thirtyDays]
}

function parsePeriod(value: unknown, label: string): PeriodSummary | undefined {
  if (!isRecord(value)) return undefined
  const { cost, requests, tokens } = value
  if (
    !isNonNegativeNumber(cost) ||
    !isNonNegativeNumber(requests) ||
    !isNonNegativeNumber(tokens)
  ) {
    return undefined
  }
  return {
    label,
    values: [
      { label: 'Cost', value: cost, unit: 'USD' },
      { label: 'Requests', value: requests, unit: 'requests' },
      { label: 'Tokens', value: tokens, unit: 'tokens' },
    ],
  }
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
