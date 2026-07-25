import { describe, expect, it } from 'vitest'

import type { LimitsView } from '../src/core/model.js'
import { renderLimits } from '../src/presentation/render-limits.js'

describe('renderLimits', () => {
  it('renders provider sections with account context and separate reset lines', () => {
    const view: LimitsView = {
      providers: [
        {
          status: 'success',
          snapshot: {
            account: {
              identity: 'fixture@example.test',
              planOrOrganization: 'Fixture plan',
            },
            meters: [
              {
                kind: 'fraction-used',
                label: 'Five-hour limit',
                used: 2,
                total: 5,
                resetAt: '2026-07-25T14:30:00.000Z',
              },
            ],
            periods: [
              {
                label: 'Today',
                values: [{ label: 'Requests', value: 42, unit: 'requests' }],
              },
            ],
            provider: { id: 'fixture', name: 'Fixture Provider' },
          },
        },
      ],
    }

    expect(renderLimits(view)).toBe(
      [
        'FIXTURE PROVIDER',
        'fixture@example.test (Fixture plan)',
        '',
        'Five-hour limit  2 / 5 used',
        '                 Resets Jul 25, 2026, 2:30 PM',
        'Today            Requests: 42 requests',
      ].join('\n')
    )
  })

  it('renders failures in their provider section and an explicit empty state', () => {
    const failedView: LimitsView = {
      providers: [
        {
          status: 'failure',
          failure: { code: 'unavailable' },
          provider: { id: 'fixture', name: 'Fixture Provider' },
          account: {
            identity: 'fixture@example.test',
            planOrOrganization: 'Fixture plan',
          },
        },
      ],
    }

    expect(renderLimits(failedView)).toContain(
      'Usage is temporarily unavailable. Try again later.'
    )
    expect(renderLimits({ providers: [] })).toBe(
      'No connected usage providers found.\n\nConnect Codex, OpenCode Zen, or GitHub Copilot, then run /limits again.'
    )
  })
})
