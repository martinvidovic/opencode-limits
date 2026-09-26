import type { DisplayOnlyAccountContext } from '../../core/model.js'

export interface IZenCredential {
  readonly accessToken: string
  readonly organizationId: string
  readonly account: DisplayOnlyAccountContext
}
