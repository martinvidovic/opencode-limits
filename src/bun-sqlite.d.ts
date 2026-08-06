declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean })
    public query(sql: string): {
      get(): Record<string, unknown> | undefined
      run(...parameters: unknown[]): void
    }
    public close(): void
  }
}
