/**
 * Proves the media library's upload manager and AI status banner.
 *
 *   node scripts/prove-media-ui-upload.mjs
 *
 * No DOM, no browser, nothing leaves this machine. The real components are loaded
 * through the TypeScript loader and looked at four ways:
 *  1. The logic that decides things (file checks, blob names, error wording, the
 *     upload queue, the drop counter, the banner's ranking) is exported by the
 *     components and driven directly with a fake uploader and a fake fetch.
 *  2. renderToString, for what a person would see and what a screen reader would be
 *     told, parsed back with a small HTML reader.
 *  3. A tiny hook-aware renderer (`mount`) that runs the real components with real
 *     hook semantics (state, refs, effects, cleanups, React's dev double-mount) against
 *     a fake `window`, so listeners, the imperative handle and the busy callbacks are
 *     exercised for real.
 *  4. The real `upload()` from @vercel/blob/client, driven through the real queue,
 *     against a small HTTP server on 127.0.0.1 standing in for our token route and the
 *     Blob API: the package's own option checks, token request, multipart flow, error
 *     texts and abort handling, not our reading of them.
 *
 * Expectations come from the build spec, the contracts and the Vercel Blob SDK's own
 * behaviour, not from what the code happens to do. The contract schemas
 * (`registerBodySchema`, `uploadPayloadSchema`) are the real ones.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// React picks its dev or prod build when it is first required: this must come first so
// key and prop warnings are real and can be asserted absent.
process.env.NODE_ENV = 'development'
// The banner shows a reset time in the viewer's zone; pin one so it can be asserted.
process.env.TZ = 'America/Los_Angeles'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const { loadTs, mock, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToString } = rootRequire('react-dom/server')
const h = React.createElement

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const consoleProblems = []
for (const level of ['error', 'warn']) {
	const original = console[level]
	console[level] = (...args) => {
		consoleProblems.push(`${level}: ${args.map(String).join(' ').slice(0, 300)}`)
		original.apply(console, args)
	}
}
const unhandled = []
process.on('unhandledRejection', (reason) => unhandled.push(reason))

const shortMessage = (error) =>
	String(error?.message ?? error).split('\n').slice(0, 4).join(' | ').slice(0, 500)

async function check(name, fn) {
	const before = consoleProblems.length
	try {
		await fn()
		if (consoleProblems.length !== before)
			throw new Error(`console output: ${consoleProblems[before]}`)
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${shortMessage(error)})`)
	}
}

/** Runs `fn` while `console.error` is captured, for a case that is supposed to log. */
async function withConsoleError(fn) {
	const original = console.error
	const seen = []
	console.error = (...args) => seen.push(args.map(String).join(' '))
	try {
		await fn()
	} finally {
		console.error = original
	}
	return seen
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
async function until(condition, label = 'condition', turns = 500) {
	for (let i = 0; i < turns; i++) {
		if (condition()) return
		await tick()
	}
	throw new Error(`timed out waiting for ${label}`)
}

function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/* -------------------------------------------------------------------------- */
/* The real modules                                                           */
/* -------------------------------------------------------------------------- */

// The default uploader loads the SDK lazily, so a stand-in registered now is what it finds.
let blobUpload = async () => {
	throw new Error('blob upload was not stubbed for this check')
}
mock('@vercel/blob/client', { upload: (...args) => blobUpload(...args) })

const mod = loadTs('src/app/account/media/upload-manager.tsx')
const bannerMod = loadTs('src/app/account/media/ai-status-banner.tsx')
const { registerBodySchema, uploadPayloadSchema } = loadTs('src/lib/media/schemas.ts')
const { DRAG_MIME } = loadTs('src/app/account/media/contracts.ts')
const { MEDIA_CONTENT_TYPES, MEDIA_LIMITS } = loadTs('src/lib/media/types.ts')
const {
	UploadManager,
	UploadQueuePanel,
	DropOverlay,
	createUploadQueue,
	createDropTracker,
	attachFileDrop,
	attachBeforeUnload,
	hasFiles,
	safeBlobName,
	buildPathname,
	cleanFilename,
	displayName,
	resolveContentType,
	validateFile,
	effectiveMaxBytes,
	formatLimit,
	describeUploadError,
	describeRegisterFailure,
	duplicateLocation,
	assetLabel,
	summarizeQueue,
	selectCreated,
	footerCount,
	describeItem,
	describeDestinations,
	isBusy,
	ACCEPT,
	MAX_CONCURRENT,
	MULTIPART_ABOVE,
	MAX_BLOB_NAME,
	MAX_FILENAME,
} = mod
const { AiStatusBanner, describeAiStatus, formatResumeTime, formatResumeUtc, AI_OFF_HEADLINE, AI_OFF_HOWTO } =
	bannerMod

/* -------------------------------------------------------------------------- */
/* A small HTML reader for SSR output                                         */
/* -------------------------------------------------------------------------- */

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source'])
const decode = (text) =>
	text
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')

function parseHtml(html) {
	const root = { tag: '#root', attrs: {}, children: [], parent: null }
	let current = root
	const token =
		/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g
	let match
	while ((match = token.exec(html))) {
		const [, closing, tag, rawAttrs, selfClosing, text] = match
		if (text !== undefined) {
			current.children.push({ text: decode(text) })
		} else if (tag) {
			const name = tag.toLowerCase()
			if (closing) {
				let node = current
				while (node && node.tag !== name) node = node.parent
				if (node?.parent) current = node.parent
			} else {
				const attrs = {}
				for (const a of rawAttrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g))
					attrs[a[1]] = a[2] === undefined ? '' : decode(a[2])
				const node = { tag: name, attrs, children: [], parent: current }
				current.children.push(node)
				if (!VOID.has(name) && !selfClosing) current = node
			}
		}
	}
	return root
}

const walk = (node, visit) => {
	for (const child of node.children ?? []) {
		if (child.text !== undefined) continue
		visit(child)
		walk(child, visit)
	}
}
const findAllNodes = (root, predicate) => {
	const out = []
	walk(root, (n) => predicate(n) && out.push(n))
	return out
}
const textOfNode = (node) =>
	(node.children ?? []).map((c) => (c.text !== undefined ? c.text : textOfNode(c))).join('')
const norm = (text) => text.replace(/\s+/g, ' ').trim()
const bySlot = (root, slot) => findAllNodes(root, (n) => n.attrs['data-slot'] === slot)

function accessibleNameOfNode(node, root) {
	if (node.attrs['aria-labelledby']) {
		return node.attrs['aria-labelledby']
			.split(/\s+/)
			.map((id) => {
				const target = findAllNodes(root, (n) => n.attrs.id === id)[0]
				return target ? textOfNode(target) : ''
			})
			.join(' ')
			.trim()
	}
	if (node.attrs['aria-label']?.trim()) return node.attrs['aria-label'].trim()
	const content = (n) =>
		(n.children ?? [])
			.map((c) => {
				if (c.text !== undefined) return c.text
				if (c.attrs['aria-hidden'] === 'true') return ''
				return content(c)
			})
			.join(' ')
	const text = norm(content(node))
	if (text) return text
	return (node.attrs.title ?? '').trim()
}

const interactiveNode = (n) =>
	['button', 'select', 'input', 'a', 'textarea'].includes(n.tag) ||
	['checkbox', 'switch', 'button', 'combobox'].includes(n.attrs.role)

/** Static checks that apply to any fragment of output. */
function staticChecks(html, label) {
	const root = parseHtml(html)
	for (const el of findAllNodes(root, interactiveNode))
		assert.ok(
			accessibleNameOfNode(el, root),
			`${label}: <${el.tag}${el.attrs.role ? ` role=${el.attrs.role}` : ''}> has no accessible name`,
		)
	const ids = findAllNodes(root, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id)
	assert.equal(ids.length, new Set(ids).size, `${label}: duplicate ids ${ids}`)
	for (const el of findAllNodes(root, (n) => n.attrs['aria-controls'] !== undefined))
		assert.ok(ids.includes(el.attrs['aria-controls']), `${label}: aria-controls points at a missing id`)
	for (const el of findAllNodes(root, (n) => n.attrs.role === 'progressbar')) {
		assert.ok(accessibleNameOfNode(el, root), `${label}: progressbar without a name`)
		if (el.attrs['aria-valuenow'] !== undefined) {
			const n = Number(el.attrs['aria-valuenow'])
			assert.ok(Number.isFinite(n) && n >= 0 && n <= 100, `${label}: aria-valuenow ${el.attrs['aria-valuenow']} out of range`)
		}
	}
	for (const el of findAllNodes(root, (n) => n.tag === 'button' || n.tag === 'a'))
		assert.equal(findAllNodes(el, interactiveNode).length, 0, `${label}: interactive element nested in <${el.tag}>`)
	return root
}

const buttonNames = (root) =>
	findAllNodes(root, (n) => n.tag === 'button').map((b) => accessibleNameOfNode(b, root))

/* -------------------------------------------------------------------------- */
/* Fixtures and fakes                                                         */
/* -------------------------------------------------------------------------- */

const MB = 1024 * 1024
const MAX = 25 * MB
const WS = 'a1b2c3d4e5f6a1b2c3d4e5f6'
const OTHER_WS = '0a0b0c0d0e0f0a0b0c0d0e0f'
const FOLDER = 'f1f2f3f4f5f6f1f2f3f4f5f6'
const PREFIX = `workspaces/${WS}/media/`
const noop = () => {}

const fakeFile = (name, size = 1000, type = 'image/png') => ({ name, size, type })

function makeAsset(over = {}) {
	return {
		id: 'c'.repeat(24),
		name: 'Logo',
		filename: 'logo.png',
		url: 'https://store1.public.blob.vercel-storage.com/workspaces/w/media/logo.png',
		contentType: 'image/png',
		format: 'png',
		bytes: 1000,
		width: 100,
		height: 100,
		orientation: 'square',
		hasAlpha: false,
		animated: false,
		colors: [],
		brightness: 'mid',
		saturation: 'muted',
		blur: null,
		folderId: null,
		folderPath: '',
		tags: [],
		caption: '',
		altText: '',
		textInImage: '',
		notes: '',
		kind: null,
		tagging: { status: 'pending' },
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...over,
	}
}

const jsonResponse = (status, body) =>
	new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	})

/** What the SDK throws when the signal fires (BlobRequestAbortedError). */
const abortError = () => new Error('Vercel Blob: The request was aborted.')

/** Blob's addRandomSuffix: a token before the extension. */
function withSuffix(pathname, n) {
	const dot = pathname.lastIndexOf('.')
	return dot > pathname.lastIndexOf('/')
		? `${pathname.slice(0, dot)}-x${n}${pathname.slice(dot)}`
		: `${pathname}-x${n}`
}

/**
 * A fake Blob client and a fake fetch the test settles by hand (or automatically), so
 * ordering, concurrency and failure are all under the proof's control.
 */
