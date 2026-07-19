/**
 * THROWAWAY PROTOTYPE: three native DialogAlert structures for /limits.
 *
 * Run each command repeatedly to cycle through connected-provider states:
 * /limits-prototype-a, /limits-prototype-b, /limits-prototype-c.
 */
import type { TuiPluginModule } from "@opencode-ai/plugin/tui"

type QuotaMeter = {
  label: string
  value: string
  reset?: string
}

type PeriodSummary = {
  label: string
  values: string
}

type ProviderUsage = {
  provider: string
  account: string
  status: "available" | "unavailable"
  meters: readonly QuotaMeter[]
  periods: readonly PeriodSummary[]
  failure?: string
}

type Scenario = {
  name: string
  providers: readonly ProviderUsage[]
}

type Variant = "a" | "b" | "c"

const codex: ProviderUsage = {
  provider: "Codex",
  account: "jane@example.com (ChatGPT Plus)",
  status: "available",
  meters: [
    { label: "5h limit", value: "[######----] 63% left", reset: "today 14:30" },
    { label: "Weekly", value: "[########--] 82% left", reset: "Jul 24 09:00" },
  ],
  periods: [],
}

const zen: ProviderUsage = {
  provider: "OpenCode Zen",
  account: "jane@example.com (Acme Engineering)",
  status: "available",
  meters: [],
  periods: [
    { label: "Today", values: "$1.84 | 42 requests | 1.2M tokens" },
    { label: "30 days", values: "$38.20 | 1.4k requests | 31.8M tokens" },
  ],
}

const copilot: ProviderUsage = {
  provider: "GitHub Copilot",
  account: "janedoe (Copilot Business)",
  status: "available",
  meters: [
    { label: "Premium", value: "[#######---] 74% left" },
    { label: "Requests", value: "78 / 300 used", reset: "Aug 01" },
  ],
  periods: [],
}

const zenFailure: ProviderUsage = {
  ...zen,
  status: "unavailable",
  meters: [],
  periods: [],
  failure: "Usage is temporarily unavailable. Try again later.",
}

const scenarios: readonly Scenario[] = [
  { name: "all connected", providers: [codex, zen, copilot] },
  { name: "partial failure", providers: [codex, zenFailure, copilot] },
  { name: "Zen disconnected", providers: [codex, copilot] },
  { name: "no connected providers", providers: [] },
]

const variantNames: Record<Variant, string> = {
  a: "Provider sections",
  b: "Compact ledger",
  c: "Quota-first scan",
}

function emptyMessage(): string {
  return [
    "No connected usage providers found.",
    "",
    "Connect Codex, OpenCode Zen, or GitHub Copilot, then run /limits again.",
  ].join("\n")
}

function renderProviderSections(providers: readonly ProviderUsage[]): string {
  if (providers.length === 0) return emptyMessage()

  return providers
    .map((provider) => {
      const lines = [provider.provider.toUpperCase(), provider.account, ""]
      if (provider.status === "unavailable") {
        lines.push(`! ${provider.failure}`)
        return lines.join("\n")
      }
      for (const meter of provider.meters) {
        lines.push(`${meter.label.padEnd(10)} ${meter.value}`)
        if (meter.reset) lines.push(`${"".padEnd(10)} Resets ${meter.reset}`)
      }
      for (const period of provider.periods) {
        lines.push(`${period.label.padEnd(10)} ${period.values}`)
      }
      return lines.join("\n")
    })
    .join("\n\n----------------------------------------------\n\n")
}

function renderCompactLedger(providers: readonly ProviderUsage[]): string {
  if (providers.length === 0) return emptyMessage()

  const lines: string[] = []
  for (const provider of providers) {
    lines.push(`${provider.provider.toUpperCase()}  ${provider.account}`)
    if (provider.status === "unavailable") {
      lines.push(`  UNAVAILABLE  ${provider.failure}`)
    } else {
      for (const meter of provider.meters) {
        const reset = meter.reset ? ` | resets ${meter.reset}` : ""
        lines.push(`  ${meter.label}: ${meter.value}${reset}`)
      }
      for (const period of provider.periods) {
        lines.push(`  ${period.label}: ${period.values}`)
      }
    }
    lines.push("")
  }
  lines.push("Providers appear in stable registry order; disconnected providers are omitted.")
  return lines.join("\n")
}

function renderQuotaFirst(providers: readonly ProviderUsage[]): string {
  if (providers.length === 0) return emptyMessage()

  const meters = providers.flatMap((provider) =>
    provider.status === "available"
      ? provider.meters.map((meter) => ({ provider: provider.provider, ...meter }))
      : [],
  )
  const periods = providers.flatMap((provider) =>
    provider.status === "available"
      ? provider.periods.map((period) => ({ provider: provider.provider, ...period }))
      : [],
  )
  const failures = providers.filter((provider) => provider.status === "unavailable")
  const lines = ["QUOTA METERS"]

  if (meters.length === 0) lines.push("  None")
  for (const meter of meters) {
    const reset = meter.reset ? ` | resets ${meter.reset}` : ""
    lines.push(`  ${meter.provider} / ${meter.label}: ${meter.value}${reset}`)
  }

  lines.push("", "PERIOD SUMMARIES")
  if (periods.length === 0) lines.push("  None")
  for (const period of periods) {
    lines.push(`  ${period.provider} / ${period.label}: ${period.values}`)
  }

  if (failures.length > 0) {
    lines.push("", "NEEDS ATTENTION")
    for (const provider of failures) {
      lines.push(`  ${provider.provider}: ${provider.failure}`)
    }
  }

  lines.push("", "CONNECTED ACCOUNTS")
  for (const provider of providers) {
    lines.push(`  ${provider.provider}: ${provider.account}`)
  }
  return lines.join("\n")
}

function render(variant: Variant, providers: readonly ProviderUsage[]): string {
  if (variant === "a") return renderProviderSections(providers)
  if (variant === "b") return renderCompactLedger(providers)
  return renderQuotaFirst(providers)
}

const plugin: TuiPluginModule = {
  id: "opencode-limits-popup-prototype",
  tui: async (api) => {
    const nextScenario: Record<Variant, number> = { a: 0, b: 0, c: 0 }

    api.keymap.registerLayer({
      commands: (["a", "b", "c"] as const).map((variant) => ({
        name: `opencode-limits.prototype.${variant}`,
        title: `Limits prototype ${variant.toUpperCase()}: ${variantNames[variant]}`,
        description: "Run repeatedly to cycle fixture scenarios",
        category: "Prototype",
        namespace: "palette",
        slashName: `limits-prototype-${variant}`,
        run() {
          const scenario = scenarios[nextScenario[variant]]
          nextScenario[variant] = (nextScenario[variant] + 1) % scenarios.length
          api.ui.dialog.setSize("large")
          api.ui.dialog.replace(() =>
            api.ui.DialogAlert({
              title: `${variant.toUpperCase()} - ${variantNames[variant]} | ${scenario.name}`,
              message: render(variant, scenario.providers),
            }),
          )
        },
      })),
    })
  },
}

export default plugin
