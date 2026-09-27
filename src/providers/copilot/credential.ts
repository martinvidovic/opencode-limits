import type { DisplayOnlyAccountContext } from '../../core/model.js'

export interface ICopilotCredential {
  readonly accessToken: string
  readonly account?: DisplayOnlyAccountContext
}