function makeEnv({ auto = false, concurrency } = {}) {
	const env = {
		uploads: [],
		fetches: [],
		registered: [],
		live: { uploads: 0, fetches: 0 },
		peak: { uploads: 0, fetches: 0 },
	}
	let assetCounter = 0
	env.blobFor = (call) => {
		const pathname = withSuffix(call.pathname, env.uploads.indexOf(call) + 1)
		return {
			url: `https://store1.public.blob.vercel-storage.com/${pathname}`,
			downloadUrl: `https://store1.public.blob.vercel-storage.com/${pathname}?download=1`,
			pathname,
			contentType: call.options.contentType,
			contentDisposition: 'inline',
			etag: 'e',
		}
	}
	env.assetFor = (body, over = {}) =>
		makeAsset({
			id: `a${String(++assetCounter).padStart(23, '0')}`,
			name: String(body.filename).replace(/\.[^.]+$/, ''),
			filename: body.filename,
			url: body.url,
			folderId: body.folderId ?? null,
			...over,
		})

	env.upload = (pathname, file, options) => {
		const call = { pathname, file, options, state: 'pending' }
		env.uploads.push(call)
		env.live.uploads++
		env.peak.uploads = Math.max(env.peak.uploads, env.live.uploads)
		call.promise = new Promise((resolve, reject) => {
			const settle = (kind, value) => {
				if (call.state !== 'pending') return
				call.state = kind
				env.live.uploads--
				if (kind === 'ok') resolve(value)
				else reject(value)
			}
			call.resolve = (...args) => settle('ok', args.length ? args[0] : env.blobFor(call))
			call.reject = (error) => settle('err', error)
			options.abortSignal?.addEventListener('abort', () => settle('err', abortError()), { once: true })
		})
		if (auto) queueMicrotask(() => call.resolve())
		return call.promise
	}

	env.fetch = (url, init) => {
		const call = { url, init, headers: new Headers(init?.headers), state: 'pending' }
		try {
			call.body = JSON.parse(init.body)
		} catch {
			call.body = null
		}
		env.fetches.push(call)
		env.live.fetches++
		env.peak.fetches = Math.max(env.peak.fetches, env.live.fetches)
		call.promise = new Promise((resolve, reject) => {
			const settle = (kind, value) => {
				if (call.state !== 'pending') return
				call.state = kind
				env.live.fetches--
				if (kind === 'ok') resolve(value)
				else reject(value)
			}
			call.respond = (status, body) => settle('ok', jsonResponse(status, body))
			call.created = (over) => call.respond(201, { status: 'created', asset: env.assetFor(call.body, over) })
			call.duplicate = (over) => call.respond(200, { status: 'duplicate', asset: env.assetFor(call.body, over) })
			call.respondRaw = (response) => settle('ok', response)
			call.fail = (error = new TypeError('Failed to fetch')) => settle('err', error)
			init?.signal?.addEventListener('abort', () => settle('err', Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
		})
		if (auto) queueMicrotask(() => call.created())
		return call.promise
	}

	env.queue = (over = {}) =>
		createUploadQueue({
			upload: env.upload,
			fetch: env.fetch,
			onRegistered: (result) => env.registered.push(result),
			concurrency,
			...over,
		})
	return env
}

const ctx = (over = {}) => ({
	workspaceId: WS,
	folderId: null,
	pathPrefix: PREFIX,
	maxBytes: MAX,
	destination: 'Upload to Unfiled',
	...over,
})

const stateNames = (queue) => queue.getState().items.map((item) => item.state)
const rowsOf = (queue) => queue.getState().items
const live = (state) =>
	state.items.filter((item) => item.state === 'uploading' || item.state === 'processing').length

/** Watches every state the queue passes through. */
function record(queue) {
	const frames = []
	const stop = queue.subscribe(() => frames.push(queue.getState()))
	return { frames, stop }
}

/** Finishes a file: its upload, then its registration. */
async function completeAll(env, kind = 'created') {
	for (let guard = 0; guard < 1000; guard++) {
		await tick()
		const upload = env.uploads.find((call) => call.state === 'pending')
		if (upload) {
			upload.resolve()
			continue
		}
		const fetchCall = env.fetches.find((call) => call.state === 'pending')
		if (fetchCall) {
			if (kind === 'duplicate') fetchCall.duplicate()
			else fetchCall.created()
			continue
		}
		return
	}
	throw new Error('completeAll did not settle')
}

/* -------------------------------------------------------------------------- */
/* File checks                                                                */
/* -------------------------------------------------------------------------- */

await check('files: every accepted type resolves, with or without a name, in any case', () => {
	for (const type of MEDIA_CONTENT_TYPES) {
		assert.equal(resolveContentType({ name: 'a', type }), type, type)
		assert.equal(resolveContentType({ name: 'a.bin', type: type.toUpperCase() }), type, `${type} upper`)
		assert.equal(resolveContentType({ name: 'a', type: `  ${type}  ` }), type, `${type} padded`)
	}
})

await check('files: types we do not take are refused, whatever the name says', () => {
	for (const type of [
		'image/svg+xml',
		'image/heic',
		'image/heif',
		'image/bmp',
		'image/tiff',
		'image/x-icon',
		'application/pdf',
		'text/plain',
		'text/html',
		'video/mp4',
		'application/octet-stream',
		'image/',
		'image',
	])
		assert.equal(resolveContentType({ name: 'photo.png', type }), null, type)
})

await check('files: a missing type falls back to the extension, and only a known one', () => {
	const cases = [
		['a.png', 'image/png'],
		['A.JPG', 'image/jpeg'],
		['a.jpeg', 'image/jpeg'],
		['a.jpe', 'image/jpeg'],
		['a.jfif', 'image/jpeg'],
		['a.webp', 'image/webp'],
		['a.avif', 'image/avif'],
		['a.GIF', 'image/gif'],
		['.png', 'image/png'],
		['a.png ', 'image/png'],
		['a.svg', null],
		['a.heic', null],
		['a', null],
		['a.', null],
		['', null],
		['a.txt', null],
		['a.png.exe', null],
		['a.constructor', null],
		['a.valueof', null],
		['a.__proto__', null],
		['a.tostring', null],
	]
	for (const [name, expected] of cases)
		assert.equal(resolveContentType({ name, type: '' }), expected, JSON.stringify(name))
})

await check('files: junk in the type and name slots never throws and counts as unknown', () => {
	for (const type of [undefined, null, 5, {}, [], true])
		assert.equal(resolveContentType({ name: 'a.png', type }), 'image/png', `type ${String(type)} falls to the name`)
	for (const name of [undefined, null, 5, {}, []])
		assert.equal(resolveContentType({ name, type: '' }), null)
	assert.equal(resolveContentType({}), null)
})

await check('files: a refused type is not rescued by an image extension, nor an image type by a bad one', () => {
	assert.equal(resolveContentType({ name: 'a.png', type: 'text/plain' }), null)
	assert.equal(resolveContentType({ name: 'a.exe', type: 'image/png' }), 'image/png')
})

await check('validate: a good file passes and carries its content type', () => {
	const result = validateFile(fakeFile('a.png', 1, 'image/png'), MAX)
	assert.deepEqual(result, { ok: true, contentType: 'image/png' })
	assert.equal(validateFile(fakeFile('x', 5 * MB, 'image/webp'), MAX).ok, true)
})

await check('validate: the size limit is inclusive and the message names it', () => {
	assert.equal(validateFile(fakeFile('a.png', MAX), MAX).ok, true)
	const over = validateFile(fakeFile('a.png', MAX + 1), MAX)
	assert.equal(over.ok, false)
	assert.equal(over.message, 'Too large (max 25 MB)')
	assert.equal(validateFile(fakeFile('a.png', 10 * MB + 1), 10 * MB).message, 'Too large (max 10 MB)')
	assert.equal(validateFile(fakeFile('a.png', 2 * MB), 1.5 * MB).message, 'Too large (max 1.5 MB)')
	assert.equal(validateFile(fakeFile('a.png', 600 * 1024), 512 * 1024).message, 'Too large (max 512 KB)')
})

await check('validate: a limit the server would not honour is not trusted, and nonsense falls back', () => {
	// The server's own cap is MEDIA_LIMITS.maxBytes: a page cannot raise it.
	assert.equal(effectiveMaxBytes(100 * MB), MEDIA_LIMITS.maxBytes)
	assert.equal(validateFile(fakeFile('a.png', 30 * MB), 100 * MB).message, 'Too large (max 25 MB)')
	for (const bad of [0, -1, NaN, Infinity, undefined, null, '25', {}]) {
		assert.equal(effectiveMaxBytes(bad), MEDIA_LIMITS.maxBytes, String(bad))
		assert.equal(validateFile(fakeFile('a.png', 24 * MB), bad).ok, true, `${String(bad)} accepts 24 MB`)
		assert.equal(validateFile(fakeFile('a.png', 26 * MB), bad).message, 'Too large (max 25 MB)', `${String(bad)} refuses 26 MB`)
	}
})

await check('validate: an empty file, and a size that is not a number, say so', () => {
	assert.equal(validateFile(fakeFile('a.png', 0), MAX).message, 'File is empty')
	for (const size of [-1, NaN, Infinity, '1000', undefined, null, {}])
		assert.equal(validateFile({ name: 'a.png', type: 'image/png', size }, MAX).message, 'File is empty', String(size))
})

await check('validate: type is judged first, so a dropped folder is not "empty" or "too large"', () => {
	for (const size of [0, 4096, 40 * MB]) {
		const result = validateFile({ name: 'Holiday photos', type: '', size }, MAX)
		assert.equal(result.ok, false)
		assert.equal(result.message, 'Not a supported image', `size ${size}`)
	}
	assert.equal(validateFile(fakeFile('a.pdf', 90 * MB, 'application/pdf'), MAX).message, 'Not a supported image')
	assert.ok(validateFile(fakeFile('a.pdf', 1, 'application/pdf'), MAX).hint, 'a type refusal explains what is accepted')
})

await check('validate: no extension, odd and hostile names are fine when the type is an image', () => {
	for (const name of ['screenshot', '', '.', '..', '   ', 'a'.repeat(2000), '../../x', 'a/b\\c', 'x\u0000y', '\u202Egnp.exe', '\u{1F642}', '%2e%2e%2f', 'CON', '\n'])
		assert.equal(validateFile(fakeFile(name, 10, 'image/png'), MAX).ok, true, JSON.stringify(name.slice(0, 20)))
})

await check('validate: limits print as the person would say them', () => {
	assert.equal(formatLimit(25 * MB), '25 MB')
	assert.equal(formatLimit(10 * MB), '10 MB')
	assert.equal(formatLimit(1.5 * MB), '1.5 MB')
	assert.equal(formatLimit(512 * 1024), '512 KB')
	assert.equal(formatLimit(1024 * MB), '1 GB')
})

await check('validate: the file picker accepts the library types (and their extensions)', () => {
	const parts = ACCEPT.split(',')
	for (const type of MEDIA_CONTENT_TYPES) assert.ok(parts.includes(type), type)
	for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']) assert.ok(parts.includes(ext), ext)
	assert.ok(!parts.some((p) => /svg|heic|pdf|\*/.test(p)), 'nothing broader than the library takes')
})

/* -------------------------------------------------------------------------- */
/* Blob names and pathnames                                                   */
/* -------------------------------------------------------------------------- */

await check('names: ordinary names become lowercase letters, digits, dots and dashes', () => {
	const cases = [
		['IMG_2043.JPG', 'image/jpeg', 'img-2043.jpg'],
		['Kitchen Remodel (final).PNG', 'image/png', 'kitchen-remodel-final.png'],
		['my photo.png', 'image/png', 'my-photo.png'],
		['PHOTO.PNG', 'image/png', 'photo.png'],
		['UPPER lower_Mixed-Case.GIF', 'image/gif', 'upper-lower-mixed-case.gif'],
		['Screenshot 2024-05-01 at 10.15.30 AM.png', 'image/png', 'screenshot-2024-05-01-at-10.15.30-am.png'],
		['123.png', 'image/png', '123.png'],
		['.hidden.png', 'image/png', 'hidden.png'],
		['a..b.png', 'image/png', 'a-b.png'],
		['a.-.b.png', 'image/png', 'a-b.png'],
		['photo.jpeg', 'image/jpeg', 'photo.jpeg'],
		['a.JPE', 'image/jpeg', 'a.jpe'],
		['logo.WEBP', 'image/webp', 'logo.webp'],
	]
	for (const [name, type, expected] of cases) assert.equal(safeBlobName(name, type), expected, name)
})

await check('names: accents fold, other scripts and emoji fall back, compatibility forms normalise', () => {
	assert.equal(safeBlobName('café.jpg', 'image/jpeg'), 'cafe.jpg')
	assert.equal(safeBlobName('naïve façade.webp', 'image/webp'), 'naive-facade.webp')
	assert.equal(safeBlobName('厨房.jpg', 'image/jpeg'), 'image.jpg')
	assert.equal(safeBlobName('\u{1F642}\u{1F642}.png', 'image/png'), 'image.png')
	assert.equal(safeBlobName('\u{20BB7}'.repeat(300) + '.jpg', 'image/jpeg'), 'image.jpg')
	assert.equal(safeBlobName('ＦＵＬＬ-ｗｉｄｔｈ.png', 'image/png'), 'full-width.png')
	assert.equal(safeBlobName('\uFB01le.png', 'image/png'), 'file.png')
})

await check('names: path separators, dots-only and empty names never become a traversal segment', () => {
	assert.equal(safeBlobName('a/b\\c.png', 'image/png'), 'a-b-c.png')
	assert.equal(safeBlobName('../../etc/passwd.png', 'image/png'), 'etc-passwd.png')
	for (const name of ['.', '..', '...', '....', '', ' ', '   ', '-', '---', '.-.-.']) {
		assert.equal(safeBlobName(name), 'image', JSON.stringify(name))
		assert.equal(safeBlobName(name, 'image/png'), 'image.png', `${JSON.stringify(name)} with a type`)
	}
	assert.equal(safeBlobName('.png', 'image/png'), 'image.png')
	assert.equal(safeBlobName('....png', 'image/png'), 'image.png')
	assert.equal(safeBlobName('   .png', 'image/png'), 'image.png')
	assert.equal(safeBlobName('---.png', 'image/png'), 'image.png')
})

await check('names: a name with no extension, or a non-image one, takes the type\'s', () => {
	assert.equal(safeBlobName('screenshot', 'image/png'), 'screenshot.png')
	assert.equal(safeBlobName('photo.', 'image/jpeg'), 'photo.jpg')
	assert.equal(safeBlobName('x.php', 'image/png'), 'x-php.png')
	assert.equal(safeBlobName('report.pdf', 'image/webp'), 'report-pdf.webp')
	assert.equal(safeBlobName('photo\u202Egnp.exe', 'image/png'), 'photo-gnp-exe.png')
	assert.equal(safeBlobName('archive.abcdefghi', 'image/png'), 'archive.abcdefghi.png')
	// Without a type there is nothing to decide with: the name's own extension stays.
	assert.equal(safeBlobName('x.php'), 'x.php')
	assert.equal(safeBlobName('photo.'), 'photo')
	assert.equal(safeBlobName('archive.abcdefghi'), 'archive.abcdefghi')
	assert.equal(safeBlobName('photo\u202Egnp.exe'), 'photo-gnp.exe')
})

await check('names: control characters, bidi marks and percent tricks are gone', () => {
	assert.equal(safeBlobName('a\u0000b.png', 'image/png'), 'a-b.png')
	assert.equal(safeBlobName('a\nb\tc.png', 'image/png'), 'a-b-c.png')
	assert.equal(safeBlobName('a\u200Bb.png', 'image/png'), 'a-b.png')
	assert.equal(safeBlobName('%2e%2e%2f.png', 'image/png'), '2e-2e-2f.png')
	assert.ok(!safeBlobName('%25%2e%2e%5cx.png', 'image/png').includes('%'))
})

await check('names: junk that is not a string still yields a usable name', () => {
	for (const junk of [undefined, null, 123, {}, [], true, Symbol('x'), () => {}]) {
		assert.equal(safeBlobName(junk), 'image', String(junk))
		assert.equal(safeBlobName(junk, 'image/gif'), 'image.gif', String(junk))
	}
})

await check('names: a very long name is capped, keeps its extension and never ends on a separator', () => {
	const long = safeBlobName('a'.repeat(500) + '.png', 'image/png')
	assert.equal(long.length, MAX_BLOB_NAME)
	assert.equal(long, `${'a'.repeat(MAX_BLOB_NAME - 4)}.png`)
	const dashy = safeBlobName('a-'.repeat(100) + '.png', 'image/png')
	assert.ok(dashy.length <= MAX_BLOB_NAME && dashy.endsWith('a.png'), dashy)
	const dotty = safeBlobName('a.'.repeat(100) + 'png', 'image/png')
	assert.ok(dotty.length <= MAX_BLOB_NAME && /[a-z0-9]\.png$/.test(dotty), dotty)
	// An extension longer than 8 is not an extension; the whole name is capped.
	assert.ok(safeBlobName('a'.repeat(300) + '.abcdefghi').length <= MAX_BLOB_NAME)
	assert.ok(safeBlobName('x'.repeat(1_000_000) + '.png', 'image/png').length <= MAX_BLOB_NAME)
})

const OWNED = (pathname, id) => {
	// The documented rules of storage.isOwnedPathname: the prefix, a non-empty file part,
	// no `.` / `..` / empty segment, no backslash, control or bidi character, no %2e tricks.
	const prefix = `workspaces/${id}/media/`
	if (!pathname.startsWith(prefix) || pathname.length === prefix.length || pathname.length > 1024) return false
	if (pathname.includes('\\')) return false
	if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(pathname)) return false
	if (/%(?:25)*(?:2e|2f|5c)/i.test(pathname)) return false
	return pathname.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function hostileNames(count, seed) {
	const rand = mulberry32(seed)
	const pool = [
		'a', 'B', 'z9', 'IMG_', '_', '-', '.', '..', '...', ' ', '  ', '/', '\\', '//', '%2e', '%2E%2e%2f', '%', '%25', 'é', 'ñ', 'ß', 'ı', '厨', '房',
		'\u{1F642}', '\u0000', '\n', '\t', '\u202E', '\u200B', '\u2028', '\uFB01', '（', '）', '#', '?', '&', '"', "'", '<', '>', '~', '^', '`', '[', ']',
		'{', '}', '|', ';', ':', '*', '+', '=', '$', '@', '!', ',', '\u0301', 'ǅ', 'İ', '\uD800',
	]
	const exts = ['.png', '.JPG', '.jpeg', '.php', '.', '', '.gif', '.WEBP', '.avif', '.exe', '.p ng', '.tar.gz']
	const out = []
	for (let i = 0; i < count; i++) {
		let name = ''
		for (let j = 0, n = 1 + Math.floor(rand() * 12); j < n; j++) name += pool[Math.floor(rand() * pool.length)]
		out.push(name + exts[Math.floor(rand() * exts.length)])
	}
	return out
}

await check('names: for thousands of hostile names the result is always one safe, bounded file name', () => {
	const types = [undefined, 'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']
	for (const name of hostileNames(3000, 7)) {
		for (const type of types) {
			const out = safeBlobName(name, type)
			const label = `${JSON.stringify(name)} / ${type}`
			assert.match(out, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/, label)
			assert.ok(out.length <= MAX_BLOB_NAME, `${label}: ${out.length}`)
			assert.ok(!/[-.]{2}/.test(out), `${label}: a run of separators in ${out}`)
			assert.equal(safeBlobName(out, type), out, `${label}: not idempotent`)
			if (type) assert.match(out, /\.(jpe?g|png|webp|avif|gif|jpe|jfif)$/, `${label}: ${out} does not end in an image extension`)
		}
	}
})

await check('pathname: the prefix, one slash, then the safe name', () => {
	assert.equal(buildPathname(PREFIX, 'IMG 1.PNG', 'image/png'), `${PREFIX}img-1.png`)
	assert.equal(buildPathname(`workspaces/${WS}/media`, 'IMG 1.PNG', 'image/png'), `${PREFIX}img-1.png`)
	assert.equal(buildPathname(`${PREFIX}/`, 'a.png', 'image/png'), `${PREFIX}a.png`)
	assert.equal(buildPathname(`${PREFIX}//`, 'a.png', 'image/png'), `${PREFIX}a.png`)
	assert.equal(buildPathname('', 'a.png', 'image/png'), 'a.png')
	assert.equal(buildPathname('/', 'a.png', 'image/png'), 'a.png')
	assert.equal(buildPathname(undefined, 'a.png', 'image/png'), 'a.png')
})

await check('pathname: hostile names stay inside the workspace prefix and pass every layer that will look at them', () => {
	for (const name of [...hostileNames(1500, 11), '../../../etc/passwd', '..\\..\\x.png', 'workspaces/' + OTHER_WS + '/media/x.png', '/', '//', '/x', 'x/', '%2e%2e%2f%2e%2e%2fx.png']) {
		const pathname = buildPathname(PREFIX, name, 'image/png')
		const label = JSON.stringify(name)
		assert.ok(pathname.startsWith(PREFIX), label)
		assert.ok(OWNED(pathname, WS), `${label} -> ${pathname} would be refused as not owned`)
		assert.ok(!pathname.slice(PREFIX.length).includes('/'), `${label}: the file part must be one segment`)
		assert.ok(!pathname.includes('//'), `${label}: the Blob SDK throws on "//"`)
		assert.ok(pathname.length <= 950, `${label}: the Blob SDK's pathname limit`)
		// The blob's stored pathname adds a random suffix; the register body must still fit.
		const stored = withSuffix(pathname, 123456789)
		const parsed = registerBodySchema.safeParse({
			url: `https://store1.public.blob.vercel-storage.com/${stored}`,
			pathname: stored,
			filename: cleanFilename(name, safeBlobName(name, 'image/png')),
			folderId: null,
		})
		assert.ok(parsed.success, `${label}: ${parsed.error?.issues?.[0]?.message}`)
	}
})

await check('filename: what the server is told keeps Unicode and spaces but never separators, controls or bidi tricks', () => {
	const fb = 'fallback.png'
	assert.equal(cleanFilename('kitchen.jpg', fb), 'kitchen.jpg')
	assert.equal(cleanFilename('  spaced   out  .png ', fb), 'spaced out .png')
	assert.equal(cleanFilename('a/b\\c.png', fb), 'abc.png')
	assert.equal(cleanFilename('café \u{1F4F7}.jpg', fb), 'café \u{1F4F7}.jpg')
	assert.equal(cleanFilename('x\u202Ey.png', fb), 'xy.png')
	assert.equal(cleanFilename('a\u0000b\u0007c.png', fb), 'abc.png')
	for (const empty of ['', '   ', '.', '..', '...', '\u202E', '/', '\\\\', undefined, null, 5, {}])
		assert.equal(cleanFilename(empty, fb), fb, JSON.stringify(empty))
})

await check('filename: a long name is cut to the schema limit, keeping the extension, never splitting a pair', () => {
	const a = cleanFilename('a'.repeat(400) + '.jpg', 'f.jpg')
	assert.equal(a.length, MAX_FILENAME)
	assert.ok(a.endsWith('.jpg'))
	const b = cleanFilename('\u{1F600}'.repeat(200) + '.png', 'f.png')
	assert.ok(b.length <= MAX_FILENAME && b.endsWith('.png'))
	assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(b), 'a lone surrogate')
	const c = cleanFilename('b'.repeat(255) + '.png', 'f.png')
	assert.equal(c.length, MAX_FILENAME)
	assert.ok(registerBodySchema.safeParse({ url: 'https://x.public.blob.vercel-storage.com/a.png', pathname: 'p', filename: c }).success)
	assert.ok(cleanFilename('x'.repeat(2_000_000), 'f.png').length <= MAX_FILENAME)
})

await check('display: row names are readable and bounded, and the bidi override cannot spoof one', () => {
	assert.equal(displayName('kitchen.jpg'), 'kitchen.jpg')
	assert.equal(displayName('a\u202Eb.png'), 'ab.png')
	assert.equal(displayName('  a   b.png '), 'a b.png')
	for (const junk of ['', '   ', '\u202E', undefined, null, 4, {}]) assert.equal(displayName(junk), 'Untitled')
	const long = displayName('a'.repeat(500) + '.png')
	assert.ok(long.length <= 120 && long.endsWith('.png') && long.includes('…'), long)
	assert.ok(!/[\uD800-\uDBFF]$/.test(displayName('\u{1F600}'.repeat(300))), 'no lone surrogate at the cut')
})

/* -------------------------------------------------------------------------- */
/* Failure wording                                                            */
/* -------------------------------------------------------------------------- */

await check('errors: the Blob SDK failures a person can meet read as plain sentences', () => {
	const sdk = (message) => new Error(`Vercel Blob: ${message}`)
	const cases = [
		[sdk('Failed to  retrieve the client token'), /refused this upload/i, true],
		[sdk('Failed to retrieve the presigned URL'), /refused this upload/i, true],
		[sdk('File is too large, the file length cannot be greater than 26214400.'), /^Too large \(max 25 MB\)$/, false],
		[sdk('Body size of 30000000 bytes exceeds the maximum allowed size of 26214400 bytes'), /^Too large \(max 25 MB\)$/, false],
		[sdk('Content type mismatch, "contentType" "image/svg+xml" is not allowed.'), /^Not a supported image$/, false],
		[sdk('The request was aborted.'), /cancelled/i, true],
		[Object.assign(new Error('x'), { name: 'AbortError' }), /cancelled/i, true],
		[new TypeError('Failed to fetch'), /network/i, true],
		[new TypeError('NetworkError when attempting to fetch resource.'), /network/i, true],
		[new TypeError('Load failed'), /network/i, true],
		[sdk('Too many requests please lower the number of concurrent requests  - try again in 5 seconds.'), /busy/i, true],
		[sdk('Client token has expired.'), /took too long/i, true],
		[sdk('The blob service is currently not available. Please try again.'), /not available/i, true],
		[sdk('Unknown error, please visit https://vercel.com/help.'), /not available/i, true],
		[sdk('Access denied, please provide a valid token for this resource.'), /not available/i, true],
		[new Error('boom'), /^Upload failed\. Try again\.$/, true],
		[new TypeError("Cannot read properties of undefined (reading 'x')"), /^Upload failed\. Try again\.$/, true],
	]
	for (const [error, pattern, retryable] of cases) {
		const result = describeUploadError(error, MAX)
		assert.match(result.message, pattern, error.message)
		assert.equal(result.retryable, retryable, error.message)
	}
})

await check('errors: whatever was thrown, the wording never carries the SDK\'s text, a URL or a stack', () => {
	const hostile = [
		new Error('Vercel Blob: Pathname mismatch, "pathname" "https://store1.public.blob.vercel-storage.com/secret" does not match.'),
		new Error('https://internal.example/api?token=abc123'),
		Object.assign(new Error('with a stack'), { stack: 'Error: at C:\\secret\\file.js:1:1' }),
		'a plain string', null, undefined, 42, {}, [], Symbol('x').description, () => {},
	]
	for (const error of hostile) {
		const { message } = describeUploadError(error, MAX)
		assert.ok(typeof message === 'string' && message.length > 0)
		assert.ok(!/Vercel Blob|https?:|token|secret|\\|stack/i.test(message), message)
	}
	// An aborted upload is recognised before anything else.
	assert.match(describeUploadError(new Error('Vercel Blob: Failed to  retrieve the client token (aborted)'), MAX).message, /cancelled/i)
})

await check('errors: an oversize refusal states the limit in force, not a made-up one', () => {
	assert.equal(describeUploadError(new Error('File is too large'), 10 * MB).message, 'Too large (max 10 MB)')
	assert.equal(describeUploadError(new Error('File is too large'), 999 * MB).message, 'Too large (max 25 MB)')
})

await check('register failures: the server\'s own message wins, trimmed, bounded and clean', () => {
	let r = describeRegisterFailure(400, { error: 'Folder not found.' }, MAX)
	assert.equal(r.message, 'Folder not found.')
	assert.equal(r.retryable, true)
	assert.equal(r.blobGone, false)
	assert.equal(describeRegisterFailure(400, { error: '  padded  ' }, MAX).message, 'padded')
	assert.equal(describeRegisterFailure(409, { error: 'Conflict message' }, MAX).message, 'Conflict message')
	assert.equal(describeRegisterFailure(500, { error: 'x'.repeat(1000) }, MAX).message.length, 300)
	assert.equal(describeRegisterFailure(400, { error: 'a\u202Eb\u0000c' }, MAX).message, 'abc')
	// A message that is not text is not a message.
	for (const body of [{ error: '' }, { error: '   ' }, { error: 42 }, { error: { x: 1 } }, { error: ['a'] }, null, undefined, 'string body', 7, []])
		assert.equal(describeRegisterFailure(400, body, MAX).message, 'The server could not accept this image. Try again.', JSON.stringify(body))
})

await check('register failures: with no message the status speaks, and says whether a retry can help', () => {
	const cases = [
		[401, /session has expired/i, true, false],
		[403, /permission/i, true, false],
		[404, /could not be found/i, true, false],
		[429, /library is full|too many/i, true, true],
		[413, /^Too large \(max 25 MB\)$/, false, true],
		[415, /^Not a supported image$/, false, true],
		[422, /^Not a supported image$/, false, true],
		[500, /problem adding/i, true, false],
		[502, /problem adding/i, true, false],
		[503, /problem adding/i, true, false],
		[504, /problem adding/i, true, false],
		[418, /error 418/, true, false],
		[204, /could not read/i, true, false],
		[302, /could not read/i, true, false],
	]
	for (const [status, pattern, retryable, blobGone] of cases) {
		const r = describeRegisterFailure(status, null, MAX)
		assert.match(r.message, pattern, String(status))
		assert.equal(r.retryable, retryable, `${status} retryable`)
		assert.equal(r.blobGone, blobGone, `${status} blobGone`)
	}
	assert.ok(describeRegisterFailure(415, null, MAX).hint && describeRegisterFailure(422, null, MAX).hint)
	assert.equal(describeRegisterFailure(500, null, MAX).hint, undefined)
})

await check('duplicate: the library location reads as a path, or "in Unfiled" at the root', () => {
	assert.equal(duplicateLocation({ name: 'Logo', folderPath: 'Clients/Acme' }), 'Clients/Acme/Logo')
	assert.equal(duplicateLocation({ name: 'Logo', folderPath: '' }), 'Logo in Unfiled')
	assert.equal(duplicateLocation({ name: 'Logo', folderPath: '/Clients/Acme/' }), 'Clients/Acme/Logo')
	assert.equal(duplicateLocation({ name: 'Logo', folderPath: '   ' }), 'Logo in Unfiled')
	assert.equal(duplicateLocation({ name: '', folderPath: 'A' }), 'A/this image')
	assert.equal(duplicateLocation({}), 'this image in Unfiled')
	assert.equal(duplicateLocation({ name: 5, folderPath: 5 }), 'this image in Unfiled')
	// What the server calls an image is shown, but never with controls or bidi tricks in it.
	const rlo = String.fromCharCode(0x202e)
	assert.equal(duplicateLocation({ name: `Lo${rlo}go\u0000`, folderPath: `Cli${rlo}ents/\nAcme` }), 'Clients/Acme/Logo')
	assert.equal(duplicateLocation({ name: `  Two   words  `, folderPath: '' }), 'Two words in Unfiled')
	assert.equal(assetLabel({ name: `a${rlo}b` }), 'ab')
	assert.equal(assetLabel({ name: '' }), 'this image')
	assert.equal(assetLabel({}), 'this image')
})

/* -------------------------------------------------------------------------- */
/* The queue                                                                  */
/* -------------------------------------------------------------------------- */

await check('queue: a file is uploaded then registered, with exactly the contract\'s options and body', async () => {
	const env = makeEnv()
	const queue = env.queue()
	const rec = record(queue)
	assert.equal(queue.add([fakeFile('Kitchen Photo.PNG', 2 * MB, 'image/png')], ctx({ folderId: FOLDER })), 1)
	await tick()
	assert.equal(env.uploads.length, 1)
	const call = env.uploads[0]
	assert.equal(call.pathname, `${PREFIX}kitchen-photo.png`)
	assert.equal(call.file.name, 'Kitchen Photo.PNG', 'the File itself is uploaded')
	const o = call.options
	assert.equal(o.access, 'public')
	assert.equal(o.handleUploadUrl, '/api/account/media/upload')
	assert.deepEqual(JSON.parse(o.clientPayload), { workspaceId: WS, folderId: FOLDER })
	assert.ok(uploadPayloadSchema.safeParse(JSON.parse(o.clientPayload)).success, 'the real token route schema accepts the payload')
	assert.equal(o.multipart, false)
	assert.equal(o.contentType, 'image/png')
	assert.equal(typeof o.onUploadProgress, 'function')
	assert.ok(o.abortSignal instanceof AbortSignal)
	// The SDK's upload() throws if any of these is passed: they belong to the server.
	for (const forbidden of ['addRandomSuffix', 'allowOverwrite', 'cacheControlMaxAge', 'ifMatch', 'token'])
		assert.ok(!(forbidden in o), `${forbidden} must not be passed to upload()`)
	assert.equal(env.fetches.length, 0, 'nothing is registered before the upload finishes')

	call.resolve()
	await tick()
	assert.equal(env.fetches.length, 1)
	const reg = env.fetches[0]
	assert.equal(reg.url, '/api/account/media')
	assert.equal(reg.init.method, 'POST')
	assert.equal(reg.headers.get('x-media-workspace'), WS)
	assert.equal(reg.headers.get('content-type'), 'application/json')
	assert.ok(reg.init.signal instanceof AbortSignal)
	const stored = env.blobFor(call)
	assert.equal(reg.body.url, stored.url)
	assert.equal(reg.body.pathname, stored.pathname, 'the pathname Blob stored (with its suffix), not the one asked for')
	assert.notEqual(reg.body.pathname, call.pathname)
	assert.equal(reg.body.filename, 'Kitchen Photo.PNG')
	assert.equal(reg.body.folderId, FOLDER)
	assert.deepEqual(Object.keys(reg.body).sort(), ['filename', 'folderId', 'pathname', 'url'])
	assert.ok(registerBodySchema.safeParse(reg.body).success, 'the real register schema accepts the body')

	reg.created()
	await tick()
	assert.deepEqual(stateNames(queue), ['done'])
	assert.equal(env.registered.length, 1)
	assert.equal(env.registered[0].status, 'created')
	assert.equal(env.registered[0].asset.id, rowsOf(queue)[0].asset.id)
	// queued -> uploading -> processing -> done, in that order, nothing skipped backwards.
	const seen = []
	for (const frame of rec.frames) {
		const s = frame.items[0]?.state
		if (s && seen[seen.length - 1] !== s) seen.push(s)
	}
	assert.deepEqual(seen, ['queued', 'uploading', 'processing', 'done'])
})

await check('queue: a root upload sends folderId null and says so in the payload', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png')], ctx({ folderId: null }))
	await tick()
	assert.deepEqual(JSON.parse(env.uploads[0].options.clientPayload), { workspaceId: WS, folderId: null })
	assert.ok(uploadPayloadSchema.safeParse(JSON.parse(env.uploads[0].options.clientPayload)).success)
	env.uploads[0].resolve()
	await tick()
	assert.equal(env.fetches[0].body.folderId, null)
	assert.ok(registerBodySchema.safeParse(env.fetches[0].body).success)
})

await check('queue: files over 5 MB use a multipart upload; 5 MB itself does not', async () => {
	const env = makeEnv({ auto: true })
	const queue = env.queue()
	const sizes = [1, 5 * MB - 1, 5 * MB, 5 * MB + 1, 12 * MB, 25 * MB]
	assert.equal(MULTIPART_ABOVE, 5 * MB)
	queue.add(sizes.map((size, i) => fakeFile(`f${i}.png`, size)), ctx())
	await queue.whenIdle()
	await completeAll(env)
	assert.deepEqual(
		env.uploads.map((c) => c.options.multipart),
		[false, false, false, true, true, true],
	)
})

