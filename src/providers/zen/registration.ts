import type { RegisteredProvider } from '../../core/model.js'
import { createProviderRegistration } from '../../core/register-provider.js'
import { createSafeRequester } from '../../core/safe-requester.js'
import { createZenAdapter, zenIdentity } from './adapter.js'
import { createZenCredentialReader } from './credential.js'

export function createZenRegistration(): RegisteredProvider {
  return createProviderRegistration({
    identity: zenIdentity,
    providerIds: ['opencode'],
    reader: createZenCredentialReader(),
    adapter: createZenAdapter(),
    requester: createSafeRequester({ origin: 'https://console.opencode.ai' }),
  })
}
