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

const packageDirectory = cwd()
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
    'dist/server.d.ts',
    'dist/server.js',
    'dist/tui.d.ts',
    'dist/tui.js',
    'package.json',
  ])
  const packedFiles = new Set(packedPackage.files.map(({ path }) => path))

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

  await writeFile(
    join(fixtureDirectory, 'verify.mjs'),
    [
      "import server from 'opencode-limits/server'",
      "import tui from 'opencode-limits/tui'",
      "if (server.id !== 'opencode-limits' || tui.id !== 'opencode-limits') throw new Error('Packed exports do not identify the opencode-limits plugin')",
    ].join('\n')
  )
  await execFile(execPath, ['verify.mjs'], { cwd: fixtureDirectory })

  const manifest = JSON.parse(
    await readFile(
      join(fixtureDirectory, 'node_modules', 'opencode-limits', 'package.json'),
      'utf8'
    )
  )
  if (manifest.engines.opencode !== '>=1.14.42 <2') {
    throw new Error(
      'Packed manifest has an unexpected OpenCode compatibility range'
    )
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}