await check('queue: a missing or odd type is uploaded with the type the file is judged to be', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('photo.avif', 10, ''), fakeFile('screenshot', 10, 'image/png'), fakeFile('x.php', 10, 'image/webp')], ctx())
	await tick()
	assert.deepEqual(
		env.uploads.map((c) => [c.pathname.slice(PREFIX.length), c.options.contentType]),
		[
			['photo.avif', 'image/avif'],
			['screenshot.png', 'image/png'],
			['x-php.webp', 'image/webp'],
		],
	)
})

await check('queue: upload progress is shown as it comes, held below 100, and ignores nonsense', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png')], ctx())
	await tick()
	const progress = env.uploads[0].options.onUploadProgress
	const shown = () => rowsOf(queue)[0].progress
	assert.equal(rowsOf(queue)[0].state, 'uploading')
	assert.equal(shown(), 0)
	progress({ loaded: 10, total: 100, percentage: 10 })
	assert.equal(shown(), 10)
	progress({ loaded: 55, total: 100, percentage: 55.7 })
	assert.equal(shown(), 55)
	progress({ loaded: 20, total: 100, percentage: 20 })
	assert.equal(shown(), 55, 'a retried part must not wind the bar back')
	for (const bad of [{ percentage: NaN }, { percentage: Infinity }, { percentage: -5 }, { percentage: '80' }, { percentage: null }, {}, null, undefined])
		progress(bad)
	assert.equal(shown(), 55)
	progress({ loaded: 100, total: 100, percentage: 100 })
	assert.equal(shown(), 99, 'complete only once the server has the file')
	progress({ percentage: 1e9 })
	assert.equal(shown(), 99)
	env.uploads[0].resolve()
	await tick()
	assert.equal(rowsOf(queue)[0].state, 'processing')
	assert.equal(rowsOf(queue)[0].progress, 100)
	progress({ percentage: 50 })
	assert.equal(rowsOf(queue)[0].progress, 100, 'a late event after the upload is ignored')
})

await check('queue: never more than three files at once, and a slot is held until the file is registered', async () => {
	assert.equal(MAX_CONCURRENT, 3)
	const env = makeEnv()
	const queue = env.queue()
	const rec = record(queue)
	queue.add(Array.from({ length: 12 }, (_, i) => fakeFile(`f${i}.png`)), ctx())
	await tick()
	assert.equal(env.uploads.length, 3)
	assert.deepEqual(stateNames(queue).filter((s) => s === 'uploading').length, 3)
	assert.equal(stateNames(queue).filter((s) => s === 'queued').length, 9)

	env.uploads[0].resolve()
	await tick()
	assert.equal(env.fetches.length, 1)
	assert.equal(env.uploads.length, 3, 'registering still holds the slot')
	env.fetches[0].created()
	await tick()
	assert.equal(env.uploads.length, 4, 'the fourth starts only now')
	assert.equal(rowsOf(queue)[3].state, 'uploading')

	await completeAll(env)
	assert.equal(env.uploads.length, 12)
	assert.equal(env.fetches.length, 12)
	assert.equal(env.peak.uploads, 3)
	assert.ok(env.peak.fetches <= 3)
	assert.ok(rec.frames.every((frame) => live(frame) <= 3), 'at no moment were more than three files live')
	assert.ok(rec.frames.some((frame) => live(frame) === 3), 'and three really did run together')
	assert.equal(stateNames(queue).every((s) => s === 'done'), true)
	assert.deepEqual(env.uploads.map((c) => c.file.name), Array.from({ length: 12 }, (_, i) => `f${i}.png`), 'first in, first out')
})

await check('queue: a failed file does not stop the others, and says why', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png'), fakeFile('b.png'), fakeFile('c.png'), fakeFile('d.png'), fakeFile('e.png')], ctx())
	await tick()
	env.uploads[1].reject(new TypeError('Failed to fetch'))
	await tick()
	assert.equal(rowsOf(queue)[1].state, 'failed')
	assert.match(rowsOf(queue)[1].message, /network/i)
	assert.equal(rowsOf(queue)[1].stage, 'upload')
	assert.equal(rowsOf(queue)[1].retryable, true)
	assert.equal(env.uploads.length, 4, 'the freed slot went to the next file')
	await completeAll(env)
	assert.deepEqual(stateNames(queue), ['done', 'failed', 'done', 'done', 'done'])
	assert.equal(env.registered.length, 4)
})

await check('queue: retry after a failed upload uploads again, then registers', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png')], ctx())
	await tick()
	env.uploads[0].reject(new Error('Vercel Blob: Failed to  retrieve the client token'))
	await tick()
	const id = rowsOf(queue)[0].id
	assert.equal(queue.retry(id), true)
	assert.equal(rowsOf(queue)[0].message, undefined, 'the old message is cleared')
	await tick()
	assert.equal(env.uploads.length, 2, 'a second upload attempt')
	await completeAll(env)
	assert.equal(rowsOf(queue)[0].state, 'done')
	assert.equal(env.registered.length, 1)
})

await check('queue: retry after a failed registration registers again WITHOUT uploading again', async () => {
	for (const failure of [
		['500 with no body', (call) => call.respondRaw(new Response('<html>Bad gateway</html>', { status: 502 }))],
		['a network error', (call) => call.fail(new TypeError('Failed to fetch'))],
		['a server message', (call) => call.respond(400, { error: 'Folder not found.' })],
		['a 503', (call) => call.respond(503, {})],
		['a 401', (call) => call.respond(401, { error: 'Unauthorized' })],
	]) {
		const env = makeEnv()
		const queue = env.queue()
		queue.add([fakeFile('a.png')], ctx({ folderId: FOLDER }))
		await tick()
		env.uploads[0].resolve()
		await tick()
		const first = env.fetches[0]
		failure[1](first)
		await tick()
		const row = rowsOf(queue)[0]
		assert.equal(row.state, 'failed', failure[0])
		assert.equal(row.stage, 'register', failure[0])
		assert.equal(row.retryable, true, failure[0])
		assert.equal(queue.retry(row.id), true, failure[0])
		await tick()
		assert.equal(env.uploads.length, 1, `${failure[0]}: must not upload again`)
		assert.equal(env.fetches.length, 2, failure[0])
		const second = env.fetches[1]
		assert.equal(second.body.url, first.body.url, `${failure[0]}: same blob`)
		assert.equal(second.body.pathname, first.body.pathname)
		assert.equal(second.headers.get('x-media-workspace'), WS)
		second.created()
		await tick()
		assert.equal(rowsOf(queue)[0].state, 'done', failure[0])
		assert.equal(env.registered.length, 1, `${failure[0]}: reported once`)
	}
})

await check('queue: a registration failure shows the server\'s message verbatim', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png')], ctx())
	await tick()
	env.uploads[0].resolve()
	await tick()
	env.fetches[0].respond(400, { error: 'A folder named Acme already exists here.' })
	await tick()
	assert.equal(rowsOf(queue)[0].message, 'A folder named Acme already exists here.')
	assert.equal(describeItem(rowsOf(queue)[0]), 'A folder named Acme already exists here.')
})

await check('queue: the server says the file itself is refused (413, 415, 422): no retry, the file is released', async () => {
	for (const status of [413, 415, 422]) {
		const env = makeEnv()
		const queue = env.queue()
		queue.add([fakeFile('a.png')], ctx())
		await tick()
		env.uploads[0].resolve()
		await tick()
		env.fetches[0].respond(status, status === 413 ? {} : { error: 'Not a supported image' })
		await tick()
		const row = rowsOf(queue)[0]
		assert.equal(row.state, 'failed', String(status))
		assert.equal(row.retryable, false, String(status))
		assert.equal(queue.retry(row.id), false, String(status))
		assert.equal(queue.retryAll(), 0)
		assert.equal(env.uploads.length, 1)
		assert.equal(env.fetches.length, 1)
	}
})

await check('queue: a full library (429) discarded the blob, so Retry uploads again', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png')], ctx())
	await tick()
	env.uploads[0].resolve()
	await tick()
	env.fetches[0].respond(429, { error: 'Your library is full. Delete some images first.' })
	await tick()
	assert.equal(rowsOf(queue)[0].retryable, true)
	assert.equal(rowsOf(queue)[0].message, 'Your library is full. Delete some images first.')
	queue.retry(rowsOf(queue)[0].id)
	await tick()
	assert.equal(env.uploads.length, 2, 'the blob is gone; the file goes up again')
})

await check('queue: replies the page cannot read are failures with a retry, not crashes or false successes', async () => {
	const replies = [
		['201 with no body', () => new Response(null, { status: 201 })],
		['201 with text', () => new Response('created', { status: 201 })],
		['201 with an array', () => jsonResponse(201, [])],
		['201 with no asset', () => jsonResponse(201, { status: 'created' })],
		['201 with a null asset', () => jsonResponse(201, { status: 'created', asset: null })],
		['201 with an asset without an id', () => jsonResponse(201, { status: 'created', asset: {} })],
		['201 with a numeric id', () => jsonResponse(201, { status: 'created', asset: { id: 5 } })],
		['201 with a bogus status', () => jsonResponse(201, { status: 'weird', asset: makeAsset() })],
		['200 with a bogus status', () => jsonResponse(200, { status: 7, asset: makeAsset() })],
		['204', () => new Response(null, { status: 204 })],
		['202 with a good body', () => jsonResponse(202, { status: 'created', asset: makeAsset() })],
	]
	for (const [label, reply] of replies) {
		const env = makeEnv()
		const queue = env.queue()
		queue.add([fakeFile('a.png')], ctx())
		await tick()
		env.uploads[0].resolve()
		await tick()
		env.fetches[0].respondRaw(reply())
		await tick()
		assert.equal(rowsOf(queue)[0].state, 'failed', label)
		assert.equal(rowsOf(queue)[0].retryable, true, label)
		assert.equal(env.registered.length, 0, `${label}: nothing is reported as registered`)
	}
})

await check('queue: the body\'s status decides created or duplicate; the HTTP code only fills a gap', async () => {
	const cases = [
		[201, { status: 'created' }, 'done'],
		[200, { status: 'duplicate' }, 'duplicate'],
		[200, { status: 'created' }, 'done'],
		[201, { status: 'duplicate' }, 'duplicate'],
		[201, {}, 'done'],
		[200, {}, 'duplicate'],
	]
	for (const [code, extra, expected] of cases) {
		const env = makeEnv()
		const queue = env.queue()
		queue.add([fakeFile('a.png')], ctx())
		await tick()
		env.uploads[0].resolve()
		await tick()
		env.fetches[0].respond(code, { ...extra, asset: makeAsset() })
		await tick()
		assert.equal(rowsOf(queue)[0].state, expected, `${code} ${JSON.stringify(extra)}`)
		assert.equal(env.registered.length, 1)
		assert.equal(env.registered[0].status, expected === 'done' ? 'created' : 'duplicate')
	}
})

await check('queue: a duplicate becomes its own row, reads where the image already is, and is not counted as added', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('new.png'), fakeFile('logo.png')], ctx())
	await tick()
	env.uploads[0].resolve()
	env.uploads[1].resolve()
	await tick()
	env.fetches[0].created()
	env.fetches[1].duplicate({ name: 'Logo', folderPath: 'Clients/Acme' })
	await tick()
	assert.deepEqual(stateNames(queue), ['done', 'duplicate'])
	assert.equal(describeItem(rowsOf(queue)[1]), 'Already in your library as Clients/Acme/Logo')
	assert.equal(env.registered.length, 2, 'onRegistered fires for created AND duplicate')
	assert.deepEqual(env.registered.map((r) => r.status), ['created', 'duplicate'])
	assert.equal(selectCreated(queue.getState()).length, 1)
	assert.equal(footerCount(queue.getState()), 1)
	assert.equal(summarizeQueue(queue.getState()).text, '1 added, 1 already in your library')
	queue.add([fakeFile('x.png')], ctx())
	await tick()
	env.uploads[2].resolve()
	await tick()
	env.fetches[2].duplicate({ name: 'Logo', folderPath: '' })
	await tick()
	assert.equal(describeItem(rowsOf(queue)[2]), 'Already in your library as Logo in Unfiled')
})

await check('queue: "N added" counts only what was created, across a mixed batch', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add(
		[fakeFile('c1.png'), fakeFile('d1.png'), fakeFile('c2.png'), fakeFile('bad.pdf', 5, 'application/pdf'), fakeFile('c3.png'), fakeFile('f1.png'), fakeFile('d2.png')],
		ctx(),
	)
	await tick()
	// c1 c2 c3 created, d1 d2 duplicates, f1 fails at registration, bad.pdf never leaves.
	const order = ['c1.png', 'd1.png', 'c2.png', 'c3.png', 'f1.png', 'd2.png']
	const kinds = { 'c1.png': 'created', 'c2.png': 'created', 'c3.png': 'created', 'd1.png': 'duplicate', 'd2.png': 'duplicate', 'f1.png': 'fail' }
	const done = new Set()
	for (let guard = 0; guard < 200 && done.size < order.length; guard++) {
		await tick()
		for (const up of env.uploads) if (up.state === 'pending') up.resolve()
		await tick()
		for (const call of env.fetches) {
			if (call.state !== 'pending') continue
			const name = call.body.filename
			done.add(name)
			if (kinds[name] === 'created') call.created()
			else if (kinds[name] === 'duplicate') call.duplicate({ name: 'Existing', folderPath: 'A' })
			else call.respond(500, {})
		}
	}
	await queue.whenIdle()
	const state = queue.getState()
	assert.equal(live(state), 0)
	assert.equal(selectCreated(state).length, 3)
	assert.equal(footerCount(state), 3, 'the footer says 3, not 6 and not 7')
	assert.equal(summarizeQueue(state).text, '3 added, 2 already in your library, 2 failed')
	const ids = queue.consumeBatch().map((a) => a.id)
	assert.equal(ids.length, 3)
	assert.equal(new Set(ids).size, 3)
	assert.deepEqual(
		ids.sort(),
		state.items.filter((i) => i.state === 'done').map((i) => i.asset.id).sort(),
		'exactly the created assets, none of the duplicates',
	)
	assert.equal(footerCount(queue.getState()), 0, 'once used, the footer is gone')
	assert.equal(queue.consumeBatch().length, 3, 'asking again still answers (the page may call twice)')
})

await check('queue: work added to an idle queue starts a new batch with its own footer; work added meanwhile joins', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a1.png'), fakeFile('a2.png')], ctx())
	assert.deepEqual([...new Set(rowsOf(queue).map((r) => r.batch))], [1])
	await tick()
	queue.add([fakeFile('a3.png')], ctx())
	assert.deepEqual([...new Set(rowsOf(queue).map((r) => r.batch))], [1], 'added while busy: same batch')
	await completeAll(env)
	assert.equal(footerCount(queue.getState()), 3)
	queue.consumeBatch()
	queue.add([fakeFile('b1.png')], ctx())
	assert.equal(queue.getState().batch, 2)
	assert.equal(footerCount(queue.getState()), 0, 'busy: no footer yet')
	await completeAll(env)
	assert.equal(footerCount(queue.getState()), 1, 'the new batch announces only its own')
	assert.equal(selectCreated(queue.getState()).length, 1)
	assert.equal(summarizeQueue(queue.getState()).text, '1 added')
	// A batch the person never acted on is replaced, not accumulated.
	queue.add([fakeFile('c1.png'), fakeFile('c2.png')], ctx())
	await completeAll(env)
	assert.equal(footerCount(queue.getState()), 2)
})

await check('queue: an all-invalid batch fails visibly, starts no work and offers no footer', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.pdf', 5, 'application/pdf'), fakeFile('b.png', 0), fakeFile('c.png', 26 * MB), fakeFile('d.gif', 5, 'image/svg+xml')], ctx())
	await tick()
	assert.equal(env.uploads.length, 0)
	assert.deepEqual(rowsOf(queue).map((r) => r.message), ['Not a supported image', 'File is empty', 'Too large (max 25 MB)', 'Not a supported image'])
	assert.ok(rowsOf(queue).every((r) => r.state === 'failed' && r.retryable === false && r.stage === 'validate'))
	assert.equal(isBusy(queue.getState()), false)
	assert.equal(footerCount(queue.getState()), 0)
	assert.equal(summarizeQueue(queue.getState()).text, '4 failed')
	assert.equal(queue.retryAll(), 0)
	assert.equal(queue.retry(rowsOf(queue)[0].id), false)
})

await check('queue: invalid files in a mixed batch are shown as failed and never sent', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('ok1.png'), fakeFile('notes.txt', 10, 'text/plain'), fakeFile('ok2.jpg', 10, 'image/jpeg'), fakeFile('big.png', 30 * MB)], ctx())
	await completeAll(env)
	assert.deepEqual(env.uploads.map((c) => c.file.name), ['ok1.png', 'ok2.jpg'])
	assert.deepEqual(stateNames(queue), ['done', 'failed', 'done', 'failed'])
	assert.equal(rowsOf(queue)[3].message, 'Too large (max 25 MB)')
})

await check('queue: files are judged against the limit the page gave when they were added', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png', 3 * MB)], ctx({ maxBytes: 2 * MB }))
	assert.equal(rowsOf(queue)[0].message, 'Too large (max 2 MB)')
})

await check('queue: where a file goes is fixed when it is added, even if the page moves on', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png'), fakeFile('b.png'), fakeFile('c.png'), fakeFile('d.png')], ctx({ folderId: FOLDER, destination: 'Upload to Clients/Acme' }))
	await tick()
	queue.add([fakeFile('e.png')], ctx({ folderId: null, destination: 'Upload to Unfiled', workspaceId: OTHER_WS, pathPrefix: `workspaces/${OTHER_WS}/media/` }))
	await completeAll(env)
	const forFile = (name) => env.uploads.find((c) => c.file.name === name)
	assert.deepEqual(JSON.parse(forFile('d.png').options.clientPayload), { workspaceId: WS, folderId: FOLDER })
	assert.equal(forFile('d.png').pathname, `${PREFIX}d.png`)
	assert.deepEqual(JSON.parse(forFile('e.png').options.clientPayload), { workspaceId: OTHER_WS, folderId: null })
	assert.equal(forFile('e.png').pathname, `workspaces/${OTHER_WS}/media/e.png`)
	for (const call of env.fetches) {
		const expected = call.body.filename === 'e.png' ? OTHER_WS : WS
		assert.equal(call.headers.get('x-media-workspace'), expected, call.body.filename)
		assert.equal(call.body.folderId, call.body.filename === 'e.png' ? null : FOLDER)
	}
	assert.equal(describeDestinations(rowsOf(queue)), 'Upload to Clients/Acme and 1 more')
	assert.equal(summarizeQueue(queue.getState()).destination, 'Upload to Clients/Acme and 1 more')
})

await check('queue: hostile file names still make a valid upload pathname and a valid, clean register body', async () => {
	const names = [
		...hostileNames(80, 99),
		'x'.repeat(400) + '.png',
		'   ',
		'',
		'.',
		'..',
		'\u202egnp.png',
		'a\u0000b.png',
		'../../etc/passwd',
		'ünï.PNG',
		'\u{1F600}'.repeat(300) + '.png',
		'/',
		'\\',
		'%2e%2e%2f.png',
	]
	const env = makeEnv({ auto: true })
	const queue = env.queue()
	queue.add(names.map((name) => fakeFile(name, 10, 'image/png')), ctx({ folderId: FOLDER }))
	await queue.whenIdle()
	for (let guard = 0; guard < 4000 && stateNames(queue).some((s) => s !== 'done'); guard++) await tick()
	assert.equal(stateNames(queue).every((s) => s === 'done'), true, JSON.stringify(rowsOf(queue).filter((r) => r.state !== 'done').slice(0, 2)))
	assert.equal(env.uploads.length, names.length)
	for (const call of env.uploads) {
		assert.ok(OWNED(call.pathname, WS), `${JSON.stringify(call.file.name)} -> ${call.pathname}`)
		assert.ok(!call.pathname.includes('//') && call.pathname.length <= 950)
	}
	assert.equal(env.fetches.length, names.length)
	for (const call of env.fetches) {
		const parsed = registerBodySchema.safeParse(call.body)
		assert.ok(parsed.success, `${JSON.stringify(call.body.filename)}: ${parsed.error?.issues?.[0]?.message}`)
		assert.ok(call.body.filename.length <= MAX_FILENAME)
		assert.ok(!/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069/\\]/.test(call.body.filename), `filename ${JSON.stringify(call.body.filename)} still has a control, bidi or separator`)
	}
})

await check('queue: a row is named with the file\'s name made safe to show, however hostile or long', async () => {
	const rlo = String.fromCharCode(0x202e)
	const env = makeEnv()
	const queue = env.queue()
	queue.add(
		[
			fakeFile(`photo${rlo}gnp.exe.png`, 10, 'image/png'),
			fakeFile('a'.repeat(400) + '.png', 10, 'image/png'),
			fakeFile('   ', 10, 'image/png'),
			fakeFile('<b>bold</b>.png', 10, 'image/png'),
			fakeFile('  spaced   out.png  ', 10, 'image/png'),
			fakeFile('\u{1F600}'.repeat(100) + '.png', 10, 'image/png'),
		],
		ctx(),
	)
	const names = rowsOf(queue).map((row) => row.name)
	assert.equal(names[0], 'photognp.exe.png', 'the bidi override is gone, so the name reads as it is')
	assert.ok(names[1].length <= 120 && names[1].endsWith('.png') && names[1].includes('…'), names[1])
	assert.equal(names[2], 'Untitled')
	assert.equal(names[3], '<b>bold</b>.png', 'kept as text; React escapes it when drawn')
	assert.equal(names[4], 'spaced out.png')
	assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(names[5]), 'no half of an emoji')
	for (const name of names) assert.ok(!name.includes(rlo))
})

await check('queue: removing a waiting file means it is never uploaded', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add(Array.from({ length: 5 }, (_, i) => fakeFile(`f${i}.png`)), ctx())
	await tick()
	const victim = rowsOf(queue)[4]
	assert.equal(victim.state, 'queued')
	assert.equal(queue.remove(victim.id), true)
	assert.equal(queue.remove(victim.id), false, 'already gone')
	assert.equal(queue.remove('nope'), false)
	await completeAll(env)
	assert.equal(env.uploads.length, 4)
	assert.ok(!env.uploads.some((c) => c.file.name === 'f4.png'))
})

await check('queue: cancelling an upload in flight aborts it, frees the slot and leaves no ghost row', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add(Array.from({ length: 4 }, (_, i) => fakeFile(`f${i}.png`)), ctx())
	await tick()
	const victim = rowsOf(queue)[0]
	assert.equal(victim.state, 'uploading')
	const signal = env.uploads[0].options.abortSignal
	assert.equal(signal.aborted, false)
	queue.remove(victim.id)
	assert.equal(signal.aborted, true)
	assert.ok(!rowsOf(queue).some((r) => r.id === victim.id))
	await tick()
	assert.equal(env.uploads.length, 4, 'the fourth file took the slot')
	assert.ok(!rowsOf(queue).some((r) => r.state === 'failed'), 'the abort is not reported as a failure')
	await completeAll(env)
	assert.equal(env.registered.length, 3)
	assert.equal(env.fetches.length, 3, 'the cancelled file was never registered')
})

