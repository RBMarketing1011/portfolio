/**
 * Proves src/lib/media/storage.ts, the Vercel Blob boundary, against the real
 * source. No network: '@vercel/blob' is mocked and global fetch is replaced.
 *
 *   node scripts/prove-media-storage.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, mock } = require('./lib/load-ts.cjs')

const WS = '0123456789abcdef01234567'
const OTHER = 'fedcba9876543210fedcba98'
const PREFIX = `workspaces/${WS}/media/`
const HOST = 'https://s1abc23.public.blob.vercel-storage.com'
const TOKEN = 'vercel_blob_rw_S1abc23_SuperSecretValue0123456789'

// ---------------------------------------------------------------- the mock store

class BlobNotFoundError extends Error {
	constructor() {
		super('Vercel Blob: The requested blob does not exist')
	}
}

const sdk = {
	head: async () => {
		throw new Error('head not configured')
	},
	del: async () => {
		throw new Error('del not configured')
	},
	list: async () => {
		throw new Error('list not configured')
	},
}
const calls = { head: [], del: [], list: [] }

mock('@vercel/blob', {
	BlobNotFoundError,
	head: (...args) => {
		calls.head.push(args)
		return sdk.head(...args)
	},
	del: (...args) => {
		calls.del.push(args)
		return sdk.del(...args)
	},
	list: (...args) => {
		calls.list.push(args)
		return sdk.list(...args)
	},
})

const storage = loadTs('src/lib/media/storage.ts')
const { MEDIA_LIMITS } = loadTs('src/lib/media/types.ts')
const {
	BlobUrlError,
	BlobGoneError,
	BlobTooLargeError,
	BLOB_HOST_SUFFIX,
	assertBlobUrl,
	headBlob,
	readBlob,
	deleteBlob,
	deleteAllUnderPrefix,
	isOwnedPathname,
	mediaPathPrefix,
	safeFilename,
	nameFromFilename,
} = storage

function resetSdk() {
	calls.head.length = 0
	calls.del.length = 0
	calls.list.length = 0
	sdk.head = async () => {
		throw new Error('head not configured')
	}
	sdk.del = async () => undefined
	sdk.list = async () => {
		throw new Error('list not configured')
	}
}

// ---------------------------------------------------------------- harness

const realFetch = globalThis.fetch
const realWarn = console.warn
const realToken = process.env.BLOB_READ_WRITE_TOKEN
const warnings = []
console.warn = (...args) => warnings.push(args.join(' '))

let passed = 0
let failed = 0
const out = (line) => process.stdout.write(`${line}\n`)

async function test(name, fn) {
	resetSdk()
	warnings.length = 0
	globalThis.fetch = async () => {
		throw new Error('unexpected fetch')
	}
	try {
		await fn()
		passed++
		out(`PASS  ${name}`)
	} catch (error) {
		failed++
		const detail = error instanceof Error ? error.message : String(error)
		out(`FAIL  ${name} (${detail})`)
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message ?? 'assertion failed')
}
function eq(actual, expected, label = 'value') {
	if (actual !== expected)
		throw new Error(
			`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		)
}

async function rejects(promise, check, label = 'call') {
	let thrown
	try {
		await promise
	} catch (error) {
		thrown = error
	}
	if (thrown === undefined) throw new Error(`${label} did not throw`)
	check(thrown)
	return thrown
}

function expectUrlError(fn, label) {
	let thrown
	try {
		fn()
	} catch (error) {
		thrown = error
	}
	if (!(thrown instanceof BlobUrlError))
		throw new Error(`${label}: expected BlobUrlError, got ${thrown ?? 'no throw'}`)
	eq(thrown.name, 'BlobUrlError', `${label} name`)
}

const GOOD_URL = `${HOST}/${PREFIX}photo-abc123.png`

// ---------------------------------------------------------------- fetch helpers

function bytes(n, fill = 7) {
	return new Uint8Array(n).fill(fill)
}

/** A stream of the given chunks that counts how much of it was pulled. */
function counted(chunks, { stallAfter, failAfter } = {}) {
	const stats = { pulled: 0, cancelled: false }
	let index = 0
	const stream = new ReadableStream(
		{
			pull(controller) {
				if (stallAfter !== undefined && index >= stallAfter) return new Promise(() => {})
				if (failAfter !== undefined && index >= failAfter)
					throw new Error(`boom ${TOKEN}`)
				if (index >= chunks.length) {
					controller.close()
					return undefined
				}
				stats.pulled++
				controller.enqueue(chunks[index++])
				return undefined
			},
			cancel() {
				stats.cancelled = true
			},
		},
		{ highWaterMark: 0 },
	)
	return { stream, stats }
}

/** An endless stream, one `size`-byte chunk per pull. */
function endless(size) {
	const stats = { pulled: 0, cancelled: false }
	const stream = new ReadableStream(
		{
			pull(controller) {
				stats.pulled++
				controller.enqueue(bytes(size))
			},
			cancel() {
				stats.cancelled = true
			},
		},
		{ highWaterMark: 0 },
	)
	return { stream, stats }
}

function serve(handler) {
	const seen = []
	globalThis.fetch = async (input, init) => {
		seen.push({ input: String(input), init })
		return handler(String(input), init)
	}
	return seen
}

const ok = (body, headers = {}) => new Response(body, { status: 200, headers })

// ================================================================ URL validation

await test('assertBlobUrl accepts real-looking blob URLs and returns the parsed URL', () => {
	const good = [
		GOOD_URL,
		`${HOST}:443/${PREFIX}a.png`,
		`${HOST}/${PREFIX}a%20b.png`,
		`${HOST}/${PREFIX}caf%C3%A9.png`,
		`${HOST}/${PREFIX}${encodeURI('猫.jpg')}`,
		`${HOST}/${PREFIX}猫.jpg`,
		`${HOST}/sites/abc/hero-x7Zq.webp`,
		`https://a.public.blob.vercel-storage.com/x`,
		`https://0.public.blob.vercel-storage.com/x`,
		`https://a-b-c.public.blob.vercel-storage.com/x/`,
	]
	for (const url of good) {
		const parsed = assertBlobUrl(url)
		assert(parsed instanceof URL, `not a URL for ${url}`)
		eq(parsed.protocol, 'https:', 'protocol')
		assert(parsed.hostname.endsWith(BLOB_HOST_SUFFIX), 'host suffix')
	}
	eq(BLOB_HOST_SUFFIX, '.public.blob.vercel-storage.com', 'suffix constant')
})

await test('assertBlobUrl rejects every non-https scheme and malformed input', () => {
	const bad = [
		`http://s1.public.blob.vercel-storage.com/${PREFIX}a.png`,
		`HTTP://s1.public.blob.vercel-storage.com/a.png`,
		`HTTPS://s1.public.blob.vercel-storage.com/a.png`,
		`ftp://s1.public.blob.vercel-storage.com/a.png`,
		`file:///etc/passwd`,
		`javascript:alert(1)`,
		`data:image/png;base64,AAAA`,
		`//s1.public.blob.vercel-storage.com/a.png`,
		`https:/s1.public.blob.vercel-storage.com/a.png`,
		`https:s1.public.blob.vercel-storage.com/a.png`,
		` ${GOOD_URL}`,
		`${GOOD_URL} `,
		`${GOOD_URL}\n`,
		`https://s1.public.blob.vercel-storage.com/a\t.png`,
		`https://s1.public.blob.vercel-storage.com/a\r\nHost: evil.com`,
		`https://s1.public.blob.vercel-storage.com/a\u0000.png`,
		`https://s1.public.blob.vercel-storage.com/a\u202e.png`,
		'',
		'not a url',
		'/workspaces/x/media/a.png',
		`workspaces/${WS}/media/a.png`,
		`https://s1.public.blob.vercel-storage.com`,
		`https://s1.public.blob.vercel-storage.com/`,
		`https://s1.public.blob.vercel-storage.com/${'a'.repeat(3000)}`,
	]
	for (const url of bad) expectUrlError(() => assertBlobUrl(url), JSON.stringify(url.slice(0, 60)))
	for (const value of [null, undefined, 42, {}, [], true, () => GOOD_URL, Symbol('x')])
		expectUrlError(() => assertBlobUrl(value), `non-string ${String(typeof value)}`)
})

