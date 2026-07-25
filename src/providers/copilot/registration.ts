import type { RegisteredProvider } from '../../core/model.js'
import { createProviderRegistration } from '../../core/register-provider.js'
import { createSafeRequester } from '../../core/safe-requester.js'
import { copilotIdentity, createCopilotAdapter } from './adapter.js'
import { createCopilotCredentialReader } from './credential.js'

export function createCopilotRegistration(): RegisteredProvider {
  return createProviderRegistration({
    identity: copilotIdentity,
    providerIds: ['github-copilot'],
    reader: createCopilotCredentialReader(),
    adapter: createCopilotAdapter(),
    requester: createSafeRequester({ origin: 'https://api.github.com' }),
  })
}