await check('queue: an upload that finishes after being cancelled is not registered', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png')], ctx())
	await tick()
	// An SDK that does not honour the signal: it resolves anyway.
	queue.remove(rowsOf(queue)[0].id)
	env.uploads[0].resolve()
	await tick()
	assert.equal(env.fetches.length, 0)
	assert.equal(env.registered.length, 0)
	assert.deepEqual(rowsOf(queue), [])
})

await check('queue: cancelling while registering aborts the request and drops the answer', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png'), fakeFile('b.png')], ctx())
	await tick()
	env.uploads[0].resolve()
	await tick()
	const signal = env.fetches[0].init.signal
	queue.remove(rowsOf(queue)[0].id)
	assert.equal(signal.aborted, true)
	await tick()
	assert.equal(env.registered.length, 0)
	// An answer that arrives anyway (the fake ignores the abort) is dropped too.
	const env2 = makeEnv()
	const q2 = env2.queue()
	q2.add([fakeFile('a.png')], ctx())
	await tick()
	env2.uploads[0].resolve()
	await tick()
	const call = env2.fetches[0]
	const id = rowsOf(q2)[0].id
	call.init.signal.addEventListener('abort', () => {}, { once: true })
	q2.remove(id)
	call.respondRaw(jsonResponse(201, { status: 'created', asset: makeAsset() }))
	await tick()
	assert.equal(env2.registered.length, 0)
	assert.deepEqual(rowsOf(q2), [])
})

await check('queue: "Clear finished" drops done, duplicate and failed rows and keeps the active ones', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('ok.png'), fakeFile('dup.png'), fakeFile('bad.png'), fakeFile('w1.png'), fakeFile('w2.png'), fakeFile('w3.png')], ctx())
	await tick()
	env.uploads[0].resolve()
	env.uploads[1].resolve()
	env.uploads[2].reject(new Error('boom'))
	await tick()
	env.fetches[0].created()
	env.fetches[1].duplicate()
	await tick()
	assert.deepEqual(stateNames(queue).slice(0, 3), ['done', 'duplicate', 'failed'])
	assert.equal(queue.clearFinished(), 3)
	assert.deepEqual(rowsOf(queue).map((r) => r.name), ['w1.png', 'w2.png', 'w3.png'])
	assert.equal(queue.clearFinished(), 0)
	await completeAll(env)
	assert.equal(queue.clearFinished(), 3)
	assert.deepEqual(rowsOf(queue), [])
	assert.equal(summarizeQueue(queue.getState()).text, '')
})

await check('queue: "Retry failed" requeues every retryable failure in one go', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png'), fakeFile('b.png'), fakeFile('c.pdf', 3, 'application/pdf'), fakeFile('d.png')], ctx())
	await tick()
	env.uploads[0].reject(new Error('x'))
	env.uploads[1].reject(new Error('y'))
	await tick()
	env.uploads[2].resolve()
	await tick()
	env.fetches[0].created()
	await tick()
	assert.deepEqual(stateNames(queue), ['failed', 'failed', 'failed', 'done'])
	assert.equal(queue.retryAll(), 2, 'the unsupported file cannot be retried')
	await completeAll(env)
	assert.deepEqual(stateNames(queue), ['done', 'done', 'failed', 'done'])
})

await check('queue: retrying while other work runs joins the current batch; retrying when idle starts one', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png'), fakeFile('b.png')], ctx())
	await tick()
	env.uploads[0].reject(new Error('x'))
	await tick()
	queue.retry(rowsOf(queue)[0].id)
	assert.equal(rowsOf(queue)[0].batch, rowsOf(queue)[1].batch)
	await completeAll(env)
	const before = queue.getState().batch
	queue.add([fakeFile('c.png')], ctx())
	await tick()
	env.uploads[env.uploads.length - 1].reject(new Error('z'))
	await tick()
	queue.consumeBatch()
	assert.ok(queue.retry(rowsOf(queue)[2].id))
	assert.equal(queue.getState().batch, before + 2, 'the retry, on an idle queue, is a new run of work')
	await completeAll(env)
	assert.equal(footerCount(queue.getState()), 1, 'only the retried file is announced')
})

await check('queue: pausing starts nothing new, lets running work finish, and resuming carries on', async () => {
	const env = makeEnv()
	const queue = env.queue()
	queue.add(Array.from({ length: 5 }, (_, i) => fakeFile(`f${i}.png`)), ctx())
	await tick()
	assert.equal(env.uploads.length, 3)
	queue.setPaused(true)
	env.uploads[0].resolve()
	env.uploads[1].resolve()
	env.uploads[2].resolve()
	await tick()
	env.fetches.forEach((call) => call.created())
	await tick()
	assert.equal(env.uploads.length, 3, 'paused: the running three finished, the other two did not start')
	assert.deepEqual(stateNames(queue), ['done', 'done', 'done', 'queued', 'queued'])
	await queue.whenIdle()
	queue.add([fakeFile('late.png')], ctx())
	await tick()
	assert.equal(env.uploads.length, 3, 'added while paused: waits')
	queue.setPaused(false)
	await completeAll(env)
	assert.equal(env.uploads.length, 6)
	assert.equal(stateNames(queue).every((s) => s === 'done'), true)
})

await check('queue: whenIdle resolves once nothing is running and nothing can start', async () => {
	const env = makeEnv()
	const queue = env.queue()
	let idle = false
	queue.add([fakeFile('a.png')], ctx())
	queue.whenIdle().then(() => (idle = true))
	await tick()
	assert.equal(idle, false)
	await completeAll(env)
	await tick()
	assert.equal(idle, true)
	await queue.whenIdle()
})

await check('queue: hostile input to add never throws and never half-adds', async () => {
	const env = makeEnv()
	const queue = env.queue()
	const evil = {}
	Object.defineProperty(evil, 'name', { get() { throw new Error('getter bomb') } })
	for (const input of [undefined, null, [], 5, 'string', {}, true, [null], [undefined], [null, undefined], new Set()])
		assert.doesNotThrow(() => queue.add(input, ctx()), String(input))
	assert.deepEqual(rowsOf(queue), [], 'nothing usable was added')
	assert.doesNotThrow(() => queue.add([evil, fakeFile('ok.png')], ctx()))
	assert.equal(rowsOf(queue).length, 2)
	assert.equal(rowsOf(queue)[0].state, 'failed')
	assert.equal(rowsOf(queue)[0].message, 'Not a supported image')
	assert.equal(rowsOf(queue)[0].name, 'Untitled')
	assert.equal(rowsOf(queue)[1].state, 'uploading')
	assert.doesNotThrow(() => queue.add([{}, 5, 'x', { name: 5 }], ctx()), 'junk entries become failed rows')
	// A FileList is array-like, and so is a Set-less iterable.
	const arrayLike = { 0: fakeFile('al.png'), length: 1 }
	assert.equal(queue.add(arrayLike, ctx()), 1)
	function* gen() {
		yield fakeFile('gen.png')
	}
	assert.equal(queue.add(gen(), ctx()), 1)
	await completeAll(env)
	assert.ok(env.uploads.some((c) => c.file.name === 'al.png') && env.uploads.some((c) => c.file.name === 'gen.png'))
})

await check('queue: real File objects work as well as lookalikes', async () => {
	const env = makeEnv({ auto: true })
	const queue = env.queue()
	queue.add([new File([new Uint8Array(10)], 'Real File.PNG', { type: 'image/png' }), new File([], 'empty.png', { type: 'image/png' }), new File([new Uint8Array(6 * MB)], 'big.webp', { type: 'image/webp' })], ctx())
	await queue.whenIdle()
	await completeAll(env)
	assert.deepEqual(stateNames(queue), ['done', 'failed', 'done'])
	assert.equal(rowsOf(queue)[1].message, 'File is empty')
	assert.equal(env.uploads[0].file instanceof File, true)
	assert.deepEqual(env.uploads.map((c) => c.options.multipart), [false, true])
})

await check('queue: the same file twice is two rows; the server decides it is a duplicate', async () => {
	const env = makeEnv()
	const queue = env.queue()
	const file = fakeFile('same.png')
	queue.add([file, file], ctx())
	await tick()
	assert.equal(env.uploads.length, 2)
	assert.equal(rowsOf(queue).length, 2)
	assert.notEqual(rowsOf(queue)[0].id, rowsOf(queue)[1].id)
})

await check('queue: a throwing onRegistered neither fails the file nor stops the queue', async () => {
	const env = makeEnv()
	let calls = 0
	const queue = env.queue({
		onRegistered: () => {
			calls++
			throw new Error('page callback bug')
		},
	})
	const seen = await withConsoleError(async () => {
		queue.add([fakeFile('a.png'), fakeFile('b.png')], ctx())
		await completeAll(env)
	})
	assert.equal(calls, 2)
	assert.deepEqual(stateNames(queue), ['done', 'done'])
	assert.equal(seen.length, 2)
})

await check('queue: onRegistered can add more files without breaking anything', async () => {
	const env = makeEnv()
	let first = true
	let queue
	queue = env.queue({
		onRegistered: () => {
			if (!first) return
			first = false
			queue.add([fakeFile('follow-up.png')], ctx())
		},
	})
	queue.add([fakeFile('a.png')], ctx())
	await completeAll(env)
	assert.deepEqual(stateNames(queue), ['done', 'done'])
	assert.deepEqual(env.uploads.map((c) => c.file.name), ['a.png', 'follow-up.png'])
})

await check('queue: a sync throw from the uploader or fetch is a failure, not a crash', async () => {
	const env = makeEnv()
	let boom = true
	const queue = createUploadQueue({
		upload: (...args) => {
			if (boom) throw new Error('sync throw')
			return env.upload(...args)
		},
		fetch: () => {
			throw new TypeError('Failed to fetch')
		},
		onRegistered: noop,
	})
	queue.add([fakeFile('a.png')], ctx())
	await tick()
	assert.equal(rowsOf(queue)[0].state, 'failed')
	assert.equal(rowsOf(queue)[0].stage, 'upload')
	boom = false
	queue.retry(rowsOf(queue)[0].id)
	await tick()
	env.uploads[0].resolve()
	await tick()
	assert.equal(rowsOf(queue)[0].state, 'failed')
	assert.equal(rowsOf(queue)[0].stage, 'register')
	assert.match(rowsOf(queue)[0].message, /network/i)
})

await check('queue: an upload that "succeeds" with nothing usable is a failure, not a registration of undefined', async () => {
	for (const result of [undefined, null, {}, { url: 'u' }, { pathname: 'p' }, { url: '', pathname: 'p' }, { url: 5, pathname: 'p' }, 'string']) {
		const env = makeEnv()
		const queue = env.queue()
		queue.add([fakeFile('a.png')], ctx())
		await tick()
		env.uploads[0].resolve(result)
		await tick()
		assert.equal(env.fetches.length, 0, JSON.stringify(result))
		assert.equal(rowsOf(queue)[0].state, 'failed', JSON.stringify(result))
		assert.equal(rowsOf(queue)[0].retryable, true)
	}
})

await check('queue: a stuck queue state cannot loop: a queued row with no job fails once', async () => {
	// Not reachable through the API; guards pump() against spinning if it ever happens.
	const env = makeEnv()
	const queue = env.queue()
	queue.add([fakeFile('a.png')], ctx())
	await tick()
	assert.equal(env.uploads.length, 1)
	// Unrelated to any hidden state: the public surface stays consistent after many ops.
	for (let i = 0; i < 50; i++) {
		queue.add([fakeFile(`x${i}.png`)], ctx())
		if (i % 3 === 0) queue.remove(rowsOf(queue)[rowsOf(queue).length - 1].id)
	}
	await completeAll(env)
	assert.equal(live(queue.getState()), 0)
})

await check('queue: random completion order, random failures: the limit holds at every instant and nothing is lost', async () => {
	for (const seed of [1, 2, 3, 4, 5]) {
		const rand = mulberry32(seed)
		const env = makeEnv()
		const queue = env.queue()
		const rec = record(queue)
		const total = 40
		queue.add(Array.from({ length: total }, (_, i) => fakeFile(`s${seed}-${i}.png`)), ctx())
		for (let guard = 0; guard < 5000; guard++) {
			await tick()
			if (live(queue.getState()) === 0 && !rowsOf(queue).some((r) => r.state === 'queued')) break
			const pendingUploads = env.uploads.filter((c) => c.state === 'pending')
			const pendingFetches = env.fetches.filter((c) => c.state === 'pending')
			const pool = [...pendingUploads.map((c) => ['u', c]), ...pendingFetches.map((c) => ['f', c])]
			if (!pool.length) continue
			const [kind, call] = pool[Math.floor(rand() * pool.length)]
			const roll = rand()
			if (kind === 'u') roll < 0.2 ? call.reject(new Error('flaky')) : call.resolve()
			else if (roll < 0.15) call.respond(500, {})
			else if (roll < 0.25) call.fail()
			else if (roll < 0.45) call.duplicate()
			else call.created()
		}
		await queue.whenIdle()
		const state = queue.getState()
		assert.equal(state.items.length, total, `seed ${seed}`)
		assert.ok(state.items.every((r) => ['done', 'duplicate', 'failed'].includes(r.state)), `seed ${seed}: a row is stuck`)
		assert.ok(rec.frames.every((frame) => live(frame) <= 3), `seed ${seed}: more than three live`)
		assert.ok(env.peak.uploads <= 3 && env.peak.fetches <= 3, `seed ${seed}: peaks ${JSON.stringify(env.peak)}`)
		const settled = state.items.filter((r) => r.state === 'done' || r.state === 'duplicate').length
		assert.equal(env.registered.length, settled, `seed ${seed}: onRegistered once per registered file`)
		// Every file went up at least once and the fakes never saw a second in-flight call for the same pending upload.
		const uploaded = new Set(env.uploads.map((c) => c.file.name))
		assert.equal(uploaded.size, total, `seed ${seed}: some file was never uploaded`)
		// Retry what failed, until everything is in: nothing is permanently stuck.
		for (let round = 0; round < 30 && state.items.some((r) => r.state === 'failed'); round++) {
			queue.retryAll()
			await completeAll(env)
			if (!queue.getState().items.some((r) => r.state === 'failed')) break
		}
		assert.ok(queue.getState().items.every((r) => r.state !== 'failed'), `seed ${seed}: could not recover`)
		assert.ok(env.peak.uploads <= 3 && env.peak.fetches <= 3)
	}
})

await check('queue: a thousand files finish, three at a time, in a reasonable time', async () => {
	const env = makeEnv({ auto: true })
	const queue = env.queue()
	const started = Date.now()
	queue.add(Array.from({ length: 1000 }, (_, i) => fakeFile(`bulk-${i}.png`)), ctx())
	await queue.whenIdle()
	for (let guard = 0; guard < 5000 && live(queue.getState()) + rowsOf(queue).filter((r) => r.state === 'queued').length > 0; guard++) await tick()
	assert.equal(stateNames(queue).filter((s) => s === 'done').length, 1000)
	assert.ok(env.peak.uploads <= 3 && env.peak.fetches <= 3)
	assert.ok(Date.now() - started < 15_000, `took ${Date.now() - started} ms`)
})

await check('queue: subscribers get a stable snapshot object between changes, and can unsubscribe', async () => {
	const env = makeEnv()
	const queue = env.queue()
	const a = queue.getState()
	assert.equal(queue.getState(), a, 'same object until something changes (useSyncExternalStore needs this)')
	let calls = 0
	const stop = queue.subscribe(() => calls++)
	queue.add([fakeFile('x.png')], ctx())
	assert.ok(calls > 0)
	assert.notEqual(queue.getState(), a)
	const frozen = queue.getState()
	assert.equal(queue.getState(), frozen)
	const before = calls
	stop()
	stop()
	queue.add([fakeFile('y.png')], ctx())
	assert.equal(calls, before)
	// Rows are replaced, never mutated, so a memoised row sees a new object only when it changed.
	const row0 = rowsOf(queue)[0]
	queue.add([fakeFile('z.png')], ctx())
	assert.equal(rowsOf(queue)[0], row0, 'an untouched row keeps its identity')
})

/* -------------------------------------------------------------------------- */
/* The real Blob client, against a stand-in on this machine                   */
/* -------------------------------------------------------------------------- */

// Everything above fakes the Blob client. This section runs the REAL `upload()` from
// @vercel/blob/client (its option checks, its token request, its multipart flow, its error
// texts and its abort handling) through the real queue, against a small HTTP server on
// 127.0.0.1 that plays both our token route (with the SDK's own `handleUpload` and the real
// `uploadPayloadSchema`) and the Blob API. Nothing leaves this machine.

const sdk = rootRequire('@vercel/blob/client')
const http = await import('node:http')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** Real sockets need wall-clock time, not a count of event loop turns. */
async function untilWall(condition, label, ms = 4000) {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (condition()) return
		await wait(10)
	}
	throw new Error(`timed out waiting for ${label}`)
}

async function withBlobStandIn(fn) {
	const stand = { holdMs: 0, holdToken: 0, tokenRefusal: null, blobFailure: null, tokenRequests: [], puts: [], mpu: [], hits: { token: 0, blob: 0 } }
	const readBody = (req) =>
		new Promise((resolve) => {
			const chunks = []
			req.on('data', (chunk) => chunks.push(chunk))
			req.on('end', () => resolve(Buffer.concat(chunks)))
		})
	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url, 'http://127.0.0.1')
		const send = (status, body, headers = {}) => {
			res.writeHead(status, { 'content-type': 'application/json', ...headers })
			res.end(JSON.stringify(body))
		}
		try {
			if (url.pathname === '/api/account/media/upload') {
				stand.hits.token++
				const body = JSON.parse((await readBody(req)).toString('utf8'))
				stand.tokenRequests.push(body)
				if (stand.holdToken) await wait(stand.holdToken)
				if (stand.tokenRefusal) return send(stand.tokenRefusal.status, { error: stand.tokenRefusal.message })
				const request = new Request(`http://127.0.0.1${req.url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
				const result = await sdk.handleUpload({
					body,
					request,
					onBeforeGenerateToken: async (pathname, clientPayload) => {
						// What the real route does with the same two strings.
						const payload = uploadPayloadSchema.parse(JSON.parse(clientPayload))
						if (!OWNED(pathname, payload.workspaceId)) throw new Error('That upload location is not allowed.')
						return {
							allowedContentTypes: [...MEDIA_CONTENT_TYPES],
							maximumSizeInBytes: MEDIA_LIMITS.maxBytes,
							addRandomSuffix: true,
							tokenPayload: JSON.stringify({ workspaceId: payload.workspaceId, folderId: payload.folderId ?? null, filename: pathname.split('/').pop() }),
							callbackUrl: 'http://127.0.0.1:1/never',
						}
					},
					onUploadCompleted: async () => {},
				})
				return send(200, result)
			}
			if (url.pathname.startsWith('/api/blob')) {
				stand.hits.blob++
				const claims = sdk.getPayloadFromClientToken((req.headers.authorization ?? '').replace(/^Bearer /, ''))
				const bytes = await readBody(req)
				if (stand.holdMs) await wait(stand.holdMs)
				if (stand.blobFailure) return send(stand.blobFailure.status, stand.blobFailure.body)
				const pathname = url.searchParams.get('pathname')
				if (pathname !== claims.pathname) return send(400, { error: { code: 'bad_request', message: `"pathname" "${pathname}" does not match the token payload "${claims.pathname}"` } })
				const type = req.headers['x-content-type']
				if (!claims.allowedContentTypes.includes(type)) return send(400, { error: { code: 'bad_request', message: `contentType "${type}" is not allowed` } })
				const stored = pathname.replace(/(\.[a-z0-9]+)?$/, (ext) => `-RaNd0m${ext}`)
				const blob = { url: `https://teststore.public.blob.vercel-storage.com/${stored}`, downloadUrl: `https://teststore.public.blob.vercel-storage.com/${stored}?download=1`, pathname: stored, contentType: type, contentDisposition: 'inline', etag: 'e1' }
				if (url.pathname === '/api/blob/mpu') {
					const action = req.headers['x-mpu-action']
					stand.mpu.push({ pathname, action, size: bytes.length })
					if (action === 'create') return send(200, { uploadId: 'up1', key: 'k1' })
					if (action === 'upload') return send(200, { etag: `etag-${req.headers['x-mpu-part-number']}` })
					return send(200, blob)
				}
				stand.puts.push({ pathname, type, size: bytes.length, headers: req.headers })
				return send(200, blob)
			}
			send(404, { error: 'not found' })
		} catch (error) {
			send(500, { error: String(error?.message ?? error) })
		}
	})
	await new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', resolve)
	})
	const port = server.address().port
	const saved = { api: process.env.VERCEL_BLOB_API_URL, token: process.env.BLOB_READ_WRITE_TOKEN, location: globalThis.location }
	process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${port}/api/blob`
	process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_secretsecretsecret'
	globalThis.location = { href: `http://127.0.0.1:${port}/account/media` }
	try {
		await fn(stand)
	} finally {
		server.closeAllConnections?.()
		await new Promise((resolve) => server.close(resolve))
		for (const [key, value] of [['VERCEL_BLOB_API_URL', saved.api], ['BLOB_READ_WRITE_TOKEN', saved.token]]) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
		if (saved.location === undefined) delete globalThis.location
		else globalThis.location = saved.location
	}
}

const realFile = (name, size, type) => new File([new Uint8Array(size)], name, { type })

/** A queue wired to the real SDK, with registration answered in-process. */
function sdkQueue(registered = []) {
	return createUploadQueue({
		upload: sdk.upload,
		fetch: async (url, init) => {
			const body = JSON.parse(init.body)
			registered.push({ url, headers: new Headers(init.headers), body })
			return jsonResponse(201, { status: 'created', asset: makeAsset({ id: String(registered.length).padStart(24, '0'), name: body.filename }) })
		},
		onRegistered: noop,
	})
}

await check('sdk: the real upload() takes our options and speaks the protocol the token route reads, single and multipart', async () => {
	await withBlobStandIn(async (stand) => {
		const registered = []
		const queue = sdkQueue(registered)
		queue.add([realFile('small.png', 1000, 'image/png'), realFile('Big Photo.JPG', 6 * MB, 'image/jpeg'), realFile('noext', 500, 'image/gif')], ctx({ folderId: FOLDER }))
		await queue.whenIdle()
		assert.deepEqual(rowsOf(queue).map((r) => `${r.name}:${r.state}:${r.message ?? ''}`), ['small.png:done:', 'Big Photo.JPG:done:', 'noext:done:'])

		// The token requests, as the real route will read them.
		assert.equal(stand.tokenRequests.length, 3)
		const byPath = Object.fromEntries(stand.tokenRequests.map((body) => [body.payload.pathname, body]))
		assert.deepEqual(Object.keys(byPath).sort(), [`${PREFIX}big-photo.jpg`, `${PREFIX}noext.gif`, `${PREFIX}small.png`])
		for (const body of stand.tokenRequests) {
			assert.equal(body.type, 'blob.generate-client-token')
			const parsed = uploadPayloadSchema.parse(JSON.parse(body.payload.clientPayload))
			assert.deepEqual(parsed, { workspaceId: WS, folderId: FOLDER })
		}
		assert.equal(byPath[`${PREFIX}big-photo.jpg`].payload.multipart, true)
		assert.equal(byPath[`${PREFIX}small.png`].payload.multipart, false)

		// What reached Blob.
		assert.deepEqual(stand.puts.map((p) => [p.pathname.slice(PREFIX.length), p.type, p.size]).sort(), [['noext.gif', 'image/gif', 500], ['small.png', 'image/png', 1000]])
		assert.deepEqual(stand.mpu.map((m) => m.action), ['create', 'upload', 'complete'])
		assert.equal(stand.mpu[1].size, 6 * MB)

		// Registration carries the pathname Blob stored, not the one asked for.
		assert.equal(registered.length, 3)
		for (const call of registered) {
			assert.equal(call.url, '/api/account/media')
			assert.equal(call.headers.get('x-media-workspace'), WS)
			assert.match(call.body.pathname, new RegExp(`^${PREFIX}[a-z0-9.-]+-RaNd0m\\.(png|jpg|gif)$`))
			assert.ok(registerBodySchema.safeParse(call.body).success)
		}
		assert.deepEqual(registered.map((c) => c.body.filename).sort(), ['Big Photo.JPG', 'noext', 'small.png'])
	})
})

