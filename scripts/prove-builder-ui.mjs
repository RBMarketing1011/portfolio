/**
 * Proves the "Build with AI" UI, with no DOM, no server and no model:
 *
 *   node scripts/prove-builder-ui.mjs
 *
 *  - the runner (ai-build-runner.ts) against a fake API and a fake clock: plan → outline
 *    → pages three at a time, home first and alone → land; the 20 s fallback; the
 *    automatic retry once; Retry; Stop; minimize then Apply; resume; a broken stream read
 *    back by polling; the plan's lighter retry; conflicts; a single-flight landing;
 *  - every view server-rendered on its own (compose, progress, review) in every state of
 *    sections 13.6-13.8, with the copy of 13.10 and 13.11;
 *  - the dialog files contain no raw <button>, <input>, <select> or <textarea>.
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

// React picks its dev build when first required, so key and nesting warnings are real.
process.env.NODE_ENV = 'development'

const require = createRequire(import.meta.url)
const { loadTs, mock, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToString } = rootRequire('react-dom/server')
const h = React.createElement

let passed = 0
let failed = 0
let finished = false
process.on('exit', (code) => {
	if (!finished && code === 0) process.exitCode = 1
	if (!finished) console.log('FAIL  the proof did not run to the end')
})

const consoleProblems = []
for (const level of ['error', 'warn']) {
	const original = console[level]
	console[level] = (...args) => {
		consoleProblems.push(`${level}: ${args.map(String).join(' ').slice(0, 300)}`)
		original.apply(console, args)
	}
}

const only = process.env.ONLY
async function check(name, fn) {
	if (only && !name.includes(only)) return
	const before = consoleProblems.length
	try {
		await fn()
		if (consoleProblems.length !== before) throw new Error(`console output: ${consoleProblems[before]}`)
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const text = error?.message ?? String(error)
		console.log(`FAIL  ${name} (${text.split('\n').slice(0, 3).join(' | ').slice(0, 400)})`)
	}
}

function assert(condition, message = 'assertion failed') {
	if (!condition) throw new Error(message)
}
const canonical = (value) =>
	JSON.stringify(value, (key, inner) =>
		inner && typeof inner === 'object' && !Array.isArray(inner)
			? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
			: inner,
	)
function eq(actual, expected, message = '') {
	const a = canonical(actual)
	const b = canonical(expected)
	if (a !== b) throw new Error(`${message ? `${message}: ` : ''}expected ${b}, got ${a}`)
}
/** Lets every promise chain that can move, move. */
const flush = async () => {
	for (let i = 0; i < 30; i++) await new Promise((resolve) => setImmediate(resolve))
}

// ---------------------------------------------------------------- stand-ins, then the real modules

mock('next/navigation', {
	useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
	usePathname: () => '/builder/sites/site1/pages/pg_home',
})
mock('next/link', {
	__esModule: true,
	default: function FakeLink({ href, children, ...rest }) {
		return h('a', { href, ...rest }, children)
	},
})

const runnerModule = loadTs('src/app/builder/builder/ai-build-runner.ts')
const { AiBuildRunner, emptyDraft, errorCopy, landedCopy, openNeedsInput, validateDraft, unitsFor, progressValue } =
	runnerModule
const { AiBuildCompose, composeCopy, parseReviews } = loadTs('src/app/builder/builder/ai-build-compose.tsx')
const { AiBuildProgress } = loadTs('src/app/builder/builder/ai-build-progress.tsx')
const { AiBuildReview } = loadTs('src/app/builder/builder/ai-build-review.tsx')
const { LandError } = loadTs('src/lib/builder/land.ts')
const { AI_LIMITS, AI_ERROR_CODES } = loadTs('src/lib/builder/ai/contract.ts')
const { defaultSettings } = loadTs('src/app/builder/theme-settings.ts')

// ---------------------------------------------------------------- fixtures

const BUILD_ID = 'bld_0123456789abcdef01234567'
const ISO = '2026-10-25T12:00:00.000Z'

const pageView = (n, extra = {}) => ({
	key: `p${n}`,
	pageId: `pg_${String(n).padStart(10, '0')}`,
	name: n === 1 ? 'Home' : `Page ${n}`,
	slug: n === 1 ? '/' : `page-${n}`,
	archetype: n === 1 ? 'home' : 'service',
	purpose: 'Win the call',
	outlined: n <= 6,
	sections:
		n <= 6
			? [
					{ layout: 'page-hero:centered', label: 'Page Hero (Centered)' },
					{ layout: 'cta-band:card', label: 'CTA Band (Card)' },
				]
			: [],
	status: 'pending',
	attempts: 0,
	canRetry: false,
	retryCostsUnit: false,
	error: null,
	issues: [],
	needsInput: [],
	...extra,
})
const written = (n, extra = {}) => pageView(n, { outlined: true, status: 'written', attempts: 1, ...extra })

const buildView = (pages, extra = {}) => ({
	id: BUILD_ID,
	status: 'planned',
	mode: 'site',
	placement: 'replace-site',
	targetPageId: null,
	createdAt: ISO,
	updatedAt: ISO,
	expiresAt: ISO,
	design: {
		polarity: 'light',
		personality: 'friendly',
		palette: { id: 'L3', name: 'Paper Navy', colors: { background: '#f8f5ef', accent: '#1e3a8a', heading: '#0f172a', body: '#334155' } },
		fonts: { id: 'fraunces-inter', heading: 'Fraunces', body: 'Inter' },
		shape: 'soft',
		buttons: 'solid',
		backdrop: 'clean',
	},
	chrome: {
		kept: false,
		header: 'bar',
		footer: 'split',
		cta: 'Free inspection',
		menu: [
			{ label: 'Services', kind: 'mega', links: 4 },
			{ label: 'About', kind: 'link', links: 0 },
		],
	},
	facts: [{ value: 'since 2004', label: 'Founded' }],
	profileFill: [{ field: 'business.city', label: 'City', value: 'Austin' }],
	photosUsed: 3,
	outline: pages.some((page) => !page.outlined) ? 'pending' : 'none',
	pages,
	issues: [{ level: 'info', code: 'no-testimonials', message: 'No reviews were given, so the site has no testimonials.' }],
	units: { reserved: 9, refunded: 0 },
	error: null,
	...extra,
})

const landingFor = (build) => ({
	buildId: build.id,
	placement: build.placement,
	targetPageId: build.targetPageId,
	pages: build.pages
		.filter((page) => page.status === 'written')
		.map((page) => ({ id: page.pageId, name: page.name, slug: page.slug, inHeader: true, blocks: [], createdAt: ISO, updatedAt: ISO })),
	chrome: null,
	menuAdd: [],
	look: null,
	blockLooks: {},
	skipped: [],
	needsInput: [],
	notes: [],
})

const profile = {
	brand: { logo: null, logoAlt: '', favicon: null },
	seo: { siteTitle: '', homeTitle: '', description: '', shareImage: null, twitter: '', noindex: false },
	business: { enabled: false, type: 'RoofingContractor', name: 'Summit Roofing', description: '', phone: '', email: '', street: '', city: 'Austin', region: 'TX', postalCode: '', country: '', serviceArea: [], hours: [], priceRange: '', profiles: [], latitude: null, longitude: null },
}

const apiError = (code, extra = {}) => ({ code, status: 502, retryable: false, message: `server says ${code}`, ...extra })

