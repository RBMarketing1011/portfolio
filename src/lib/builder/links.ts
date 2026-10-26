/**
 * The one place a stored href is interpreted. Sections store page links root-relative
 * ('/contact'), chrome stores bare slugs ('contact'), and both store '/' for home and
 * tel:, mailto:, https: and '#anchor' links as written. Rendered under a link base
 * ('' on a hosted site, '/preview/<id>' or '/p/<token>' elsewhere), every page link
 * stays inside the site and nothing unsafe ever reaches an `href`.
 *
 * Pure: no imports, so the renderer, the landing code and the proofs share it.
 */

const HOME = '/'

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const SAFE_SCHEME = /^(https?|mailto|tel):/i

/**
 * What a browser would actually parse: it ignores control characters and spaces around
 * a URL and tabs or line breaks inside it, so `java\tscript:` is still a script link.
 */
const clean = (href: string) =>
	String(href ?? '')
		.replace(/[\t\n\r]/g, '')
		.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '')

/** http(s), mailto, tel, '#…', root-relative or a bare slug; never javascript:, data:, vbscript: or protocol-relative '//'. */
export function isSafeHref(href: string): boolean {
	const value = clean(href)
	if (!value) return false
	if (value.startsWith('#')) return true
	// Browsers read a backslash as a slash, so '/\host' and '\\host' are protocol-relative too.
	if (/^[\\/]{2}/.test(value) || value.startsWith('\\')) return false
	if (SCHEME.test(value)) return SAFE_SCHEME.test(value)
	return true
}

/** The path part of a page link, apart from its '?query' or '#hash'. */
function splitSuffix(value: string) {
	const cut = value.search(/[?#]/)
	return cut === -1 ? { path: value, suffix: '' } : { path: value.slice(0, cut), suffix: value.slice(cut) }
}

/** A root-relative path or bare slug as a page link under the base. Home is the base itself. */
function pageLink(linkBase: string, value: string) {
	const base = String(linkBase ?? '').replace(/\/+$/, '')
	const { path, suffix } = splitSuffix(value)
	const slug = path.replace(/^\/+|\/+$/g, '')
	if (!slug) return `${base || HOME}${suffix}`
	return `${base}/${slug}${suffix}`
}

function resolve(linkBase: string, href: string) {
	const value = clean(href)
	if (!isSafeHref(value)) return '#'
	if (value.startsWith('#') || SCHEME.test(value)) return value
	return pageLink(linkBase, value)
}

/** A link a section stores ('/', '/contact', 'contact', 'tel:…', 'mailto:…', 'https://…', '#x') as rendered under a link base. */
export function sectionHref(linkBase: string, href: string): string {
	return resolve(linkBase, href)
}

/** A link chrome stores (bare slug, '/', tel:, mailto:, https:) as rendered under a link base. Never ''. */
export function chromeHref(linkBase: string, href: string): string {
	return resolve(linkBase, href) || '#'
}

/** The page slug a stored href points at ('/' for home), or null for external, tel, mailto and anchors. */
export function slugOfHref(href: string): string | null {
	const value = clean(href)
	if (!isSafeHref(value) || value.startsWith('#') || SCHEME.test(value)) return null
	const slug = splitSuffix(value).path.replace(/^\/+|\/+$/g, '')
	return slug || HOME
}

const asSlug = (value: string) => String(value ?? '').trim().replace(/^\/+|\/+$/g, '') || HOME

/** Rewrites an href that points at `from` (bare or root-relative) to `to`, keeping its form; anything else unchanged. */
export function rewriteSlugRefs(href: string, from: string, to: string): string {
	const source = asSlug(from)
	const target = asSlug(to)
	if (source === target || slugOfHref(href) !== source) return href

	const { path, suffix } = splitSuffix(clean(href))
	if (target === HOME) return `${HOME}${suffix}`
	// Home is written '/' in both forms; a renamed home keeps the root-relative form.
	const rooted = path.startsWith('/')
	const trailing = source !== HOME && path.length > 1 && path.endsWith('/') ? '/' : ''
	return `${rooted ? '/' : ''}${target}${trailing}${suffix}`
}