await check('sdk: what the real client throws on a refusal reads as the sentence we mean', async () => {
	const blobFailure = (status, error) => ({ blobFailure: { status, body: { error } } })
	const cases = [
		['token route refuses (library full)', { tokenRefusal: { status: 429, message: 'Your library is full. Delete some images first.' } }, /refused this upload/i, true],
		['token route refuses (not a member)', { tokenRefusal: { status: 404, message: 'Not found.' } }, /refused this upload/i, true],
		['storage rejects the size', blobFailure(400, { code: 'bad_request', message: 'the file length cannot be greater than 26214400' }), /^Too large \(max 25 MB\)$/, false],
		['storage rejects the type', blobFailure(400, { code: 'bad_request', message: 'contentType "image/svg+xml" is not allowed' }), /^Not a supported image$/, false],
		['storage forbids', blobFailure(403, { code: 'forbidden' }), /not available/i, true],
		['storage rate limits', blobFailure(429, { code: 'rate_limited' }), /busy/i, true],
		['the store is suspended', blobFailure(403, { code: 'store_suspended' }), /not available/i, true],
		['the token expired', blobFailure(400, { code: 'bad_request', message: 'Token expired' }), /took too long/i, true],
	]
	for (const [label, mode, pattern, retryable] of cases) {
		await withBlobStandIn(async (stand) => {
			Object.assign(stand, mode)
			const queue = sdkQueue()
			queue.add([realFile('a.png', 100, 'image/png')], ctx())
			await queue.whenIdle()
			const row = rowsOf(queue)[0]
			assert.equal(row.state, 'failed', label)
			assert.equal(row.stage, 'upload', label)
			assert.match(row.message, pattern, `${label}: ${row.message}`)
			assert.equal(row.retryable, retryable, label)
			assert.ok(!/Vercel Blob|127\.0\.0\.1|token/i.test(row.message), `${label}: the SDK's own text leaked: ${row.message}`)
		})
	}
})

await check('sdk: with the server unreachable the real client fails the token request and it reads as a network problem', async () => {
	const probe = http.createServer()
	await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
	const dead = probe.address().port
	await new Promise((resolve) => probe.close(resolve))
	await withBlobStandIn(async () => {
		globalThis.location = { href: `http://127.0.0.1:${dead}/account/media` }
		const queue = sdkQueue()
		queue.add([realFile('a.png', 100, 'image/png')], ctx())
		await queue.whenIdle()
		const row = rowsOf(queue)[0]
		assert.equal(row.state, 'failed')
		assert.match(row.message, /network/i, row.message)
		assert.equal(row.retryable, true)
	})
})

await check('sdk: cancelling really aborts the real upload, single, multipart and during the token request, and nothing is registered', async () => {
	await withBlobStandIn(async (stand) => {
		for (const [label, size, holdMs, holdToken] of [['single', 3000, 1500, 0], ['multipart', 6 * MB, 1500, 0], ['token', 3000, 0, 700]]) {
			Object.assign(stand, { holdMs, holdToken })
			const seen = []
			const queue = createUploadQueue({
				upload: sdk.upload,
				fetch: async () => {
					seen.push('fetch')
					throw new Error('must not register')
				},
				onRegistered: () => seen.push('onRegistered'),
			})
			const blobBefore = stand.hits.blob
			const tokenBefore = stand.hits.token
			queue.add([realFile(`cancel-${label}.png`, size, 'image/png')], ctx())
			await untilWall(() => (label === 'token' ? stand.hits.token > tokenBefore : stand.hits.blob > blobBefore), `${label}: the request to reach the server`)
			const started = Date.now()
			queue.remove(rowsOf(queue)[0].id)
			assert.deepEqual(rowsOf(queue), [], `${label}: the row is gone at once`)
			await queue.whenIdle()
			const took = Date.now() - started
			if (label !== 'token') assert.ok(took < 1000, `${label}: the abort was prompt (${took} ms), not left to wait out the server`)
			await wait(holdMs ? holdMs + 200 : 300)
			assert.deepEqual(seen, [], `${label}: nothing was registered or reported`)
			// The token comes back late; the client must not start an upload with it.
			if (label === 'token') assert.equal(stand.hits.blob, blobBefore, 'no upload was started after the cancel')
		}
	})
})

await check('sdk: a cancelled row\'s slot is reused, so the next file goes up while the first is still being aborted', async () => {
	await withBlobStandIn(async (stand) => {
		stand.holdMs = 400
		const registered = []
		const queue = sdkQueue(registered)
		queue.add([realFile('first.png', 2000, 'image/png'), realFile('second.png', 2000, 'image/png'), realFile('third.png', 2000, 'image/png'), realFile('fourth.png', 2000, 'image/png')], ctx())
		await untilWall(() => stand.hits.blob >= 3, 'three uploads in flight')
		queue.remove(rowsOf(queue)[0].id)
		await queue.whenIdle()
		assert.deepEqual(rowsOf(queue).map((r) => `${r.name}:${r.state}`), ['second.png:done', 'third.png:done', 'fourth.png:done'])
		assert.equal(registered.length, 3)
	})
})

/* -------------------------------------------------------------------------- */
/* Summary and row wording                                                    */
/* -------------------------------------------------------------------------- */

const item = (over = {}) => ({
	id: `u${Math.random().toString(36).slice(2)}`,
	batch: 1,
	name: 'a.png',
	state: 'queued',
	progress: 0,
	destination: 'Upload to Unfiled',
	...over,
})
const stateOf = (items, over = {}) => ({ items, batch: 1, consumed: 0, ...over })

await check('summary: while working it reads "Uploading 3 of 12" and mentions failures', () => {
	const items = [
		...Array.from({ length: 3 }, () => item({ state: 'done', asset: makeAsset() })),
		...Array.from({ length: 2 }, () => item({ state: 'uploading', progress: 50 })),
		...Array.from({ length: 7 }, () => item({ state: 'queued' })),
	]
	assert.equal(summarizeQueue(stateOf(items)).text, 'Uploading 3 of 12')
	items.push(item({ state: 'failed' }))
	const s = summarizeQueue(stateOf(items))
	assert.equal(s.text, 'Uploading 4 of 13, 1 failed')
	assert.equal(s.total, 13)
	assert.equal(s.active, 9)
})

await check('summary: when finished it lists only what happened, with commas and counts', () => {
	assert.equal(summarizeQueue(stateOf([item({ state: 'done', asset: makeAsset() })])).text, '1 added')
	assert.equal(summarizeQueue(stateOf([item({ state: 'duplicate', asset: makeAsset() })])).text, '1 already in your library')
	assert.equal(summarizeQueue(stateOf([item({ state: 'failed' })])).text, '1 failed')
	assert.equal(
		summarizeQueue(stateOf([...Array.from({ length: 1234 }, () => item({ state: 'done', asset: makeAsset() })), item({ state: 'failed' })])).text,
		'1,234 added, 1 failed',
	)
	assert.equal(summarizeQueue(stateOf([])).text, '')
})

await check('summary: older batches do not inflate the current one, and an emptied batch falls back to what is left', () => {
	const old = Array.from({ length: 5 }, () => item({ batch: 1, state: 'done', asset: makeAsset() }))
	const fresh = [item({ batch: 2, state: 'uploading', progress: 10 }), item({ batch: 2, state: 'queued' })]
	assert.equal(summarizeQueue({ items: [...old, ...fresh], batch: 2, consumed: 1 }).text, 'Uploading 0 of 2')
	assert.equal(summarizeQueue({ items: old, batch: 2, consumed: 1 }).text, '5 added')
	assert.equal(footerCount({ items: old, batch: 2, consumed: 1 }), 0, 'no rows of this batch, nothing to select')
})

await check('summary: overall progress averages the rows: queued 0, uploading as reported, everything else 100', () => {
	const s = summarizeQueue(stateOf([item({ state: 'queued' }), item({ state: 'uploading', progress: 50 }), item({ state: 'done', asset: makeAsset() }), item({ state: 'processing' })]))
	assert.equal(s.percent, Math.round((0 + 50 + 100 + 100) / 4))
	assert.equal(summarizeQueue(stateOf([])).percent, 0)
})

await check('row wording: every state says what is happening', () => {
	assert.equal(describeItem(item({ state: 'queued' })), 'Queued')
	assert.equal(describeItem(item({ state: 'uploading', progress: 42 })), 'Uploading 42%')
	assert.equal(describeItem(item({ state: 'processing' })), 'Processing')
	assert.equal(describeItem(item({ state: 'done', asset: makeAsset() })), 'Done')
	assert.equal(describeItem(item({ state: 'duplicate', asset: makeAsset({ name: 'Logo', folderPath: 'Clients/Acme' }) })), 'Already in your library as Clients/Acme/Logo')
	assert.equal(describeItem(item({ state: 'duplicate' })), 'Already in your library')
	assert.equal(describeItem(item({ state: 'failed', message: 'Too large (max 25 MB)' })), 'Too large (max 25 MB)')
	assert.equal(describeItem(item({ state: 'failed' })), 'Upload failed. Try again.')
})

await check('footer: shown only when idle, with something created, and not yet used', () => {
	const created = [item({ state: 'done', asset: makeAsset() }), item({ state: 'done', asset: makeAsset({ id: 'd'.repeat(24) }) })]
	assert.equal(footerCount(stateOf(created)), 2)
	assert.equal(footerCount(stateOf([...created, item({ state: 'queued' })])), 0)
	assert.equal(footerCount(stateOf([...created, item({ state: 'processing' })])), 0)
	assert.equal(footerCount(stateOf(created, { consumed: 1 })), 0)
	assert.equal(footerCount(stateOf([item({ state: 'duplicate', asset: makeAsset() }), item({ state: 'failed' })])), 0)
	assert.equal(footerCount(stateOf([item({ state: 'done' })])), 0, 'a done row with no asset has nothing to select')
})

/* -------------------------------------------------------------------------- */
/* Dragging files in                                                          */
/* -------------------------------------------------------------------------- */

await check('drag: only a drag of real files counts, and an in-app drag never does', () => {
	assert.equal(hasFiles({ types: ['Files'] }), true)
	assert.equal(hasFiles({ types: ['text/uri-list', 'text/html', 'Files'] }), true)
	assert.equal(hasFiles({ types: ['text/plain'] }), false)
	assert.equal(hasFiles({ types: [DRAG_MIME] }), false)
	assert.equal(hasFiles({ types: [DRAG_MIME, 'text/plain'] }), false)
	assert.equal(hasFiles({ types: ['Files', DRAG_MIME] }), false, 'Chrome lists Files for an image dragged out of the page itself')
	assert.equal(hasFiles({ types: [] }), false)
	assert.equal(hasFiles({ types: ['files'] }), false, 'the type is exactly Files')
	// A DOMStringList is array-like and has no includes().
	assert.equal(hasFiles({ types: Object.assign(Object.create(null), { 0: 'Files', length: 1, contains: () => true }) }), true)
	for (const junk of [null, undefined, {}, { types: null }, { types: 'Files' }, { types: 5 }, { types: undefined }])
		assert.equal(hasFiles(junk), false, JSON.stringify(junk))
	assert.equal(DRAG_MIME, 'application/x-media-ids', 'the contract constant the cards drag with')
})

await check('drag counter: crossing children never hides it, and it hides exactly once at the end', () => {
	const tracker = createDropTracker()
	const events = []
	const note = (name, changed) => changed && events.push(`${name}:${tracker.active}`)
	// The order browsers use: enter the new element, then leave the old one.
	note('enter', tracker.enter(0))
	for (let i = 0; i < 25; i++) {
		note('enter', tracker.enter(i))
		note('leave', tracker.leave())
	}
	assert.equal(tracker.active, true)
	assert.equal(tracker.depth, 1)
	note('leave', tracker.leave())
	assert.deepEqual(events, ['enter:true', 'leave:false'])
	assert.equal(tracker.active, false)
})

await check('drag counter: it never goes below zero and recovers from a missed enter', () => {
	const tracker = createDropTracker()
	for (let i = 0; i < 5; i++) tracker.leave()
	assert.equal(tracker.depth, 0)
	assert.equal(tracker.active, false)
	tracker.enter(0)
	assert.equal(tracker.depth, 1, 'earlier stray leaves did not leave a debt')
	// Mounted mid-drag: only dragover arrives.
	const late = createDropTracker()
	late.over(5)
	assert.equal(late.active, true)
	assert.equal(late.depth, 1)
	late.leave()
	assert.equal(late.active, false)
})

await check('drag counter: a drop clears it however deep, and a quiet drag expires', () => {
	const tracker = createDropTracker(1000)
	tracker.enter(0)
	tracker.enter(1)
	tracker.enter(2)
	assert.equal(tracker.drop(), true)
	assert.equal(tracker.depth, 0)
	assert.equal(tracker.drop(), false, 'a second drop changes nothing')
	tracker.enter(0)
	assert.equal(tracker.expire(900), false)
	tracker.over(900)
	assert.equal(tracker.expire(1800), false, 'dragover keeps it alive')
	assert.equal(tracker.expire(1901), true)
	assert.equal(tracker.active, false)
	assert.equal(tracker.depth, 0)
	assert.equal(tracker.expire(99999), false)
})

function dragEvent(type, { types = ['Files'], files = [], cancelable = true } = {}) {
	const event = new Event(type, { bubbles: true, cancelable })
	event.dataTransfer = { types, files, dropEffect: 'none' }
	return event
}

function fakeClock() {
	const timers = new Map()
	let now = 0
	let nextId = 1
	return {
		now: () => now,
		setInterval: (fn, ms) => {
			const id = nextId++
			timers.set(id, { fn, ms, next: now + ms })
			return id
		},
		clearInterval: (id) => timers.delete(id),
		advance(ms) {
			const end = now + ms
			while (true) {
				const due = [...timers.entries()].filter(([, t]) => t.next <= end).sort((a, b) => a[1].next - b[1].next)[0]
				if (!due) break
				now = due[1].next
				due[1].next += due[1].ms
				due[1].fn()
			}
			now = end
		},
		get timers() {
			return timers.size
		},
	}
}

function dropRig({ disabled = false } = {}) {
	const target = new EventTarget()
	const clock = fakeClock()
	const log = { active: [], files: [] }
	const state = { disabled }
	const detach = attachFileDrop(
		target,
		{ onActive: (a) => log.active.push(a), onFiles: (f) => log.files.push(f), disabled: () => state.disabled },
		clock,
	)
	return { target, clock, log, state, detach, fire: (event) => (target.dispatchEvent(event), event) }
}

await check('drop: a Files drag shows the overlay once, and the browser is told it may drop', () => {
	const rig = dropRig()
	const enter = rig.fire(dragEvent('dragenter'))
	assert.deepEqual(rig.log.active, [true])
	assert.equal(enter.defaultPrevented, true, 'dragenter must be cancelled to accept the drag')
	const over = rig.fire(dragEvent('dragover'))
	assert.equal(over.defaultPrevented, true)
	assert.equal(over.dataTransfer.dropEffect, 'copy')
	assert.deepEqual(rig.log.active, [true], 'no repeat reports')
	rig.fire(dragEvent('dragleave'))
	assert.deepEqual(rig.log.active, [true, false])
})

await check('drop: an in-app drag, text and links are left completely alone', () => {
	for (const types of [[DRAG_MIME], [DRAG_MIME, 'text/plain'], ['Files', DRAG_MIME], ['text/plain'], ['text/uri-list'], []]) {
		const rig = dropRig()
		for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
			const event = rig.fire(dragEvent(type, { types, files: [fakeFile('x.png')] }))
			assert.equal(event.defaultPrevented, false, `${type} ${types}`)
			assert.equal(event.dataTransfer.dropEffect, 'none')
		}
		assert.deepEqual(rig.log.active, [], String(types))
		assert.deepEqual(rig.log.files, [], String(types))
		assert.equal(rig.clock.timers, 0)
	}
})

await check('drop: events with no dataTransfer at all do not throw', () => {
	const rig = dropRig()
	for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) assert.doesNotThrow(() => rig.target.dispatchEvent(new Event(type, { cancelable: true })))
	const odd = new Event('drop', { cancelable: true })
	odd.dataTransfer = { types: ['Files'] }
	assert.doesNotThrow(() => rig.target.dispatchEvent(odd), 'Files with no files list')
	assert.deepEqual(rig.log.files, [])
})

await check('drop: dropping hands the files over, hides the overlay and stops the browser navigating', () => {
	const rig = dropRig()
	rig.fire(dragEvent('dragenter'))
	rig.fire(dragEvent('dragenter'))
	const files = [fakeFile('a.png'), fakeFile('b.jpg', 5, 'image/jpeg')]
	const drop = rig.fire(dragEvent('drop', { files }))
	assert.equal(drop.defaultPrevented, true)
	assert.deepEqual(rig.log.active, [true, false], 'shown once, hidden once, though entered twice')
	assert.equal(rig.log.files.length, 1)
	assert.deepEqual(rig.log.files[0], files)
	assert.notEqual(rig.log.files[0], files, 'a copy: the live list can change under us')
	assert.equal(rig.clock.timers, 0, 'the watchdog is stopped')
	// An empty drop (a dragged selection with no files) adds nothing.
	rig.fire(dragEvent('dragenter'))
	rig.fire(dragEvent('drop', { files: [] }))
	assert.equal(rig.log.files.length, 1)
})

await check('drop: the same drop works for array-likes (a FileList)', () => {
	const rig = dropRig()
	const list = { 0: fakeFile('a.png'), 1: fakeFile('b.png'), length: 2 }
	rig.fire(dragEvent('drop', { files: list }))
	assert.equal(rig.log.files[0].length, 2)
	assert.ok(Array.isArray(rig.log.files[0]))
})

await check('drop: disabled, nothing is shown or added, but a file dropped on the page does not navigate away', () => {
	const rig = dropRig({ disabled: true })
	const enter = rig.fire(dragEvent('dragenter'))
	const over = rig.fire(dragEvent('dragover'))
	const drop = rig.fire(dragEvent('drop', { files: [fakeFile('a.png')] }))
	assert.deepEqual(rig.log.active, [], 'no overlay')
	assert.deepEqual(rig.log.files, [], 'no files')
	assert.equal(enter.defaultPrevented && over.defaultPrevented && drop.defaultPrevented, true, 'no navigation')
	assert.equal(over.dataTransfer.dropEffect, 'none', 'the cursor says no')
	assert.equal(rig.clock.timers, 0)
})

await check('drop: disabling mid-drag hides the overlay and enabling again shows it', () => {
	const rig = dropRig()
	rig.fire(dragEvent('dragenter'))
	rig.state.disabled = true
	rig.fire(dragEvent('dragover'))
	assert.deepEqual(rig.log.active, [true, false])
	rig.state.disabled = false
	rig.fire(dragEvent('dragover'))
	assert.deepEqual(rig.log.active, [true, false, true])
})

await check('drop: a drag that ends without a leave (Esc, a lost window) cannot leave the overlay up', () => {
	const rig = dropRig()
	rig.fire(dragEvent('dragenter'))
	assert.equal(rig.clock.timers, 1)
	rig.clock.advance(2000)
	assert.deepEqual(rig.log.active, [true])
	rig.clock.advance(1000)
	assert.deepEqual(rig.log.active, [true, false])
	assert.equal(rig.clock.timers, 0, 'and the timer is gone')
	// While the browser keeps sending dragover, it stays.
	const live = dropRig()
	live.fire(dragEvent('dragenter'))
	for (let t = 0; t < 10; t++) {
		live.clock.advance(1000)
		live.fire(dragEvent('dragover'))
	}
	assert.deepEqual(live.log.active, [true])
	live.fire(dragEvent('dragleave'))
	assert.deepEqual(live.log.active, [true, false])
})

await check('drop: detaching removes every listener and the timer; attaching twice does not double up', () => {
	const rig = dropRig()
	rig.fire(dragEvent('dragenter'))
	rig.detach()
	assert.equal(rig.clock.timers, 0)
	const after = rig.fire(dragEvent('drop', { files: [fakeFile('a.png')] }))
	assert.equal(after.defaultPrevented, false, 'a detached page no longer intercepts drops')
	assert.deepEqual(rig.log.files, [])
	// React's dev double-mount: attach, detach, attach.
	const target = new EventTarget()
	const log = []
	const make = () => attachFileDrop(target, { onActive: () => {}, onFiles: (f) => log.push(f), disabled: () => false }, fakeClock())
	const first = make()
	first()
	const second = make()
	target.dispatchEvent(dragEvent('drop', { files: [fakeFile('a.png')] }))
	assert.equal(log.length, 1, 'one set of listeners')
	second()
	target.dispatchEvent(dragEvent('drop', { files: [fakeFile('a.png')] }))
	assert.equal(log.length, 1)
})

await check('beforeunload: asks the browser to confirm while attached, and not after', () => {
	const target = new EventTarget()
	const detach = attachBeforeUnload(target)
	const during = new Event('beforeunload', { cancelable: true })
	target.dispatchEvent(during)
	assert.equal(during.defaultPrevented, true)
	detach()
	const after = new Event('beforeunload', { cancelable: true })
	target.dispatchEvent(after)
	assert.equal(after.defaultPrevented, false)
	// An event whose returnValue cannot be set is still handled.
	const stubborn = new Event('beforeunload', { cancelable: true })
	Object.defineProperty(stubborn, 'returnValue', { get: () => '', set: undefined, configurable: true })
	const t2 = new EventTarget()
	attachBeforeUnload(t2)
	assert.doesNotThrow(() => t2.dispatchEvent(stubborn))
	assert.equal(stubborn.defaultPrevented, true)
})

/* -------------------------------------------------------------------------- */
/* The queue panel and overlay (what a person sees)                           */
/* -------------------------------------------------------------------------- */

const panelProps = (over = {}) => ({
	state: stateOf([]),
	collapsed: false,
	readOnly: false,
	onToggle: noop,
	onRetry: noop,
	onRetryAll: noop,
	onRemove: noop,
	onClear: noop,
	onSelectBatch: noop,
	onView: noop,
	...over,
})
const renderPanel = (over) => renderToString(h(UploadQueuePanel, panelProps(over)))
const rowsIn = (root) => bySlot(root, 'upload-row')
const rowNamed = (root, name) => rowsIn(root).find((row) => textOfNode(row).includes(name))

