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

  let hasPreviousReset = false
  for (const [index, meter] of snapshot.meters.entries()) {
    if (index > 0 && hasPreviousReset) lines.push('')
    const meterLines = formatMeter(meter)
    lines.push(...meterLines)
    hasPreviousReset = meterHasResetLine(meter)
  }
  for (const period of snapshot.periods) {
    lines.push(formatPeriod(period))
  }

  return lines.join('\n')
}

function meterHasResetLine(meter: QuotaMeter): boolean {
  if (meter.resetAt !== undefined) return true
  return meter.kind === 'unavailable' && meter.resetUnknown === true
}

function formatAccount(
  account:
    | { readonly identity: string; readonly planOrOrganization?: string }
    | undefined,
  showAccountContext: boolean
): string | undefined {
  if (!showAccountContext || account === undefined) return undefined
  const value =
    account.planOrOrganization === undefined
      ? account.identity
      : `${account.identity} (${account.planOrOrganization})`
  return `Account:   ${value}`
}

function formatMeter(meter: QuotaMeter): string[] {
  const lines = [formatLabeled(meter.label, formatMeterValue(meter))]

  if (meter.kind === 'unavailable' && meter.resetUnknown === true) {
    lines.push(formatLabeled('Reset', 'reset time unknown'))
  } else if (meter.resetAt !== undefined) {
    lines.push(
      formatLabeled(
        'Reset',
        formatReset(meter.resetAt, meter.resetDateOnly === true)
      )
    )
  }

  return lines
}

function formatLabeled(label: string, value: string): string {
  return `${`${label}:`.padEnd(11)}${value}`
}

function formatMeterValue(meter: QuotaMeter): string {
  switch (meter.kind) {
    case 'fraction-used': {
      const left = Math.max(
        0,
        Math.min(100, Math.round(100 - (meter.used / meter.total) * 100))
      )
      return `${progressBar(left)}  ${String(left).padStart(3, ' ')}% left`
    }
    case 'bounded-amount':
      return `${meter.used} / ${meter.total} used`
    case 'remaining-balance':
      return `${meter.remaining} left`
    case 'unlimited':
      return 'unlimited'
    case 'unavailable':
      return 'unknown'
    default:
      return 'Unlimited'
  }
}

function formatPeriod(period: PeriodSummary): string {
  const values = period.values.map(formatPeriodValue).join(' | ')
  return `${`${period.label}:`.padEnd(10)} | ${values}`
}

function formatPeriodValue(value: PeriodSummary['values'][number]): string {
  if (value.label === 'Cost' && value.unit === 'USD') {
    return `$${value.value.toFixed(2)}`
  }
  if (value.label === 'Requests') {
    return `${formatCompactNumber(value.value)} requests`
  }
  if (value.label === 'Tokens') {
    return `${formatCompactNumber(value.value)} tokens`
  }
  return `${value.label}: ${formatCompactNumber(value.value)} ${value.unit}`
}

const monthAbbreviations = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function formatReset(resetAt: string, dateOnly = false): string {
  if (dateOnly) {
    const calendar = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/u.exec(
      resetAt
    )
    if (calendar?.groups !== undefined) {
      const month = monthAbbreviations[Number(calendar.groups.month) - 1]
      if (month !== undefined) return `resets ${month} ${calendar.groups.day}`
    }
  }

  const date = new Date(resetAt)
  const now = new Date()
  const time = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date)
  if (date.toDateString() === now.toDateString()) return `resets today ${time}`
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
    date
  )
  const day = String(date.getDate()).padStart(2, '0')
  return `resets ${month} ${day} ${time}`
}

function progressBar(percent: number): string {
  const width = 10
  const filled = Math.max(
    0,
    Math.min(width, Math.round((percent / 100) * width))
  )
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
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
