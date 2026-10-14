/** Prose HTML helpers. Pure and environment neutral: no React, no browser APIs. */

/** The editor stores HTML; older blocks stored `##`-prefixed plain text. */
export function isProseHtml(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/<(p|h[1-6]|ul|ol|blockquote|hr|pre)\b/i.test(value)
	)
}

/** Authored HTML is still untrusted input once a site JSON can be imported. */
export function sanitizeProseHtml(html: string) {
	return html
		.replace(
			/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\s*\1\s*>/gi,
			'',
		)
		.replace(
			/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi,
			'',
		)
		.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
}
