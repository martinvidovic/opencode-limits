import type { RegisteredProvider } from '../../core/model.js'
import { createProviderRegistration } from '../../core/register-provider.js'
import { createSafeRequester } from '../../core/safe-requester.js'
import { createCodexAdapter, codexIdentity } from './adapter.js'
import { createCodexCredentialReader } from './credential.js'

export function createCodexRegistration(): RegisteredProvider {
  return createProviderRegistration({
    identity: codexIdentity,
    providerIds: ['openai'],
    reader: createCodexCredentialReader(),
    adapter: createCodexAdapter(),
    requester: createSafeRequester({ origin: 'https://chatgpt.com' }),
  })
}
