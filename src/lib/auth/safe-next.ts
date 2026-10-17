/**
 * Where to send someone after they sign in. Only a path on this site is
 * honoured: anything with a scheme, a host, a protocol-relative `//`, or the
 * control characters and backslashes browsers quietly strip or normalise
 * (`/\t/evil.com` becomes `//evil.com`) would turn the sign-in page into an
 * open redirect for phishing links. The value is re-serialised from a parsed
 * URL, so what comes back is exactly a path on this origin.
 */
export function safeNext(
	value: string | null | undefined,
	fallback = '/account',
) {
	if (!value || !value.startsWith('/')) return fallback
	if (/[\u0000- \u007f\\]/.test(value)) return fallback
	if (value.startsWith('//')) return fallback
	try {
		const url = new URL(value, 'http://safe.local')
		if (url.origin !== 'http://safe.local') return fallback
		return `${url.pathname}${url.search}${url.hash}`
	} catch {
		return fallback
	}
}