await test('assertBlobUrl rejects other hosts and lookalikes', () => {
	const bad = [
		'https://example.com/a.png',
		'https://blob.vercel-storage.com/a.png',
		'https://public.blob.vercel-storage.com/a.png',
		'https://s1.blob.vercel-storage.com/a.png',
		'https://s1.private.blob.vercel-storage.com/a.png',
		'https://vercel-storage.com/a.png',
		'https://evil.com/.public.blob.vercel-storage.com',
		'https://evil.com/s1.public.blob.vercel-storage.com/a.png',
		'https://evilpublic.blob.vercel-storage.com/a.png',
		'https://evil-public.blob.vercel-storage.com/a.png',
		'https://s1.public.blob.vercel-storage.com.evil.com/a.png',
		'https://s1.public.blob.vercel-storage.com.evil.com./a.png',
		'https://s1.public.blob.vercel-storage.comevil.com/a.png',
		'https://s1.public.blob.vercel-storage.co/a.png',
		'https://s1.public.blob.vercel-storage.com-evil.com/a.png',
		'https://s1.public-blob.vercel-storage.com/a.png',
		'https://s1.public.blob.vercel-storage.org/a.png',
		'https://.public.blob.vercel-storage.com/a.png',
		'https://-s1.public.blob.vercel-storage.com/a.png',
		'https://s1-.public.blob.vercel-storage.com/a.png',
		'https://a..public.blob.vercel-storage.com/a.png',
		'https://a.b.public.blob.vercel-storage.com/a.png',
		'https://s1_x.public.blob.vercel-storage.com/a.png',
		'https://s1%2Epublic.blob.vercel-storage.com/a.png',
		'https://s1.public.blob.vercel-storage.com%2eevil.com/a.png',
		'https://xn--s1.public.blob.vercel-storage.com.evil.com/a.png',
		'https://s1.public.blob.vercel-storage.com\u3002evil.com/a.png',
		'https://s1\uff0epublic.blob.vercel-storage.com/a.png',
		'https://localhost/a.png',
	]
	for (const url of bad) expectUrlError(() => assertBlobUrl(url), url)
})

await test('assertBlobUrl rejects userinfo in every position', () => {
	const bad = [
		'https://user@s1.public.blob.vercel-storage.com/a.png',
		'https://user:pass@s1.public.blob.vercel-storage.com/a.png',
		'https://:pass@s1.public.blob.vercel-storage.com/a.png',
		'https://@s1.public.blob.vercel-storage.com/a.png',
		'https://s1.public.blob.vercel-storage.com@evil.com/a.png',
		'https://s1.public.blob.vercel-storage.com:443@evil.com/a.png',
		'https://evil.com@s1.public.blob.vercel-storage.com/a.png',
		'https://evil.com:pw@s1.public.blob.vercel-storage.com:443/a.png',
		'https://s1.public.blob.vercel-storage.com\\@evil.com/a.png',
		'https://evil.com\\@s1.public.blob.vercel-storage.com/a.png',
	]
	for (const url of bad) expectUrlError(() => assertBlobUrl(url), url)
})

await test('assertBlobUrl rejects non-default ports (443 itself is the default)', () => {
	for (const port of ['80', '8443', '8080', '0', '65535', '4430', '1', '00443', '99999'])
		expectUrlError(
			() => assertBlobUrl(`https://s1.public.blob.vercel-storage.com:${port}/a.png`),
			`port ${port}`,
		)
	expectUrlError(
		() => assertBlobUrl('https://s1.public.blob.vercel-storage.com:/a.png'),
		'empty port',
	)
	expectUrlError(
		() => assertBlobUrl('https://s1.public.blob.vercel-storage.com:abc/a.png'),
		'alpha port',
	)
	assertBlobUrl('https://s1.public.blob.vercel-storage.com:443/a.png')
})

await test('assertBlobUrl rejects IP literals in every spelling', () => {
	const bad = [
		'https://127.0.0.1/a.png',
		'https://127.0.0.1:443/a.png',
		'https://10.0.0.1/a.png',
		'https://169.254.169.254/latest/meta-data',
		'https://0.0.0.0/a.png',
		'https://2130706433/a.png',
		'https://0x7f000001/a.png',
		'https://0x7f.1/a.png',
		'https://0177.0.0.1/a.png',
		'https://[::1]/a.png',
		'https://[::1]:443/a.png',
		'https://[::ffff:127.0.0.1]/a.png',
		'https://[2001:db8::1]/a.png',
		'https://[::1].public.blob.vercel-storage.com/a.png',
		'https://127.0.0.1.public.blob.vercel-storage.com.evil.com/a.png',
		'https://1.2.3.4.public.blob.vercel-storage.com/a.png',
		'https://127.0.0.1/.public.blob.vercel-storage.com',
	]
	for (const url of bad) expectUrlError(() => assertBlobUrl(url), url)
})

await test('assertBlobUrl rejects uppercase hostnames and trailing dots', () => {
	const bad = [
		'https://S1.public.blob.vercel-storage.com/a.png',
		'https://s1.PUBLIC.blob.vercel-storage.com/a.png',
		'https://s1.public.blob.vercel-storage.COM/a.png',
		'https://S1.PUBLIC.BLOB.VERCEL-STORAGE.COM/a.png',
		'https://s1.public.blob.vercel-storage.com./a.png',
		'https://s1.public.blob.vercel-storage.com../a.png',
		'https://s1.public.blob.vercel-storage.com.:443/a.png',
		'https://s1..public.blob.vercel-storage.com/a.png',
	]
	for (const url of bad) expectUrlError(() => assertBlobUrl(url), url)
})

await test('assertBlobUrl rejects dot segments, however written', () => {
	const bad = [
		`${HOST}/../a.png`,
		`${HOST}/a/../b.png`,
		`${HOST}/${PREFIX}../x.png`,
		`${HOST}/${PREFIX}a/../../b.png`,
		`${HOST}/./a.png`,
		`${HOST}/a/./b.png`,
		`${HOST}/a/..`,
		`${HOST}/a/.`,
		`${HOST}/%2e%2e/a.png`,
		`${HOST}/%2E%2E/a.png`,
		`${HOST}/a/%2e%2e/b.png`,
		`${HOST}/a/%2e./b.png`,
		`${HOST}/a/.%2e/b.png`,
		`${HOST}/a/%2e/b.png`,
		`${HOST}/a%2f..%2fb.png`,
		`${HOST}/a/..%2fb.png`,
		`${HOST}/a%2F%2E%2E%2Fb.png`,
		`${HOST}/a%5c..%5cb.png`,
		`${HOST}/a/%252e%252e/b.png`,
		`${HOST}/a/%25252e/b.png`,
		`${HOST}/a\\..\\b.png`,
		`${HOST}/a/..;/b.png`.replace('..;', '..'),
	]
	for (const url of bad) expectUrlError(() => assertBlobUrl(url), url)
	// Dots that are not a whole segment are an ordinary name.
	assertBlobUrl(`${HOST}/${PREFIX}a..b.png`)
	assertBlobUrl(`${HOST}/${PREFIX}...png`)
	assertBlobUrl(`${HOST}/${PREFIX}a.png`)
})

await test('assertBlobUrl rejects query strings, fragments, bad escapes', () => {
	for (const url of [
		`${GOOD_URL}?download=1`,
		`${GOOD_URL}?`,
		`${GOOD_URL}#frag`,
		`${GOOD_URL}#`,
		`${HOST}/a%.png`,
		`${HOST}/a%zz.png`,
		`${HOST}/${PREFIX}a%00.png`,
		`${HOST}/${PREFIX}a%0a.png`,
		`${HOST}/${PREFIX}a%E2%80%AE.png`,
	])
		expectUrlError(() => assertBlobUrl(url), url)
})

await test('headBlob and readBlob refuse a bad URL before any I/O', async () => {
	const seen = serve(() => ok(bytes(3)))
	const bads = ['http://s1.public.blob.vercel-storage.com/a.png', 'https://evil.com/a.png', '']
	for (const url of bads) {
		await rejects(headBlob(url), (e) => assert(e instanceof BlobUrlError), `head ${url}`)
		await rejects(readBlob(url), (e) => assert(e instanceof BlobUrlError), `read ${url}`)
	}
	eq(calls.head.length, 0, 'head calls')
	eq(seen.length, 0, 'fetch calls')
})

// ================================================================ pathname ownership

await test('mediaPathPrefix builds the prefix and refuses a malformed id', () => {
	eq(mediaPathPrefix(WS), `workspaces/${WS}/media/`, 'prefix')
	eq(mediaPathPrefix('abc'), 'workspaces/abc/media/', 'short id')
	for (const id of ['', '..', '.', 'a/b', 'a\\b', 'a b', '../x', 'a%2fb', 'x'.repeat(65), null, undefined, 5, {}]) {
		let threw = false
		try {
			mediaPathPrefix(id)
		} catch {
			threw = true
		}
		assert(threw, `accepted ${JSON.stringify(id)}`)
	}
})

await test('isOwnedPathname accepts real upload pathnames', () => {
	const good = [
		`${PREFIX}photo-AbC123.png`,
		`${PREFIX}a b.png`,
		`${PREFIX}kitchen_remodel-2.JPG`,
		`${PREFIX}caf\u00e9-\u732b.jpg`,
		`${PREFIX}\u{1F468}\u200D\u{1F469}.png`,
		`${PREFIX}a..b.png`,
		`${PREFIX}...png`,
		`${PREFIX}.hidden.png`,
		`${PREFIX}100%.png`,
		`${PREFIX}a(1)+b&c=d,e;f!g~h.png`,
		`${PREFIX}sub/deeper/x.png`,
		`${PREFIX}x`,
	]
	for (const p of good) assert(isOwnedPathname(p, WS), `rejected ${JSON.stringify(p)}`)
})

