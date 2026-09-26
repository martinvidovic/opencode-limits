import type { RegisteredProvider } from '../../core/model.js'
import { createProviderRegistration } from '../../core/register-provider.js'
import { createSafeRequester } from '../../core/safe-requester.js'
import { copilotIdentity, createCopilotAdapter } from './adapter.js'
import { createCopilotCredentialReader } from './credential.js'

export function createCopilotRegistration(
  input: { readonly fetch?: typeof fetch } = {}
): RegisteredProvider {
  return createProviderRegistration({
    identity: copilotIdentity,
    integrationId: 'github-copilot',
    reader: createCopilotCredentialReader(),
    adapter: createCopilotAdapter(),
    requester: createSafeRequester({
      baseUrl: 'https://api.github.com',
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    }),
  })
}
