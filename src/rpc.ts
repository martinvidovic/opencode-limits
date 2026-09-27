import type { Rpc } from '@opencode/plugin'

import {
  providerFailureCodes,
  quotaMeterKinds,
  type LimitsView,
} from './core/model.js'

export type LimitsRpcOutput =
  | { readonly status: 'loaded'; readonly view: LimitsView }
  | { readonly status: 'invalid-configuration' }

const text = { type: 'string' } as const
const finiteNumber = { type: 'number' } as const

const providerIdentity = {
  type: 'object',
  properties: { id: text, name: text },
  required: ['id', 'name'],
  additionalProperties: false,
} as const

const account = {
  type: 'object',
  properties: { identity: text, planOrOrganization: text },
  required: ['identity'],
  additionalProperties: false,
} as const

const quotaMeter = {
  type: 'object',
  properties: {
    kind: { enum: quotaMeterKinds },
    label: text,
    used: finiteNumber,
    total: finiteNumber,
    remaining: finiteNumber,
    unit: text,
    resetAt: text,
    resetDateOnly: { type: 'boolean' },
    resetUnknown: { type: 'boolean' },
  },
  required: ['kind', 'label'],
  additionalProperties: false,
} as const

const periodSummary = {
  type: 'object',
  properties: {
    label: text,
    values: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: text, value: finiteNumber, unit: text },
        required: ['label', 'value', 'unit'],
        additionalProperties: false,
      },
    },
  },
  required: ['label', 'values'],
  additionalProperties: false,
} as const

const providerFailure = {
  type: 'object',
  properties: {
    code: { enum: providerFailureCodes },
    retryAt: text,
  },
  required: ['code'],
  additionalProperties: false,
} as const

const providerLoadResult = {
  anyOf: [
    {
      type: 'object',
      properties: {
        status: { const: 'success' },
        snapshot: {
          type: 'object',
          properties: {
            provider: providerIdentity,
            account,
            meters: { type: 'array', items: quotaMeter },
            periods: { type: 'array', items: periodSummary },
          },
          required: ['provider', 'meters', 'periods'],
          additionalProperties: false,
        },
      },
      required: ['status', 'snapshot'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        status: { const: 'failure' },
        provider: providerIdentity,
        failure: providerFailure,
        account,
      },
      required: ['status', 'provider', 'failure'],
      additionalProperties: false,
    },
  ],
} as const

/**
 * The only server-to-CLI boundary. Its output carries displayable results;
 * credentials, provider responses, and raw errors never cross it.
 */
export const limitsRpc = {
  id: 'opencode-limits',
  methods: {
    load: {
      input: { type: 'object', additionalProperties: false },
      output: {
        anyOf: [
          {
            type: 'object',
            properties: {
              status: { const: 'loaded' },
              view: {
                type: 'object',
                properties: {
                  providers: { type: 'array', items: providerLoadResult },
                },
                required: ['providers'],
                additionalProperties: false,
              },
            },
            required: ['status', 'view'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: { status: { const: 'invalid-configuration' } },
            required: ['status'],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  events: {},
} as const satisfies Rpc.PortableDefinition

export function isLimitsRpcOutput(value: unknown): value is LimitsRpcOutput {
  if (typeof value !== 'object' || value === null) return false
  const output = value as Record<string, unknown>
  if (output.status === 'invalid-configuration') return true
  if (output.status !== 'loaded') return false
  const { view } = output
  return (
    typeof view === 'object' &&
    view !== null &&
    Array.isArray((view as Record<string, unknown>).providers)
  )
}
