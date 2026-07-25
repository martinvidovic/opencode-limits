import type {
  ProviderAdapter,
  ProviderFailure,
  ProviderLoadResult,
  ProviderIdentity,
  QuotaMeter,
  SafeRequestResult,
} from '../../core/model.js'
import type { ICodexCredential } from './credential.js'

export const codexIdentity: ProviderIdentity = { id: 'codex', name: 'Codex' }

export function createCodexAdapter(): ProviderAdapter<ICodexCredential> {
  return {
    load: async ({ credential, requester, signal }) => {
      const response = await requester.requestJson({
        path: '/backend-api/wham/usage',
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
          ...(credential.accountId === undefined
            ? {}
            : { 'ChatGPT-Account-Id': credential.accountId }),
          'User-Agent': 'opencode-limits',
        },
        signal,
      })
      const failure = responseFailure(response)
      if (failure !== undefined) return failed(failure, credential)
      if (response.status !== 'response') {
        return failed({ code: 'network' }, credential)
      }

      const windows = parseWindows(response.json)
      if (windows === undefined) {
        return failed({ code: 'invalid-response' }, credential)
      }

      return {
        status: 'success',
        snapshot: {
          provider: codexIdentity,
          ...(credential.account === undefined
            ? {}
            : { account: credential.account }),
          meters: [
            meter('Five-hour limit', windows.fiveHour),
            meter('Weekly limit', windows.weekly),
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
  credential: ICodexCredential
): ProviderLoadResult {
  return {
    status: 'failure',
    provider: codexIdentity,
    failure,
    ...(credential.account === undefined
      ? {}
      : { account: credential.account }),
  }
}

function parseWindows(
  value: unknown
): { readonly fiveHour: IWindow; readonly weekly: IWindow } | undefined {
  if (!isRecord(value) || !isRecord(value.rate_limit)) return undefined
  const primary = parseWindow(value.rate_limit.primary_window)
  const secondary = parseWindow(value.rate_limit.secondary_window)
  if (primary === undefined || secondary === undefined) return undefined
  const windows = [primary, secondary]
  const fiveHour = windows.find((window) => window.seconds === 5 * 60 * 60)
  const weekly = windows.find((window) => window.seconds === 7 * 24 * 60 * 60)
  return fiveHour === undefined || weekly === undefined
    ? undefined
    : { fiveHour, weekly }
}

interface IWindow {
  readonly seconds: number
  readonly usedPercent: number
  readonly resetAt: number
}

function parseWindow(value: unknown): IWindow | undefined {
  if (!isRecord(value)) return undefined
  const seconds = value.limit_window_seconds
  const usedPercent = value.used_percent
  const resetAt = value.reset_at
  if (
    typeof seconds !== 'number' ||
    typeof usedPercent !== 'number' ||
    typeof resetAt !== 'number' ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(usedPercent) ||
    !Number.isFinite(resetAt) ||
    usedPercent < 0 ||
    usedPercent > 100 ||
    resetAt <= 0
  ) {
    return undefined
  }
  return { seconds, usedPercent, resetAt }
}

function meter(label: string, window: IWindow): QuotaMeter {
  return {
    kind: 'fraction-used' as const,
    label,
    used: window.usedPercent,
    total: 100,
    resetAt: new Date(window.resetAt * 1_000).toISOString(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