await test('isOwnedPathname rejects traversal, encodings, separators and controls', () => {
	const bad = [
		`${PREFIX}../x.png`,
		`${PREFIX}..`,
		`${PREFIX}.`,
		`${PREFIX}./x.png`,
		`${PREFIX}a/../b.png`,
		`${PREFIX}a/./b.png`,
		`${PREFIX}a/..`,
		`workspaces/${WS}/media/../../${OTHER}/media/x.png`,
		`workspaces/${WS}/media/../x.png`,
		`workspaces/${WS}/media/../media/x.png`,
		`workspaces/${WS}/../${WS}/media/x.png`,
		`workspaces/${WS}/./media/x.png`,
		`${PREFIX}%2e%2e/x.png`,
		`${PREFIX}%2E%2E/x.png`,
		`${PREFIX}%2e./x.png`,
		`${PREFIX}.%2e/x.png`,
		`${PREFIX}%2e/x.png`,
		`${PREFIX}a%2f..%2fb.png`,
		`${PREFIX}a%2Fb.png`,
		`${PREFIX}a%5cb.png`,
		`${PREFIX}%252e%252e/x.png`,
		`${PREFIX}a%252fb.png`,
		`${PREFIX}%25%32%65`.replace('%25%32%65', '%252e'),
		`${PREFIX}a//b.png`,
		`${PREFIX}/x.png`,
		`workspaces//${WS}/media/x.png`,
		`workspaces/${WS}//media/x.png`,
		`workspaces/${WS}/media//x.png`,
		`${PREFIX}a\\b.png`,
		`${PREFIX}..\\x.png`,
		`workspaces\\${WS}\\media\\x.png`,
		`${PREFIX}a\u0000b.png`,
		`${PREFIX}a\nb.png`,
		`${PREFIX}a\rb.png`,
		`${PREFIX}a\tb.png`,
		`${PREFIX}a\u001bb.png`,
		`${PREFIX}a\u007fb.png`,
		`${PREFIX}a\u0085b.png`,
		`${PREFIX}a\u2028b.png`,
		`${PREFIX}a\u2029b.png`,
		`${PREFIX}a\u202eb.png`,
		`${PREFIX}a\u2066b.png`,
		PREFIX,
		`${PREFIX}sub/`,
		`${PREFIX}sub//`,
		`/${PREFIX}x.png`,
		` ${PREFIX}x.png`,
		`${PREFIX}x.png/`,
		'',
		'/',
		`${PREFIX}${'a'.repeat(2000)}`,
	]
	for (const p of bad) assert(!isOwnedPathname(p, WS), `accepted ${JSON.stringify(p.slice(0, 80))}`)
})

await test('isOwnedPathname rejects other workspaces, sites/ and prefix lookalikes', () => {
	const bad = [
		`workspaces/${OTHER}/media/x.png`,
		`workspaces/${OTHER}/media/${WS}/x.png`,
		`sites/${WS}/x.png`,
		`sites/${WS}/media/x.png`,
		`sites/507f1f77bcf86cd799439011/hero-abc.webp`,
		`workspaces/${WS}x/media/x.png`,
		`workspaces/x${WS}/media/x.png`,
		`workspaces/${WS.slice(0, -1)}/media/x.png`,
		`workspaces/${WS}/medias/x.png`,
		`workspaces/${WS}/media`,
		`workspaces/${WS}/mediax/x.png`,
		`workspaces/${WS}/Media/x.png`,
		`workspaces/${WS}/other/x.png`,
		`workspaces/${WS}/x.png`,
		`Workspaces/${WS}/media/x.png`,
		`workspaces/${WS.toUpperCase()}/media/x.png`,
		`prefix/workspaces/${WS}/media/x.png`,
		`media/x.png`,
		`x.png`,
	]
	for (const p of bad) assert(!isOwnedPathname(p, WS), `accepted ${p}`)
	// A short id is a prefix of a longer one but is not its owner.
	assert(isOwnedPathname('workspaces/abc/media/x.png', 'abc'), 'abc owns its own')
	assert(!isOwnedPathname('workspaces/abcd/media/x.png', 'abc'), 'abc must not own abcd')
	assert(!isOwnedPathname('workspaces/abc/media/x.png', 'abcd'), 'abcd must not own abc')
	assert(!isOwnedPathname('workspaces/ab/media/x.png', 'abc'), 'abc must not own ab')
})

await test('isOwnedPathname is false for malformed workspace ids and non-strings', () => {
	for (const id of ['', '..', '.', 'a/b', 'a b', '*', `${WS}/..`, 'x'.repeat(65), null, undefined, 1, {}])
		assert(!isOwnedPathname(`workspaces/${id}/media/x.png`, id), `id ${JSON.stringify(id)}`)
	for (const p of [null, undefined, 5, {}, [], true])
		assert(!isOwnedPathname(p, WS), `pathname ${JSON.stringify(p)}`)
	assert(!isOwnedPathname(['workspaces', WS, 'media', 'x'], WS), 'array pathname')
})

// ================================================================ deleteBlob guard

const ownedInfo = (name = 'photo-abc123.png') => ({
	url: `${HOST}/${PREFIX}${name}`,
	pathname: `${PREFIX}${name}`,
})

async function refused(name, info, ...rest) {
	const prefix = rest.length > 0 ? rest[0] : PREFIX
	await test(`deleteBlob refuses: ${name}`, async () => {
		await deleteBlob(info, prefix)
		eq(calls.del.length, 0, 'del() calls')
		eq(warnings.length, 1, 'log lines')
		assert(!warnings[0].includes(TOKEN), 'log leaks token')
		assert(!/[\r\n]/.test(warnings[0]), 'log line is not one line')
	})
}

await refused('a foreign workspace pathname', {
	url: `${HOST}/workspaces/${OTHER}/media/x.png`,
	pathname: `workspaces/${OTHER}/media/x.png`,
})
await refused('a sites/ pathname', {
	url: `${HOST}/sites/507f1f77bcf86cd799439011/hero.webp`,
	pathname: 'sites/507f1f77bcf86cd799439011/hero.webp',
})
await refused('a pathname that the url does not match', {
	url: `${HOST}/workspaces/${OTHER}/media/x.png`,
	pathname: `${PREFIX}x.png`,
})
await refused('a url whose path is a different owned blob', {
	url: `${HOST}/${PREFIX}other.png`,
	pathname: `${PREFIX}x.png`,
})
await refused('a url path that is a prefix of the pathname', {
	url: `${HOST}/${PREFIX}x`,
	pathname: `${PREFIX}x.png`,
})
await refused('an owned-looking pathname with a url under sites/', {
	url: `${HOST}/sites/507f1f77bcf86cd799439011/hero.webp`,
	pathname: `${PREFIX}x.png`,
})
await refused('a traversal pathname that resolves elsewhere', {
	url: `${HOST}/workspaces/${OTHER}/media/x.png`,
	pathname: `${PREFIX}../../${OTHER}/media/x.png`,
})
await refused('a traversal in both pathname and url', {
	url: `${HOST}/${PREFIX}../../${OTHER}/media/x.png`,
	pathname: `${PREFIX}../../${OTHER}/media/x.png`,
})
await refused('a percent-encoded traversal in both', {
	url: `${HOST}/${PREFIX}%2e%2e/%2e%2e/x.png`,
	pathname: `${PREFIX}%2e%2e/%2e%2e/x.png`,
})
await refused('a url on a lookalike host', {
	url: `https://evil.com/${PREFIX}x.png`,
	pathname: `${PREFIX}x.png`,
})
await refused('a url on http', {
	url: `http://s1.public.blob.vercel-storage.com/${PREFIX}x.png`,
	pathname: `${PREFIX}x.png`,
})
await refused('a url with userinfo', {
	url: `https://u:p@s1.public.blob.vercel-storage.com/${PREFIX}x.png`,
	pathname: `${PREFIX}x.png`,
})
await refused('a url with a query', {
	url: `${HOST}/${PREFIX}x.png?x=1`,
	pathname: `${PREFIX}x.png`,
})
await refused('a pathname that is the bare prefix', {
	url: `${HOST}/${PREFIX}`,
	pathname: PREFIX,
})
await refused('a pathname with a double slash', {
	url: `${HOST}/${PREFIX}a//b.png`,
	pathname: `${PREFIX}a//b.png`,
})
await refused('a pathname with a control character', {
	url: `${HOST}/${PREFIX}a%0Ab.png`,
	pathname: `${PREFIX}a\nb.png`,
})
await refused('a pathname with a backslash', {
	url: `${HOST}/${PREFIX}a%5Cb.png`,
	pathname: `${PREFIX}a\\b.png`,
})
await refused('a workspace-prefix lookalike pathname', {
	url: `${HOST}/workspaces/${WS}x/media/x.png`,
	pathname: `workspaces/${WS}x/media/x.png`,
})
await refused('a prefix naming a different workspace than the pathname', ownedInfo(), `workspaces/${OTHER}/media/`)
await refused('an empty prefix', ownedInfo(), '')
await refused('the prefix "workspaces/"', ownedInfo(), 'workspaces/')
await refused('the prefix "/"', ownedInfo(), '/')
await refused('a prefix with no workspace id', ownedInfo(), 'workspaces//media/')
await refused('a prefix without its trailing slash', ownedInfo(), `workspaces/${WS}/media`)
await refused('a prefix that stops at the workspace', ownedInfo(), `workspaces/${WS}/`)
await refused('a prefix that is a mere substring (leading chars cut)', ownedInfo(), `orkspaces/${WS}/media/`)
await refused('a prefix that is only "media/"', ownedInfo(), 'media/')
await refused('a prefix that is a substring of the pathname start', ownedInfo(), `workspaces/${WS.slice(0, 10)}`)
await refused('a prefix with extra suffix', ownedInfo(), `workspaces/${WS}/media/sub/`)
await refused('a prefix with a wildcard id', ownedInfo(), 'workspaces/*/media/')
await refused('a prefix with a traversal id', ownedInfo(), 'workspaces/../media/')
await refused('a prefix with trailing text', ownedInfo(), `${PREFIX}x`)
await refused('a non-string prefix (null)', ownedInfo(), null)
await refused('a non-string prefix (undefined)', ownedInfo(), undefined)
await refused('a non-string prefix (number)', ownedInfo(), 7)
await refused('a non-string prefix (array)', ownedInfo(), [PREFIX])
await refused('null info', null)
await refused('undefined info', undefined)
await refused('empty info', {})
await refused('info without a url', { pathname: `${PREFIX}x.png` })
await refused('info without a pathname', { url: GOOD_URL })
await refused('a non-string pathname', { url: GOOD_URL, pathname: 5 })
await refused('a non-string url', { url: 5, pathname: `${PREFIX}x.png` })
await refused('an array pathname', { url: GOOD_URL, pathname: [`${PREFIX}x.png`] })

