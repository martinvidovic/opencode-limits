import type {
  ProviderAdapter,
  ProviderFailure,
  ProviderIdentity,
  ProviderLoadResult,
  SafeRequestResult,
} from '../../core/model.js'
import type { ICopilotCredential } from './credential.js'

export const copilotIdentity: ProviderIdentity = {
  id: 'copilot',
  name: 'GitHub Copilot',
}

export function createCopilotAdapter(): ProviderAdapter<ICopilotCredential> {
  return {
    load: async ({ credential, requester, signal }) => {
      const response = await requester.requestJson({
        path: '/copilot_internal/user',
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
          'User-Agent': 'opencode-limits',
        },
        signal,
      })
      const failure = responseFailure(response)
      if (failure !== undefined) return failed(failure, credential)
      if (response.status !== 'response') {
        return failed({ code: 'network' }, credential)
      }

      const usage = parseUsage(response.json)
      if (usage === undefined) {
        return failed({ code: 'invalid-response' }, credential)
      }

      return {
        status: 'success',
        snapshot: {
          provider: copilotIdentity,
          ...(credential.account === undefined
            ? {}
            : {
                account: {
                  ...credential.account,
                  planOrOrganization: `Copilot ${usage.plan}`,
                },
              }),
          meters: [
            {
              kind: 'bounded-amount',
              label: 'Premium requests',
              used: usage.premium.entitlement - usage.premium.remaining,
              total: usage.premium.entitlement,
              unit: 'requests',
              resetAt: usage.premium.resetAt,
            },
            {
              kind: 'remaining-balance',
              label: 'Chat requests',
              remaining: usage.chat.remaining,
              unit: 'requests',
              resetAt: usage.chat.resetAt,
            },
          ],
          periods: [],
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
  credential: ICopilotCredential
): ProviderLoadResult {
  return {
    status: 'failure',
    provider: copilotIdentity,
    failure,
    ...(credential.account === undefined
      ? {}
      : { account: credential.account }),
  }
}

function parseUsage(value: unknown):
  | {
      readonly plan: string
      readonly premium: {
        readonly entitlement: number
        readonly remaining: number
        readonly resetAt: string
      }
      readonly chat: { readonly remaining: number; readonly resetAt: string }
    }
  | undefined {
  if (!isRecord(value) || typeof value.copilot_plan !== 'string')
    return undefined
  const premium = parsePremium(value.monthly_quotas, value.quota_reset_date)
  const chat = parseChat(value.limited_user_quotas)
  return premium === undefined || chat === undefined
    ? undefined
    : { plan: value.copilot_plan, premium, chat }
}

function parsePremium(
  quotas: unknown,
  resetDate: unknown
):
  | {
      readonly entitlement: number
      readonly remaining: number
      readonly resetAt: string
    }
  | undefined {
  if (!isRecord(quotas) || !isRecord(quotas.premium_interactions))
    return undefined
  const { entitlement, remaining } = quotas.premium_interactions
  const resetAt = parseDate(resetDate)
  if (!isNonNegativeNumber(entitlement)) return undefined
  if (!isNonNegativeNumber(remaining)) return undefined
  if (remaining > entitlement) return undefined
  if (resetAt === undefined) return undefined
  return { entitlement, remaining, resetAt }
}

function parseChat(
  quotas: unknown
): { readonly remaining: number; readonly resetAt: string } | undefined {
  if (!isRecord(quotas) || !isRecord(quotas.chat)) return undefined
  const { remaining, reset_date: resetDate } = quotas.chat
  const resetAt = parseDate(resetDate)
  if (!isNonNegativeNumber(remaining)) return undefined
  if (resetAt === undefined) return undefined
  return { remaining, resetAt }
}

function parseDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
