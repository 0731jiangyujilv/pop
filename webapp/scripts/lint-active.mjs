// Lints the active submission surface: everything the /robinhood route can
// execute at runtime, plus the build config and the Robinhood config tests.
//
// The set is derived from the import graph rather than a hand-kept list, so a
// new import from an active file is linted automatically. Traversal starts at
// src/main.tsx and follows every static and dynamic import, except that from
// src/App.tsx it follows only non-page modules and the page rendered by the
// /robinhood routes. The other routes' pages (and anything only they import)
// are historical surfaces covered by `pnpm lint`, not by this gate.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src')

const ROUTE_SHELL = join(src, 'App.tsx')
const ROBINHOOD_ROUTE_PAGE = join(src, 'pages', 'OddsShiftPage.tsx')
const ENTRY = join(src, 'main.tsx')
const EXTRA = [
  'vite.config.ts',
  'eslint.config.js',
  'scripts/lint-active.mjs',
  'test/robinhood-config.test.ts',
  'test/robinhood-live-evidence.test.ts',
]

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']

function resolveImport(fromFile, spec) {
  let base
  if (spec.startsWith('@/')) base = join(src, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`Unresolved import '${spec}' in ${relative(root, fromFile)}`)
}

function isLintable(file) {
  return /\.(ts|tsx|js|jsx|mjs)$/.test(file)
}

const seen = new Set()
const queue = [ENTRY]
while (queue.length > 0) {
  const file = queue.pop()
  if (seen.has(file)) continue
  seen.add(file)
  if (!isLintable(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(IMPORT_RE)) {
    const target = resolveImport(file, match[1] ?? match[2] ?? match[3])
    if (!target) continue
    const isSiblingRoutePage =
      file === ROUTE_SHELL && target.startsWith(join(src, 'pages')) && target !== ROBINHOOD_ROUTE_PAGE
    if (!isSiblingRoutePage) queue.push(target)
  }
}

if (!seen.has(ROBINHOOD_ROUTE_PAGE)) {
  throw new Error('The /robinhood route page was not reached from src/main.tsx')
}

const files = [...[...seen].filter(isLintable), ...EXTRA.map((f) => join(root, f))]
  .map((f) => relative(root, f))
  .sort()

if (process.argv.includes('--list')) {
  console.log(files.join('\n'))
  process.exit(0)
}

const eslint = new ESLint({ cwd: root })
const results = await eslint.lintFiles(files)
const formatter = await eslint.loadFormatter('stylish')
const output = await formatter.format(results)
if (output) console.log(output)

const errors = results.reduce((n, r) => n + r.errorCount + r.fatalErrorCount, 0)
const warnings = results.reduce((n, r) => n + r.warningCount, 0)
console.log(`Active-submission lint: ${files.length} files, ${errors} errors, ${warnings} warnings`)
process.exitCode = errors > 0 || warnings > 0 ? 1 : 0