await test('deleteBlob refuses a hostile info object without throwing', async () => {
	const hostile = new Proxy(
		{},
		{
			get() {
				throw new Error('getter exploded')
			},
		},
	)
	await deleteBlob(hostile, PREFIX)
	eq(calls.del.length, 0, 'del() calls')
	assert(warnings.length >= 1, 'no log line')
})

await test('deleteBlob log lines cannot be forged by the pathname', async () => {
	await deleteBlob(
		{ url: GOOD_URL, pathname: 'x\nmedia: deleted everything\u2028ok' },
		PREFIX,
	)
	eq(calls.del.length, 0, 'del() calls')
	eq(warnings.length, 1, 'log lines')
	assert(!/[\r\n\u2028\u2029]/.test(warnings[0]), 'raw newline reached the log')
})

await test('deleteBlob deletes a proven-owned blob exactly once, with the validated url', async () => {
	const info = ownedInfo()
	const result = await deleteBlob(info, PREFIX)
	eq(result, undefined, 'return value')
	eq(calls.del.length, 1, 'del() calls')
	const target = calls.del[0][0]
	assert(typeof target === 'string', 'del target is a single string')
	eq(target, info.url, 'del target')
	eq(warnings.length, 0, 'log lines')
})

await test('deleteBlob proves ownership for escaped and unicode names', async () => {
	const cases = [
		{ url: `${HOST}/${PREFIX}a%20b.png`, pathname: `${PREFIX}a b.png` },
		{ url: `${HOST}/${PREFIX}a%20b.png`, pathname: `${PREFIX}a%20b.png` },
		{ url: `${HOST}/${PREFIX}caf%C3%A9.png`, pathname: `${PREFIX}caf\u00e9.png` },
		{ url: `${HOST}/${PREFIX}${encodeURI('猫.jpg')}`, pathname: `${PREFIX}猫.jpg` },
		{ url: `${HOST}/${PREFIX}猫.jpg`, pathname: `${PREFIX}猫.jpg` },
		{ url: `${HOST}/${PREFIX}sub/x.png`, pathname: `${PREFIX}sub/x.png` },
	]
	for (const info of cases) await deleteBlob(info, PREFIX)
	eq(calls.del.length, cases.length, 'del() calls')
	eq(warnings.length, 0, 'log lines')
})