// ---------------------------------------------------------------- fakes

function fakeClock() {
	let now = 1_000_000
	let seq = 0
	const timers = new Map()
	return {
		now: () => now,
		setTimeout(fn, ms) {
			const id = ++seq
			timers.set(id, { at: now + Math.max(0, ms), fn })
			return id
		},
		clearTimeout(id) {
			timers.delete(id)
		},
		/** Runs every timer due within `ms`, in time order, letting promises settle between. */
		async advance(ms) {
			const end = now + ms
			for (;;) {
				await flush()
				let next = null
				for (const [id, timer] of timers) if (timer.at <= end && (!next || timer.at < next[1].at)) next = [id, timer]
				if (!next) break
				timers.delete(next[0])
				now = next[1].at
				next[1].fn()
			}
			now = end
			await flush()
		},
		get pending() {
			return timers.size
		},
	}
}

function fakeApi() {
	const log = []
	const streams = { create: [], outline: [], write: [] }
	let openWrites = 0
	let maxWrites = 0
	function open(kind, info, onEvent, signal) {
		return new Promise((resolve) => {
			const call = {
				kind,
				...info,
				signal,
				done: false,
				emit: (event) => onEvent(event),
				end(outcome) {
					if (call.done) return
					call.done = true
					if (kind === 'write') openWrites--
					resolve(outcome)
				},
				succeed(data) {
					onEvent({ t: 'done', data })
					call.end('done')
				},
				fail(error, data) {
					onEvent(data === undefined ? { t: 'error', error } : { t: 'error', error, data })
					call.end('error')
				},
			}
			if (kind === 'write') {
				openWrites++
				maxWrites = Math.max(maxWrites, openWrites)
			}
			signal.addEventListener('abort', () => call.end('ended'))
			streams[kind].push(call)
			log.push([kind, info])
		})
	}
	const api = {
		createBuild: (body, onEvent, signal) => open('create', { body }, onEvent, signal),
		outlineBuild: (buildId, onEvent, signal) => open('outline', { buildId }, onEvent, signal),
		writeBuildPage: (buildId, key, onEvent, signal) => open('write', { buildId, key }, onEvent, signal),
		getBuild: async (buildId) => {
			log.push(['get', buildId])
			return api.onGet(buildId)
		},
		cancelBuild: async (buildId) => {
			log.push(['cancel', buildId])
			return api.onCancel(buildId)
		},
		landBuild: async (buildId, body) => {
			log.push(['land', buildId, body])
			return api.onLand(buildId, body)
		},
		onGet: () => {
			throw new Error('getBuild was not expected')
		},
		onCancel: () => buildView([written(1)], { status: 'cancelled' }),
		onLand: () => {
			throw new Error('landBuild was not expected')
		},
	}
	return { api, streams, log, get maxWrites() { return maxWrites } }
}

function harness({ open = true } = {}) {
	const clock = fakeClock()
	const fake = fakeApi()
	const store = {
		applied: [],
		profile: null,
		mark: 41,
		throwOnLand: null,
		applyAiResult(landing) {
			if (this.throwOnLand) throw this.throwOnLand
			this.applied.push(landing)
			return { firstPageId: landing.pages[0]?.id ?? null, renamed: {}, pageIds: landing.pages.map((p) => p.id), notes: [], unslotted: [] }
		},
		setProfile(value) {
			this.profile = value
		},
		historyMark() {
			return this.mark
		},
	}
	const navigated = []
	const notices = []
	let isOpen = open
	const runner = new AiBuildRunner({
		api: fake.api,
		clock,
		store,
		navigate: (id) => navigated.push(id),
		isOpen: () => isOpen,
		notify: (notice) => notices.push(notice),
	})
	return {
		runner,
		clock,
		fake,
		api: fake.api,
		streams: fake.streams,
		log: fake.log,
		store,
		navigated,
		notices,
		setOpen: (value) => {
			isOpen = value
		},
		state: () => runner.getState(),
		keys: () => fake.streams.write.map((call) => call.key),
	}
}

const brief = (extra = {}) => ({ ...emptyDraft(), prompt: 'Family-owned roofing company in Austin since 2004.', ...extra })

/** Starts a build and answers its plan with `pages`; returns the harness. */
async function planned(t, pages, extra = {}) {
	t.runner.start(brief())
	const plan = t.streams.create.at(-1)
	plan.emit({ t: 'accepted', buildId: BUILD_ID, reserved: 9 })
	plan.succeed(buildView(pages, extra))
	await flush()
	return t
}

/** Finishes every open page write with a written view, until no write is open. */
async function writeAll(t) {
	for (let round = 0; round < 40; round++) {
		const open = t.streams.write.filter((call) => !call.done)
		if (open.length === 0) return
		for (const call of open) {
			const n = Number(call.key.slice(1))
			call.emit({ t: 'accepted', buildId: BUILD_ID, key: call.key, attempt: 1 })
			call.emit({ t: 'stage', stage: 'writing' })
			call.succeed(written(n))
		}
		await flush()
	}
}

// ================================================================ the runner

await check('plan → outline → pool of three with home first → land, saving the profile', async () => {
	const t = harness()
	t.runner.start(brief())
	eq(t.state().phase, 'planning')
	const plan = t.streams.create[0]
	eq(plan.body.fast, false, 'the first plan is not the lighter one')
	eq(plan.body.prompt, 'Family-owned roofing company in Austin since 2004.')
	plan.emit({ t: 'accepted', buildId: BUILD_ID, reserved: 9 })
	eq(t.state().buildId, BUILD_ID)
	plan.emit({ t: 'stage', stage: 'thinking' })
	eq(t.state().stage, 'thinking')
	plan.emit({ t: 'hb', ms: 10000 })
	const pages = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => pageView(n))
	plan.succeed(buildView(pages))
	await flush()

	eq(t.state().phase, 'running')
	eq(t.streams.outline.length, 1, 'pages 7 and 8 are outlined alongside')
	eq(t.keys(), ['p1'], 'the home page starts alone')
	const home = t.streams.write[0]
	home.emit({ t: 'accepted', buildId: BUILD_ID, key: 'p1', attempt: 1 })
	await flush()
	eq(t.keys(), ['p1'], 'accepted alone does not let the others go')
	home.emit({ t: 'stage', stage: 'thinking' })
	await flush()
	eq(t.keys(), ['p1', 'p2', 'p3'], "home's first stage starts the pool, three at a time")
	eq(t.state().pages.find((p) => p.key === 'p1').status, 'writing')
	eq(t.state().pages.find((p) => p.key === 'p4').status, 'pending')

	t.streams.write[1].succeed(written(2))
	await flush()
	eq(t.keys(), ['p1', 'p2', 'p3', 'p4'], 'a finished page lets the next one in, in plan order')
	eq(t.state().pages.find((p) => p.key === 'p2').status, 'written')

	// The outline fills pages 7 and 8; they wait until it does.
	const outlined = pages.map((p) => ({ ...p, outlined: true, sections: p.sections.length ? p.sections : [{ layout: 'faq-accordion:split', label: 'FAQ' }] }))
	t.streams.outline[0].succeed(buildView(outlined, { outline: 'done', status: 'writing' }))
	await flush()
	assert(t.state().pages.every((p) => p.outlined), 'every page is outlined after the outline')
	eq(t.state().pages.find((p) => p.key === 'p2').status, 'written', 'the outline view does not undo a finished row')

	t.api.onLand = (buildId, body) => {
		const done = buildView([1, 2, 3, 4, 5, 6, 7, 8].map((n) => written(n)), { status: 'landed' })
		return { landing: landingFor(done), profile, build: done }
	}
	await writeAll(t)
	assert(t.fake.maxWrites <= AI_LIMITS.writeConcurrency, `at most three pages write at once (saw ${t.fake.maxWrites})`)
	eq(t.keys().slice().sort(), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], 'each page is written once')

	const s = t.state()
	eq(s.phase, 'landed')
	const land = t.log.filter((entry) => entry[0] === 'land')
	eq(land.length, 1, 'the dialog is open, so the build lands at once, once')
	eq(land[0][2], { saveProfile: true })
	eq(t.store.applied.length, 1)
	eq(t.store.profile, profile)
	eq(t.navigated, ['pg_0000000001'], 'the builder opens the first landed page')
	eq(s.mark, 41)
	assert(t.notices.some((n) => n.kind === 'landed'), 'the landing toast is asked for')
})

