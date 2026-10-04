/**
 * Runs every media-library proof, in dependency order, and prints one table.
 *
 *   pnpm prove:media                 the offline proofs (they use the dev database
 *                                    with throwaway workspace ids and clean up)
 *   pnpm prove:media -- --live       also the end-to-end proof against a running
 *                                    dev server (BASE_URL, default localhost:3000)
 *   pnpm prove:media -- --only plan,search
 *
 * Exits non-zero if any proof fails or is missing.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Pure first, then the layers that build on them, then the surfaces.
const OFFLINE = [
	'text',
	'colors',
	'query',
	'plan',
	'storage',
	'analyze',
	'tagger',
	'folders',
	'tags',
	'assets',
	'process',
	'purge',
	'search',
	'routes-a',
	'routes-b',
	'ui-grid',
	'ui-folders',
	'ui-search',
	'ui-detail',
	'ui-upload',
	'ui-core',
]
const LIVE = ['']

const args = process.argv.slice(2)
const live = args.includes('--live')
const only = args.includes('--only')
	? new Set(args[args.indexOf('--only') + 1]?.split(',') ?? [])
	: null

const wanted = [...OFFLINE, ...(live ? LIVE : [])].filter(
	(name) => !only || only.has(name || 'live'),
)

const rows = []
for (const name of wanted) {
	const file = join(here, `prove-media${name ? `-${name}` : ''}.mjs`)
	const label = name || 'live'
	if (!existsSync(file)) {
		rows.push({ label, status: 'MISSING', detail: '', seconds: 0 })
		continue
	}
	const started = Date.now()
	const run = spawnSync(
		process.execPath,
		['--env-file=.env', file],
		{ cwd: join(here, '..'), encoding: 'utf8', timeout: 5 * 60_000 },
	)
	const seconds = (Date.now() - started) / 1000
	const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
	const failed = output
		.split('\n')
		.filter((line) => line.startsWith('FAIL'))
	const summary = output.match(/(\d+)\/(\d+) passed/)
	rows.push({
		label,
		status: run.status === 0 ? 'PASS' : run.error ? 'ERROR' : 'FAIL',
		detail: summary ? `${summary[1]}/${summary[2]}` : '',
		seconds,
		failed,
		tail: run.status === 0 ? '' : output.trim().split('\n').slice(-12).join('\n'),
	})
}

const width = Math.max(...rows.map((row) => row.label.length))
console.log('')
for (const row of rows)
	console.log(
		`${row.status.padEnd(7)} ${row.label.padEnd(width)}  ${row.detail.padEnd(9)} ${row.seconds.toFixed(1)}s`,
	)

const bad = rows.filter((row) => row.status !== 'PASS')
for (const row of bad) {
	console.log(`\n--- ${row.label}: ${row.status} ---`)
	if (row.failed?.length) console.log(row.failed.join('\n'))
	if (row.tail) console.log(row.tail)
}
console.log(`\n${rows.length - bad.length}/${rows.length} proofs passed`)
process.exit(bad.length ? 1 : 0)