await test('deleteBlob swallows a failing del() and logs one clean line', async () => {
	process.env.BLOB_READ_WRITE_TOKEN = TOKEN
	try {
		sdk.del = async () => {
			throw new Error(`Vercel Blob: boom with ${TOKEN}`)
		}
		await deleteBlob(ownedInfo(), PREFIX)
		eq(calls.del.length, 1, 'del() calls')
		eq(warnings.length, 1, 'log lines')
		assert(!warnings[0].includes(TOKEN), 'log leaks token')
	} finally {
		if (realToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
		else process.env.BLOB_READ_WRITE_TOKEN = realToken
	}
})

await test('deleteBlob swallows every kind of rejection, and a gone blob is not an error', async () => {
	const rejections = [
		() => Promise.reject(new Error('x')),
		() => Promise.reject('a string'),
		() => Promise.reject(null),
		() => Promise.reject(undefined),
		() => Promise.reject({ not: 'an error' }),
		() => {
			throw new TypeError('sync throw')
		},
		() => Promise.reject(new BlobNotFoundError()),
	]
	for (const reject of rejections) {
		sdk.del = reject
		const result = await deleteBlob(ownedInfo(), PREFIX)
		eq(result, undefined, 'return value')
	}
	eq(calls.del.length, rejections.length, 'del() calls')
	// The already-gone case adds no noise.
	eq(warnings.length, rejections.length - 1, 'log lines')
})

await test('deleteBlob never throws for any input shape', async () => {
	const infos = [null, undefined, 0, '', 'str', [], {}, { url: {}, pathname: {} }, ownedInfo()]
	const prefixes = [null, undefined, 0, '', {}, [], PREFIX]
	let delivered = 0
	for (const info of infos)
		for (const prefix of prefixes) {
			await deleteBlob(info, prefix)
			delivered++
		}
	eq(delivered, infos.length * prefixes.length, 'completed calls')
	eq(calls.del.length, 1, 'only the one valid pair reaches del()')
})

// ================================================================ readBlob

await test('readBlob returns the bytes and fetches safely', async () => {
	const body = Uint8Array.from([1, 2, 3, 4, 5])
	const seen = serve(() => ok(body, { 'content-length': '5' }))
	const buffer = await readBlob(GOOD_URL)
	assert(Buffer.isBuffer(buffer), 'not a Buffer')
	eq(Buffer.compare(buffer, Buffer.from(body)), 0, 'bytes')
	eq(seen.length, 1, 'fetch calls')
	eq(seen[0].input, GOOD_URL, 'fetched url')
	assert(['manual', 'error'].includes(seen[0].init?.redirect), `redirect mode ${seen[0].init?.redirect}`)
	assert(seen[0].init?.signal instanceof AbortSignal, 'no AbortSignal')
	const headers = new Headers(seen[0].init?.headers ?? {})
	eq(headers.has('authorization'), false, 'authorization header')
	eq(headers.has('cookie'), false, 'cookie header')
})

await test('readBlob joins chunks in order and ignores empty ones', async () => {
	const { stream } = counted([
		Uint8Array.from([1, 2]),
		new Uint8Array(0),
		Uint8Array.from([3]),
		Uint8Array.from([4, 5, 6]),
	])
	serve(() => ok(stream))
	eq(Array.from(await readBlob(GOOD_URL)).join(','), '1,2,3,4,5,6', 'bytes')
})

await test('readBlob refuses by content-length without reading the body', async () => {
	const { stream, stats } = counted([bytes(100)])
	serve(() => ok(stream, { 'content-length': '100' }))
	await rejects(
		readBlob(GOOD_URL, { maxBytes: 99 }),
		(e) => {
			assert(e instanceof BlobTooLargeError, 'not BlobTooLargeError')
			assert(e instanceof Error, 'not an Error')
			assert(!(e instanceof BlobGoneError), 'wrongly Gone')
		},
		'readBlob',
	)
	eq(stats.pulled, 0, 'chunks pulled')
	eq(stats.cancelled, true, 'body cancelled')
})

await test('readBlob default cap is MEDIA_LIMITS.maxBytes (header, then stream)', async () => {
	const { stream, stats } = counted([bytes(10)])
	serve(() => ok(stream, { 'content-length': String(MEDIA_LIMITS.maxBytes + 1) }))
	await rejects(readBlob(GOOD_URL), (e) => assert(e instanceof BlobTooLargeError), 'header')
	eq(stats.pulled, 0, 'chunks pulled')

	const big = endless(1024 * 1024)
	serve(() => ok(big.stream))
	await rejects(readBlob(GOOD_URL), (e) => assert(e instanceof BlobTooLargeError), 'stream')
	// 25 MiB of 1 MiB chunks: it must stop at the 26th, not run on.
	assert(big.stats.pulled <= MEDIA_LIMITS.maxBytes / (1024 * 1024) + 3, `pulled ${big.stats.pulled}`)
	eq(big.stats.cancelled, true, 'stream cancelled')
})

await test('readBlob caps by stream with no header and never buffers the whole object', async () => {
	const source = endless(10)
	serve(() => ok(source.stream))
	await rejects(
		readBlob(GOOD_URL, { maxBytes: 35 }),
		(e) => assert(e instanceof BlobTooLargeError),
		'readBlob',
	)
	assert(source.stats.pulled <= 5, `pulled ${source.stats.pulled} chunks of an endless body`)
	eq(source.stats.cancelled, true, 'stream cancelled')
})

await test('readBlob caps by stream when the header lies low', async () => {
	const source = endless(10)
	serve(() => ok(source.stream, { 'content-length': '5' }))
	await rejects(
		readBlob(GOOD_URL, { maxBytes: 35 }),
		(e) => assert(e instanceof BlobTooLargeError),
		'readBlob',
	)
	assert(source.stats.pulled <= 5, `pulled ${source.stats.pulled}`)
})

await test('readBlob ignores a garbage content-length and still caps the stream', async () => {
	for (const header of ['abc', '-5', '1e3', '', '12 34', '0x10']) {
		const source = endless(10)
		serve(() => ok(source.stream, { 'content-length': header }))
		await rejects(
			readBlob(GOOD_URL, { maxBytes: 35 }),
			(e) => assert(e instanceof BlobTooLargeError),
			`header ${JSON.stringify(header)}`,
		)
	}
})

await test('readBlob exact-cap boundary: cap bytes pass, cap+1 fails', async () => {
	for (const withHeader of [false, true]) {
		const headers = (n) => (withHeader ? { 'content-length': String(n) } : {})
		serve(() => ok(bytes(50), headers(50)))
		eq((await readBlob(GOOD_URL, { maxBytes: 50 })).length, 50, `exact ${withHeader}`)
		serve(() => ok(bytes(51), headers(51)))
		await rejects(
			readBlob(GOOD_URL, { maxBytes: 50 }),
			(e) => assert(e instanceof BlobTooLargeError),
			`cap+1 header=${withHeader}`,
		)
		// Same boundary when the bytes arrive in several chunks.
		serve(() => ok(counted([bytes(20), bytes(20), bytes(10)]).stream, headers(50)))
		eq((await readBlob(GOOD_URL, { maxBytes: 50 })).length, 50, `chunked exact ${withHeader}`)
		serve(() => ok(counted([bytes(20), bytes(20), bytes(11)]).stream))
		await rejects(
			readBlob(GOOD_URL, { maxBytes: 50 }),
			(e) => assert(e instanceof BlobTooLargeError),
			`chunked cap+1 ${withHeader}`,
		)
	}
	serve(() => ok(bytes(MEDIA_LIMITS.maxBytes)))
	eq((await readBlob(GOOD_URL)).length, MEDIA_LIMITS.maxBytes, 'default cap exact')
})

await test('readBlob treats a non-positive or odd maxBytes safely', async () => {
	serve(() => ok(bytes(1)))
	await rejects(readBlob(GOOD_URL, { maxBytes: 0 }), (e) => assert(e instanceof BlobTooLargeError), 'zero')
	// NaN, Infinity and negatives fall back to the default cap, not "no cap".
	for (const maxBytes of [Number.NaN, -1, undefined]) {
		serve(() => ok(bytes(3)))
		eq((await readBlob(GOOD_URL, { maxBytes })).length, 3, `maxBytes ${maxBytes}`)
	}
	const source = endless(1024 * 1024)
	serve(() => ok(source.stream))
	await rejects(
		readBlob(GOOD_URL, { maxBytes: Number.POSITIVE_INFINITY }),
		(e) => assert(e instanceof BlobTooLargeError),
		'infinity',
	)
})

await test('readBlob times out on a fetch that never answers', async () => {
	serve(
		(_url, init) =>
			new Promise((_resolve, reject) => {
				init.signal.addEventListener('abort', () => reject(init.signal.reason))
			}),
	)
	const started = Date.now()
	await rejects(
		readBlob(GOOD_URL, { timeoutMs: 60 }),
		(e) => {
			assert(e instanceof Error, 'not an Error')
			assert(!(e instanceof BlobGoneError) && !(e instanceof BlobUrlError), 'wrong class')
			assert(/time/i.test(e.message), `message ${e.message}`)
		},
		'readBlob',
	)
	assert(Date.now() - started < 2000, 'took too long')
})

await test('readBlob times out even if the fetch ignores its abort signal', async () => {
	serve(() => new Promise(() => {}))
	const started = Date.now()
	await rejects(readBlob(GOOD_URL, { timeoutMs: 60 }), (e) => assert(/time/i.test(e.message)), 'readBlob')
	assert(Date.now() - started < 2000, 'took too long')
})

await test('readBlob times out on a body that stalls after the first chunk', async () => {
	const { stream } = counted([bytes(10), bytes(10)], { stallAfter: 1 })
	serve(() => ok(stream))
	const started = Date.now()
	await rejects(readBlob(GOOD_URL, { timeoutMs: 80 }), (e) => assert(/time/i.test(e.message)), 'readBlob')
	assert(Date.now() - started < 2000, 'took too long')
})

await test('readBlob honours a tiny or zero timeout and ignores a non-finite one', async () => {
	serve(() => new Promise(() => {}))
	await rejects(readBlob(GOOD_URL, { timeoutMs: 0 }), (e) => assert(/time/i.test(e.message)), 'zero')
	await rejects(readBlob(GOOD_URL, { timeoutMs: -50 }), (e) => assert(/time/i.test(e.message)), 'negative')
	serve(() => ok(bytes(4)))
	eq((await readBlob(GOOD_URL, { timeoutMs: Number.NaN })).length, 4, 'NaN falls back to the default')
})

await test('readBlob refuses redirects', async () => {
	for (const status of [301, 302, 303, 307, 308]) {
		const seen = serve(
			() => new Response(null, { status, headers: { location: 'https://evil.com/x.png' } }),
		)
		await rejects(
			readBlob(GOOD_URL),
			(e) => assert(e instanceof BlobUrlError, `status ${status}: ${e}`),
			`status ${status}`,
		)
		eq(seen.length, 1, 'followed a redirect')
	}
	// A client that followed it anyway is caught by `redirected`.
	serve(() => {
		const response = new Response(bytes(5), { status: 200 })
		Object.defineProperty(response, 'redirected', { value: true })
		return response
	})
	await rejects(readBlob(GOOD_URL), (e) => assert(e instanceof BlobUrlError), 'redirected flag')
	serve(() => {
		const response = new Response(null, { status: 200 })
		Object.defineProperty(response, 'type', { value: 'opaqueredirect' })
		return response
	})
	await rejects(readBlob(GOOD_URL), (e) => assert(e instanceof BlobUrlError), 'opaqueredirect')
})

await test('readBlob maps 404 and 410 to BlobGoneError', async () => {
	for (const status of [404, 410]) {
		serve(() => new Response('gone', { status }))
		await rejects(
			readBlob(GOOD_URL),
			(e) => {
				assert(e instanceof BlobGoneError, `status ${status}`)
				eq(e.name, 'BlobGoneError', 'name')
			},
			`status ${status}`,
		)
	}
})

await test('readBlob treats any other non-200 as a plain, retryable Error', async () => {
	for (const status of [201, 202, 204, 206, 400, 401, 403, 408, 429, 500, 502, 503, 504]) {
		const { stream, stats } = counted([bytes(5)])
		serve(() => new Response(status === 204 ? null : stream, { status }))
		await rejects(
			readBlob(GOOD_URL),
			(e) => {
				assert(e instanceof Error, 'not an Error')
				assert(
					!(e instanceof BlobGoneError) && !(e instanceof BlobUrlError) && !(e instanceof BlobTooLargeError),
					`status ${status} got a permanent class`,
				)
				assert(e.message.includes(String(status)), `message ${e.message}`)
			},
			`status ${status}`,
		)
		void stats
	}
})

await test('readBlob rejects an empty body (never hands back zero bytes)', async () => {
	serve(() => ok(new Uint8Array(0)))
	await rejects(readBlob(GOOD_URL), (e) => assert(e instanceof Error), 'empty bytes')
	serve(() => new Response(null, { status: 200 }))
	await rejects(readBlob(GOOD_URL), (e) => assert(e instanceof Error), 'null body')
	serve(() => ok(counted([new Uint8Array(0), new Uint8Array(0)]).stream, { 'content-length': '0' }))
	await rejects(readBlob(GOOD_URL), (e) => assert(e instanceof Error), 'empty chunks')
	serve(() => ok(bytes(0), { 'content-length': '0' }))
	await rejects(readBlob(GOOD_URL), (e) => assert(!(e instanceof BlobGoneError)), 'content-length 0')
})

await test('readBlob turns a network failure or a mid-body failure into a clean Error', async () => {
	process.env.BLOB_READ_WRITE_TOKEN = TOKEN
	try {
		globalThis.fetch = async () => {
			throw new TypeError(`fetch failed ${TOKEN}`)
		}
		await rejects(
			readBlob(GOOD_URL),
			(e) => {
				assert(e instanceof Error, 'not an Error')
				assert(!e.message.includes(TOKEN), 'leaks token')
				assert(!(e instanceof BlobGoneError) && !(e instanceof BlobUrlError), 'wrong class')
			},
			'network failure',
		)
		const { stream } = counted([bytes(5), bytes(5)], { failAfter: 1 })
		serve(() => ok(stream))
		await rejects(
			readBlob(GOOD_URL),
			(e) => {
				assert(e instanceof Error, 'not an Error')
				assert(!e.message.includes(TOKEN), 'leaks token')
			},
			'mid-body failure',
		)
	} finally {
		if (realToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
		else process.env.BLOB_READ_WRITE_TOKEN = realToken
	}
})

await test('readBlob stops a stream that is already past the cap on the first chunk', async () => {
	const source = counted([bytes(100), bytes(100), bytes(100)])
	serve(() => ok(source.stream))
	await rejects(
		readBlob(GOOD_URL, { maxBytes: 50 }),
		(e) => assert(e instanceof BlobTooLargeError),
		'readBlob',
	)
	eq(source.stats.pulled, 1, 'chunks pulled')
})

// ================================================================ headBlob

const headResult = (over = {}) => ({
	url: GOOD_URL,
	downloadUrl: `${GOOD_URL}?download=1`,
	pathname: `${PREFIX}photo-abc123.png`,
	size: 1234,
	contentType: 'image/png',
	contentDisposition: 'inline',
	cacheControl: 'public',
	uploadedAt: new Date(),
	etag: 'x',
	...over,
})

await test('headBlob returns the store answer, not the caller claim', async () => {
	sdk.head = async () => headResult({ size: 777, contentType: 'image/webp' })
	const info = await headBlob(GOOD_URL)
	eq(info.url, GOOD_URL, 'url')
	eq(info.pathname, `${PREFIX}photo-abc123.png`, 'pathname')
	eq(info.size, 777, 'size')
	eq(info.contentType, 'image/webp', 'contentType')
	eq(Object.keys(info).sort().join(','), 'contentType,pathname,size,url', 'shape')
	eq(calls.head.length, 1, 'head calls')
	eq(calls.head[0][0], GOOD_URL, 'head arg')
})

await test('headBlob accepts escaped and unicode paths that match the store pathname', async () => {
	const cases = [
		[`${HOST}/${PREFIX}a%20b.png`, `${PREFIX}a b.png`],
		[`${HOST}/${PREFIX}caf%C3%A9.png`, `${PREFIX}caf\u00e9.png`],
		[`${HOST}/${PREFIX}${encodeURI('猫.jpg')}`, `${PREFIX}猫.jpg`],
	]
	for (const [url, pathname] of cases) {
		sdk.head = async () => headResult({ url, pathname })
		eq((await headBlob(url)).pathname, pathname, 'pathname')
	}
})

await test('headBlob maps a missing blob to BlobGoneError', async () => {
	sdk.head = async () => {
		throw new BlobNotFoundError()
	}
	await rejects(
		headBlob(GOOD_URL),
		(e) => {
			assert(e instanceof BlobGoneError, 'not BlobGoneError')
			eq(e.name, 'BlobGoneError', 'name')
		},
		'headBlob',
	)
	// A second copy of the SDK has its own class; matching must not rely on identity.
	sdk.head = async () => {
		class BlobNotFoundError extends Error {}
		throw new BlobNotFoundError('Vercel Blob: The requested blob does not exist')
	}
	await rejects(headBlob(GOOD_URL), (e) => assert(e instanceof BlobGoneError), 'duplicate class')
})

await test('headBlob rejects a store answer about a different path (BlobUrlError)', async () => {
	const answers = [
		{ pathname: `${PREFIX}other.png` },
		{ pathname: `workspaces/${OTHER}/media/photo-abc123.png` },
		{ pathname: 'photo-abc123.png' },
		{ pathname: `${PREFIX}photo-abc123.png/` },
		{ pathname: `/${PREFIX}photo-abc123.png` },
		{ pathname: '' },
		{ pathname: undefined },
		{ pathname: null },
		{ pathname: 42 },
	]
	for (const answer of answers) {
		sdk.head = async () => headResult(answer)
		await rejects(
			headBlob(GOOD_URL),
			(e) => assert(e instanceof BlobUrlError, `${JSON.stringify(answer)}: ${e}`),
			JSON.stringify(answer),
		)
	}
	for (const nothing of [null, undefined, 'str', 0]) {
		sdk.head = async () => nothing
		await rejects(headBlob(GOOD_URL), (e) => assert(e instanceof BlobUrlError), String(nothing))
	}
})

await test('headBlob does not let a claim on another store stick', async () => {
	const claim = `https://zzzzzzz.public.blob.vercel-storage.com/${PREFIX}photo-abc123.png`
	// Store answers with ITS url; the claim named another store's host.
	sdk.head = async () => headResult({ url: GOOD_URL })
	await rejects(headBlob(claim), (e) => assert(e instanceof BlobUrlError), 'host mismatch')
	for (const url of [
		'https://evil.com/x.png',
		'http://s1abc23.public.blob.vercel-storage.com/x.png',
		'',
		undefined,
		null,
		`${HOST}/${PREFIX}other.png`,
		`${HOST}/${PREFIX}../photo-abc123.png`,
	]) {
		sdk.head = async () => headResult({ url })
		await rejects(headBlob(GOOD_URL), (e) => assert(e instanceof BlobUrlError), `result url ${url}`)
	}
})

await test('headBlob rejects a nonsensical size and tolerates a missing contentType', async () => {
	for (const size of [Number.NaN, -1, Number.POSITIVE_INFINITY, '12', null, undefined]) {
		sdk.head = async () => headResult({ size })
		await rejects(headBlob(GOOD_URL), (e) => assert(e instanceof Error), `size ${size}`)
	}
	sdk.head = async () => headResult({ size: 0 })
	eq((await headBlob(GOOD_URL)).size, 0, 'zero size is legal')
	sdk.head = async () => headResult({ contentType: undefined })
	eq((await headBlob(GOOD_URL)).contentType, '', 'contentType fallback')
})

await test('headBlob rethrows other store errors as plain Errors without the token', async () => {
	process.env.BLOB_READ_WRITE_TOKEN = 'plain-secret-without-a-recognisable-shape-9f8e7d'
	const secrets = [process.env.BLOB_READ_WRITE_TOKEN, TOKEN]
	try {
		class BlobServiceRateLimited extends Error {
			constructor() {
				super(`Vercel Blob: slow down ${secrets[0]} and ${TOKEN}`)
				this.token = TOKEN
				this.headers = { authorization: `Bearer ${TOKEN}` }
				this.cause = new Error(`inner ${TOKEN}`)
			}
		}
		const failures = [
			new BlobServiceRateLimited(),
			new Error(`Vercel Blob: Unauthorized ${TOKEN}`),
			Object.assign(new Error(`Authorization: Bearer ${TOKEN}`), { name: TOKEN }),
			`raw string ${TOKEN}`,
			{ message: TOKEN },
			null,
			undefined,
			new TypeError(`fetch failed: ${secrets[0]}`),
		]
		for (const failure of failures) {
			sdk.head = async () => {
				throw failure
			}
			await rejects(
				headBlob(GOOD_URL),
				(e) => {
					assert(e instanceof Error, 'not an Error')
					eq(e.constructor, Error, 'constructor is plain Error')
					assert(!(e instanceof BlobGoneError) && !(e instanceof BlobUrlError), 'wrong class')
					const everything = [
						e.message,
						e.name,
						e.stack ?? '',
						JSON.stringify(Object.getOwnPropertyNames(e).map((k) => String(e[k]))),
					].join('\n')
					for (const secret of secrets) assert(!everything.includes(secret), `leaks ${secret.slice(0, 12)}`)
					assert(!('cause' in e), 'carries a cause')
					assert(e.message.length > 0, 'empty message')
					assert(e.message.length <= 400, 'message not bounded')
				},
				String(failure),
			)
		}
	} finally {
		if (realToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
		else process.env.BLOB_READ_WRITE_TOKEN = realToken
	}
})

// ================================================================ deleteAllUnderPrefix

/** A store with real prefix + cursor paging and a del() that removes what it names. */
function makeStore(pathnames, pageSize = 3) {
	const store = {
		blobs: pathnames.map((pathname) => ({
			pathname,
			url: `${HOST}/${pathname}`,
			size: 1,
			uploadedAt: new Date(),
			downloadUrl: `${HOST}/${pathname}?download=1`,
			etag: 'e',
		})),
		listOptions: [],
		delArgs: [],
	}
	sdk.list = async (options) => {
		store.listOptions.push(options)
		const matching = store.blobs
			.filter((b) => b.pathname.startsWith(options.prefix ?? ''))
			.sort((a, b) => (a.pathname < b.pathname ? -1 : 1))
		const start = options.cursor ? Number(options.cursor) : 0
		const page = matching.slice(start, start + pageSize)
		const end = start + page.length
		return { blobs: page, hasMore: end < matching.length, cursor: end < matching.length ? String(end) : undefined }
	}
	sdk.del = async (arg) => {
		const urls = Array.isArray(arg) ? arg : [arg]
		store.delArgs.push(urls)
		store.blobs = store.blobs.filter((b) => !urls.includes(b.url))
	}
	return store
}

const mine = (n) => Array.from({ length: n }, (_, i) => `${PREFIX}img-${String(i).padStart(4, '0')}.png`)
const foreign = [
	`workspaces/${OTHER}/media/theirs-1.png`,
	`workspaces/${OTHER}/media/theirs-2.png`,
	`workspaces/${WS}x/media/lookalike.png`,
	`workspaces/${WS.slice(0, -1)}/media/shorter.png`,
	`workspaces/${WS}/other/not-media.png`,
	`workspaces/${WS}/media`,
	`sites/${WS}/hero.webp`,
	'sites/507f1f77bcf86cd799439011/hero-abc.webp',
	'loose.png',
]

await test('deleteAllUnderPrefix pages the list, deletes each page, and only touches the prefix', async () => {
	const store = makeStore([...mine(10), ...foreign], 3)
	const removed = await deleteAllUnderPrefix(WS)
	eq(removed, 10, 'removed')
	eq(store.blobs.length, foreign.length, 'blobs left')
	assert(
		store.blobs.every((b) => foreign.includes(b.pathname)),
		'something other than the foreign set remains',
	)
	assert(store.listOptions.length >= 4, `listed ${store.listOptions.length} pages for 10 blobs`)
	for (const options of store.listOptions) eq(options.prefix, PREFIX, 'list prefix')
	eq(store.listOptions[0].cursor, undefined, 'first cursor')
	// Every request after a sweep's first page carries the cursor the store handed back.
	const withCursor = store.listOptions.filter((o) => o.cursor !== undefined)
	assert(withCursor.length >= 3, 'later pages did not carry a cursor')
	assert(withCursor.every((o) => typeof o.cursor === 'string' && o.cursor !== ''), 'bad cursor')
	for (const urls of store.delArgs)
		for (const url of urls) assert(url.includes(`/${PREFIX}`), `deleted outside prefix: ${url}`)
	for (const [urls] of [[store.delArgs.flat()]]) eq(urls.length, 10, 'deleted urls')
})

await test('deleteAllUnderPrefix is idempotent and returns 0 for an empty prefix', async () => {
	const store = makeStore([...mine(7), ...foreign], 4)
	eq(await deleteAllUnderPrefix(WS), 7, 'first run')
	const delsAfterFirst = store.delArgs.length
	eq(await deleteAllUnderPrefix(WS), 0, 'second run')
	eq(store.delArgs.length, delsAfterFirst, 'second run deleted something')
	const empty = makeStore(foreign)
	eq(await deleteAllUnderPrefix(WS), 0, 'nothing of ours')
	eq(empty.delArgs.length, 0, 'del calls with nothing to delete')
	eq(empty.blobs.length, foreign.length, 'foreign blobs')
})

await test('deleteAllUnderPrefix batches a large library', async () => {
	const store = makeStore([...mine(450), ...foreign], 200)
	eq(await deleteAllUnderPrefix(WS), 450, 'removed')
	eq(store.blobs.length, foreign.length, 'blobs left')
	for (const urls of store.delArgs) assert(urls.length > 0 && urls.length <= 200, `batch of ${urls.length}`)
})

await test('deleteAllUnderPrefix never deletes what the store lists outside the prefix', async () => {
	const hostile = [
		...foreign.map((pathname) => ({ pathname, url: `${HOST}/${pathname}` })),
		{ pathname: `${PREFIX}ok.png`, url: `${HOST}/${PREFIX}ok.png` },
		{ pathname: `${PREFIX}../../${OTHER}/media/x.png`, url: `${HOST}/${PREFIX}../../${OTHER}/media/x.png` },
		{ pathname: `${PREFIX}%2e%2e/%2e%2e/x.png`, url: `${HOST}/${PREFIX}%2e%2e/%2e%2e/x.png` },
		{ pathname: `${PREFIX}ok2.png`, url: `${HOST}/workspaces/${OTHER}/media/theirs-1.png` },
		{ pathname: `${PREFIX}ok3.png`, url: 'https://evil.com/x.png' },
		{ pathname: `${PREFIX}ok4.png`, url: undefined },
		{ pathname: undefined, url: `${HOST}/${PREFIX}ok5.png` },
		null,
		'junk',
	]
	const live = new Set(hostile)
	sdk.list = async () => ({ blobs: [...live], hasMore: false })
	sdk.del = async (arg) => {
		for (const url of Array.isArray(arg) ? arg : [arg])
			for (const b of [...live]) if (b && b.url === url) live.delete(b)
	}
	const removed = await deleteAllUnderPrefix(WS)
	eq(removed, 1, 'removed')
	const deleted = calls.del.flatMap(([arg]) => (Array.isArray(arg) ? arg : [arg]))
	eq(deleted.join(','), `${HOST}/${PREFIX}ok.png`, 'deleted urls')
	assert(warnings.length >= 1, 'skipped blobs left no log line')
})

await test('deleteAllUnderPrefix keeps paging past a page of skipped blobs', async () => {
	const pages = [
		{ blobs: [{ pathname: 'sites/x/a.png', url: `${HOST}/sites/x/a.png` }], hasMore: true, cursor: 'c1' },
		{ blobs: [{ pathname: `${PREFIX}b.png`, url: `${HOST}/${PREFIX}b.png` }], hasMore: false },
	]
	let served = 0
	sdk.list = async (options) => {
		served++
		if (options.cursor === 'c1') return pages[1]
		return served <= 1 ? pages[0] : { blobs: [], hasMore: false }
	}
	eq(await deleteAllUnderPrefix(WS), 1, 'removed')
	assert(served >= 2, 'did not reach the second page')
})

await test('deleteAllUnderPrefix stops if the cursor does not advance', async () => {
	let listed = 0
	sdk.list = async () => {
		listed++
		return {
			blobs: [{ pathname: `${PREFIX}a-${listed}.png`, url: `${HOST}/${PREFIX}a-${listed}.png` }],
			hasMore: true,
			cursor: 'same',
		}
	}
	const removed = await deleteAllUnderPrefix(WS)
	assert(listed <= 60, `looped ${listed} times`)
	eq(removed, listed, 'removed')
	// And a missing cursor with hasMore must not loop either.
	listed = 0
	sdk.list = async () => {
		listed++
		return { blobs: [], hasMore: true }
	}
	eq(await deleteAllUnderPrefix(WS), 0, 'no cursor')
	eq(listed, 1, 'listed')
})

await test('deleteAllUnderPrefix refuses a malformed workspace id before any I/O', async () => {
	for (const id of ['', '..', 'a/b', '*', 'a b', undefined, null, 5]) {
		await rejects(deleteAllUnderPrefix(id), (e) => assert(e instanceof Error), String(id))
	}
	eq(calls.list.length, 0, 'list calls')
	eq(calls.del.length, 0, 'del calls')
})

await test('deleteAllUnderPrefix surfaces store failures without the token', async () => {
	process.env.BLOB_READ_WRITE_TOKEN = TOKEN
	try {
		sdk.list = async () => {
			throw new Error(`Vercel Blob: nope ${TOKEN}`)
		}
		await rejects(
			deleteAllUnderPrefix(WS),
			(e) => {
				assert(e instanceof Error, 'not an Error')
				assert(!e.message.includes(TOKEN) && !(e.stack ?? '').includes(TOKEN), 'leaks token')
			},
			'list failure',
		)
		makeStore(mine(3), 10)
		sdk.del = async () => {
			throw new Error(`Vercel Blob: nope ${TOKEN}`)
		}
		await rejects(
			deleteAllUnderPrefix(WS),
			(e) => assert(!e.message.includes(TOKEN) && !(e.stack ?? '').includes(TOKEN), 'leaks token'),
			'del failure',
		)
	} finally {
		if (realToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
		else process.env.BLOB_READ_WRITE_TOKEN = realToken
	}
})

await test('deleteAllUnderPrefix tolerates a batch that is already gone', async () => {
	const store = makeStore(mine(5), 10)
	sdk.del = async (arg) => {
		store.delArgs.push(arg)
		throw new BlobNotFoundError()
	}
	eq(await deleteAllUnderPrefix(WS), 0, 'nothing of ours to count')
})

await test('deleteAllUnderPrefix stays inside the prefix for a short id that prefixes another', async () => {
	const store = makeStore(['workspaces/abc/media/a.png', 'workspaces/abcd/media/b.png', 'workspaces/abc/media/c.png'])
	eq(await deleteAllUnderPrefix('abc'), 2, 'removed')
	eq(store.blobs.map((b) => b.pathname).join(','), 'workspaces/abcd/media/b.png', 'left')
})

// ================================================================ file names

await test('safeFilename table', () => {
	const table = [
		['photo.jpg', 'photo.jpg'],
		['My Photo.PNG', 'My Photo.PNG'],
		['  padded name.png  ', 'padded name.png'],
		['My  Photo \t\n 1.png', 'My Photo 1.png'],
		['a/b\\c.png', 'abc.png'],
		['C:\\fakepath\\photo.png', 'C:fakepathphoto.png'],
		['a\u0000b.png', 'ab.png'],
		['a\u001b[31mb.png', 'a[31mb.png'],
		['a\u202etxt.png', 'atxt.png'],
		['a\u2028b.png', 'ab.png'],
		['caf\u00e9 \u732b.png', 'caf\u00e9 \u732b.png'],
		['\u{1F468}\u200D\u{1F469}.png', '\u{1F468}\u200D\u{1F469}.png'],
		['a..b.png', 'a..b.png'],
		['.hidden.png', '.hidden.png'],
		['', 'image'],
		['   ', 'image'],
		['\t\n', 'image'],
		['///', 'image'],
		['\\\\', 'image'],
		['.', 'image'],
		['..', 'image'],
		['...', 'image'],
		['/../', 'image'],
		['\u0000\u0001\u0002', 'image'],
		['%2e%2e', '2e2e'],
		['%2E%2E', '2E2E'],
		['100%.png', '100%.png'],
	]
	for (const [input, expected] of table) eq(safeFilename(input), expected, JSON.stringify(input))
	for (const input of [null, undefined, 5, {}, [], ['a.png']]) eq(safeFilename(input), 'image', String(input))
})

await test('safeFilename caps at 255 and keeps the extension', () => {
	const longStem = 'a'.repeat(300)
	const a = safeFilename(`${longStem}.png`)
	eq(a.length, 255, 'length')
	assert(a.endsWith('.png'), 'extension lost')
	eq(a, `${'a'.repeat(251)}.png`, 'value')
	const b = safeFilename(longStem)
	eq(b.length, 255, 'no-extension length')
	const c = safeFilename(`${'x'.repeat(254)}.jpeg`)
	eq(c.length, 255, 'trimmed length')
	assert(c.endsWith('.jpeg'), 'jpeg lost')
	eq(safeFilename(`${'x'.repeat(250)}.png`), `${'x'.repeat(250)}.png`, 'under the cap is untouched')
	eq(safeFilename(`${'x'.repeat(251)}.png`).length, 255, 'exactly at the cap')
	eq(safeFilename(`${'x'.repeat(252)}.png`).length, 255, 'one over the cap')
	// Spaces right at the cut do not leave a ragged name.
	const spaced = safeFilename(`${'a'.repeat(250)} ${'b'.repeat(40)}.png`)
	assert(spaced.length <= 255 && spaced.endsWith('.png') && !spaced.includes(' .'), `spaced ${spaced.length}`)
	// An astral character at the boundary is not cut in half.
	const emoji = safeFilename(`${'\u{1F600}'.repeat(200)}.png`)
	assert(emoji.length <= 255, 'emoji length')
	assert(emoji.isWellFormed(), 'lone surrogate')
	assert(emoji.endsWith('.png'), 'emoji ext lost')
	const odd = safeFilename(`a${'\u{1F600}'.repeat(200)}.png`)
	assert(odd.isWellFormed() && odd.length <= 255, 'odd emoji boundary')
	// A silly "extension" is not preserved at the cost of the whole name.
	const silly = safeFilename(`short.${'e'.repeat(400)}`)
	assert(silly.length <= 255 && silly.length > 0, 'silly ext')
})

await test('safeFilename output is always acceptable to isOwnedPathname', () => {
	const alphabet = [
		'a', 'B', '1', ' ', '.', '..', '/', '\\', '%', '2e', '2E', '5c', '2f', '25', '%2e', '%25',
		'\u0000', '\n', '\t', '\u007f', '\u0085', '\u2028', '\u202e', '\u2066', '\u{1F600}', '\u200D',
		'caf\u00e9', '\u732b', '-', '_', '(', ')', '#', '?', '&', ':', '*', '"', '<', '>', '|',
	]
	let seed = 12345
	const rand = () => {
		seed = (seed * 1664525 + 1013904223) % 4294967296
		return seed / 4294967296
	}
	for (let i = 0; i < 4000; i++) {
		const length = Math.floor(rand() * 40)
		let input = ''
		for (let j = 0; j < length; j++) input += alphabet[Math.floor(rand() * alphabet.length)]
		if (rand() < 0.1) input += 'z'.repeat(Math.floor(rand() * 400))
		const result = safeFilename(input)
		assert(result.length > 0 && result.length <= 255, `length for ${JSON.stringify(input)}`)
		assert(result.isWellFormed(), `ill-formed for ${JSON.stringify(input)}`)
		assert(isOwnedPathname(`${PREFIX}${result}`, WS), `not owned: ${JSON.stringify(input)} -> ${JSON.stringify(result)}`)
		assert(result === result.trim(), `untrimmed: ${JSON.stringify(result)}`)
		assert(!/[\s]{2}/.test(result), `uncollapsed: ${JSON.stringify(result)}`)
	}
	for (const nested of ['%252e', '%25%2e', '%2525%2e', '%25252e%25252e', '%%2e2e', '%5%2cc'])
		assert(isOwnedPathname(`${PREFIX}${safeFilename(nested)}`, WS), `nested ${nested}`)
})

await test('nameFromFilename table', () => {
	const table = [
		['kitchen_remodel-2.JPG', 'kitchen remodel 2'],
		['photo.png', 'photo'],
		['IMG_1234.HEIC', 'IMG 1234'],
		['noextension', 'noextension'],
		['  spaced  .png', 'spaced'],
		['a  b   c.webp', 'a b c'],
		['a__b--c.gif', 'a b c'],
		['-_-lead.png', 'lead'],
		['trail_-_.png', 'trail'],
		['Caf\u00e9_\u00d1and\u00fa.webp', 'Caf\u00e9 \u00d1and\u00fa'],
		['\u732b_\u72d7.avif', '\u732b \u72d7'],
		['kitchen 2.5', 'kitchen 2.5'],
		['v1.2', 'v1.2'],
		['a/b.png', 'a b'],
		['a\\b.png', 'a b'],
		['a\u0000b.png', 'ab'],
		['a\u202eb.png', 'ab'],
		['Mixed.Case.Name.JPEG', 'Mixed.Case.Name'],
		['', 'Untitled'],
		['   ', 'Untitled'],
		['.png', 'Untitled'],
		['_', 'Untitled'],
		['___', 'Untitled'],
		['---.jpg', 'Untitled'],
		['_ - _', 'Untitled'],
		['\u0000', 'Untitled'],
	]
	for (const [input, expected] of table) eq(nameFromFilename(input), expected, JSON.stringify(input))
	for (const input of [null, undefined, 5, {}]) eq(nameFromFilename(input), 'Untitled', String(input))
})

await test('nameFromFilename is capped at MEDIA_LIMITS.nameMax and never ragged', () => {
	const long = nameFromFilename(`${'a'.repeat(300)}.png`)
	eq(long.length, MEDIA_LIMITS.nameMax, 'length')
	const exact = nameFromFilename(`${'b'.repeat(MEDIA_LIMITS.nameMax)}.png`)
	eq(exact.length, MEDIA_LIMITS.nameMax, 'exact')
	const spaced = nameFromFilename(`${'a'.repeat(MEDIA_LIMITS.nameMax - 1)}_${'b'.repeat(50)}.png`)
	assert(spaced.length <= MEDIA_LIMITS.nameMax && spaced === spaced.trim(), `spaced ${spaced.length}`)
	const emoji = nameFromFilename(`${'\u{1F600}'.repeat(300)}.png`)
	assert(emoji.length <= MEDIA_LIMITS.nameMax && emoji.isWellFormed(), 'emoji')
	let seed = 99
	const rand = () => {
		seed = (seed * 1664525 + 1013904223) % 4294967296
		return seed / 4294967296
	}
	const alphabet = ['a', ' ', '_', '-', '.', '/', '\\', '\u0000', '\u{1F600}', '.png', '.JPG', '\u2028', 'z'.repeat(80)]
	for (let i = 0; i < 3000; i++) {
		let input = ''
		for (let j = 0; j < Math.floor(rand() * 20); j++) input += alphabet[Math.floor(rand() * alphabet.length)]
		const name = nameFromFilename(input)
		assert(name.length > 0 && name.length <= MEDIA_LIMITS.nameMax, `length ${JSON.stringify(input)}`)
		assert(name === name.trim(), `untrimmed ${JSON.stringify(name)}`)
		assert(name.isWellFormed(), `ill-formed ${JSON.stringify(input)}`)
		assert(!/[\u0000-\u001f\u007f]/.test(name), 'control char in name')
	}
})

// ---------------------------------------------------------------- done

globalThis.fetch = realFetch
console.warn = realWarn
if (realToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
else process.env.BLOB_READ_WRITE_TOKEN = realToken

out('')
out(`${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
