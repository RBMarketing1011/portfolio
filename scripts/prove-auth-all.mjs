/**
 * Runs every authentication proof in order against the dev server, with the
 * same environment flags this process was started with (so `--env-file` and
 * the MONGODB_URI / MAIL_SINK_DIR overrides carry through). Stops at the first
 * failure. Indexes go in first: the uniqueness proofs depend on them.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/reynoldsbuilt_proof MAIL_SINK_DIR=/tmp/mail pnpm prove:auth
 *
 * (`pnpm prove:auth` loads .env for AUTH_SECRET; the two variables above, set in
 * the shell, override what .env says.)
 */
import { spawnSync } from 'node:child_process'

const steps = [
	'scripts/ensure-indexes.mjs',
	'scripts/prove-welcome.mjs',
	'scripts/prove-magic-link.mjs',
	'scripts/prove-password-reset.mjs',
	'scripts/prove-invites.mjs',
	'scripts/prove-rate-limit.mjs',
	'scripts/prove-account-bootstrap.mjs',
	'scripts/prove-auth-guards.mjs',
]

for (const step of steps) {
	console.log(`\n=== ${step} ===`)
	const result = spawnSync(process.execPath, [...process.execArgv, step], {
		stdio: 'inherit',
		env: process.env,
	})
	if (result.status !== 0) {
		console.error(`\n${step} failed (exit ${result.status}).`)
		process.exit(result.status ?? 1)
	}
}

console.log('\nevery authentication proof passed')