await check('the others start 20 s after home when it shows no stage', async () => {
	const t = await planned(harness(), [1, 2, 3].map((n) => pageView(n)))
	eq(t.keys(), ['p1'])
	await t.clock.advance(19_000)
	eq(t.keys(), ['p1'])
	await t.clock.advance(1_000)
	eq(t.keys(), ['p1', 'p2', 'p3'])
})

await check('a page that fails after its first attempt is retried once by itself, then waits for Retry', async () => {
	const t = await planned(harness(), [pageView(1)])
	const first = t.streams.write[0]
	first.emit({ t: 'accepted', buildId: BUILD_ID, key: 'p1', attempt: 1 })
	first.fail(apiError('upstream', { retryable: true }), pageView(1, { status: 'failed', attempts: 1, canRetry: true }))
	await flush()
	const row = t.state().pages[0]
	eq(row.status, 'writing', 'the row keeps writing while the retry waits')
	assert(row.retryAt !== null && row.error?.code === 'upstream', 'and says it is trying again')
	eq(t.streams.write.length, 1)
	await t.clock.advance(2_000)
	eq(t.streams.write.length, 2, 'retried after 2 s')
	const second = t.streams.write[1]
	second.emit({ t: 'accepted', buildId: BUILD_ID, key: 'p1', attempt: 2 })
	second.fail(apiError('upstream', { retryable: true }), pageView(1, { status: 'failed', attempts: 2, canRetry: true, retryCostsUnit: true }))
	await flush()
	await t.clock.advance(10_000)
	eq(t.streams.write.length, 2, 'only one automatic retry')
	const failedRow = t.state().pages[0]
	eq(failedRow.status, 'failed')
	eq(failedRow.retryCostsUnit, true)
	eq(t.state().phase, 'ready')
	eq(t.log.filter((entry) => entry[0] === 'land').length, 0, 'nothing lands with a page failed')

	t.runner.retry('p1')
	await flush()
	eq(t.state().phase, 'running')
	eq(t.streams.write.length, 3, 'Retry writes it again')
	eq(t.state().pages[0].status, 'writing')
})

await check('a refusal before the stream (busy) is retried after its wait, at most twice', async () => {
	const t = await planned(harness(), [pageView(1)])
	t.streams.write[0].fail({ code: 'busy', status: 429, retryable: true, retryAfterMs: 5000, message: 'busy' })
	await flush()
	await t.clock.advance(4_999)
	eq(t.streams.write.length, 1)
	await t.clock.advance(1)
	eq(t.streams.write.length, 2, 'after retryAfterMs')
	t.streams.write[1].fail({ code: 'busy', status: 429, retryable: true, retryAfterMs: 5000, message: 'busy' })
	await t.clock.advance(5_000)
	eq(t.streams.write.length, 3)
	t.streams.write[2].fail({ code: 'busy', status: 429, retryable: true, retryAfterMs: 5000, message: 'busy' })
	await t.clock.advance(60_000)
	eq(t.streams.write.length, 3, 'then it waits for Retry')
	eq(t.state().pages[0].status, 'failed')
	eq(t.state().pages[0].canRetry, true)
})

await check('a page still being outlined (not-ready) waits silently for the outline', async () => {
	const t = await planned(harness(), [pageView(1)])
	t.streams.write[0].fail({ code: 'not-ready', status: 409, retryable: true, message: 'This page is still being planned.' })
	await flush()
	const row = t.state().pages[0]
	eq(row.status, 'pending')
	eq(row.outlined, false)
	eq(t.streams.outline.length, 1, 'the outline is asked for')
	t.streams.outline[0].succeed(buildView([pageView(1)], { outline: 'done' }))
	await flush()
	eq(t.streams.write.length, 2, 'and the page goes once it is outlined')
})

await check('Stop aborts every request, cancels the build and offers the finished pages', async () => {
	const t = await planned(harness(), [1, 2, 3, 4].map((n) => pageView(n)))
	t.streams.write[0].emit({ t: 'stage', stage: 'thinking' })
	await flush()
	t.streams.write[1].succeed(written(2))
	await flush()
	const inFlight = t.streams.write.filter((call) => !call.done)
	t.api.onCancel = () => buildView([pageView(1, { status: 'writing' }), written(2), pageView(3, { status: 'cancelled' }), pageView(4, { status: 'cancelled' })], { status: 'cancelled' })
	await t.runner.stop()
	assert(inFlight.length > 0 && inFlight.every((call) => call.signal.aborted), 'every request in flight is aborted')
	eq(t.log.filter((entry) => entry[0] === 'cancel').length, 1, 'POST …/cancel')
	const s = t.state()
	eq(s.phase, 'stopped')
	eq(s.pages.map((p) => p.status), ['cancelled', 'written', 'cancelled', 'cancelled'])
	t.api.onLand = () => {
		const done = buildView([written(2)], { status: 'landed' })
		return { landing: landingFor(done), profile, build: done }
	}
	await t.runner.apply()
	eq(t.state().phase, 'landed', '"Use the finished pages" lands them')
})

await check('Stop while planning cancels the build and goes back to the draft', async () => {
	const t = harness()
	t.runner.start(brief())
	t.streams.create[0].emit({ t: 'accepted', buildId: BUILD_ID, reserved: 9 })
	await t.runner.stop()
	eq(t.state().phase, 'idle')
	assert(t.streams.create[0].signal.aborted)
	eq(t.log.filter((entry) => entry[0] === 'cancel').length, 1)
})

await check('minimized: a finished build waits for Apply (chip or toast), which lands it once', async () => {
	const t = await planned(harness({ open: false }), [pageView(1), pageView(2)])
	await writeAll(t)
	eq(t.state().phase, 'ready')
	eq(t.log.filter((entry) => entry[0] === 'land').length, 0, 'nothing lands while minimized')
	assert(t.notices.some((n) => n.kind === 'ready'), '"Your site is ready." is asked for')
	t.api.onLand = () => {
		const done = buildView([written(1), written(2)], { status: 'landed' })
		return { landing: landingFor(done), profile, build: done }
	}
	// The chip and the toast both offer Apply: one landing.
	const a = t.runner.apply()
	const b = t.runner.apply()
	eq(a, b, 'every Apply shares the one in-flight landing')
	await a
	eq(t.log.filter((entry) => entry[0] === 'land').length, 1)
	eq(t.store.applied.length, 1)
	eq(t.state().phase, 'landed')
})

