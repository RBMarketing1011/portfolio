/**
 * Every place a URL is shown or sent has to follow the deployment it is running
 * on. Hardcoding the production domain is only visible once you are staging.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const APP_HOST = (process.env.NEXT_PUBLIC_APP_HOST ?? 'localhost:3000')
	.toLowerCase()
	.replace(/^https?:\/\//, '')

const rand = () => Math.random().toString(36).slice(2, 10)

function jar() {
	const cookies = new Map()
	return {
		async call(path, init = {}) {
			const headers = new Headers(init.headers ?? {})
			if (cookies.size)
				headers.set(
					'cookie',
					[...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
				)
			const response = await fetch(`${BASE}${path}`, {
				...init,
				headers,
				redirect: 'manual',
			})
			for (const raw of response.headers.getSetCookie?.() ?? []) {
				const [pair] = raw.split(';')
				const i = pair.indexOf('=')
				cookies.set(pair.slice(0, i), pair.slice(i + 1))
			}
			return response
		},
	}
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const email = `e2e_env_${rand()}@example.com`
const session = jar()
await session.call('/api/auth/register', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ email, password: 'password-env-0000' }),
})
const { csrfToken } = await (await session.call('/api/auth/csrf')).json()
await session.call('/api/auth/callback/credentials', {
	method: 'POST',
	headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({
		email,
		password: 'password-env-0000',
		csrfToken,
	}),
})

const created = await session.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		name: `Env ${rand()}`,
		site: { version: 1, pages: [] },
	}),
})
const { site } = await created.json()

const page = await (await session.call(`/account/projects/${site.id}`)).text()

record(
	'the project page shows this environment as the address suffix',
	// React splits `.{appHost}` across text nodes, so the dot is not adjacent.
	page.includes(APP_HOST),
	APP_HOST,
)
record(
	'the project page does not show the production domain in development',
	APP_HOST === 'reynoldsbuilt.dev' || !page.includes('.reynoldsbuilt.dev'),
	APP_HOST,
)

const robots = await (await fetch(`${BASE}/robots.txt`)).text()
record(
	'robots.txt points at this deployment',
	APP_HOST === 'reynoldsbuilt.dev'
		? robots.includes('https://reynoldsbuilt.dev/sitemap.xml')
		: !robots.includes('reynoldsbuilt.dev'),
	robots.split('\n')[0],
)

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
record(
	'the sitemap uses this deployment as its base',
	sitemap.includes(BASE.replace(/\/$/, '')) || APP_HOST === 'reynoldsbuilt.dev',
	sitemap.match(/<loc>([^<]*)<\/loc>/)?.[1] ?? 'no loc',
)

await session.call(`/api/sites/${site.id}`, { method: 'DELETE' })

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
