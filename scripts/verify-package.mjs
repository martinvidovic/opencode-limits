import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { cwd, env, execPath } from 'node:process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const packageManager = env.npm_execpath

if (packageManager === undefined) {
  throw new Error('verify:package must run through npm')
}

// Runs inside a clean fixture that installed the packed tarball. It resolves
// entrypoints the way OpenCode v2 resolves package plugins and exercises the
// server RPC with a secret-bearing key connection for every Provider Adapter.
const installedSmokeTest = `
import server from 'opencode-limits'
import { limitsRpc } from 'opencode-limits/rpc'
import tui from 'opencode-limits/tui'

if (server.id !== 'opencode-limits' || tui.id !== 'opencode-limits' || limitsRpc.id !== 'opencode-limits') {
  throw new Error('Packed exports do not identify the opencode-limits plugin')
}
if (typeof server.setup !== 'function' || typeof tui.setup !== 'function' || 'server' in server || 'tui' in tui) {
  throw new Error('Packed exports are not v2-only plugin definitions')
}
try {
  import.meta.resolve('opencode-limits/server')
  throw new Error('Packed exports still publish the v1 ./server entrypoint')
} catch (error) {
  if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
}

let load
await server.setup({
  options: { showAccountContext: false },
  integration: {
    connection: {
      active: async (id) => ({ type: 'env', name: id }),
      resolve: async () => ({ type: 'key', key: 'verify-secret-canary' }),
    },
  },
  rpc: {
    register: async (definition, handlers) => {
      if (definition !== limitsRpc) throw new Error('Server registered an unexpected RPC')
      load = handlers.load
      return { dispose: async () => {} }
    },
  },
})
const output = JSON.stringify(await load({}, { signal: AbortSignal.timeout(5000) }))
const expected = JSON.stringify({
  status: 'loaded',
  view: {
    providers: [
      { status: 'failure', provider: { id: 'codex', name: 'Codex' }, failure: { code: 'unsupported-auth' } },
      { status: 'failure', provider: { id: 'opencode-zen', name: 'OpenCode Zen' }, failure: { code: 'unsupported-auth' } },
      { status: 'failure', provider: { id: 'copilot', name: 'Copilot' }, failure: { code: 'unsupported-auth' } },
    ],
  },
})
if (output !== expected || output.includes('canary')) {
  throw new Error('Installed server RPC returned an unexpected result')
}
`

const packageDirectory = cwd()
const sourceManifest = JSON.parse(
  await readFile(join(packageDirectory, 'package.json'), 'utf8')
)
const supportedOpenCode = sourceManifest.engines.opencode
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), 'opencode-limits-package-')
)

try {
  const { stdout } = await execFile(
    execPath,
    [
      packageManager,
      'pack',
      '--json',
      '--pack-destination',
      temporaryDirectory,
    ],
    {
      cwd: packageDirectory,
    }
  )
  const [packedPackage] = JSON.parse(stdout)
  const expectedFiles = new Set([
    'LICENSE',
    'README.md',
    'dist/rpc.d.ts',
    'dist/rpc.js',
    'dist/server.d.ts',
    'dist/server.js',
    'dist/tui.d.ts',
    'dist/tui.js',
    'package.json',
  ])
  const packedFiles = new Set(packedPackage.files.map(({ path }) => path))
  // Output of the removed v1 host integration must never ship again.
  const staleFile = [...packedFiles].find((file) =>
    /provider-discovery|bun-sqlite/u.test(file)
  )
  if (staleFile !== undefined) {
    throw new Error(`Packed tarball contains stale v1 output ${staleFile}`)
  }

  for (const file of expectedFiles) {
    if (!packedFiles.has(file)) {
      throw new Error(`Packed tarball is missing ${file}`)
    }
  }

  const tarball = join(temporaryDirectory, basename(packedPackage.filename))
  const fixtureDirectory = join(temporaryDirectory, 'fixture')
  await mkdir(fixtureDirectory)
  await execFile(execPath, [packageManager, 'init', '--yes'], {
    cwd: fixtureDirectory,
  })
  await execFile(
    execPath,
    [
      packageManager,
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      tarball,
    ],
    {
      cwd: fixtureDirectory,
    }
  )

  await writeFile(join(fixtureDirectory, 'verify.mjs'), installedSmokeTest)
  await execFile(execPath, ['verify.mjs'], { cwd: fixtureDirectory })

  const manifest = JSON.parse(
    await readFile(
      join(fixtureDirectory, 'node_modules', 'opencode-limits', 'package.json'),
      'utf8'
    )
  )
  if (
    !supportedOpenCode.startsWith('>=2.') ||
    manifest.engines.opencode !== supportedOpenCode
  ) {
    throw new Error(
      'Packed manifest has an unexpected OpenCode compatibility range'
    )
  }
  if (
    manifest.dependencies !== undefined ||
    manifest.peerDependencies?.['@opencode/plugin'] !== supportedOpenCode ||
    manifest.peerDependenciesMeta?.['@opencode/plugin']?.optional !== true ||
    JSON.stringify(manifest).includes('@opencode-ai/')
  ) {
    throw new Error('Packed manifest has unexpected OpenCode dependencies')
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}
