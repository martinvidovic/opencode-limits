import type {
  CredentialReader,
  ProviderAdapter,
  ProviderIdentity,
  RegisteredProvider,
  SafeRequester,
} from './model.js'

export function createProviderRegistration<TCredential>(input: {
  readonly identity: ProviderIdentity
  readonly providerIds: readonly string[]
  readonly reader: CredentialReader<TCredential>
  readonly adapter: ProviderAdapter<TCredential>
  readonly requester: SafeRequester
}): RegisteredProvider {
  return {
    id: input.identity.id,
    providerIds: input.providerIds,
    load: async ({ signal }) => {
      const credential = await input.reader.read({ signal })
      if (credential.status === 'failure') {
        return {
          status: 'failure',
          provider: input.identity,
          failure: credential.failure,
          ...(credential.account === undefined
            ? {}
            : { account: credential.account }),
        }
      }

      return input.adapter.load({
        credential: credential.credential,
        requester: input.requester,
        signal,
      })
    },
  }
}