await check('a payload already on the site counts as landed (no second step); a broken one offers Try again', async () => {
	const t = await planned(harness({ open: false }), [pageView(1)])
	await writeAll(t)
	const done = buildView([written(1)], { status: 'landed' })
	t.api.onLand = () => ({ landing: landingFor(done), profile, build: done })
	t.store.throwOnLand = new LandError('already-landed')
	await t.runner.apply()
	eq(t.state().phase, 'landed')
	eq(t.state().mark, -1, 'its Undo stays in the toolbar')

	const u = await planned(harness({ open: false }), [pageView(1)])
	await writeAll(u)
	u.api.onLand = () => ({ landing: landingFor(done), profile, build: done })
	u.store.throwOnLand = new LandError('invalid')
	await u.runner.apply()
	eq(u.state().phase, 'ready')
	eq(u.state().landFailed, true)
	eq(u.navigated, [])

	const v = await planned(harness({ open: false }), [pageView(1)])
	await writeAll(v)
	const { AiRequestError } = loadTs('src/app/builder/builder/builder-ai.ts')
	v.api.onLand = () => {
		throw new AiRequestError({ code: 'home-failed', status: 409, retryable: false, message: 'The home page could not be written. Start the build again.' })
	}
	await v.runner.apply()
	eq(v.state().phase, 'ready')
	eq(v.state().error?.code, 'home-failed')
})

await check('a stream that ends without its last line is read back every 3 s', async () => {
	const t = await planned(harness({ open: false }), [pageView(1)])
	let polls = 0
	t.api.onGet = () => {
		polls++
		return buildView([polls < 3 ? pageView(1, { status: 'writing' }) : written(1)], { status: polls < 3 ? 'writing' : 'ready' })
	}
	t.streams.write[0].emit({ t: 'accepted', buildId: BUILD_ID, key: 'p1', attempt: 1 })
	t.streams.write[0].end('ended')
	await flush()
	eq(polls, 0)
	await t.clock.advance(3_000)
	eq(polls, 1, 'the first read is 3 s later')
	await t.clock.advance(6_000)
	eq(polls, 3)
	eq(t.state().pages[0].status, 'written', 'the page the server finished counts')
	eq(t.state().phase, 'ready')
})

await check('a page whose outcome never shows within 100 s is left retryable', async () => {
	const t = await planned(harness({ open: false }), [pageView(1)])
	let polls = 0
	t.api.onGet = () => {
		polls++
		return buildView([pageView(1, { status: 'writing' })], { status: 'writing' })
	}
	t.streams.write[0].emit({ t: 'accepted', buildId: BUILD_ID, key: 'p1', attempt: 1 })
	t.streams.write[0].end('ended')
	await t.clock.advance(AI_LIMITS.pollMaxMs + 10_000)
	assert(polls >= 30 && polls <= 34, `polled for about 100 s (${polls})`)
	const row = t.state().pages[0]
	eq(row.status, 'failed')
	eq(row.canRetry, true)
	eq(row.error.code, 'network')
})

await check('a plan that ran out of time is tried once more, lighter; a second one fails', async () => {
	const t = harness()
	t.runner.start(brief())
	t.streams.create[0].fail({ code: 'timeout', status: 504, retryable: true, message: 'timeout' })
	await flush()
	eq(t.streams.create.length, 2)
	eq(t.streams.create[1].body.fast, true)
	eq(t.state().retrying, true)
	t.streams.create[1].fail({ code: 'timeout', status: 504, retryable: true, message: 'timeout' }, buildView([], { status: 'failed', units: { reserved: 9, refunded: 9 } }))
	await flush()
	eq(t.streams.create.length, 2, 'only once')
	const s = t.state()
	eq(s.phase, 'failed')
	eq(s.error.code, 'timeout')
	eq(s.units, { reserved: 9, refunded: 9 })
})

await check('a plan stream that breaks is read back until it leaves planning', async () => {
	const t = harness()
	t.runner.start(brief())
	t.streams.create[0].emit({ t: 'accepted', buildId: BUILD_ID, reserved: 9 })
	let polls = 0
	t.api.onGet = () => {
		polls++
		return polls < 2 ? buildView([], { status: 'planning', design: null, chrome: null }) : buildView([pageView(1)])
	}
	t.streams.create[0].end('ended')
	await t.clock.advance(6_000)
	eq(t.state().phase, 'running')
	eq(t.keys(), ['p1'])
})

await check('a build already running (conflict): Resume it, or Stop it and start over', async () => {
	const t = harness()
	t.runner.start(brief())
	t.streams.create[0].fail({ code: 'conflict', status: 409, retryable: false, message: 'A build is already running for this site.', buildId: 'bld_ffffffffffffffffffffffff' })
	await flush()
	eq(t.state().phase, 'failed')
	eq(t.state().error.buildId, 'bld_ffffffffffffffffffffffff')
	await t.runner.restart('bld_ffffffffffffffffffffffff')
	await flush()
	eq(t.log.filter((entry) => entry[0] === 'cancel')[0][1], 'bld_ffffffffffffffffffffffff')
	eq(t.streams.create.length, 2, 'and the same draft is planned again')
	eq(t.state().phase, 'planning')
})

await check('resume: the interrupted build shows as it is, and Continue writes what is left', async () => {
	const t = harness()
	t.api.onGet = () => buildView([written(1), pageView(2, { status: 'failed', attempts: 1, canRetry: true }), pageView(3)], { status: 'writing' })
	await t.runner.resume(BUILD_ID)
	const s = t.state()
	eq(s.phase, 'ready')
	eq(s.interrupted, true)
	eq(t.streams.write.length, 0, 'nothing restarts without a click')
	t.runner.continueBuild()
	await flush()
	eq(t.keys(), ['p2', 'p3'], 'pending and retryable pages, home already written')
	eq(t.runner.brief, '', 'a resumed build has no brief on this side')
})

await check('discard cancels the build and goes back to the draft', async () => {
	const t = await planned(harness({ open: false }), [pageView(1)])
	await writeAll(t)
	await t.runner.discard()
	eq(t.state().phase, 'idle')
	eq(t.log.filter((entry) => entry[0] === 'cancel').length, 1)
})

await check('an outline that fails is retried once after 2 s; then its pages wait for Retry', async () => {
	const t = await planned(harness({ open: false }), [pageView(1), pageView(7)])
	t.streams.write[0].succeed(written(1))
	t.streams.outline[0].fail({ code: 'upstream', status: 502, retryable: true, message: 'x' })
	await flush()
	await t.clock.advance(2_000)
	eq(t.streams.outline.length, 2)
	t.streams.outline[1].fail({ code: 'upstream', status: 502, retryable: true, message: 'x' })
	await t.clock.advance(10_000)
	eq(t.streams.outline.length, 2)
	const row = t.state().pages.find((p) => p.key === 'p7')
	eq(row.status, 'failed')
	eq(row.canRetry, true)
	eq(t.state().phase, 'ready')
	t.runner.retry('p7')
	await flush()
	eq(t.streams.outline.length, 3, 'Retry outlines again first')
})

// ================================================================ copy

