import type { RegisteredProvider } from '../../core/model.js'
import { createProviderRegistration } from '../../core/register-provider.js'
import { createSafeRequester } from '../../core/safe-requester.js'
import { createZenAdapter, zenIdentity } from './adapter.js'
import { createZenCredentialReader } from './credential.js'
import { zenConsoleBaseUrl } from './endpoints.js'

export function createZenRegistration(
  input: { readonly fetch?: typeof fetch } = {}
): RegisteredProvider {
  return createProviderRegistration({
    identity: zenIdentity,
    integrationId: 'opencode',
    reader: createZenCredentialReader(),
    adapter: createZenAdapter(),
    requester: createSafeRequester({
      baseUrl: zenConsoleBaseUrl,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    }),
  })
}