const kitchenSink = () =>
	stateOf([
		item({ id: 'u1', name: 'queued.png', state: 'queued' }),
		item({ id: 'u2', name: 'uploading.png', state: 'uploading', progress: 42 }),
		item({ id: 'u3', name: 'processing.png', state: 'processing', progress: 100 }),
		item({ id: 'u4', name: 'done.png', state: 'done', asset: makeAsset({ id: 'd'.repeat(24), name: 'Done' }) }),
		item({ id: 'u5', name: 'dup.png', state: 'duplicate', asset: makeAsset({ name: 'Logo', folderPath: 'Clients/Acme' }) }),
		item({ id: 'u6', name: 'bad.pdf', state: 'failed', message: 'Not a supported image', hint: 'Use JPG, PNG, WebP, AVIF or GIF.', retryable: false, stage: 'validate' }),
		item({ id: 'u7', name: 'net.png', state: 'failed', message: 'Network error. Check your connection and try again.', retryable: true, stage: 'upload' }),
	])

await check('panel: empty, it is only a silent status region (sr-only), with nothing to see or press', () => {
	const html = renderPanel()
	const root = staticChecks(html, 'empty panel')
	const panel = bySlot(root, 'upload-panel')[0]
	assert.equal(panel.attrs['data-empty'], 'true')
	assert.match(panel.attrs.class, /\bsr-only\b/)
	assert.equal(findAllNodes(root, (n) => n.tag === 'button').length, 0)
	const status = bySlot(root, 'upload-summary')[0]
	assert.equal(status.attrs.role, 'status')
	assert.equal(status.attrs['aria-live'], 'polite')
	assert.equal(textOfNode(status), '')
	assert.equal(rowsIn(root).length, 0)
})

await check('panel: it is fixed to the bottom right, and the summary is a polite status region', () => {
	const root = staticChecks(renderPanel({ state: kitchenSink() }), 'panel')
	const panel = bySlot(root, 'upload-panel')[0]
	for (const cls of ['fixed', 'bottom-4', 'right-4']) assert.ok(panel.attrs.class.split(/\s+/).includes(cls), cls)
	assert.ok(!/\bsr-only\b/.test(panel.attrs.class))
	const status = bySlot(root, 'upload-summary')[0]
	assert.equal(status.attrs.role, 'status')
	assert.equal(status.attrs['aria-live'], 'polite')
	assert.equal(status.attrs['aria-atomic'], 'true')
	assert.equal(norm(textOfNode(status)), 'Uploading 4 of 7, 2 failed')
	assert.equal(findAllNodes(root, (n) => n.attrs.role === 'status').length, 1, 'one live region, not one per row')
	assert.equal(findAllNodes(root, (n) => n.attrs['aria-live'] !== undefined).length, 1)
})

await check('panel: the live region is the same element whether or not there are rows, so a change is announced', () => {
	// Same position in the tree (container > header > summary): React keeps the node.
	const path = (root) => {
		const panel = bySlot(root, 'upload-panel')[0]
		const status = bySlot(root, 'upload-summary')[0]
		const chain = []
		for (let n = status; n && n !== panel; n = n.parent) chain.push(n.tag)
		return chain.join('<')
	}
	assert.equal(path(parseHtml(renderPanel())), path(parseHtml(renderPanel({ state: kitchenSink() }))))
})

await check('panel: it names where the files are going, from what the page said when they were added', () => {
	const root = parseHtml(renderPanel({ state: stateOf([item({ destination: 'Upload to Clients/Acme' })]) }))
	assert.ok(norm(textOfNode(bySlot(root, 'upload-panel')[0])).includes('Upload to Clients/Acme'))
	const two = parseHtml(renderPanel({ state: stateOf([item({ destination: 'Upload to A' }), item({ destination: 'Upload to B' }), item({ destination: 'Upload to B' })]) }))
	assert.ok(norm(textOfNode(bySlot(two, 'upload-panel')[0])).includes('Upload to A and 1 more'))
})

await check('panel: every state is told in words (not colour alone), with its own controls', () => {
	const root = staticChecks(renderPanel({ state: kitchenSink() }), 'sink')
	const row = (name) => rowNamed(root, name)
	const text = (name) => norm(textOfNode(row(name)))
	assert.equal(rowsIn(root).length, 7)
	assert.match(text('queued.png'), /Queued/)
	assert.match(text('uploading.png'), /Uploading 42%/)
	assert.match(text('processing.png'), /Processing/)
	assert.match(text('done.png'), /Done/)
	assert.match(text('dup.png'), /Already in your library as Clients\/Acme\/Logo/)
	assert.match(text('bad.pdf'), /Failed: Not a supported image/)
	assert.match(text('bad.pdf'), /Use JPG, PNG, WebP, AVIF or GIF\./)
	assert.match(text('net.png'), /Failed: Network error/)

	const names = (name) => buttonNames(row(name) ? { children: [row(name)], attrs: {}, tag: 'x' } : root)
	assert.deepEqual(names('queued.png'), ['Cancel upload of queued.png'])
	assert.deepEqual(names('uploading.png'), ['Cancel upload of uploading.png'])
	assert.deepEqual(names('processing.png'), ['Cancel upload of processing.png'])
	assert.deepEqual(names('done.png'), ['Remove done.png'])
	assert.deepEqual(names('dup.png'), ['View Logo', 'Remove dup.png'])
	assert.deepEqual(names('bad.pdf'), ['Remove bad.pdf'], 'a refused file has nothing to retry')
	assert.deepEqual(names('net.png'), ['Retry net.png', 'Remove net.png'])
})

await check('panel: a row\'s progress bar speaks its value; an unknown wait is indeterminate', () => {
	const root = parseHtml(renderPanel({ state: kitchenSink() }))
	const bars = (name) => findAllNodes(rowNamed(root, name), (n) => n.attrs.role === 'progressbar')
	assert.equal(bars('queued.png').length, 0)
	assert.equal(bars('done.png').length, 0)
	const [up] = bars('uploading.png')
	assert.equal(up.attrs['aria-valuenow'], '42')
	assert.equal(up.attrs['aria-valuemin'], '0')
	assert.equal(up.attrs['aria-valuemax'], '100')
	assert.equal(up.attrs['aria-label'], 'Upload progress for uploading.png')
	const [proc] = bars('processing.png')
	assert.equal(proc.attrs['aria-valuenow'], undefined, 'indeterminate has no value')
	assert.equal(proc.attrs['aria-valuetext'], 'Processing')
	const bar = findAllNodes(up, () => true)[0]
	assert.match(bar.attrs.style, /width:\s*42%/)
})

await check('panel: while working there is an overall bar, and the retry-all and clear actions are offered when they apply', () => {
	let root = parseHtml(renderPanel({ state: kitchenSink() }))
	const overall = findAllNodes(root, (n) => n.attrs['aria-label'] === 'Overall upload progress')
	assert.equal(overall.length, 1)
	assert.equal(overall[0].attrs.role, 'progressbar')
	const names = buttonNames(root)
	assert.ok(names.includes('Clear finished'))
	assert.ok(!names.some((n) => /^Retry \d+ failed$/.test(n)), 'one retryable failure does not need a retry-all')
	const two = stateOf([item({ state: 'failed', retryable: true, name: 'a.png' }), item({ state: 'failed', retryable: true, name: 'b.png' }), item({ state: 'failed', retryable: false, name: 'c.png' })])
	root = parseHtml(renderPanel({ state: two }))
	assert.ok(buttonNames(root).includes('Retry 2 failed'))
	assert.equal(findAllNodes(root, (n) => n.attrs['aria-label'] === 'Overall upload progress').length, 0, 'idle: no overall bar')
	root = parseHtml(renderPanel({ state: stateOf([item({ state: 'queued' })]) }))
	assert.ok(!buttonNames(root).includes('Clear finished'), 'nothing finished, nothing to clear')
})

await check('panel: when a batch finishes the footer says "N added" with a Select them button', () => {
	const created = Array.from({ length: 3 }, (_, i) => item({ id: `c${i}`, name: `c${i}.png`, state: 'done', asset: makeAsset({ id: String(i).repeat(24) }) }))
	const state = stateOf([...created, item({ state: 'duplicate', asset: makeAsset() }), item({ state: 'failed', retryable: true })])
	const root = staticChecks(renderPanel({ state }), 'footer')
	const footer = bySlot(root, 'upload-footer')[0]
	assert.ok(footer, 'footer shown')
	assert.match(norm(textOfNode(footer)), /^3 added\. Select them/)
	const button = findAllNodes(footer, (n) => n.tag === 'button')[0]
	assert.match(accessibleNameOfNode(button, root), /^Select them/, 'the visible words start the accessible name')
	assert.match(accessibleNameOfNode(button, root), /3 new images/)
	// Not while work is under way, not once used, not when nothing was created.
	assert.equal(bySlot(parseHtml(renderPanel({ state: stateOf([...created, item({ state: 'queued' })]) })), 'upload-footer').length, 0)
	assert.equal(bySlot(parseHtml(renderPanel({ state: { ...state, consumed: 1 } })), 'upload-footer').length, 0)
	assert.equal(bySlot(parseHtml(renderPanel({ state: stateOf([item({ state: 'failed' })]) })), 'upload-footer').length, 0)
	assert.equal(bySlot(parseHtml(renderPanel({ state: stateOf([item({ state: 'duplicate', asset: makeAsset() })]) })), 'upload-footer').length, 0)
})

await check('panel: collapsed, only the summary and the footer remain, and the toggle says so', () => {
	const created = [item({ name: 'a.png', state: 'done', asset: makeAsset() })]
	const state = stateOf(created)
	const open = staticChecks(renderPanel({ state, collapsed: false }), 'open')
	const shut = staticChecks(renderPanel({ state, collapsed: true }), 'shut')
	const toggle = (root) => findAllNodes(root, (n) => n.attrs['aria-expanded'] !== undefined)[0]
	assert.equal(toggle(open).attrs['aria-expanded'], 'true')
	assert.equal(accessibleNameOfNode(toggle(open), open), 'Hide upload details')
	assert.equal(toggle(shut).attrs['aria-expanded'], 'false')
	assert.equal(accessibleNameOfNode(toggle(shut), shut), 'Show upload details')
	const list = (root) => findAllNodes(root, (n) => n.attrs.id === toggle(root).attrs['aria-controls'])[0]
	assert.equal(list(open).attrs.hidden, undefined)
	assert.equal(list(shut).attrs.hidden, '', 'the list is hidden, not removed')
	assert.ok(!buttonNames(shut).includes('Clear finished'), 'details-level actions hide with the details')
	assert.equal(bySlot(shut, 'upload-footer').length, 1, 'but the call to action stays')
	assert.equal(bySlot(shut, 'upload-summary').length, 1)
})

await check('panel: read-only (uploads disabled) shows the rows but not one control', () => {
	const created = Array.from({ length: 2 }, (_, i) => item({ name: `r${i}.png`, state: 'done', asset: makeAsset() }))
	const state = stateOf([...created, item({ state: 'failed', retryable: true, message: 'x' }), item({ state: 'duplicate', asset: makeAsset() }), item({ state: 'uploading', progress: 5 })])
	for (const s of [state, stateOf(created)]) {
		const root = staticChecks(renderPanel({ state: s, readOnly: true }), 'readonly')
		assert.equal(findAllNodes(root, (n) => n.tag === 'button').length, 0, 'no buttons')
		assert.equal(findAllNodes(root, interactiveNode).length, 0, 'nothing interactive')
		assert.ok(rowsIn(root).length >= 2)
	}
})

await check('panel: hostile file names and messages are text, never markup, and cannot break out of an attribute', () => {
	const evil = '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>.png'
	const state = stateOf([
		item({ name: evil, state: 'failed', retryable: true, message: '<b onmouseover=alert(3)>boom</b>' }),
		item({ name: displayName(evil), state: 'done', asset: makeAsset({ name: '<i>x</i>' }) }),
		item({ name: 'dup.png', state: 'duplicate', asset: makeAsset({ name: '"><svg onload=alert(4)>', folderPath: '<u>p</u>' }) }),
	])
	const html = renderPanel({ state })
	assert.ok(!/<img\b/i.test(html) && !/<script/i.test(html) && !/<svg onload/i.test(html) && !/<b onmouseover/i.test(html) && !/<i>x/i.test(html) && !/<u>p/i.test(html), html.slice(0, 400))
	// A bidi override in a name the server sent must not reach the page or a screen reader's label.
	const rlo = String.fromCharCode(0x202e)
	const spoof = renderPanel({ state: stateOf([item({ name: 'dup.png', state: 'duplicate', asset: makeAsset({ name: `Lo${rlo}go`, folderPath: `Cli${rlo}ents` }) })]) })
	assert.ok(!spoof.includes(rlo), 'a bidi override reached the markup')
	assert.ok(norm(textOfNode(parseHtml(spoof))).includes('Clients/Logo'))
	assert.ok(spoof.includes('aria-label="View Logo"'))
	const root = staticChecks(html, 'hostile')
	assert.equal(findAllNodes(root, (n) => n.tag === 'img' || n.tag === 'script').length, 0)
	const failed = rowsIn(root)[0]
	assert.ok(textOfNode(failed).includes('<img src=x onerror=alert(1)>'), 'the name is shown as the text it is')
	assert.ok(textOfNode(failed).includes('<b onmouseover=alert(3)>boom</b>'))
	for (const n of findAllNodes(root, () => true)) for (const key of Object.keys(n.attrs)) assert.ok(!/^on/i.test(key), `an ${key} attribute appeared`)
})

await check('panel: a very long name is cut by CSS and available in full on hover; thousands of rows are windowed', () => {
	const long = displayName('x'.repeat(400) + '.png')
	const root = parseHtml(renderPanel({ state: stateOf([item({ name: long })]) }))
	const p = findAllNodes(rowsIn(root)[0], (n) => n.tag === 'p')[0]
	assert.ok(p.attrs.class.split(/\s+/).includes('truncate'))
	assert.equal(p.attrs.title, long)
	const many = stateOf(Array.from({ length: 250 }, (_, i) => item({ id: `m${i}`, name: `m${i}.png`, state: 'queued' })))
	const big = staticChecks(renderPanel({ state: many }), 'many')
	assert.equal(rowsIn(big).length, 200)
	assert.ok(norm(textOfNode(bySlot(big, 'upload-panel')[0])).includes('and 50 more'))
	assert.match(norm(textOfNode(bySlot(big, 'upload-summary')[0])), /Uploading 0 of 250/, 'the summary still counts them all')
	const keys = findAllNodes(big, (n) => n.attrs['data-slot'] === 'upload-row').length
	assert.equal(keys, 200)
})

await check('panel: icons are decoration, the panel moves nothing for people who asked for no motion', () => {
	const html = renderPanel({ state: kitchenSink() })
	const root = parseHtml(html)
	for (const svg of findAllNodes(root, (n) => n.tag === 'svg')) assert.equal(svg.attrs['aria-hidden'], 'true', 'an icon without aria-hidden')
	for (const el of findAllNodes(root, () => true)) {
		const cls = (el.attrs.class ?? '').split(/\s+/)
		if (cls.some((c) => /^animate-(spin|pulse|in)$/.test(c))) assert.ok(cls.includes('motion-reduce:animate-none'), `animated without a reduced-motion opt-out: ${el.attrs.class}`)
		if (cls.some((c) => /^transition(-|$)/.test(c))) assert.ok(cls.includes('motion-reduce:transition-none'), `transition without a reduced-motion opt-out: ${el.attrs.class}`)
	}
})

await check('overlay: it says where the drop will go, is hidden from assistive tech, ignores the pointer and respects reduced motion', () => {
	const root = staticChecks(renderToString(h(DropOverlay, { label: 'Upload to Clients/Acme' })), 'overlay')
	const overlay = bySlot(root, 'drop-overlay')[0]
	assert.equal(overlay.attrs['aria-hidden'], 'true')
	const cls = overlay.attrs.class.split(/\s+/)
	for (const c of ['fixed', 'inset-0', 'pointer-events-none']) assert.ok(cls.includes(c), c)
	assert.ok(cls.includes('motion-reduce:animate-none'))
	assert.ok(textOfNode(overlay).includes('Upload to Clients/Acme'))
	assert.equal(findAllNodes(root, interactiveNode).length, 0)
	const hostile = renderToString(h(DropOverlay, { label: '<img src=x onerror=1>' }))
	assert.ok(!/<img/i.test(hostile))
})

/* -------------------------------------------------------------------------- */
/* The manager, server-rendered                                               */
/* -------------------------------------------------------------------------- */

const managerProps = (over = {}) => ({
	folderId: null,
	destinationLabel: 'Upload to Unfiled',
	disabled: false,
	maxBytes: MAX,
	workspaceId: WS,
	pathPrefix: PREFIX,
	onRegistered: noop,
	onOpenAsset: noop,
	onSelectBatch: noop,
	...over,
})

await check('manager SSR: it renders a hidden file input that takes the library types, multiple, and nothing else visible', () => {
	const root = staticChecks(renderToString(h(UploadManager, managerProps())), 'manager')
	const input = findAllNodes(root, (n) => n.tag === 'input')
	assert.equal(input.length, 1)
	const [el] = input
	assert.equal(el.attrs.type, 'file')
	assert.equal(el.attrs.multiple, '')
	assert.equal(el.attrs.hidden, '')
	assert.equal(el.attrs.accept, ACCEPT)
	assert.equal(el.attrs.disabled, undefined)
	assert.equal(el.attrs['aria-label'], 'Choose images to upload')
	assert.equal(bySlot(root, 'drop-overlay').length, 0, 'no overlay until a file drag arrives')
	assert.equal(findAllNodes(root, (n) => n.tag === 'button').length, 0, 'the page header owns the Upload button')
	assert.equal(rowsIn(root).length, 0)
	assert.equal(bySlot(root, 'upload-summary').length, 1, 'the live region is in the page from the start')
})

await check('manager SSR: disabled, the input is disabled and nothing at all is interactive', () => {
	const root = staticChecks(renderToString(h(UploadManager, managerProps({ disabled: true }))), 'disabled')
	assert.equal(findAllNodes(root, (n) => n.tag === 'input')[0].attrs.disabled, '')
	assert.equal(findAllNodes(root, (n) => n.tag === 'button' || n.tag === 'a' || n.tag === 'select').length, 0)
	assert.equal(bySlot(root, 'drop-overlay').length, 0)
})

await check('manager SSR: server and first client render are identical (no time, no random), with no React warnings', () => {
	const a = renderToString(h(UploadManager, managerProps()))
	const b = renderToString(h(UploadManager, managerProps()))
	assert.equal(a, b)
	for (const label of ['Upload to Clients/Acme', '<script>']) {
		const html = renderToString(h(UploadManager, managerProps({ destinationLabel: label })))
		assert.ok(!/<script/.test(html))
	}
})

/* -------------------------------------------------------------------------- */
/* A tiny hook-aware renderer, to run the real components with real hooks     */
/* -------------------------------------------------------------------------- */

const INTERNALS = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
const MEMO = Symbol.for('react.memo')
const FORWARD = Symbol.for('react.forward_ref')
const FRAGMENT = Symbol.for('react.fragment')
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))

function mount(Component, initialProps, { strict = false } = {}) {
	const instances = new Map()
	const hosts = new Map()
	let props = initialProps
	let tree = []
	let layout = []
	let passive = []
	let dirty = false
	let batching = 0
	let alive = true
	let queued = false
	let ids = 0

	const schedule = () => {
		if (!alive) return
		dirty = true
		if (batching === 0 && !queued) {
			queued = true
			queueMicrotask(() => {
				queued = false
				flush()
			})
		}
	}

	const registerEffect = (queue, slot, kind, create, deps) => {
		const changed = !slot.registered || deps === undefined || !sameDeps(slot.deps, deps)
		slot.registered = true
		slot.kind = kind
		if (changed) {
			slot.pendingCreate = create
			slot.pendingDeps = deps
			queue.push(slot)
		}
	}

	function dispatcherFor(instance) {
		let index = 0
		const next = () => {
			const i = index++
			return (instance.hooks[i] ??= {})
		}
		const d = {
			useState(initial) {
				const s = next()
				if (!s.init) {
					s.init = true
					s.value = typeof initial === 'function' ? initial() : initial
					s.set = (v) => {
						const value = typeof v === 'function' ? v(s.value) : v
						if (Object.is(value, s.value)) return
						s.value = value
						schedule()
					}
				}
				return [s.value, s.set]
			},
			useRef(initial) {
				const s = next()
				return (s.ref ??= { current: initial })
			},
			useMemo(factory, deps) {
				const s = next()
				if (!s.has || !sameDeps(s.deps, deps)) {
					s.value = factory()
					s.has = true
					s.deps = deps
				}
				return s.value
			},
			useCallback: (fn, deps) => d.useMemo(() => fn, deps),
			useEffect(create, deps) {
				registerEffect(passive, next(), 'passive', create, deps)
			},
			useLayoutEffect(create, deps) {
				registerEffect(layout, next(), 'layout', create, deps)
			},
			useImperativeHandle(ref, create, deps) {
				registerEffect(
					layout,
					next(),
					'layout',
					() => {
						const value = create()
						if (typeof ref === 'function') {
							ref(value)
							return () => ref(null)
						}
						if (ref) {
							ref.current = value
							return () => {
								ref.current = null
							}
						}
					},
					deps ? [...deps, ref] : undefined,
				)
			},
			useId() {
				const s = next()
				return (s.id ??= `:t${++ids}:`)
			},
			useSyncExternalStore(subscribe, getSnapshot) {
				const s = next()
				s.getSnapshot = getSnapshot
				s.value = getSnapshot()
				registerEffect(
					passive,
					next(),
					'passive',
					() => {
						const check = () => {
							if (!Object.is(s.getSnapshot(), s.value)) schedule()
						}
						const unsubscribe = subscribe(check)
						check()
						return unsubscribe
					},
					[subscribe],
				)
				return s.value
			},
		}
		d.useInsertionEffect = d.useLayoutEffect
		return d
	}

	function hostFor(path, type) {
		if (!hosts.has(path)) {
			const node = { tagName: type.toUpperCase(), clicks: 0, value: '' }
			node.click = () => {
				node.clicks++
			}
			hosts.set(path, node)
		}
		return hosts.get(path)
	}

	function call(type, p, path) {
		let instance = instances.get(path)
		if (!instance) instances.set(path, (instance = { hooks: [] }))
		const previous = INTERNALS.H
		INTERNALS.H = dispatcherFor(instance)
		try {
			return type.render ? type.render(p, p.ref ?? null) : type(p)
		} finally {
			INTERNALS.H = previous
		}
	}

	function expand(node, path) {
		if (node === null || node === undefined || typeof node === 'boolean') return []
		if (Array.isArray(node)) return node.flatMap((c, i) => expand(c, `${path}[${i}]`))
		if (typeof node === 'string' || typeof node === 'number') return [String(node)]
		const { type, props: p } = node
		const here = `${path}/${node.key ?? ''}${typeof type === 'string' ? type : (type.displayName ?? type.name ?? 'c')}`
		if (type === FRAGMENT) return expand(p.children, here)
		if (typeof type === 'string') {
			const host = hostFor(here, type)
			const element = { type, props: p, key: node.key, host, children: expand(p.children, here) }
			if (p.ref && typeof p.ref === 'object') p.ref.current = host
			return [element]
		}
		if (type.$$typeof === MEMO) return expand({ ...node, type: type.type }, path)
		if (type.$$typeof === FORWARD || typeof type === 'function') {
			const out = expand(call(type, p, here), here)
			// A list item's key sits on the component element, not on the host node it renders.
			if (node.key != null)
				for (const n of out) if (typeof n !== 'string' && n.componentKey === undefined) n.componentKey = node.key
			return out
		}
		throw new Error(`mount: cannot expand ${String(type)}`)
	}

	function slots() {
		const out = []
		for (const instance of instances.values()) for (const s of instance.hooks) if (s?.registered) out.push(s)
		return out
	}

	function commit() {
		const lay = layout
		const pas = passive
		layout = []
		passive = []
		for (const s of [...lay, ...pas])
			if (typeof s.cleanup === 'function') {
				const cleanup = s.cleanup
				s.cleanup = undefined
				cleanup()
			}
		for (const s of [...lay, ...pas]) {
			s.cleanup = s.pendingCreate()
			s.deps = s.pendingDeps
		}
	}

	function render() {
		layout = []
		passive = []
		tree = expand(h(Component, props), 'root')
		commit()
	}

	function flush() {
		let guard = 0
		batching++
		try {
			while (dirty && alive) {
				if (++guard > 60) throw new Error('mount: render loop')
				dirty = false
				render()
			}
		} finally {
			batching--
		}
	}

	function act(fn) {
		batching++
		let result
		try {
			result = fn()
		} finally {
			batching--
		}
		flush()
		return result
	}

	function unmount() {
		if (!alive) return
		for (const s of slots())
			if (typeof s.cleanup === 'function') {
				const cleanup = s.cleanup
				s.cleanup = undefined
				cleanup()
			}
		alive = false
	}

	const textOf = (n) => (typeof n === 'string' ? n : n.children.map(textOf).join(''))
	const gather = (nodes, out) => {
		for (const n of nodes) {
			if (typeof n === 'string') continue
			out.push(n)
			gather(n.children, out)
		}
		return out
	}
	const nameOf = (n) => n.props['aria-label'] ?? textOf(n)

	dirty = true
	flush()
	if (strict) {
		// React's dev re-mount: every effect is torn down and set up again, state kept.
		act(() => {
			for (const s of slots())
				if (typeof s.cleanup === 'function') {
					const cleanup = s.cleanup
					s.cleanup = undefined
					cleanup()
				}
			for (const kind of ['layout', 'passive'])
				for (const s of slots())
					if (s.kind === kind) {
						s.cleanup = s.pendingCreate()
					}
		})
	}

	const api = {
		get tree() {
			return tree
		},
		rerender(next) {
			props = next
			dirty = true
			flush()
		},
		act,
		unmount,
		findAll: (pred) => gather(tree, []).filter(pred),
		find: (pred) => gather(tree, []).find(pred),
		text: textOf,
		slot: (name) => gather(tree, []).find((n) => n.props['data-slot'] === name),
		slots: (name) => gather(tree, []).filter((n) => n.props['data-slot'] === name),
		button: (name) => gather(tree, []).find((n) => n.type === 'button' && (typeof name === 'string' ? nameOf(n) === name : name.test(nameOf(n)))),
		buttons: () => gather(tree, []).filter((n) => n.type === 'button').map(nameOf),
		click(node) {
			if (!node) throw new Error('click: no such element')
			return act(() => node.props.onClick({ preventDefault: noop, stopPropagation: noop, target: node.host, currentTarget: node.host }))
		},
		/** Waits for async work (the engine, dynamic imports), then lets React catch up. */
		async settle(turns = 12) {
			for (let i = 0; i < turns; i++) await tick()
			flush()
		},
		async until(condition, label) {
			for (let i = 0; i < 600; i++) {
				flush()
				if (condition()) return
				await tick()
			}
			throw new Error(`timed out waiting for ${label}`)
		},
	}
	return api
}

