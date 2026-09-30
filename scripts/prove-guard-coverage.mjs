/**
 * A guard that has never been seen to fail is not proof. For each one, the check is
 * removed from the source, the authorization suite is expected to FAIL, and the
 * file is restored. Anything reported "proved" has actually been caught failing.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const CASES = [
	{
		name: 'account membership check in requireSitePermission',
		file: 'src/lib/auth/guards.ts',
		find: `\tconst membership = await resolveMembership(userId, site.workspaceId)\n\tif (!membership) throw new HttpError(404, 'Site not found.')`,
		replace: `\tconst membership = (await resolveMembership(userId, site.workspaceId)) ?? (await resolveMembership(userId))\n\tif (!membership) throw new HttpError(404, 'Site not found.')`,
	},
	{
		name: 'role permission check in requireSitePermission',
		file: 'src/lib/auth/guards.ts',
		find: `\tif (!membership.permissions.has(permission))\n\t\tthrow new HttpError(403, 'Your role does not allow that.')\n\n\treturn { membership, site, db }`,
		replace: `\tif (false)\n\t\tthrow new HttpError(403, 'Your role does not allow that.')\n\n\treturn { membership, site, db }`,
	},
	{
		name: 'sign-in requirement in requireUserId',
		file: 'src/lib/auth/guards.ts',
		find: `if (!session?.user?.id) throw new HttpError(401, 'Sign in to continue.')\n\treturn session.user.id`,
		replace: `if (!session?.user?.id) return 'anonymous'\n\treturn session.user.id`,
	},
	{
		name: 'workspace scoping on the project list',
		file: 'src/app/api/sites/route.ts',
		find: `\t\t\t.find({ workspaceId: workspace._id })\n\t\t\t.sort({ updatedAt: -1 })`,
		replace: `\t\t\t.find({})\n\t\t\t.sort({ updatedAt: -1 })`,
	},
	{
		name: 'stale revision rejection on PATCH',
		file: 'src/app/api/sites/[siteId]/route.ts',
		find: `if (parsed.data.rev !== site.rev)`,
		replace: `if (false)`,
	},
	{
		name: 'blob path confinement on media register',
		file: 'src/app/api/sites/[siteId]/media/route.ts',
		find: `if (!parsed.data.pathname.startsWith(\`sites/\${site._id.toString()}/\`))`,
		replace: `if (false)`,
	},
	{
		name: 'permission filter on stored role permissions',
		file: 'src/lib/workspace/permissions.ts',
		find: `(v): v is Permission => typeof v === 'string' && isPermission(v),`,
		replace: `(v): v is Permission => typeof v === 'string',`,
	},
]

const suitePasses = () => {
	try {
		execFileSync('node', ['scripts/prove-auth-guards.mjs'], {
			stdio: 'pipe',
		})
		return true
	} catch {
		return false
	}
}

if (!suitePasses()) {
	console.error('Baseline suite is already failing. Fix that first.')
	process.exit(1)
}
console.log('baseline: suite passes\n')

const report = []

for (const testCase of CASES) {
	const original = readFileSync(testCase.file, 'utf8')
	// Source may be CRLF while these anchors are LF, which would miss every time.
	const normalized = original.replace(/\r\n/g, '\n')

	if (!normalized.includes(testCase.find)) {
		report.push({ name: testCase.name, status: 'ANCHOR MISSING' })
		continue
	}

	writeFileSync(
		testCase.file,
		normalized.replace(testCase.find, testCase.replace),
	)
	await wait(2500)

	const stillPasses = suitePasses()
	writeFileSync(testCase.file, original)
	await wait(2500)

	report.push({
		name: testCase.name,
		status: stillPasses ? 'UNPROVED' : 'PROVED',
	})
}

if (!suitePasses()) {
	console.error('Suite does not pass after restore. The files may be dirty.')
	process.exit(1)
}

for (const row of report) console.log(`${row.status.padEnd(15)} ${row.name}`)

const proved = report.filter((r) => r.status === 'PROVED').length
console.log(`\n${proved} proved, ${report.length - proved} unproved`)
process.exit(proved === report.length ? 0 : 1)
