export interface ProviderIdentity {
  readonly id: string
  readonly name: string
}

export interface DisplayOnlyAccountContext {
  readonly identity: string
  readonly planOrOrganization?: string
}

export type QuotaMeter =
  | {
      readonly kind: 'fraction-used'
      readonly label: string
      readonly used: number
      readonly total: number
      readonly resetAt?: string
    }
  | {
      readonly kind: 'bounded-amount'
      readonly label: string
      readonly used: number
      readonly total: number
      readonly unit: string
      readonly resetAt?: string
    }
  | {
      readonly kind: 'remaining-balance'
      readonly label: string
      readonly remaining: number
      readonly unit: string
      readonly resetAt?: string
    }
  | {
      readonly kind: 'unlimited'
      readonly label: string
    }

export interface PeriodSummary {
  readonly label: string
  readonly values: readonly {
    readonly label: string
    readonly value: number
    readonly unit: string
  }[]
}

export interface UsageSnapshot {
  readonly provider: ProviderIdentity
  readonly account?: DisplayOnlyAccountContext
  readonly meters: readonly QuotaMeter[]
  readonly periods: readonly PeriodSummary[]
}

export type ProviderFailureCode =
  | 'unsupported-auth'
  | 'reauthentication-required'
  | 'permission-denied'
  | 'rate-limited'
  | 'network'
  | 'invalid-response'
  | 'unavailable'

export interface ProviderFailure {
  readonly code: ProviderFailureCode
  readonly retryAt?: string
}

export type ProviderLoadResult =
  | { readonly status: 'success'; readonly snapshot: UsageSnapshot }
  | {
      readonly status: 'failure'
      readonly provider: ProviderIdentity
      readonly failure: ProviderFailure
      readonly account?: DisplayOnlyAccountContext
    }

export interface LimitsView {
  readonly providers: readonly ProviderLoadResult[]
}

export interface ConnectedProvider {
  readonly id: string
}

export interface ProviderDiscovery {
  readonly list: () => Promise<readonly ConnectedProvider[]>
}

export interface RegisteredProvider {
  readonly id: string
  readonly providerIds: readonly string[]
  readonly load: (input: {
    readonly signal: AbortSignal
  }) => Promise<ProviderLoadResult>
}

export type LoadLimits = (input: {
  readonly signal: AbortSignal
}) => Promise<LimitsView>
