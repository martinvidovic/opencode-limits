import type {
  LimitsView,
  PeriodSummary,
  ProviderFailure,
  ProviderLoadResult,
  QuotaMeter,
} from '../core/model.js'

const separator = '\n\n----------------------------------------------\n\n'

export interface ILimitsRenderOptions {
  readonly showAccountContext?: boolean
}

export function renderLimits(
  view: LimitsView,
  { showAccountContext = true }: ILimitsRenderOptions = {}
): string {
  if (view.providers.length === 0) {
    return 'No connected usage providers found.\n\nConnect Codex, OpenCode Zen, or GitHub Copilot, then run /limits again.'
  }

  return view.providers
    .map((provider) => renderProvider(provider, showAccountContext))
    .join(separator)
}

function renderProvider(
  result: ProviderLoadResult,
  showAccountContext: boolean
): string {
  if (result.status === 'failure') {
    return [
      result.provider.name.toUpperCase(),
      formatAccount(result.account, showAccountContext),
      '',
      `! ${formatFailure(result.failure)}`,
    ]
      .filter((line) => line !== undefined)
      .join('\n')
  }

  const { snapshot } = result
  const lines = [
    snapshot.provider.name.toUpperCase(),
    formatAccount(snapshot.account, showAccountContext),
    '',
  ].filter((line) => line !== undefined)

  for (const meter of snapshot.meters) {
    lines.push(...formatMeter(meter))
  }
  for (const period of snapshot.periods) {
    lines.push(formatPeriod(period))
  }

  return lines.join('\n')
}

function formatAccount(
  account:
    | { readonly identity: string; readonly planOrOrganization?: string }
    | undefined,
  showAccountContext: boolean
): string | undefined {
  if (!showAccountContext || account === undefined) return undefined
  return account.planOrOrganization === undefined
    ? account.identity
    : `${account.identity} (${account.planOrOrganization})`
}

function formatMeter(meter: QuotaMeter): string[] {
  const value = formatMeterValue(meter)
  const lines = [`${meter.label.padEnd(16)} ${value}`]

  if ('resetAt' in meter) {
    lines.push(`${''.padEnd(16)} Resets ${formatReset(meter.resetAt)}`)
  }

  return lines
}

function formatMeterValue(meter: QuotaMeter): string {
  switch (meter.kind) {
    case 'fraction-used':
      return `${meter.used} / ${meter.total} used`
    case 'bounded-amount':
      return `${meter.used} / ${meter.total} ${meter.unit} used`
    case 'remaining-balance':
      return `${meter.remaining} ${meter.unit} remaining`
    case 'unlimited':
      return 'Unlimited'
    default:
      return 'Unlimited'
  }
}

function formatPeriod(period: PeriodSummary): string {
  const values = period.values
    .map((value) => `${value.label}: ${value.value} ${value.unit}`)
    .join(' | ')
  return `${period.label.padEnd(16)} ${values}`
}

function formatReset(resetAt: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(resetAt))
}

function formatFailure(failure: ProviderFailure): string {
  const messages: Record<ProviderFailure['code'], string> = {
    'unsupported-auth': 'The connected account is not supported.',
    'reauthentication-required': 'Reconnect this provider, then try again.',
    'permission-denied': 'This account does not have permission to view usage.',
    'rate-limited': 'Usage is temporarily rate limited. Try again later.',
    'network':
      'Usage could not be reached. Check your connection and try again.',
    'invalid-response':
      'Usage returned an unsupported response. Try again later.',
    'unavailable': 'Usage is temporarily unavailable. Try again later.',
  }
  return messages[failure.code]
}
