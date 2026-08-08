import { describe, expect, it } from 'vitest'

import type { LimitsView } from '../src/core/model.js'
import { renderLimits } from '../src/presentation/render-limits.js'

describe('renderLimits', () => {
  it('renders compact provider sections with account context and separate reset lines', () => {
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

    const rendered = renderLimits(view)
    expect(rendered).toContain('FIXTURE PROVIDER')
    expect(rendered).toContain('Account:   fixture@example.test (Fixture plan)')
    expect(rendered).toContain('Five-hour limit:[██████░░░░]   60% left')
    expect(rendered).toContain('Reset:')
    expect(rendered).toContain('Today:     | 42 requests')
  })

  it('matches status-codex Codex window spacing, bar glyphs, and padded percent left', () => {
    const rendered = renderLimits({
      providers: [
        {
          status: 'success',
          snapshot: {
            provider: { id: 'codex', name: 'Codex' },
            account: {
              identity: 'account@example.test',
              planOrOrganization: 'ChatGPT Team',
            },
            meters: [
              { kind: 'unavailable', label: '5h limit', resetUnknown: true },
              {
                kind: 'fraction-used',
                label: 'Weekly',
                used: 98,
                total: 100,
                resetAt: '2026-07-27T14:50:00.000Z',
              },
            ],
            periods: [],
          },
        },
      ],
    })

    expect(rendered).toBe(
      [
        'CODEX',
        'Account:   account@example.test (ChatGPT Team)',
        '',
        '5h limit:  unknown',
        'Reset:     reset time unknown',
        '',
        'Weekly:    [░░░░░░░░░░]    2% left',
        rendered.split('\n').at(-1),
      ].join('\n')
    )
    expect(rendered.split('\n').at(-1)).toMatch(/^Reset:\s{5}resets /u)
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

  it('omits display-only account context when requested', () => {
    const view: LimitsView = {
      providers: [
        {
          status: 'success',
          snapshot: {
            provider: { id: 'fixture', name: 'Fixture Provider' },
            account: { identity: 'fixture@example.test' },
            meters: [],
            periods: [],
          },
        },
      ],
    }

    expect(renderLimits(view, { showAccountContext: false })).toBe(
      'FIXTURE PROVIDER\n'
    )
  })

  it('renders unavailable quota meters and compact Zen period values', () => {
    expect(
      renderLimits({
        providers: [
          {
            status: 'success',
            snapshot: {
              provider: { id: 'fixture', name: 'Fixture Provider' },
              meters: [
                { kind: 'unavailable', label: '5h limit', resetUnknown: true },
              ],
              periods: [
                {
                  label: 'Today',
                  values: [
                    { label: 'Cost', value: 1.8, unit: 'USD' },
                    { label: 'Requests', value: 38, unit: 'requests' },
                    { label: 'Tokens', value: 2_240_985, unit: 'tokens' },
                  ],
                },
              ],
            },
          },
        ],
      })
    ).toBe(
      'FIXTURE PROVIDER\n\n5h limit:  unknown\nReset:     reset time unknown\nToday:     | $1.80 | 38 requests | 2.2M tokens'
    )
  })

  it('matches status-codex Copilot premium, requests, and date-only reset', () => {
    expect(
      renderLimits({
        providers: [
          {
            status: 'success',
            snapshot: {
              provider: { id: 'copilot', name: 'Copilot' },
              account: {
                identity: 'martinvidovic',
                planOrOrganization: 'GitHub Copilot Business',
              },
              meters: [
                {
                  kind: 'fraction-used',
                  label: 'Premium',
                  used: 0,
                  total: 100,
                },
                {
                  kind: 'bounded-amount',
                  label: 'Requests',
                  used: 0,
                  total: 5000,
                  unit: 'requests',
                  resetAt: '2026-09-01T00:00:00.000Z',
                  resetDateOnly: true,
                },
              ],
              periods: [],
            },
          },
        ],
      })
    ).toBe(
      [
        'COPILOT',
        'Account:   martinvidovic (GitHub Copilot Business)',
        '',
        'Premium:   [██████████]  100% left',
        'Requests:  0 / 5000 used',
        'Reset:     resets Sep 01',
      ].join('\n')
    )
  })
})
