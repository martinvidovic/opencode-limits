export interface ILimitsOptions {
  readonly showAccountContext?: boolean
}

export function parseLimitsOptions(
  options: unknown
): ILimitsOptions | undefined {
  if (options === undefined) return {}
  if (typeof options !== 'object' || options === null) return undefined

  const { showAccountContext } = options as Record<string, unknown>
  if (
    showAccountContext !== undefined &&
    typeof showAccountContext !== 'boolean'
  ) {
    return undefined
  }

  return showAccountContext === undefined ? {} : { showAccountContext }
}
