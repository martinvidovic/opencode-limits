import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  CredentialReader,
  DisplayOnlyAccountContext,
} from '../../core/model.js'

export interface ICopilotCredential {
  readonly accessToken: string
  readonly account?: DisplayOnlyAccountContext
}

export function createCopilotCredentialReader(
  input: {
    readonly environment?: NodeJS.ProcessEnv
    readonly readFile?: typeof readFile
  } = {}
): CredentialReader<ICopilotCredential> {
  const environment = input.environment ?? process.env
  const read = input.readFile ?? readFile

  return {
    read: async () => {
      let content: string
      try {
        content =
          environment.OPENCODE_AUTH_CONTENT ??
          (await read(authPath(environment), 'utf8'))
      } catch {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }

      const record = parseCopilotRecord(content)
      if (record === undefined) {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }
      if (record.type !== 'oauth') {
        return { status: 'failure', failure: { code: 'unsupported-auth' } }
      }

      // Match /status-codex: use access || refresh and ignore expires (often 0).
      const accessToken = record.access ?? record.refresh
      if (accessToken === undefined) {
        return {
          status: 'failure',
          failure: { code: 'reauthentication-required' },
        }
      }

      return {
        status: 'success',
        credential: {
          accessToken,
          ...(record.login === undefined
            ? {}
            : { account: { identity: record.login } }),
        },
      }
    },
  }
}

function authPath(environment: NodeJS.ProcessEnv): string {
  const dataHome =
    environment.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
  return join(dataHome, 'opencode', 'auth.json')
}

function parseCopilotRecord(content: string):
  | {
      readonly type: 'oauth' | 'api'
      readonly access?: string
      readonly refresh?: string
      readonly login?: string
    }
  | undefined {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!isRecord(parsed) || !isRecord(parsed['github-copilot']))
      return undefined
    const record = parsed['github-copilot']
    if (!isAuthType(record.type)) return undefined
    return {
      type: record.type,
      ...optionalString('access', record.access),
      ...optionalString('refresh', record.refresh),
      ...optionalString('login', record.login),
    }
  } catch {
    return undefined
  }
}

function isAuthType(value: unknown): value is 'oauth' | 'api' {
  return value === 'oauth' || value === 'api'
}

function optionalString<TName extends string>(
  name: TName,
  value: unknown
): {
  readonly [Key in TName]?: string
} {
  return typeof value === 'string' && value.length > 0
    ? ({ [name]: value } as { readonly [Key in TName]: string })
    : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
