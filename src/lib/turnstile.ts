import { site } from '@/lib/site'

const domain = site.domain.toLowerCase()

// Siteverify reports the hostname the widget actually ran on. Production must
// never accept localhost, so the fallback is environment specific.
const expectedHostnames = new Set(
	(
		process.env.TURNSTILE_HOSTNAMES ??
		(process.env.NODE_ENV === 'production'
			? `${domain},www.${domain}`
			: 'localhost,127.0.0.1')
	)
		.split(',')
		.map((hostname) => hostname.trim())
		.filter(Boolean),
)

export async function verifyTurnstile(
	token: unknown,
	remoteip: string | null,
	expectedAction: string,
) {
	const secret = process.env.CLOUDFLARE_SECRET_KEY
	const production = process.env.NODE_ENV === 'production'

	// Production always demands a solved challenge. Outside it, a missing key or a
	// missing token means the widget never rendered, so requiring one would lock
	// every form and every local test.
	if (!production && (!secret || typeof token !== 'string' || !token))
		return true
	if (!secret) return false

	if (
		typeof token !== 'string' ||
		token.length === 0 ||
		token.length > 2048 ||
		expectedHostnames.size === 0
	)
		return false

	try {
		const response = await fetch(
			'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				signal: AbortSignal.timeout(10_000),
				body: new URLSearchParams({
					secret,
					response: token,
					...(remoteip ? { remoteip } : {}),
				}),
			},
		)
		if (!response.ok) return false

		const result = await response.json()
		return (
			result.success === true &&
			result.action === expectedAction &&
			expectedHostnames.has(result.hostname)
		)
	} catch {
		return false
	}
}