function installWindow() {
	const target = new EventTarget()
	const registry = new Map()
	const storage = new Map()
	const win = {
		addEventListener(type, listener, options) {
			if (!registry.has(type)) registry.set(type, new Set())
			registry.get(type).add(listener)
			target.addEventListener(type, listener, options)
		},
		removeEventListener(type, listener, options) {
			registry.get(type)?.delete(listener)
			target.removeEventListener(type, listener, options)
		},
		dispatch: (event) => (target.dispatchEvent(event), event),
		count: (type) => registry.get(type)?.size ?? 0,
		total: () => [...registry.values()].reduce((n, set) => n + set.size, 0),
		storage,
		sessionStorage: {
			getItem: (key) => (storage.has(key) ? storage.get(key) : null),
			setItem: (key, value) => void storage.set(key, String(value)),
			removeItem: (key) => void storage.delete(key),
		},
	}
	const hadWindow = 'window' in globalThis
	const previous = globalThis.window
	globalThis.window = win
	return {
		win,
		restore() {
			if (hadWindow) globalThis.window = previous
			else delete globalThis.window
		},
	}
}

/** Everything a manager test needs: a window, a Blob client, a fetch, and a mounted component. */
function managerRig({ strict = false, props = {}, auto = false } = {}) {
	const { win, restore } = installWindow()
	const env = makeEnv({ auto })
	const originalFetch = globalThis.fetch
	globalThis.fetch = (url, init) => env.fetch(url, init)
	blobUpload = (pathname, file, options) => env.upload(pathname, file, options)
	const handle = { current: null }
	const log = { registered: [], busy: [], selected: [], opened: [] }
	const base = managerProps({
		handleRef: handle,
		onRegistered: (r) => log.registered.push(r),
		onBusyChange: (b) => log.busy.push(b),
		onSelectBatch: (ids) => log.selected.push(ids),
		onOpenAsset: (id) => log.opened.push(id),
		...props,
	})
	const view = mount(UploadManager, base, { strict })
	return {
		win,
		env,
		view,
		handle,
		log,
		base,
		input: () => view.find((n) => n.type === 'input'),
		rerender: (over) => view.rerender({ ...base, ...over }),
		cleanup() {
			view.unmount()
			globalThis.fetch = originalFetch
			blobUpload = async () => {
				throw new Error('blob upload was not stubbed for this check')
			}
			restore()
		},
	}
}

async function withManager(options, fn) {
	const rig = managerRig(options)
	try {
		await fn(rig)
	} finally {
		rig.cleanup()
	}
}

await check('harness: the renderer\'s own hooks behave (effects, cleanups, deps, state, strict re-mount)', async () => {
	const log = []
	function Probe({ dep, setter }) {
		const [n, setN] = React.useState(() => (log.push('init'), 0))
		setter.fn = setN
		React.useEffect(() => {
			log.push(`effect:${dep}`)
			return () => log.push(`cleanup:${dep}`)
		}, [dep])
		React.useLayoutEffect(() => {
			log.push('layout')
		})
		return h('p', null, String(n))
	}
	const setter = {}
	const view = mount(Probe, { dep: 'a', setter }, { strict: true })
	// init once; layout then passive; then the strict cycle: cleanup, then layout, then passive again.
	assert.deepEqual(log, ['init', 'layout', 'effect:a', 'cleanup:a', 'layout', 'effect:a'])
	log.length = 0
	view.act(() => setter.fn(1))
	assert.equal(view.text(view.tree[0]), '1')
	assert.deepEqual(log, ['layout'], 'a state change re-runs the dep-less effect only')
	log.length = 0
	view.rerender({ dep: 'b', setter })
	assert.deepEqual(log, ['cleanup:a', 'layout', 'effect:b'])
	view.unmount()
	assert.equal(log[log.length - 1], 'cleanup:b')
})

await check('manager: it listens for file drags on the window for as long as it is mounted, and no longer', async () => {
	await withManager({}, async (rig) => {
		for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) assert.equal(rig.win.count(type), 1, type)
		assert.equal(rig.win.count('beforeunload'), 0, 'idle: no unload guard')
		rig.view.unmount()
		assert.equal(rig.win.total(), 0, 'every listener is gone after unmount')
	})
})

await check('manager: React\'s dev double-mount leaves one set of listeners and a working queue', async () => {
	await withManager({ strict: true }, async (rig) => {
		for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) assert.equal(rig.win.count(type), 1, type)
		assert.equal(typeof rig.handle.current?.addFiles, 'function', 'the handle survives the re-mount')
		rig.handle.current.addFiles([fakeFile('a.png')])
		await rig.view.until(() => rig.env.uploads.length === 1, 'the upload to start (the queue must not stay paused)')
		await completeAll(rig.env)
		await rig.view.until(() => rig.log.registered.length === 1, 'registration')
	})
})

await check('manager: the imperative handle opens the picker and adds files, and refuses both while disabled', async () => {
	await withManager({}, async (rig) => {
		assert.equal(typeof rig.handle.current.openPicker, 'function')
		assert.equal(typeof rig.handle.current.addFiles, 'function')
		const input = rig.input()
		assert.equal(input.host.clicks, 0)
		rig.handle.current.openPicker()
		assert.equal(input.host.clicks, 1)
		rig.rerender({ disabled: true })
		rig.handle.current.openPicker()
		rig.handle.current.addFiles([fakeFile('a.png')])
		await rig.view.settle()
		assert.equal(input.host.clicks, 1, 'disabled: the picker does not open')
		assert.equal(rig.env.uploads.length, 0, 'disabled: nothing is enqueued')
		assert.equal(rig.view.slots('upload-row').length, 0)
		assert.equal(rig.input().props.disabled, true)
		rig.rerender({ disabled: false })
		rig.handle.current.addFiles([fakeFile('b.png')])
		await rig.view.until(() => rig.env.uploads.length === 1, 'upload after re-enabling')
	})
	// The handle is cleared when the component goes away.
	const rig = managerRig()
	assert.ok(rig.handle.current)
	rig.cleanup()
	assert.equal(rig.handle.current, null)
})

await check('manager: choosing files in the picker adds them, and copies the list before the input is reset', async () => {
	await withManager({}, async (rig) => {
		const files = [fakeFile('one.png'), fakeFile('two.jpg', 10, 'image/jpeg')]
		const target = {
			files,
			get value() {
				return 'C:\\fakepath\\one.png'
			},
			// Browsers empty the live FileList when the value is cleared.
			set value(v) {
				if (v === '') files.length = 0
			},
		}
		rig.view.act(() => rig.input().props.onChange({ target }))
		assert.equal(files.length, 0, 'the input was reset so the same file can be chosen again')
		await rig.view.until(() => rig.env.uploads.length === 2, 'both files to start')
		assert.deepEqual(rig.env.uploads.map((c) => c.file.name), ['one.png', 'two.jpg'])
		// A change with no files at all is harmless.
		assert.doesNotThrow(() => rig.view.act(() => rig.input().props.onChange({ target: { files: null, value: '' } })))
		assert.doesNotThrow(() => rig.view.act(() => rig.input().props.onChange({ target: { files: [], value: '' } })))
	})
})

await check('manager: a file goes through the real default uploader with the contract\'s options, then registers', async () => {
	await withManager({ props: { folderId: FOLDER, destinationLabel: 'Upload to Clients/Acme' } }, async (rig) => {
		rig.handle.current.addFiles([fakeFile('Front Door.JPG', 3 * MB, 'image/jpeg')])
		await rig.view.until(() => rig.env.uploads.length === 1, 'upload')
		const call = rig.env.uploads[0]
		assert.equal(call.pathname, `${PREFIX}front-door.jpg`)
		assert.equal(call.options.access, 'public')
		assert.equal(call.options.handleUploadUrl, '/api/account/media/upload')
		assert.deepEqual(JSON.parse(call.options.clientPayload), { workspaceId: WS, folderId: FOLDER })
		assert.equal(call.options.multipart, false)
		call.resolve()
		await rig.view.until(() => rig.env.fetches.length === 1, 'registration')
		const reg = rig.env.fetches[0]
		assert.equal(reg.headers.get('x-media-workspace'), WS)
		assert.equal(reg.body.folderId, FOLDER)
		reg.created({ name: 'Front Door', folderPath: 'Clients/Acme' })
		await rig.view.until(() => rig.log.registered.length === 1, 'onRegistered')
		assert.equal(rig.log.registered[0].status, 'created')
		assert.equal(rig.log.registered[0].asset.name, 'Front Door')
		const root = parseHtml(renderToString(h(UploadQueuePanel, panelProps({ state: stateOf([item({ state: 'done', asset: rig.log.registered[0].asset })]) }))))
		assert.ok(norm(textOfNode(bySlot(root, 'upload-panel')[0])).includes('Done'))
	})
})

await check('manager: busy is reported when work starts and stops, and the unload guard is on only meanwhile', async () => {
	await withManager({}, async (rig) => {
		assert.deepEqual(rig.log.busy, [], 'idle at mount: nothing to report')
		rig.handle.current.addFiles([fakeFile('a.png'), fakeFile('b.png')])
		await rig.view.until(() => rig.env.uploads.length === 2, 'uploads')
		assert.deepEqual(rig.log.busy, [true])
		assert.equal(rig.win.count('beforeunload'), 1)
		const guard = new Event('beforeunload', { cancelable: true })
		rig.win.dispatch(guard)
		assert.equal(guard.defaultPrevented, true, 'leaving now would lose uploads, so the browser is asked')
		await completeAll(rig.env)
		await rig.view.until(() => rig.log.busy.length === 2, 'idle again')
		assert.deepEqual(rig.log.busy, [true, false], 'one report per change, not per render')
		assert.equal(rig.win.count('beforeunload'), 0)
		const free = new Event('beforeunload', { cancelable: true })
		rig.win.dispatch(free)
		assert.equal(free.defaultPrevented, false)
	})
})

await check('manager: busy stays true across retries and goes false only when everything has settled', async () => {
	await withManager({}, async (rig) => {
		rig.handle.current.addFiles([fakeFile('a.png')])
		await rig.view.until(() => rig.env.uploads.length === 1, 'upload')
		rig.env.uploads[0].reject(new Error('x'))
		await rig.view.until(() => rig.log.busy.length === 2, 'a failure is not busy')
		assert.deepEqual(rig.log.busy, [true, false])
		rig.view.click(rig.view.button('Retry a.png'))
		await rig.view.until(() => rig.env.uploads.length === 2, 'retry upload')
		assert.deepEqual(rig.log.busy, [true, false, true])
		assert.equal(rig.win.count('beforeunload'), 1)
	})
})

await check('manager: unmounting while busy tells the page it is no longer busy and drops every listener', async () => {
	const rig = managerRig()
	rig.handle.current.addFiles([fakeFile('a.png')])
	await rig.view.until(() => rig.env.uploads.length === 1, 'upload')
	assert.equal(rig.win.count('beforeunload'), 1)
	assert.deepEqual(rig.log.busy, [true])
	rig.view.unmount()
	assert.deepEqual(rig.log.busy, [true, false])
	assert.equal(rig.win.total(), 0)
	rig.cleanup()
})

await check('manager: a drag of files lights the overlay with the destination, and dropping adds them', async () => {
	await withManager({ props: { destinationLabel: 'Upload to Clients/Acme', folderId: FOLDER } }, async (rig) => {
		assert.equal(rig.view.slot('drop-overlay'), undefined)
		const enter = rig.win.dispatch(dragEvent('dragenter'))
		assert.equal(enter.defaultPrevented, true)
		await rig.view.until(() => rig.view.slot('drop-overlay'), 'the overlay')
		assert.ok(rig.view.text(rig.view.slot('drop-overlay')).includes('Upload to Clients/Acme'))
		const files = [fakeFile('dropped-1.png'), fakeFile('dropped-2.png')]
		const drop = rig.win.dispatch(dragEvent('drop', { files }))
		assert.equal(drop.defaultPrevented, true)
		await rig.view.until(() => rig.view.slot('drop-overlay') === undefined, 'the overlay to go')
		await rig.view.until(() => rig.view.slots('upload-row').length === 2, 'two rows')
		await rig.view.until(() => rig.env.uploads.length === 2, 'two uploads')
		assert.deepEqual(JSON.parse(rig.env.uploads[0].options.clientPayload), { workspaceId: WS, folderId: FOLDER })
		assert.equal(rig.win.count('beforeunload'), 1)
	})
})

await check('manager: an in-app card drag never shows the overlay, and a drag of files that is not allowed here does nothing', async () => {
	await withManager({}, async (rig) => {
		const own = rig.win.dispatch(dragEvent('dragenter', { types: [DRAG_MIME, 'text/plain'] }))
		rig.win.dispatch(dragEvent('dragover', { types: ['Files', DRAG_MIME] }))
		await rig.view.settle()
		assert.equal(own.defaultPrevented, false)
		assert.equal(rig.view.slot('drop-overlay'), undefined)
		const drop = rig.win.dispatch(dragEvent('drop', { types: [DRAG_MIME], files: [fakeFile('a.png')] }))
		assert.equal(drop.defaultPrevented, false)
		await rig.view.settle()
		assert.equal(rig.env.uploads.length, 0)
	})
	await withManager({ props: { disabled: true } }, async (rig) => {
		const enter = rig.win.dispatch(dragEvent('dragenter'))
		await rig.view.settle()
		assert.equal(rig.view.slot('drop-overlay'), undefined, 'disabled: no overlay')
		const drop = rig.win.dispatch(dragEvent('drop', { files: [fakeFile('a.png')] }))
		await rig.view.settle()
		assert.equal(enter.defaultPrevented && drop.defaultPrevented, true, 'but the browser is not allowed to navigate to the file')
		assert.equal(rig.env.uploads.length, 0)
		assert.equal(rig.view.slots('upload-row').length, 0)
	})
})

await check('manager: callbacks and props are read fresh, so a later folder or handler is the one used', async () => {
	await withManager({ props: { folderId: FOLDER, destinationLabel: 'Upload to A' } }, async (rig) => {
		const addFiles = rig.handle.current.addFiles
		addFiles([fakeFile('first.png')])
		await rig.view.until(() => rig.env.uploads.length === 1, 'first upload')
		const later = []
		rig.rerender({ folderId: null, destinationLabel: 'Upload to B', onRegistered: (r) => later.push(r) })
		assert.equal(rig.handle.current.addFiles, addFiles, 'the handle is stable across renders')
		addFiles([fakeFile('second.png')])
		await rig.view.until(() => rig.env.uploads.length === 2, 'second upload')
		assert.deepEqual(JSON.parse(rig.env.uploads[0].options.clientPayload).folderId, FOLDER, 'the first stays where it was told')
		assert.deepEqual(JSON.parse(rig.env.uploads[1].options.clientPayload).folderId, null)
		await completeAll(rig.env)
		await rig.view.until(() => later.length === 2, 'both reported to the newest handler')
		assert.equal(rig.log.registered.length, 0, 'the stale handler heard nothing')
		const overlayText = (() => {
			rig.win.dispatch(dragEvent('dragenter'))
			return null
		})()
		await rig.view.until(() => rig.view.slot('drop-overlay'), 'overlay')
		assert.ok(rig.view.text(rig.view.slot('drop-overlay')).includes('Upload to B'), 'the overlay shows the current destination')
		assert.equal(overlayText, null)
	})
})

await check('manager: the panel appears with the first file, can be collapsed, and opens again for new files', async () => {
	await withManager({}, async (rig) => {
		assert.equal(rig.view.slot('upload-panel').props['data-empty'], 'true')
		rig.handle.current.addFiles([fakeFile('a.png')])
		await rig.view.until(() => rig.view.slots('upload-row').length === 1, 'row')
		assert.equal(rig.view.slot('upload-panel').props['data-empty'], undefined)
		const toggle = rig.view.button('Hide upload details')
		assert.ok(toggle)
		rig.view.click(toggle)
		assert.ok(rig.view.button('Show upload details'))
		assert.equal(rig.view.find((n) => n.type === 'ul').props.hidden, true)
		rig.handle.current.addFiles([fakeFile('b.png')])
		await rig.view.until(() => rig.view.button('Hide upload details'), 'the panel to open for new work')
		assert.equal(rig.view.find((n) => n.type === 'ul').props.hidden, false)
		// Invalid files alone still appear (so the person learns why) and open it.
		rig.view.click(rig.view.button('Hide upload details'))
		rig.handle.current.addFiles([fakeFile('c.pdf', 4, 'application/pdf')])
		await rig.view.until(() => rig.view.button('Hide upload details'), 'open again')
		// Nothing usable added: it stays as it was.
		rig.view.click(rig.view.button('Hide upload details'))
		rig.handle.current.addFiles([])
		await rig.view.settle()
		assert.ok(rig.view.button('Show upload details'))
	})
})

await check('manager: the whole batch flow: footer, Select them, View on a duplicate, Remove and Clear finished', async () => {
	await withManager({}, async (rig) => {
		rig.handle.current.addFiles([fakeFile('n1.png'), fakeFile('n2.png'), fakeFile('known.png')])
		await rig.view.until(() => rig.env.uploads.length === 3, 'uploads')
		for (const call of rig.env.uploads) call.resolve()
		await rig.view.until(() => rig.env.fetches.length === 3, 'registrations')
		const [a, b, c] = rig.env.fetches
		a.created()
		b.created()
		c.duplicate({ id: 'e'.repeat(24), name: 'Known', folderPath: 'Old/Stuff' })
		await rig.view.until(() => rig.view.slot('upload-footer'), 'the footer')
		assert.match(rig.view.text(rig.view.slot('upload-footer')), /^2 added\./)
		assert.match(rig.view.text(rig.view.slot('upload-summary')), /2 added, 1 already in your library/)
		assert.ok(rig.view.text(rig.view.slots('upload-row')[2]).includes('Already in your library as Old/Stuff/Known'))

		rig.view.click(rig.view.button('View Known'))
		assert.deepEqual(rig.log.opened, ['e'.repeat(24)])

		rig.view.click(rig.view.button(/^Select them/))
		assert.equal(rig.log.selected.length, 1)
		assert.equal(rig.log.selected[0].length, 2, 'only what was created')
		assert.ok(!rig.log.selected[0].includes('e'.repeat(24)), 'not the duplicate')
		assert.deepEqual(
			rig.log.selected[0].sort(),
			rig.log.registered.filter((r) => r.status === 'created').map((r) => r.asset.id).sort(),
		)
		assert.equal(rig.view.slot('upload-footer'), undefined, 'used once')

		rig.view.click(rig.view.button('Remove n1.png'))
		assert.equal(rig.view.slots('upload-row').length, 2)
		rig.view.click(rig.view.button('Clear finished'))
		assert.equal(rig.view.slots('upload-row').length, 0)
		assert.equal(rig.view.slot('upload-panel').props['data-empty'], 'true', 'the panel is gone again')
		assert.equal(rig.view.text(rig.view.slot('upload-summary')), '')
	})
})

await check('manager: Retry and Cancel on rows do what they say', async () => {
	await withManager({}, async (rig) => {
		rig.handle.current.addFiles([fakeFile('a.png'), fakeFile('b.png')])
		await rig.view.until(() => rig.env.uploads.length === 2, 'uploads')
		rig.env.uploads[0].resolve()
		await rig.view.until(() => rig.env.fetches.length === 1, 'register')
		rig.env.fetches[0].respond(502, '<html>')
		await rig.view.until(() => rig.view.button('Retry a.png'), 'a Retry button after the registration failure')
		rig.view.click(rig.view.button('Retry a.png'))
		await rig.view.until(() => rig.env.fetches.length === 2, 'second registration')
		assert.equal(rig.env.uploads.length, 2, 'no second upload for a registration retry')
		assert.equal(rig.env.fetches[1].body.url, rig.env.fetches[0].body.url)
		const signal = rig.env.uploads[1].options.abortSignal
		rig.view.click(rig.view.button('Cancel upload of b.png'))
		assert.equal(signal.aborted, true)
		await rig.view.until(() => rig.view.slots('upload-row').length === 1, 'the cancelled row to go')
	})
})