await check('error copy for every code (section 13.11)', async () => {
	const units = { limit: 100, resetsAt: '2026-10-26T00:00:00.000Z' }
	const say = (code, ctx = { stage: 'plan', units }, extra = {}) => errorCopy({ code, status: 400, retryable: false, message: 'Up to 12 reviews.', ...extra }, ctx)
	eq(say('bad-request'), 'Up to 12 reviews.')
	eq(say('unauthorized'), 'Your session ended. Sign in again to keep building.')
	eq(say('forbidden'), 'Your role can view this site but not edit it.')
	eq(say('not-found'), 'That build has expired. Start a new one.')
	eq(say('expired'), 'That build has expired. Start a new one.')
	eq(say('not-configured'), "AI building isn't set up correctly on this deployment.")
	eq(say('config'), "AI building isn't set up correctly on this deployment.")
	eq(say('conflict', undefined, { buildId: BUILD_ID }), 'A build is already running for this site.')
	eq(
		say('conflict', undefined, { message: 'Someone else on your team is building this site with AI. Try again when they finish.' }),
		'Someone else on your team is building this site with AI. Try again when they finish.',
	)
	eq(say('busy'), 'Two builds are already running in this account. Try again when one finishes.')
	eq(say('busy', { stage: 'page' }), 'The AI service is busy. Trying again…')
	eq(say('rate-limited', undefined, { retryAfterMs: 8000 }), 'The AI service is busy. Trying again in 8 seconds…')
	assert(/^You've used today's 100 AI writes\. They reset at .+\.$/.test(say('daily-limit')), say('daily-limit'))
	eq(say('global-limit'), 'The AI builder is very busy today. Try again tomorrow.')
	assert(/^This account has used today's AI allowance\. It resets at .+\.$/.test(say('token-limit')))
	eq(say('refused'), 'The AI declined this request. Try describing it differently.')
	eq(say('timeout', { stage: 'plan', automatic: true }), 'That took too long. Trying again with a lighter pass.')
	eq(say('timeout'), 'That took too long.')
	for (const code of ['invalid-reply', 'truncated', 'upstream']) {
		eq(say(code), "The AI's answer for this plan could not be used. Nothing extra was charged.")
		eq(say(code, { stage: 'page' }), "The AI's answer for this page could not be used. Nothing extra was charged.")
	}
	eq(say('attempts-exhausted'), 'This page could not be written after three tries. Apply the site without it, or start again.')
	eq(say('home-failed'), 'The home page could not be written. Start the build again.')
	eq(say('not-ready'), null)
	eq(say('cancelled'), null)
	eq(say('network'), "You're offline. Retry when you're back.")
	for (const code of AI_ERROR_CODES) assert(say(code) === null || typeof say(code) === 'string', code)
})

await check('landing copy (section 13.10): site, pages added, one page', async () => {
	const site = buildView([written(1), written(2), written(3)])
	const summary = { firstPageId: 'pg_0000000001', renamed: {}, pageIds: ['a', 'b', 'c'], notes: [], unslotted: [] }
	const landing = { ...landingFor(site), look: { theme: {}, page: {}, header: {}, footer: {} } }
	eq(landedCopy({ build: site, landing, summary }, 4), { title: 'Your site is built', description: '3 pages, a mega menu and a new look. 4 things need your input.' })
	eq(landedCopy({ build: site, landing, summary }, 1).description, '3 pages, a mega menu and a new look. 1 thing needs your input.')
	const dropdown = { ...site, chrome: { ...site.chrome, menu: [{ label: 'More', kind: 'dropdown', links: 3 }] } }
	assert(landedCopy({ build: dropdown, landing, summary }, 0).description.includes('a dropdown menu'))
	const simple = { ...site, chrome: { ...site.chrome, menu: [{ label: 'About', kind: 'link', links: 0 }] } }
	assert(landedCopy({ build: simple, landing, summary }, 0).description.includes('a simple menu'))
	const kept = { ...site, chrome: { ...site.chrome, kept: true } }
	assert(landedCopy({ build: kept, landing, summary }, 0).description.includes('your menu'))

	const append = { ...site, placement: 'append' }
	const added = { ...landingFor(append), placement: 'append' }
	eq(landedCopy({ build: append, landing: added, summary }, 0), { title: '3 pages added', description: 'Added to your menu.' })
	eq(landedCopy({ build: append, landing: added, summary: { ...summary, unslotted: ['c'] } }, 0).description, 'They are in the footer; your menu is full.')

	const one = { ...site, mode: 'page', placement: 'append', pages: [{ ...written(2), name: 'Gutters' }] }
	const oneLanding = { ...landingFor(one), placement: 'append', pages: [{ id: 'x', name: 'Gutters', slug: 'gutters', inHeader: false, blocks: [], createdAt: ISO, updatedAt: ISO }] }
	eq(landedCopy({ build: one, landing: oneLanding, summary: { ...summary, pageIds: ['x'] } }, 2), { title: 'Gutters page built', description: '2 things need your input.' })
	const rebuilt = { ...oneLanding, placement: 'replace-page' }
	eq(landedCopy({ build: { ...one, placement: 'replace-page' }, landing: rebuilt, summary }, 0), { title: 'Gutters page rebuilt', description: 'Ready to review.' })
})

await check('compose copy (section 13.10) and the units it costs', async () => {
	const pages = [{ id: 'pg_a', name: 'Home', sections: 4 }, { id: 'pg_b', name: 'Services', sections: 6 }, { id: 'pg_c', name: 'Empty', sections: 0 }]
	eq(composeCopy(brief(), []).primary, 'Build my site')
	assert(composeCopy(brief(), []).placeholder.startsWith('Tell it about the business and the site you want.'))
	eq(composeCopy(brief({ placement: 'replace-site' }), pages).primary, 'Rebuild my site')
	eq(composeCopy(brief({ placement: 'replace-site' }), pages).placeholder, 'What should the new site be like? It already knows your pages and business details.')
	eq(composeCopy(brief({ placement: 'append' }), pages).primary, 'Add pages')
	eq(composeCopy(brief({ mode: 'page', placement: 'append' }), pages).primary, 'Build this page')
	assert(composeCopy(brief({ mode: 'page', placement: 'append' }), pages).placeholder.startsWith('What is this page for?'))
	eq(composeCopy(brief({ mode: 'page', placement: 'replace-page', targetPageId: 'pg_b' }), pages), { placeholder: 'What should this page do better?', primary: 'Rebuild this page' })
	eq(composeCopy(brief({ mode: 'page', placement: 'replace-page', targetPageId: 'pg_c' }), pages).primary, 'Build this page')
	eq(unitsFor(brief()), 9, 'a site reserves the plan plus eight pages')
	eq(unitsFor(brief({ mode: 'page' })), 2)
	eq(unitsFor(brief({ pins: { ...brief().pins, pages: { kind: 'count', count: 4 } } })), 5)
	eq(unitsFor(brief({ pins: { ...brief().pins, pages: { kind: 'list', names: ['Home', 'About'] } } })), 3)
})

await check('client checks mirror the server (section 4.2)', async () => {
	const ctx = { pageIds: ['pg_a'], isFont: (family) => family === 'Inter' }
	eq(validateDraft(brief({ prompt: 'short' }), ctx)?.message, 'Describe the business or the page in a sentence or two.')
	eq(validateDraft(brief({ prompt: 'x'.repeat(4001) }), ctx)?.message, 'Keep the description under 4,000 characters.')
	eq(validateDraft(brief({ placement: 'append' }), { ...ctx, pageIds: [] })?.message, 'This site is empty, so the AI builds it from scratch.')
	eq(validateDraft(brief({ mode: 'page', placement: 'replace-page', targetPageId: 'pg_missing' }), ctx)?.message, 'Choose the page to rebuild.')
	eq(validateDraft(brief({ mode: 'page', placement: 'append', pins: { ...brief().pins, pages: { kind: 'list', names: ['A', 'B'] } } }), ctx)?.message, 'One page takes at most one page name.')
	eq(validateDraft(brief({ pins: { ...brief().pins, pages: { kind: 'list', names: ['Home', 'home'] } } }), ctx)?.message, 'Page names must be different.')
	eq(validateDraft(brief({ pins: { ...brief().pins, pages: { kind: 'list', names: [] } } }), ctx)?.message, 'Choose between 1 and 12 pages.')
	eq(validateDraft(brief({ pins: { ...brief().pins, palette: { kind: 'brand', accent: '#12', polarity: 'light' } } }), ctx)?.message, 'Colors must be six-digit hex values like #1e3a8a.')
	eq(validateDraft(brief({ pins: { ...brief().pins, fonts: { kind: 'custom', heading: 'Comic Sans', body: 'Inter' } } }), ctx)?.message, 'That font is not in the font list.')
	eq(validateDraft(brief({ pins: { ...brief().pins, ctaLabel: 'x'.repeat(41) } }), ctx)?.message, 'Keep the button text under 40 characters.')
	eq(validateDraft(brief({ business: { ...brief().business, email: 'not an email' } }), ctx)?.field, 'business.email')
	const review = { quote: 'Too short', name: 'Dana', role: '', source: '' }
	eq(validateDraft(brief({ reviews: [review] }), ctx), { field: 'reviews.0.quote', message: "Reviews need the review text and the reviewer's name." })
	eq(validateDraft(brief({ reviews: Array.from({ length: 13 }, () => ({ ...review, quote: 'A long enough review text.' })) }), ctx)?.message, 'Up to 12 reviews.')
	eq(validateDraft(brief(), ctx), null)
})

await check('pasted reviews: blocks split by blank lines, attribution split at the first comma', async () => {
	const parsed = parseReviews('“They replaced our roof in two days.”\n- Dana M., Homeowner, Round Rock\n\nFast, honest and tidy.\nThey even cleaned the gutters.\n— Luis\n\n   \n\nNo attribution here at all, just praise.')
	eq(parsed, [
		{ quote: 'They replaced our roof in two days.', name: 'Dana M.', role: 'Homeowner, Round Rock', source: '' },
		{ quote: 'Fast, honest and tidy. They even cleaned the gutters.', name: 'Luis', role: '', source: '' },
		{ quote: 'No attribution here at all, just praise.', name: '', role: '', source: '' },
	])
})

await check('needs-input items disappear once the placeholder is replaced', async () => {
	const site = {
		version: 1,
		chrome: {},
		pages: [{ id: 'pg_1', name: 'Home', slug: '/', inHeader: true, createdAt: ISO, updatedAt: ISO, blocks: [
			{ id: 'blk_1', type: 'page-hero', props: { heading: 'Roofs since [Year founded]', items: [{ title: '[License number]' }] } },
			{ id: 'blk_2', type: 'grid', props: {}, children: [{ id: 'blk_2c', type: 'feature-card', props: { title: 'Done' } }] },
		] }],
	}
	const items = [
		{ pageKey: 'p1', pageId: 'pg_1', blockId: 'blk_1', path: 'heading', text: '[Year founded]' },
		{ pageKey: 'p1', pageId: 'pg_1', blockId: 'blk_1', path: 'items.0.title', text: '[License number]' },
		{ pageKey: 'p1', pageId: 'pg_1', blockId: 'blk_2c', path: 'props.title', text: '[Warranty years]' },
		{ pageKey: 'p1', pageId: 'pg_gone', blockId: 'blk_9', path: 'x', text: '[X]' },
	]
	eq(openNeedsInput(items, site).map((item) => item.text), ['[Year founded]', '[License number]'])
})

// ================================================================ the views

const capability = { enabled: true, units: { used: 10, limit: 100, resetsAt: '2026-10-26T00:00:00.000Z' }, library: { photos: 7 }, builds: [] }
const composeProps = (extra = {}) => ({
	draft: brief({ prompt: '' }),
	onDraft() {},
	pages: [],
	theme: defaultSettings,
	media: [
		{ id: 'md_1', name: 'Crew on a roof', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
		{ id: 'md_2', name: 'Finished house', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
	],
	uploading: 0,
	onUpload() {},
	capability,
	problem: null,
	error: null,
	refunded: false,
	onSubmit() {},
	onCancel() {},
	onResume() {},
	onRestart() {},
	...extra,
})
const html = (element) => renderToString(element)
// React marks the seams between adjacent text nodes with <!-- -->; they are not spaces.
const text = (markup) =>
	markup
		.replace(/<!--[^]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
function contains(markup, ...phrases) {
	const plain = text(markup)
	for (const phrase of phrases) assert(plain.includes(phrase), `missing "${phrase}"`)
}

await check('compose, empty project: mode, brief, examples, the four sections and the cost', async () => {
	const out = html(h(AiBuildCompose, composeProps()))
	contains(out, 'Whole site', 'One page', 'Describe it', 'Real facts help: services, areas, years in business, licences. The AI never makes them up.')
	contains(out, 'Roofing company in Austin', 'Calm dental clinic', 'Neighborhood café')
	contains(out, 'Business details', 'Not set yet. The AI reads them from your description.')
	contains(out, 'Photos', 'Reviews', 'None yet. Without reviews there are no testimonials.', 'Design choices', 'AI decides everything')
	contains(out, 'Uses up to 9 of your 90 AI writes left today.', 'Cancel', 'Build my site')
	assert(out.includes('placeholder="Tell it about the business and the site you want.'), 'the empty-project placeholder')
	assert(/<button[^>]*disabled=""[^>]*>[^]*?Build my site/.test(out), 'the primary waits for a brief of 12 characters')
	assert(!text(out).includes('What happens to your pages'), 'no placement choice on an empty project')
})

await check('compose, a site with pages: add or replace, the switches, and the destructive notice', async () => {
	const pages = [{ id: 'pg_a', name: 'Home', sections: 4 }, { id: 'pg_b', name: 'Services', sections: 6 }, { id: 'pg_c', name: 'Contact', sections: 2 }]
	const add = html(h(AiBuildCompose, composeProps({ pages, draft: brief({ placement: 'append' }) })))
	contains(add, 'What happens to your pages', 'Keep my pages and add new ones', 'Keeps your 3 pages and adds new ones to the menu.', 'Replace my site', 'Keep my current design', 'Update the header menu', 'Add pages')
	const replace = html(h(AiBuildCompose, composeProps({ pages, draft: brief({ placement: 'replace-site' }) })))
	contains(replace, 'Replaces your 3 pages, header, footer and design. Undo brings them back.', 'Rebuild my site')
	const rebuild = html(h(AiBuildCompose, composeProps({ pages, draft: brief({ mode: 'page', placement: 'replace-page', targetPageId: 'pg_b' }) })))
	contains(rebuild, 'New page', 'Rebuild a page', 'Replaces the 6 sections on Services. Undo brings them back.', 'Rebuild this page')
	assert(rebuild.includes('placeholder="What should this page do better?"'))
	const page = html(h(AiBuildCompose, composeProps({ pages, draft: brief({ mode: 'page', placement: 'append' }) })))
	contains(page, 'Build this page')
})

await check('compose sections open: business details, photos, reviews and design choices', async () => {
	const business = html(h(AiBuildCompose, composeProps({ initialSection: 'business', draft: brief({ business: { name: 'Summit Roofing', type: 'RoofingContractor', phone: '', email: '', city: 'Austin', region: 'TX', areas: ['Round Rock'] } }) })))
	contains(business, 'Summit Roofing · Roofing · Austin, TX', 'Business name', 'Type', 'Phone', 'Email', 'City', 'State or region', 'Areas served', 'Round Rock', 'Used on the site. Empty fields in your business details are filled in when the build is applied.')
	const photos = html(h(AiBuildCompose, composeProps({ initialSection: 'photos', uploading: 1, draft: brief({ photoIds: ['md_1'], useLibrary: true }) })))
	contains(photos, '1 chosen · uses your library', 'Upload photos', "It never uses another company's pictures.", "Also use photos from my account's media library (7)", 'Only turn this on if your library holds photos of this business.', 'JPG, PNG or WebP, up to 12 MB each.')
	assert(photos.includes('type="file"') && photos.includes('accept="image/*"') && photos.includes('multiple'), 'a hidden file input')
	assert(photos.includes('aria-label="Crew on a roof"'), 'the project photos as toggles')
	const none = html(h(AiBuildCompose, composeProps({ initialSection: 'photos', media: [] })))
	contains(none, 'No photos. The site will be typographic.')
	const reviews = html(h(AiBuildCompose, composeProps({ initialSection: 'reviews', draft: brief({ reviews: [{ quote: 'They replaced our roof in two days.', name: 'Dana', role: 'Homeowner', source: 'Google' }] }) })))
	contains(reviews, '1 review', "They're placed word for word and never rewritten. The AI never invents any.", 'Paste one or more reviews', 'Add', 'Quote', 'Name', 'Role or place', 'Source')
	assert(reviews.includes('aria-label="Remove review"'))
	const design = html(h(AiBuildCompose, composeProps({ initialSection: 'design' })))
	contains(design, 'Pages', 'Let the AI decide', 'About', 'Exactly these pages', 'Colors', 'AI decides', 'Either', 'Light', 'Dark', 'A palette', 'My brand color', 'Exact colors', 'Fonts', 'Corner shape', 'Sharp', 'Soft', 'Round', 'Header', 'Footer', 'Menu style', 'Mega menu', 'Dropdowns', 'Simple links', 'Header button text')
	assert(!text(design).includes('Keep my current colors'), '"Keep" needs pages to keep')
	const pinned = brief({ pins: { ...brief().pins, palette: { kind: 'curated', id: 'L3' }, menu: 'mega', shape: 'round' } })
	const summary = html(h(AiBuildCompose, composeProps({ draft: pinned })))
	assert(/3 set: .*Mega menu/.test(text(summary)), 'the summary names what is set')
	const pageMode = html(h(AiBuildCompose, composeProps({ initialSection: 'design', pages: [{ id: 'pg_a', name: 'Home', sections: 3 }], draft: brief({ mode: 'page', placement: 'append' }) })))
	contains(pageMode, 'Page name (optional)')
	assert(!text(pageMode).includes('Corner shape'), 'one page keeps the design')
})

await check('compose after a failed plan, a conflict, a field problem and an empty allowance', async () => {
	const failedPlan = html(h(AiBuildCompose, composeProps({ draft: brief(), error: { code: 'upstream', status: 502, retryable: true, message: 'x' }, refunded: true })))
	contains(failedPlan, "The AI's answer for this plan could not be used. Nothing extra was charged. Nothing was charged.", 'Try again')
	const conflict = html(h(AiBuildCompose, composeProps({ draft: brief(), error: { code: 'conflict', status: 409, retryable: false, message: 'A build is already running for this site.', buildId: BUILD_ID } })))
	contains(conflict, 'A build is already running for this site.', 'Resume it', 'Stop it and start over')
	const teammate = html(h(AiBuildCompose, composeProps({ draft: brief(), error: { code: 'conflict', status: 409, retryable: false, message: 'Someone else on your team is building this site with AI. Try again when they finish.' } })))
	contains(teammate, 'Someone else on your team is building this site with AI.')
	assert(!text(teammate).includes('Resume it'), "a teammate's build offers nothing to do")
	const field = html(h(AiBuildCompose, composeProps({ draft: brief(), problem: { field: 'prompt', message: 'Describe the business or the page in a sentence or two.' } })))
	contains(field, 'Describe the business or the page in a sentence or two.')
	const broke = html(h(AiBuildCompose, composeProps({ draft: brief(), capability: { ...capability, units: { ...capability.units, used: 95 } } })))
	contains(broke, 'This needs up to 9 AI writes and you have 5 left today. Pin fewer pages, or try again after')
})

const progressProps = (state, extra = {}) => ({
	state,
	prompt: 'Family-owned roofing company in Austin since 2004.',
	mode: 'site',
	now: 1_041_000,
	saveProfile: true,
	units: capability.units,
	onSaveProfile() {},
	onRetry() {},
	onStop() {},
	onMinimize() {},
	onApply() {},
	onDiscard() {},
	onContinue() {},
	onStartAgain() {},
	...extra,
})
const row = (n, extra = {}) => ({ ...pageView(n), startedAt: null, retryAt: null, ...extra })

await check('progress, planning: the clock, the line and the placeholders', async () => {
	const out = html(h(AiBuildProgress, progressProps({ phase: 'planning', startedAt: 1_000_000, retrying: false, buildId: null })))
	contains(out, '“Family-owned roofing company in Austin since 2004.”', 'Planning your site', '0:41', 'Choosing pages, sections, colors and the menu. This usually takes one to two minutes.', 'Keep working', 'Stop')
	assert(out.includes('role="progressbar"') && out.includes('aria-valuenow="0"'), 'the bar carries its value')
	assert(out.includes('aria-live="polite"'))
	const page = html(h(AiBuildProgress, progressProps({ phase: 'planning', startedAt: 1_000_000, retrying: true, buildId: null }, { mode: 'page' })))
	contains(page, 'Planning your page', 'That took too long. Trying again with a lighter pass.')
})

await check('progress, writing: the plan card and a row per page in every status', async () => {
	const pages = [
		row(1, { status: 'written', attempts: 1 }),
		row(2, { status: 'writing', startedAt: 1_000_000 }),
		row(3, { status: 'failed', attempts: 1, canRetry: true, error: { code: 'upstream', status: 502, retryable: true, message: 'x' } }),
		row(4, { status: 'failed', attempts: 2, canRetry: true, retryCostsUnit: true, error: { code: 'invalid-reply', status: 502, retryable: true, message: 'x' } }),
		row(5),
		row(7),
		row(8, { status: 'cancelled' }),
	]
	const out = html(h(AiBuildProgress, progressProps({ phase: 'running', build: buildView(pages), pages, outlining: true })))
	contains(out, 'The plan', 'Paper Navy', 'Fraunces', 'Full-Width Bar', 'Brand Left, Ruled Columns', 'Services', 'Mega', '7 pages · 10 sections · 3 of your photos')
	contains(out, 'Facts it will use:', 'Founded: since 2004', 'Will be saved to your business details: City', 'Save these to my business details', 'No reviews were given, so the site has no testimonials.')
	contains(out, 'Page', 'Address', 'Sections', 'Status', 'Done', 'Writing', '0:41', 'Failed', 'Retry', 'Retry (uses 1 AI write)', 'Queued', 'Planning…', 'Stopped', '/page-2')
	contains(out, '1 of 7 pages written.', 'Keep working', 'Stop')
	assert(out.includes('fonts.googleapis.com'), 'the font pair is set in its own fonts')
	eq(progressValue({ phase: 'running', build: buildView(pages), pages, outlining: false }), Math.round(10 + 85 / 7))
	const waiting = [row(1, { status: 'writing', startedAt: 1_000_000, retryAt: 1_002_000, error: { code: 'busy', status: 429, retryable: true, message: 'x' } })]
	contains(html(h(AiBuildProgress, progressProps({ phase: 'running', build: buildView(waiting), pages: waiting, outlining: false }))), 'The AI service is busy. Trying again…')
})

await check('progress outcomes (section 13.7): partial, home failed, stopped, interrupted, land failed', async () => {
	const partialPages = [row(1, { status: 'written' }), row(2, { status: 'written' }), row(3, { status: 'failed', canRetry: true, error: { code: 'upstream', status: 502, retryable: true, message: 'x' } })]
	const partial = html(h(AiBuildProgress, progressProps({ phase: 'ready', build: buildView(partialPages), pages: partialPages })))
	contains(partial, "2 of 3 pages are ready. Page 3 could not be written: The AI's answer for this page could not be used. Nothing extra was charged.", 'Retry Page 3', 'Apply without it')
	assert(!text(partial).includes('Stop'), 'nothing to stop once it is ready')

	const homePages = [row(1, { status: 'failed', attempts: 3, canRetry: false, error: { code: 'attempts-exhausted', status: 409, retryable: false, message: 'x' } }), row(2, { status: 'written' })]
	contains(html(h(AiBuildProgress, progressProps({ phase: 'ready', build: buildView(homePages), pages: homePages }))), 'The home page could not be written. Start the build again.', 'Start again')

	const stoppedPages = [row(1, { status: 'written' }), row(2, { status: 'written' }), row(3, { status: 'cancelled' })]
	const stopped = html(h(AiBuildProgress, progressProps({ phase: 'stopped', build: buildView(stoppedPages, { status: 'cancelled' }), pages: stoppedPages })))
	contains(stopped, 'Building stopped. 2 of 3 pages were finished.', 'Use the 2 finished pages', 'Discard')
	const noHome = [row(1, { status: 'cancelled' }), row(2, { status: 'written' })]
	const stoppedNoHome = html(h(AiBuildProgress, progressProps({ phase: 'stopped', build: buildView(noHome, { status: 'cancelled' }), pages: noHome })))
	assert(!text(stoppedNoHome).includes('finished page'), 'a new site without its home page cannot be used')

	const interruptedPages = [row(1, { status: 'written' }), row(2, { status: 'written' }), row(3, { status: 'written' }), row(4)]
	const interrupted = html(h(AiBuildProgress, progressProps({ phase: 'ready', build: buildView(interruptedPages, { status: 'writing' }), pages: interruptedPages, interrupted: true })))
	contains(interrupted, 'This build was interrupted. 3 of 4 pages are done.', 'Continue building', 'Use the 3 finished pages', 'Discard')

	const all = [row(1, { status: 'written' })]
	contains(html(h(AiBuildProgress, progressProps({ phase: 'ready', build: buildView(all), pages: all, landFailed: true }))), 'This build could not be added to your site.', 'Try again')
	contains(html(h(AiBuildProgress, progressProps({ phase: 'ready', build: buildView(all), pages: all }))), 'Your site is ready.', 'Apply')
	contains(html(h(AiBuildProgress, progressProps({ phase: 'landing', build: buildView(all), pages: all }))), 'Adding the pages to your site…')
})

const landedState = (extra = {}) => {
	const build = buildView([written(1, { issues: [{ level: 'warn', code: 'placeholder', message: 'Two facts were left for you to fill in.' }] }), written(2)])
	const landing = { ...landingFor(build), look: { theme: {}, page: {}, header: {}, footer: {} }, skipped: [{ key: 'p3', name: 'Privacy Policy', reason: 'The AI does not write legal pages.' }] }
	return {
		phase: 'landed',
		build,
		landing,
		summary: { firstPageId: 'pg_0000000001', renamed: {}, pageIds: ['pg_0000000001', 'pg_0000000002'], notes: ['Contact is at /contact-us because /contact was already taken.'], unslotted: [] },
		mark: 41,
		profile,
		...extra,
	}
}
const reviewProps = (extra = {}) => ({
	state: landedState(),
	needsInput: [
		{ item: { pageKey: 'p1', pageId: 'pg_0000000001', blockId: 'blk_1', path: 'heading', text: '[License number]' }, page: 'Home', section: 'Page Hero' },
		{ item: { pageKey: 'p1', pageId: 'pg_0000000001', blockId: 'blk_2', path: 'body', text: '[Year founded]' }, page: 'Home', section: 'Spotlight' },
	],
	canUndo: true,
	filled: [{ label: 'City', value: 'Austin' }],
	siteId: 'site1',
	onUndo() {},
	onShowMe() {},
	onDone() {},
	...extra,
})

await check('review: the landing, what was adjusted, what needs input with Show me, and Done', async () => {
	const out = html(h(AiBuildReview, reviewProps()))
	contains(out, 'Your site is built', '2 pages, a mega menu and a new look. 2 things need your input.', 'Undo')
	contains(out, 'Adjusted for you', 'No reviews were given, so the site has no testimonials.', 'Two facts were left for you to fill in.', 'Contact is at /contact-us because /contact was already taken.', 'Privacy Policy was not added: The AI does not write legal pages.')
	contains(out, 'Needs your input', '[License number] · Home › Page Hero', '[Year founded] · Home › Spotlight', 'Show me')
	contains(out, 'Filled in your business details', 'City: Austin', 'Open the business details', 'Done')
	assert(out.includes('href="/account/projects/site1"'))
	assert(out.includes('lucide-undo2'), 'the Undo button')
	const later = html(h(AiBuildReview, reviewProps({ canUndo: false, needsInput: [] })))
	contains(later, 'Use Undo in the toolbar to step back.', 'Nothing left to fill in.', 'Ready to review.')
	assert(!later.includes('lucide-undo2'), 'no Undo button once the landing is not the newest step')
})

// ================================================================ shadcn only

await check('the dialog files contain no raw <button>, <input>, <select> or <textarea>', async () => {
	const files = [
		'src/app/builder/builder/ai-build-host.tsx',
		'src/app/builder/builder/ai-build-dialog.tsx',
		'src/app/builder/builder/ai-build-compose.tsx',
		'src/app/builder/builder/ai-build-progress.tsx',
		'src/app/builder/builder/ai-build-review.tsx',
		'src/app/builder/builder/ai-build-runner.ts',
	]
	for (const file of files) {
		const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
		for (const tag of ['<button', '<input', '<select', '<textarea'])
			assert(!source.includes(tag), `${file} has a raw ${tag}>`)
	}
})

finished = true
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
