import type {
  ProviderAdapter,
  ProviderFailure,
  ProviderIdentity,
  ProviderLoadResult,
  QuotaMeter,
  SafeRequestResult,
} from '../../core/model.js'
import type { ICopilotCredential } from './credential.js'

export const copilotIdentity: ProviderIdentity = {
  id: 'copilot',
  name: 'Copilot',
}

const planLabels = {
  free: 'Free',
  individual: 'Individual',
  business: 'Business',
  enterprise: 'Enterprise',
} as const

export function createCopilotAdapter(): ProviderAdapter<ICopilotCredential> {
  return {
    load: async ({ credential, requester, signal }) => {
      const response = await requester.requestJson({
        path: '/copilot_internal/user',
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
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

      const identity = usage.login ?? credential.account?.identity ?? 'unknown'
      const meters = buildMeters(usage)

      return {
        status: 'success',
        snapshot: {
          provider: copilotIdentity,
          account: {
            identity,
            planOrOrganization: `GitHub Copilot ${usage.planLabel}`,
          },
          meters,
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
  if (response.statusCode === 401 || response.statusCode === 403) {
    return { code: 'reauthentication-required' }
  }
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
      readonly login?: string
      readonly planLabel: string
      readonly premium: PremiumSnapshot
      readonly resetAt?: string
    }
  | undefined {
  if (!isRecord(value)) return undefined
  if (!isRecord(value.quota_snapshots)) return undefined

  const premium = parsePremiumSnapshot(
    value.quota_snapshots.premium_interactions
  )
  const planSource = planSourceFrom(value)
  const resetAt = parseResetAt(
    value.quota_reset_date_utc,
    value.quota_reset_date
  )

  return {
    ...(typeof value.login === 'string' && value.login.length > 0
      ? { login: value.login }
      : {}),
    planLabel: planLabel(planSource),
    premium,
    ...(resetAt === undefined ? {} : { resetAt }),
  }
}

type PremiumSnapshot =
  | { readonly kind: 'missing' }
  | { readonly kind: 'unlimited' }
  | {
      readonly kind: 'metered'
      readonly percentRemaining?: number
      readonly entitlement?: number
      readonly remaining?: number
    }

function parsePremiumSnapshot(value: unknown): PremiumSnapshot {
  if (!isRecord(value)) return { kind: 'missing' }
  if (value.unlimited === true) return { kind: 'unlimited' }
  return {
    kind: 'metered',
    ...(isFiniteNumber(value.percent_remaining)
      ? { percentRemaining: value.percent_remaining }
      : {}),
    ...(isNonNegativeNumber(value.entitlement)
      ? { entitlement: value.entitlement }
      : {}),
    ...remainingFrom(value),
  }
}

function planSourceFrom(value: Record<string, unknown>): string | undefined {
  if (typeof value.copilot_plan === 'string' && value.copilot_plan.length > 0) {
    return value.copilot_plan
  }
  if (
    typeof value.access_type_sku === 'string' &&
    value.access_type_sku.length > 0
  ) {
    return value.access_type_sku
  }
  return undefined
}

function remainingFrom(
  value: Record<string, unknown>
): { readonly remaining: number } | Record<string, never> {
  if (isNonNegativeNumber(value.quota_remaining)) {
    return { remaining: value.quota_remaining }
  }
  if (isNonNegativeNumber(value.remaining)) {
    return { remaining: value.remaining }
  }
  return {}
}

function buildMeters(usage: {
  readonly premium: PremiumSnapshot
  readonly resetAt?: string
}): readonly QuotaMeter[] {
  const premium = premiumMeter(usage.premium)
  const requests = requestsMeter(usage.premium)
  const last =
    usage.resetAt === undefined ? requests : withReset(requests, usage.resetAt)
  return [premium, last]
}

function premiumMeter(premium: PremiumSnapshot): QuotaMeter {
  if (premium.kind === 'missing') {
    return { kind: 'unavailable', label: 'Premium' }
  }
  if (premium.kind === 'unlimited') {
    return { kind: 'unlimited', label: 'Premium' }
  }
  if (premium.percentRemaining === undefined) {
    return { kind: 'unavailable', label: 'Premium' }
  }
  const left = clampPercent(Math.round(premium.percentRemaining))
  return {
    kind: 'fraction-used',
    label: 'Premium',
    used: 100 - left,
    total: 100,
  }
}

function requestsMeter(premium: PremiumSnapshot): QuotaMeter {
  if (premium.kind === 'missing' || premium.kind === 'unlimited') {
    return { kind: 'unlimited', label: 'Requests' }
  }
  const { entitlement, remaining } = premium
  if (
    entitlement !== undefined &&
    remaining !== undefined &&
    remaining <= entitlement
  ) {
    return {
      kind: 'bounded-amount',
      label: 'Requests',
      used: Math.max(0, entitlement - remaining),
      total: entitlement,
      unit: 'requests',
    }
  }
  if (remaining !== undefined) {
    return {
      kind: 'remaining-balance',
      label: 'Requests',
      remaining,
      unit: 'requests',
    }
  }
  return { kind: 'unavailable', label: 'Requests' }
}

function withReset(meter: QuotaMeter, resetAt: string): QuotaMeter {
  return { ...meter, resetAt, resetDateOnly: true }
}

function planLabel(source: string | undefined): string {
  if (source === undefined) return 'unknown'
  if (source in planLabels) {
    return planLabels[source as keyof typeof planLabels]
  }
  return source
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase())
}

function parseResetAt(utc: unknown, localDate: unknown): string | undefined {
  for (const value of [utc, localDate]) {
    if (typeof value !== 'string' || value.length === 0) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return value
  }
  return undefined
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