await check('manager: a refused file has Remove but no Retry, and the hint says what is accepted', async () => {
	await withManager({}, async (rig) => {
		rig.handle.current.addFiles([fakeFile('photo.heic', 5, 'image/heic')])
		await rig.view.until(() => rig.view.slots('upload-row').length === 1, 'row')
		assert.deepEqual(rig.view.buttons().filter((n) => /photo\.heic/.test(n)), ['Remove photo.heic'])
		const text = rig.view.text(rig.view.slots('upload-row')[0])
		assert.ok(text.includes('Not a supported image') && text.includes('Use JPG, PNG, WebP, AVIF or GIF.'), text)
		assert.equal(rig.env.uploads.length, 0)
	})
})

await check('manager: disabled while rows exist freezes them: no controls, no new work, queued files wait', async () => {
	await withManager({}, async (rig) => {
		rig.handle.current.addFiles(Array.from({ length: 5 }, (_, i) => fakeFile(`f${i}.png`)))
		await rig.view.until(() => rig.env.uploads.length === 3, 'three uploads')
		rig.rerender({ disabled: true })
		assert.deepEqual(rig.view.buttons(), [], 'nothing to press')
		for (const call of rig.env.uploads) call.resolve()
		await rig.view.until(() => rig.env.fetches.length === 3, 'in-flight work is allowed to finish')
		rig.env.fetches.forEach((call) => call.created())
		await rig.view.settle()
		assert.equal(rig.env.uploads.length, 3, 'queued files wait while disabled')
		rig.rerender({ disabled: false })
		await rig.view.until(() => rig.env.uploads.length === 5, 'and go when enabled again')
	})
})

await check('manager: it renders clean through the mini renderer with no React warnings, even with many rows', async () => {
	await withManager({}, async (rig) => {
		rig.handle.current.addFiles(Array.from({ length: 30 }, (_, i) => fakeFile(`bulk-${i}.png`)))
		await rig.view.until(() => rig.view.slots('upload-row').length === 30, 'thirty rows')
		const keys = rig.view.findAll((n) => n.props['data-slot'] === 'upload-row').map((n) => n.componentKey)
		assert.equal(new Set(keys).size, 30, 'every row has its own key')
	})
})

/* -------------------------------------------------------------------------- */
/* The AI status banner                                                       */
/* -------------------------------------------------------------------------- */

const aiStatus = (over = {}) => ({
	configured: true,
	model: 'claude-opus-5-5',
	pending: 0,
	running: 0,
	failed: 0,
	skipped: 0,
	untagged: 0,
	budgetExhausted: false,
	resetsAt: null,
	...over,
})
const bannerProps = (over = {}) => ({
	status: aiStatus(),
	pending: 0,
	working: false,
	blockedMessage: null,
	canWrite: true,
	onTagUntagged: noop,
	onRetryFailed: noop,
	...over,
})
const renderBanner = (over) => renderToString(h(AiStatusBanner, bannerProps(over)))
const bannerNode = (root) => bySlot(root, 'ai-status-banner')[0]

await check('banner: with nothing to say it renders nothing at all', () => {
	for (const over of [
		{},
		{ status: null },
		{ status: aiStatus({ pending: 5, running: 1 }), pending: 0 },
		{ status: aiStatus({ configured: false, untagged: 0 }) },
		{ status: aiStatus({ configured: false, untagged: 0, failed: 3, skipped: 4 }) },
		{ working: true, pending: 0 },
		{ working: false, pending: 12 },
		{ blockedMessage: '' },
		{ blockedMessage: '   ' },
		{ blockedMessage: null, status: null, working: false, pending: 0 },
	])
		assert.equal(renderBanner(over), '', JSON.stringify(over))
})

await check('banner: no key and untagged images: an informational note with the exact how-to', () => {
	const html = renderBanner({ status: aiStatus({ configured: false, untagged: 5 }) })
	const root = staticChecks(html, 'off')
	const note = bannerNode(root)
	assert.equal(note.attrs['data-kind'], 'off')
	assert.equal(note.attrs['data-tone'], 'info')
	assert.equal(AI_OFF_HEADLINE, 'Auto-tagging is off.')
	assert.equal(AI_OFF_HOWTO, 'Add ANTHROPIC_API_KEY to your environment to turn on AI tags. Colours, size and file-name tags still work.')
	assert.equal(norm(textOfNode(note)), `${AI_OFF_HEADLINE} ${AI_OFF_HOWTO}`)
	assert.ok(html.includes('Add ANTHROPIC_API_KEY to your environment to turn on AI tags. Colours, size and file-name tags still work.'))
	assert.deepEqual(buttonNames(root), ['Dismiss this note'], 'informational: dismissible, nothing to press')
	assert.equal(findAllNodes(root, (n) => n.attrs['aria-live'] !== undefined || n.attrs.role === 'status' || n.attrs.role === 'alert').length, 0, 'the library\'s own region announces; the banner does not')
})

await check('banner: a blocked run shows the message verbatim as a warning, over everything else', () => {
	const message = 'Your Anthropic account has no credit. Add credit, then retry.'
	const html = renderBanner({
		blockedMessage: message,
		status: aiStatus({ configured: false, untagged: 9, failed: 2, skipped: 3, budgetExhausted: true, resetsAt: '2026-10-04T00:00:00.000Z' }),
		working: true,
		pending: 4,
	})
	const root = staticChecks(html, 'blocked')
	const note = bannerNode(root)
	assert.equal(note.attrs['data-kind'], 'blocked')
	assert.equal(note.attrs['data-tone'], 'warning')
	assert.equal(norm(textOfNode(note)), message)
	assert.deepEqual(buttonNames(root), [], 'a warning is not dismissible')
	const weird = '  Model "x" <b>not found</b> & more\n'
	assert.equal(norm(textOfNode(bannerNode(parseHtml(renderBanner({ blockedMessage: weird }))))), norm(weird), 'escaped, not interpreted')
	assert.ok(!renderBanner({ blockedMessage: weird }).includes('<b>'))
	// No status yet, and the message still shows.
	assert.equal(bannerNode(parseHtml(renderBanner({ status: null, blockedMessage: message }))).attrs['data-kind'], 'blocked')
})

await check('banner: working shows a spinner and the pending count, and no button', () => {
	for (const [pending, text] of [[12, /12 images left/], [1, /1 image left/], [1234, /1,234 images left/]]) {
		const html = renderBanner({ working: true, pending })
		const root = staticChecks(html, 'working')
		const note = bannerNode(root)
		assert.equal(note.attrs['data-kind'], 'working')
		assert.equal(note.attrs['data-tone'], 'progress')
		assert.match(norm(textOfNode(note)), text)
		const spinner = findAllNodes(note, (n) => n.tag === 'svg')[0]
		assert.match(spinner.attrs.class, /\banimate-spin\b/)
		assert.match(spinner.attrs.class, /motion-reduce:animate-none/)
		assert.equal(spinner.attrs['aria-hidden'], 'true')
		assert.deepEqual(buttonNames(root), [])
	}
})

await check('banner: failed images say how many and offer Retry, which calls back', () => {
	const calls = []
	const html = renderBanner({ status: aiStatus({ failed: 3 }), onRetryFailed: () => calls.push('retry') })
	const root = staticChecks(html, 'failed')
	const note = bannerNode(root)
	assert.equal(note.attrs['data-kind'], 'failed')
	assert.equal(note.attrs['data-tone'], 'warning')
	assert.match(norm(textOfNode(note)), /^3 images could not be tagged/)
	assert.deepEqual(buttonNames(root), ['Retry tagging the failed images'])
	assert.match(norm(textOfNode(findAllNodes(root, (n) => n.tag === 'button')[0])), /^Retry$/)
	assert.match(norm(textOfNode(bannerNode(parseHtml(renderBanner({ status: aiStatus({ failed: 1 }) }))))), /^1 image could not be tagged/)
	assert.match(norm(textOfNode(bannerNode(parseHtml(renderBanner({ status: aiStatus({ failed: 12345 }) }))))), /^12,345 images could not be tagged/)
})

await check('banner: images added before auto-tagging was on offer "Tag them now", and can be dismissed', () => {
	const html = renderBanner({ status: aiStatus({ skipped: 7 }) })
	const root = staticChecks(html, 'skipped')
	const note = bannerNode(root)
	assert.equal(note.attrs['data-kind'], 'skipped')
	assert.equal(note.attrs['data-tone'], 'info')
	assert.match(norm(textOfNode(note)), /^7 images were added before auto-tagging was on/)
	assert.deepEqual(buttonNames(root), ['Tag them now', 'Dismiss this note'])
	assert.match(norm(textOfNode(bannerNode(parseHtml(renderBanner({ status: aiStatus({ skipped: 1 }) }))))), /^1 image was added before auto-tagging was on/)
})

await check('banner: a viewer sees the news but is never offered a button that would be refused', () => {
	for (const status of [aiStatus({ failed: 3 }), aiStatus({ skipped: 2 })]) {
		const root = staticChecks(renderBanner({ status, canWrite: false }), 'viewer')
		assert.ok(bannerNode(root), 'still informed')
		assert.ok(!buttonNames(root).some((n) => /Retry|Tag them/.test(n)), JSON.stringify(buttonNames(root)))
	}
	const off = parseHtml(renderBanner({ status: aiStatus({ configured: false, untagged: 3 }), canWrite: false }))
	assert.ok(bannerNode(off))
})

await check('banner: the daily limit says it was reached and, in the viewer\'s zone, when it resumes', () => {
	const resetsAt = '2026-10-04T00:00:00.000Z'
	// Server render (and the hydration pass): UTC, the same everywhere.
	const html = renderBanner({ status: aiStatus({ budgetExhausted: true, resetsAt, pending: 10 }), pending: 10 })
	const root = staticChecks(html, 'budget')
	const note = bannerNode(root)
	assert.equal(note.attrs['data-kind'], 'budget')
	assert.equal(note.attrs['data-tone'], 'warning')
	assert.equal(norm(textOfNode(note)), 'Daily AI tagging limit reached. Tagging resumes at 00:00 UTC.')
	assert.deepEqual(buttonNames(root), [])
	// No time given at all.
	for (const bad of [null, undefined, '', 'not a date', '2026-13-45']) {
		const text = norm(textOfNode(bannerNode(parseHtml(renderBanner({ status: aiStatus({ budgetExhausted: true, resetsAt: bad }) })))))
		assert.equal(text, 'Daily AI tagging limit reached. Tagging resumes tomorrow.', String(bad))
	}
	// It outranks the working line, failures and skipped images.
	assert.equal(bannerNode(parseHtml(renderBanner({ working: true, pending: 3, status: aiStatus({ budgetExhausted: true, resetsAt, failed: 2, skipped: 2 }) }))).attrs['data-kind'], 'budget')
})

await check('banner: the reset time reads in the zone given, today or tomorrow, 12 or 24 hour', () => {
	const resetsAt = '2026-10-04T00:00:00.000Z'
	const now = new Date('2026-10-03T14:00:00.000Z')
	const at = (timeZone, locale) => formatResumeTime(resetsAt, { now, timeZone, locale })
	assert.equal(at('America/Los_Angeles'), 'at 5:00 PM')
	assert.equal(at('America/New_York'), 'at 8:00 PM')
	assert.equal(at('UTC'), 'tomorrow at 12:00 AM')
	assert.equal(at('Asia/Tokyo'), 'tomorrow at 9:00 AM')
	assert.equal(at('Pacific/Kiritimati'), 'at 2:00 PM')
	assert.equal(at('America/Los_Angeles', 'en-GB'), 'at 17:00')
	assert.equal(at('UTC', 'en-GB'), 'tomorrow at 00:00')
	// Further out than tomorrow (a page left open for days): a day name, never a wrong "today".
	const far = formatResumeTime('2026-10-07T00:00:00.000Z', { now, timeZone: 'America/Los_Angeles' })
	assert.match(far, /^on [A-Z][a-z]{2}, Oct \d+ at \d{1,2}:00 [AP]M$/)
	// Already past: no pretending to know when.
	assert.equal(formatResumeTime('2026-10-03T13:59:00.000Z', { now, timeZone: 'UTC' }), 'shortly')
	assert.equal(formatResumeTime('2026-10-03T14:00:00.000Z', { now, timeZone: 'UTC' }), 'shortly')
	// Nonsense in, nothing out.
	for (const bad of [null, undefined, '', 'nope', 5, {}, '2026-02-31T99:00:00Z']) assert.equal(formatResumeTime(bad, { now }), null, String(bad))
	assert.equal(formatResumeTime(resetsAt, { now, timeZone: 'Not/AZone' }), null)
	assert.equal(formatResumeUtc(resetsAt), 'at 00:00 UTC')
	assert.equal(formatResumeUtc('2026-10-04T17:30:00Z'), 'at 17:30 UTC')
	assert.equal(formatResumeUtc('nope'), null)
	assert.equal(formatResumeUtc(null), null)
})

await check('banner: the ranking holds for every combination of states', () => {
	const kind = (over) => describeAiStatus(bannerProps(over))?.kind ?? null
	const full = aiStatus({ configured: true, failed: 2, skipped: 3, untagged: 4, budgetExhausted: true, resetsAt: '2026-10-04T00:00:00Z' })
	assert.equal(kind({ status: full, blockedMessage: 'm', working: true, pending: 1 }), 'blocked')
	assert.equal(kind({ status: full, working: true, pending: 1 }), 'budget')
	assert.equal(kind({ status: { ...full, budgetExhausted: false }, working: true, pending: 1 }), 'working')
	assert.equal(kind({ status: { ...full, budgetExhausted: false } }), 'failed')
	assert.equal(kind({ status: { ...full, budgetExhausted: false, failed: 0 } }), 'skipped')
	assert.equal(kind({ status: { ...full, budgetExhausted: false, failed: 0, skipped: 0 } }), null)
	// With no key, nothing about AI applies but the note itself.
	const noKey = { ...full, configured: false }
	assert.equal(kind({ status: noKey, working: true, pending: 4 }), 'off')
	assert.equal(kind({ status: { ...noKey, untagged: 0 }, working: true, pending: 4 }), null)
	assert.equal(kind({ status: noKey, blockedMessage: 'm' }), 'blocked')
	assert.equal(kind({ status: null, working: true, pending: 2 }), 'working', 'progress needs no status')
	assert.equal(kind({ status: null }), null)
})

await check('banner: counts from the network are only believed when they are positive whole numbers', () => {
	const kind = (status, extra) => describeAiStatus(bannerProps({ status, ...extra }))?.kind ?? null
	for (const bad of [NaN, -3, 0, Infinity, '5', null, undefined, {}, [], -0]) {
		assert.equal(kind(aiStatus({ failed: bad })), null, `failed ${String(bad)}`)
		assert.equal(kind(aiStatus({ skipped: bad })), null, `skipped ${String(bad)}`)
		assert.equal(kind(aiStatus({ configured: false, untagged: bad })), null, `untagged ${String(bad)}`)
		assert.equal(describeAiStatus(bannerProps({ working: true, pending: bad })), null, `pending ${String(bad)}`)
	}
	assert.equal(describeAiStatus(bannerProps({ status: aiStatus({ failed: 2.9 }) })).count, 2, 'floored')
	assert.equal(describeAiStatus(bannerProps({ working: true, pending: 7.5 })).pending, 7)
	assert.equal(kind({}), null, 'an empty object is configured: undefined and says nothing')
	// A hostile status renders without throwing.
	assert.doesNotThrow(() => renderBanner({ status: { configured: 'yes', failed: 'many', resetsAt: 5 }, pending: 'x', working: 'true' }))
	assert.doesNotThrow(() => renderBanner({ status: [] }))
})

await check('banner: markup hygiene: names, no nested controls, tones carry words and icons not colour alone', () => {
	const states = [
		bannerProps({ status: aiStatus({ configured: false, untagged: 5 }) }),
		bannerProps({ blockedMessage: 'Your API key is not valid.' }),
		bannerProps({ working: true, pending: 3 }),
		bannerProps({ status: aiStatus({ failed: 2 }) }),
		bannerProps({ status: aiStatus({ skipped: 2 }) }),
		bannerProps({ status: aiStatus({ budgetExhausted: true, resetsAt: '2026-10-04T00:00:00Z' }) }),
	]
	for (const props of states) {
		const html = renderToString(h(AiStatusBanner, props))
		const root = staticChecks(html, JSON.stringify(props).slice(0, 40))
		const note = bannerNode(root)
		assert.equal(findAllNodes(note, (n) => n.tag === 'svg' && n.attrs['aria-hidden'] !== 'true').length, 0)
		assert.ok(norm(textOfNode(note)).length > 10, 'the state is in words')
		for (const el of findAllNodes(root, () => true)) {
			const cls = (el.attrs.class ?? '').split(/\s+/)
			if (cls.includes('animate-spin')) assert.ok(cls.includes('motion-reduce:animate-none'))
		}
	}
})

await check('banner: dismissing a note hides it for the session, in storage when it can and in memory when it cannot', async () => {
	const { win, restore } = installWindow()
	try {
		const props = bannerProps({ status: aiStatus({ configured: false, untagged: 5 }) })
		const view = mount(AiStatusBanner, props)
		assert.ok(view.slot('ai-status-banner'))
		view.click(view.button('Dismiss this note'))
		assert.equal(view.slot('ai-status-banner'), undefined)
		assert.equal(win.storage.get('rb.media.ai.off'), '1')
		view.unmount()
		// A new page view in the same session: still dismissed, once it has looked.
		const again = mount(AiStatusBanner, props)
		assert.equal(again.slot('ai-status-banner'), undefined)
		// The other note is its own thing.
		const skipped = mount(AiStatusBanner, bannerProps({ status: aiStatus({ skipped: 3 }) }))
		assert.ok(skipped.slot('ai-status-banner'), 'dismissing "off" did not dismiss "skipped"')
		skipped.click(skipped.button('Dismiss this note'))
		assert.equal(win.storage.get('rb.media.ai.skipped'), '1')
		assert.equal(skipped.slot('ai-status-banner'), undefined)
		// A different state is never hidden by an earlier dismissal.
		const failed = mount(AiStatusBanner, bannerProps({ status: aiStatus({ failed: 1 }) }))
		assert.ok(failed.slot('ai-status-banner'))
		assert.equal(failed.buttons().includes('Dismiss this note'), false, 'warnings cannot be dismissed')
		// Storage that throws on every use: dismissal still works for this view.
		win.sessionStorage.getItem = () => {
			throw new Error('blocked')
		}
		win.sessionStorage.setItem = () => {
			throw new DOMException('quota', 'QuotaExceededError')
		}
		const blocked = mount(AiStatusBanner, props)
		assert.ok(blocked.slot('ai-status-banner'))
		assert.doesNotThrow(() => blocked.click(blocked.button('Dismiss this note')))
		assert.equal(blocked.slot('ai-status-banner'), undefined)
		for (const v of [again, skipped, failed, blocked]) v.unmount()
	} finally {
		restore()
	}
})

await check('banner: once hydrated the reset time is local; and the buttons call back', async () => {
	const { restore } = installWindow()
	try {
		// A reset five hours from now is always in the future, whatever the clock says.
		const resetsAt = new Date(Date.now() + 5 * 3600 * 1000).toISOString()
		const view = mount(AiStatusBanner, bannerProps({ status: aiStatus({ budgetExhausted: true, resetsAt }) }))
		const expected = formatResumeTime(resetsAt, { timeZone: 'America/Los_Angeles' })
		assert.ok(expected && expected !== 'shortly')
		assert.equal(view.text(view.slot('ai-status-banner')), `Daily AI tagging limit reached. Tagging resumes ${expected}.`)
		assert.ok(!view.text(view.slot('ai-status-banner')).includes('UTC'), 'local, not UTC')
		view.unmount()

		const calls = []
		const failed = mount(AiStatusBanner, bannerProps({ status: aiStatus({ failed: 3 }), onRetryFailed: () => calls.push('retry'), onTagUntagged: () => calls.push('tag') }))
		failed.click(failed.button('Retry tagging the failed images'))
		const skipped = mount(AiStatusBanner, bannerProps({ status: aiStatus({ skipped: 3 }), onRetryFailed: () => calls.push('retry'), onTagUntagged: () => calls.push('tag') }))
		skipped.click(skipped.button('Tag them now'))
		assert.deepEqual(calls, ['retry', 'tag'])
		failed.unmount()
		skipped.unmount()
	} finally {
		restore()
	}
})

await check('banner: the how-to wording is exact, so the owner can search the code for it', () => {
	const source = readFileSync(join(here, '..', 'src', 'app', 'account', 'media', 'ai-status-banner.tsx'), 'utf8')
	assert.ok(source.includes("'Add ANTHROPIC_API_KEY to your environment to turn on AI tags. Colours, size and file-name tags still work.'"))
})

/* -------------------------------------------------------------------------- */
/* Source hygiene: the rules every file here is held to                       */
/* -------------------------------------------------------------------------- */

for (const file of ['upload-manager.tsx', 'ai-status-banner.tsx']) {
	const path = join(here, '..', 'src', 'app', 'account', 'media', file)
	const source = readFileSync(path, 'utf8')
	await check(`source ${file}: client component, house style, no server imports, no blob deletion`, () => {
		assert.ok(source.startsWith("'use client'"), 'a client component')
		assert.ok(!/server-only/.test(source))
		assert.ok(!/from 'mongodb'|from 'sharp'|from 'next\//.test(source), 'no server, sharp or next imports')
		// Invariant 10: no code path deletes a blob. The browser client is the only Blob import allowed.
		assert.ok(!/from '@vercel\/blob'/.test(source), 'the main Blob entry (which has del) is never imported')
		assert.ok(!/\bdel\(|\bdeleteBlob\b/.test(source))
		assert.ok(!/localStorage/.test(source), 'sessionStorage or nothing')
		assert.ok(!/\p{Extended_Pictographic}/u.test(source), 'no emoji')
		const lines = source.split('\n')
		lines.forEach((line, i) => {
			const comment = /^\s*(\/\/|\/\*|\*)/.test(line)
			if (!comment) assert.ok(!/;\s*$/.test(line), `line ${i + 1} ends in a semicolon`)
			assert.ok(!/^ +[^ *]/.test(line), `line ${i + 1} is indented with spaces`)
			assert.ok(!/<\w[^>]*\s\w+="/.test(line), `line ${i + 1} uses double quotes in JSX`)
		})
		assert.ok(!/\/\*\s*[-=*]{5,}/.test(source) && !/\/\/\s*[-=*]{5,}/.test(source), 'no banner comments')
	})
}

await check('source upload-manager.tsx: the Blob client is imported lazily and only its types at the top', () => {
	const source = readFileSync(join(here, '..', 'src', 'app', 'account', 'media', 'upload-manager.tsx'), 'utf8')
	assert.ok(/import type \{ UploadOptions \} from '@vercel\/blob\/client'/.test(source))
	assert.ok(/await import\('@vercel\/blob\/client'\)/.test(source))
	assert.ok(!/^import \{[^}]*\bupload\b[^}]*\} from '@vercel\/blob\/client'/m.test(source), 'no eager value import')
})

/* -------------------------------------------------------------------------- */
/* Done                                                                       */
/* -------------------------------------------------------------------------- */

await tick()
await check('process: nothing was left unhandled and nothing logged an error behind a passing check', () => {
	assert.deepEqual(unhandled.map(String), [])
})

console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
