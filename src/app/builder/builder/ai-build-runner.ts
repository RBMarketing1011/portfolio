'use client'

/**
 * Runs a "Build with AI" build from the browser: plan, outline the rest, write the
 * pages three at a time (home first), retry, stop, resume and land. The state machine
 * is a plain class with its network, clock and store passed in, so the proof drives it
 * with a fake API and a fake clock; `useAiBuildRunner` binds it to the real ones.
 *
 * Also the copy the views and toasts share, so every surface says the same thing.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
	AI_LIMITS,
	DEFAULT_PINS,
	type ApiError,
	type BuildView,
	type CreateBuildRequest,
	type LandingPayload,
	type LandRequest,
	type LandResponse,
	type NeedsInput,
	type PageView,
	type StreamEvent,
} from '@/lib/builder/ai/contract'
import { useBuilder } from '@/lib/builder/builder-context'
import { LandError, type LandSummary } from '@/lib/builder/land'
import type { Site } from '@/lib/builder/page-schema'
import type { SiteProfile } from '@/lib/builder/site-profile'
import type { Block } from '@/lib/builder/types'
import {
	AiRequestError,
	OFFLINE,
	cancelBuild,
	createBuild,
	getBuild,
	landBuild,
	outlineBuild,
	writeBuildPage,
} from './builder-ai'

// ---------------------------------------------------------------- types

/** What the compose view holds and resubmits; also the localStorage draft. */
export type ComposeDraft = Omit<CreateBuildRequest, 'fast'>

export type RunPage = PageView & {
	startedAt: number | null
	/** Set while an automatic retry is waiting to start. */
	retryAt?: number | null
}

type PlanStage = Extract<StreamEvent<unknown>, { t: 'stage' }>['stage']

export type LandedState = {
	phase: 'landed'
	build: BuildView
	landing: LandingPayload
	summary: LandSummary
	mark: number
	profile: SiteProfile
}

export type RunnerState =
	| { phase: 'idle' }
	| { phase: 'planning'; startedAt: number; retrying: boolean; buildId: string | null; stage?: PlanStage | null }
	| { phase: 'running'; build: BuildView; pages: RunPage[]; outlining: boolean }
	| {
			phase: 'ready'
			build: BuildView
			pages: RunPage[]
			/** Opened from "Unfinished build · Resume": nothing restarts without a click. */
			interrupted?: boolean
			/** Landing was refused by the server. */
			error?: ApiError | null
			/** The payload arrived but could not be added to the site. */
			landFailed?: boolean
	  }
	| { phase: 'landing'; build: BuildView; pages: RunPage[] }
	| LandedState
	| { phase: 'stopped'; build: BuildView; pages: RunPage[]; error?: ApiError | null; landFailed?: boolean }
	| { phase: 'failed'; error: ApiError; units?: { reserved: number; refunded: number } }

type WithPages = Extract<RunnerState, { pages: RunPage[] }>

export type RunnerApi = {
	createBuild: (
		body: CreateBuildRequest,
		onEvent: (event: StreamEvent<BuildView>) => void,
		signal: AbortSignal,
	) => Promise<'done' | 'error' | 'ended'>
	outlineBuild: (
		buildId: string,
		onEvent: (event: StreamEvent<BuildView>) => void,
		signal: AbortSignal,
	) => Promise<'done' | 'error' | 'ended'>
	writeBuildPage: (
		buildId: string,
		key: string,
		onEvent: (event: StreamEvent<PageView>) => void,
		signal: AbortSignal,
	) => Promise<'done' | 'error' | 'ended'>
	getBuild: (buildId: string, signal?: AbortSignal) => Promise<BuildView>
	cancelBuild: (buildId: string) => Promise<BuildView>
	landBuild: (buildId: string, body: LandRequest) => Promise<LandResponse>
}

export type RunnerClock = {
	now: () => number
	setTimeout: (fn: () => void, ms: number) => unknown
	clearTimeout: (handle: unknown) => void
}

export type RunnerNotice =
	/** Every page is written but the dialog is minimized: nothing lands until Apply. */
	| { kind: 'ready'; build: BuildView }
	| { kind: 'landed'; state: LandedState }

export type RunnerDeps = {
	api: RunnerApi
	clock: RunnerClock
	store: {
		applyAiResult: (landing: LandingPayload) => LandSummary
		setProfile: (profile: SiteProfile) => void
		historyMark: () => number
	}
	/** Opens the first landed page. */
	navigate: (pageId: string | null) => void
	/** Whether the dialog is open; a build that finishes minimized waits for Apply. */
	isOpen: () => boolean
	notify: (notice: RunnerNotice) => void
}

type PageRun = {
	/** A request is out, or its outcome is being read back from the server. */
	active: boolean
	controller: AbortController | null
	/** An automatic retry waits on this timer. */
	timer: unknown
	/** Automatic retries spent on this page. */
	auto: number
}

// ---------------------------------------------------------------- small helpers

export const emptyBusiness = (): ComposeDraft['business'] => ({
	name: '',
	type: '',
	phone: '',
	email: '',
	city: '',
	region: '',
	areas: [],
})

export const emptyDraft = (): ComposeDraft => ({
	mode: 'site',
	placement: 'replace-site',
	targetPageId: null,
	prompt: '',
	pins: { ...DEFAULT_PINS },
	business: emptyBusiness(),
	reviews: [],
	photoIds: [],
	useLibrary: false,
})

const hasPages = (state: RunnerState): state is WithPages => 'pages' in state

const buildIdOf = (state: RunnerState) =>
	state.phase === 'planning' ? state.buildId : 'build' in state ? state.build.id : null

export const writtenCount = (pages: { status: string }[]) =>
	pages.filter((page) => page.status === 'written').length

/** Pages the planner may use: the pin, else the default; one for a page build. */
export function pageCapOf(draft: Pick<ComposeDraft, 'mode' | 'pins'>) {
	if (draft.mode === 'page') return 1
	const pages = draft.pins.pages
	const cap =
		pages.kind === 'list' ? pages.names.length : pages.kind === 'count' ? pages.count : AI_LIMITS.pagesDefault
	return Math.min(AI_LIMITS.pagesMax, Math.max(1, cap))
}

/** Units the server reserves when the build is created: the plan plus one per page. */
export const unitsFor = (draft: Pick<ComposeDraft, 'mode' | 'pins'>) => 1 + pageCapOf(draft)

/** The brief as the server reads it: no control characters, single spaces. */
export const cleanPrompt = (prompt: string) =>
	prompt
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const HEX = /^#?[0-9a-fA-F]{6}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type DraftProblem = { field: string; message: string }

/** The server's checks (section 4.2), run before sending, with the same messages. */
export function validateDraft(
	draft: ComposeDraft,
	ctx: { pageIds: string[]; isFont: (family: string) => boolean },
): DraftProblem | null {
	const prompt = cleanPrompt(draft.prompt)
	if (prompt.length < AI_LIMITS.promptMin)
		return { field: 'prompt', message: 'Describe the business or the page in a sentence or two.' }
	if (prompt.length > AI_LIMITS.promptMax)
		return { field: 'prompt', message: 'Keep the description under 4,000 characters.' }
	if (ctx.pageIds.length === 0 && draft.placement !== 'replace-site')
		return { field: 'placement', message: 'This site is empty, so the AI builds it from scratch.' }
	if (draft.placement === 'replace-page' && (draft.mode !== 'page' || !draft.targetPageId || !ctx.pageIds.includes(draft.targetPageId)))
		return { field: 'targetPageId', message: 'Choose the page to rebuild.' }

	const pages = draft.pins.pages
	if (draft.mode === 'page' && (pages.kind === 'count' || (pages.kind === 'list' && pages.names.length !== 1)))
		return { field: 'pins.pages', message: 'One page takes at most one page name.' }
	if (pages.kind === 'count' && !(Number.isInteger(pages.count) && pages.count >= 1 && pages.count <= AI_LIMITS.pagesMax))
		return { field: 'pins.pages', message: 'Choose between 1 and 12 pages.' }
	if (pages.kind === 'list') {
		const names = pages.names.map((name) => name.trim())
		if (names.length < 1 || names.length > AI_LIMITS.pagesMax || names.some((name) => !name || name.length > AI_LIMITS.pageNameMax))
			return { field: 'pins.pages', message: 'Choose between 1 and 12 pages.' }
		if (new Set(names.map((name) => name.toLowerCase())).size !== names.length)
			return { field: 'pins.pages', message: 'Page names must be different.' }
	}

	const palette = draft.pins.palette
	const colors =
		palette.kind === 'brand'
			? [palette.accent]
			: palette.kind === 'custom'
				? [palette.background, palette.accent, palette.heading, palette.body]
				: []
	if (colors.some((color) => !HEX.test(color)))
		return { field: 'pins.palette', message: 'Colors must be six-digit hex values like #1e3a8a.' }
	const fonts = draft.pins.fonts
	if (fonts.kind === 'custom' && !(ctx.isFont(fonts.heading) && ctx.isFont(fonts.body)))
		return { field: 'pins.fonts', message: 'That font is not in the font list.' }
	if (draft.pins.ctaLabel.trim().length > AI_LIMITS.ctaLabelMax)
		return { field: 'pins.ctaLabel', message: 'Keep the button text under 40 characters.' }

	const business = draft.business
	if (business.name.trim().length > 120) return { field: 'business.name', message: 'Keep the business name under 120 characters.' }
	if (business.phone.trim().length > 40) return { field: 'business.phone', message: 'Keep the phone number under 40 characters.' }
	const email = business.email.trim()
	if (email && (email.length > 254 || !EMAIL.test(email)))
		return { field: 'business.email', message: 'That email address does not look right.' }
	if (business.city.trim().length > 80) return { field: 'business.city', message: 'Keep the city under 80 characters.' }
	if (business.region.trim().length > 80) return { field: 'business.region', message: 'Keep the state or region under 80 characters.' }
	if (business.areas.length > 30) return { field: 'business.areas', message: 'Up to 30 areas.' }
	if (business.areas.some((area) => area.trim().length > 80))
		return { field: 'business.areas', message: 'Keep each area under 80 characters.' }

	if (draft.reviews.length > AI_LIMITS.reviewsMax) return { field: 'reviews', message: 'Up to 12 reviews.' }
	for (const [index, review] of draft.reviews.entries()) {
		const quote = review.quote.trim()
		const name = review.name.trim()
		if (quote.length < AI_LIMITS.reviewQuoteMin || quote.length > AI_LIMITS.reviewQuoteMax || !name || name.length > AI_LIMITS.reviewNameMax)
			return {
				field: `reviews.${index}.${quote.length < AI_LIMITS.reviewQuoteMin || quote.length > AI_LIMITS.reviewQuoteMax ? 'quote' : 'name'}`,
				message: "Reviews need the review text and the reviewer's name.",
			}
		if (review.role.trim().length > AI_LIMITS.reviewRoleMax || review.source.trim().length > AI_LIMITS.reviewSourceMax)
			return { field: `reviews.${index}.role`, message: "Reviews need the review text and the reviewer's name." }
	}
	if (draft.photoIds.length > AI_LIMITS.photosMax) return { field: 'photoIds', message: 'Up to 24 photos.' }
	return null
}

/** The progress bar: 10 for the plan, 85 for the pages, 5 for landing. */
export function progressValue(state: RunnerState) {
	if (state.phase === 'idle' || state.phase === 'failed' || state.phase === 'planning') return 0
	if (state.phase === 'landed') return 100
	const total = state.pages.length || 1
	return Math.round(10 + (85 * writtenCount(state.pages)) / total + (state.phase === 'landing' ? 5 : 0))
}

/** "0:41" */
export function elapsed(ms: number) {
	const seconds = Math.max(0, Math.floor(ms / 1000))
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** A reset time in the person's own clock, e.g. "7:00 PM". */
export function localTime(iso: string | undefined) {
	const date = iso ? new Date(iso) : null
	if (!date || Number.isNaN(date.getTime())) return 'midnight UTC'
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export type CopyContext = {
	/** Where the error happened. */
	stage: 'plan' | 'page' | 'land'
	/** The runner is already trying again. */
	automatic?: boolean
	units?: { limit: number; resetsAt: string }
}

/** The message for an error (section 13.11), or null when it is never shown. */
export function errorCopy(error: ApiError, ctx: CopyContext): string | null {
	switch (error.code) {
		case 'bad-request':
			return error.message
		case 'unauthorized':
			return 'Your session ended. Sign in again to keep building.'
		case 'forbidden':
			return 'Your role can view this site but not edit it.'
		case 'not-found':
		case 'expired':
			return 'That build has expired. Start a new one.'
		case 'not-configured':
		case 'config':
			return "AI building isn't set up correctly on this deployment."
		case 'conflict':
			return error.buildId ? 'A build is already running for this site.' : error.message
		case 'busy':
			return ctx.stage === 'page'
				? 'The AI service is busy. Trying again…'
				: 'Two builds are already running in this account. Try again when one finishes.'
		case 'rate-limited':
			return `The AI service is busy. Trying again in ${Math.max(1, Math.round((error.retryAfterMs ?? 2000) / 1000))} seconds…`
		case 'daily-limit':
			return ctx.units
				? `You've used today's ${ctx.units.limit} AI writes. They reset at ${localTime(ctx.units.resetsAt)}.`
				: "You've used today's AI writes. They reset at midnight UTC."
		case 'global-limit':
			return 'The AI builder is very busy today. Try again tomorrow.'
		case 'token-limit':
			return `This account has used today's AI allowance. It resets at ${localTime(ctx.units?.resetsAt)}.`
		case 'refused':
			return 'The AI declined this request. Try describing it differently.'
		case 'timeout':
			return ctx.automatic ? 'That took too long. Trying again with a lighter pass.' : 'That took too long.'
		case 'invalid-reply':
		case 'truncated':
		case 'upstream':
			return `The AI's answer for this ${ctx.stage === 'page' ? 'page' : 'plan'} could not be used. Nothing extra was charged.`
		case 'attempts-exhausted':
			return 'This page could not be written after three tries. Apply the site without it, or start again.'
		case 'home-failed':
			return 'The home page could not be written. Start the build again.'
		case 'not-ready':
		case 'cancelled':
			return null
		case 'network':
			return "You're offline. Retry when you're back."
		case 'too-large':
			return 'That request is too large. Remove some reviews or photos and try again.'
	}
	return error.message || null
}

/** "a mega menu", "a dropdown menu", "a simple menu", or "your menu" when it was kept. */
function menuPhrase(build: BuildView) {
	const chrome = build.chrome
	if (!chrome || chrome.kept) return 'your menu'
	if (chrome.menu.some((item) => item.kind === 'mega')) return 'a mega menu'
	if (chrome.menu.some((item) => item.kind === 'dropdown')) return 'a dropdown menu'
	return 'a simple menu'
}

const inputLine = (open: number) =>
	open > 0 ? `${plural(open, 'thing needs', 'things need')} your input.` : 'Ready to review.'

/** The landing toast and the review view's banner (section 13.10). */
export function landedCopy(state: Pick<LandedState, 'build' | 'landing' | 'summary'>, open: number) {
	const { build, landing, summary } = state
	const count = summary.pageIds.length || landing.pages.length
	if (landing.placement === 'replace-site') {
		const look = landing.look ? ' and a new look' : ''
		return {
			title: 'Your site is built',
			description: `${plural(count, 'page', 'pages')}, ${menuPhrase(build)}${look}. ${inputLine(open)}`,
		}
	}
	const name = landing.pages[0]?.name ?? 'Your'
	if (build.mode === 'page' || landing.placement === 'replace-page')
		return {
			title: `${name} page ${landing.placement === 'replace-page' ? 'rebuilt' : 'built'}`,
			description: inputLine(open),
		}
	return {
		title: `${plural(count, 'page', 'pages')} added`,
		description:
			summary.unslotted.length === 0 ? 'Added to your menu.' : 'They are in the footer; your menu is full.',
	}
}

/** Whether a bracketed placeholder is still on the site (a replaced one has gone). */
function stillOpen(item: NeedsInput, site: Site) {
	const page = site.pages.find((p) => p.id === item.pageId)
	if (!page) return false
	const find = (blocks: Block[]): Block | undefined => {
		for (const block of blocks) {
			if (block.id === item.blockId) return block
			const inner = block.children ? find(block.children) : undefined
			if (inner) return inner
		}
		return undefined
	}
	const block = find(page.blocks)
	if (!block) return false
	const text = item.text.trim()
	if (!text) return false
	// The path is read from the block, then from its props; any other shape falls back
	// to looking for the placeholder anywhere in the block.
	const parts = item.path.split('.').filter(Boolean)
	for (const root of [block as unknown, block.props as unknown]) {
		let node = root
		for (const part of parts) {
			if (node === null || typeof node !== 'object') {
				node = undefined
				break
			}
			node = (node as Record<string, unknown>)[part]
		}
		if (typeof node === 'string') return node.includes(text)
	}
	return JSON.stringify(block.props ?? {}).includes(JSON.stringify(text).slice(1, -1))
}

/** The placeholders of a landing that the person has not filled in yet. */
export const openNeedsInput = (items: NeedsInput[], site: Site) => items.filter((item) => stillOpen(item, site))

// ---------------------------------------------------------------- the runner

const NOT_WRITTEN: ApiError = {
	code: 'network',
	status: 0,
	retryable: true,
	message: 'The connection closed before this page was finished.',
}

/** Pre-stream refusals that cost no attempt and clear up by themselves. */
const TRANSIENT = new Set(['busy', 'rate-limited', 'network'])

export class AiBuildRunner {
	private state: RunnerState = { phase: 'idle' }
	private readonly listeners = new Set<() => void>()
	/** Bumped by every stop, start and discard, so late answers of an old run are ignored. */
	private generation = 0
	private draft: ComposeDraft | null = null
	private planController: AbortController | null = null
	private outlineController: AbortController | null = null
	private outlineTimer: unknown = null
	private outlineTries = 0
	private readonly runs = new Map<string, PageRun>()
	private gateOpen = false
	private gateTimer: unknown = null
	private landing: Promise<void> | null = null
	/** The plan card's "Save these to my business details". */
	saveProfile = true

	constructor(private readonly deps: RunnerDeps) {}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	getState = () => this.state

	private set(state: RunnerState) {
		this.state = state
		for (const listener of this.listeners) listener()
	}

	private get busy() {
		const phase = this.state.phase
		return phase === 'planning' || phase === 'running' || phase === 'landing'
	}

	setSaveProfile = (value: boolean) => {
		this.saveProfile = value
	}

	/** The brief this runner planned from; '' for a build resumed from an earlier visit. */
	get brief() {
		return this.draft?.prompt ?? ''
	}

	/** Stops everything in flight on this side (the server is told separately). */
	private abortAll() {
		this.generation++
		this.planController?.abort()
		this.planController = null
		this.outlineController?.abort()
		this.outlineController = null
		if (this.outlineTimer !== null) this.deps.clock.clearTimeout(this.outlineTimer)
		this.outlineTimer = null
		this.outlineTries = 0
		if (this.gateTimer !== null) this.deps.clock.clearTimeout(this.gateTimer)
		this.gateTimer = null
		this.gateOpen = false
		for (const run of this.runs.values()) {
			run.controller?.abort()
			if (run.timer !== null) this.deps.clock.clearTimeout(run.timer)
		}
		this.runs.clear()
	}

	/** Leaving the builder: requests are dropped, the server keeps the build for Resume. */
	dispose = () => {
		this.abortAll()
	}

	private sleep(ms: number) {
		return new Promise<void>((resolve) => {
			this.deps.clock.setTimeout(resolve, ms)
		})
	}

	/** Reads the build every 3 s for up to 100 s, until `until` holds. */
	private async poll(buildId: string, until: (build: BuildView) => boolean, gen: number) {
		let last: BuildView | null = null
		for (let waited = 0; waited < AI_LIMITS.pollMaxMs; waited += AI_LIMITS.pollMs) {
			await this.sleep(AI_LIMITS.pollMs)
			if (gen !== this.generation) return null
			try {
				last = await this.deps.api.getBuild(buildId)
			} catch {
				continue
			}
			if (gen !== this.generation) return null
			if (until(last)) return last
		}
		return last
	}

	// ------------------------------------------------------------ planning

	/** Plans a new build from the compose draft. */
	start = (draft: ComposeDraft) => {
		if (this.busy) return
		this.abortAll()
		this.draft = draft
		this.saveProfile = true
		void this.plan(false)
	}

	private async plan(fast: boolean): Promise<void> {
		const draft = this.draft
		if (!draft) return
		const gen = this.generation
		const controller = new AbortController()
		this.planController = controller
		this.set({ phase: 'planning', startedAt: this.deps.clock.now(), retrying: fast, buildId: null, stage: null })
		const got: { build?: BuildView; error?: ApiError; data?: BuildView } = {}
		const outcome = await this.deps.api.createBuild(
			{ ...draft, fast },
			(event) => {
				if (gen !== this.generation) return
				const state = this.state
				if (event.t === 'accepted' && state.phase === 'planning')
					this.set({ ...state, buildId: event.buildId })
				else if (event.t === 'stage' && state.phase === 'planning') this.set({ ...state, stage: event.stage })
				else if (event.t === 'done') got.build = event.data
				else if (event.t === 'error') {
					got.error = event.error
					got.data = event.data
				}
			},
			controller.signal,
		)
		if (gen !== this.generation) return
		this.planController = null

		if (!got.build && !got.error && outcome !== 'error') {
			// The stream broke before its last line; the server keeps planning, so ask it.
			const buildId = this.state.phase === 'planning' ? this.state.buildId : null
			if (buildId) {
				const polled = await this.poll(buildId, (build) => build.status !== 'planning', gen)
				if (gen !== this.generation) return
				if (polled && polled.status !== 'planning' && !polled.error && polled.status !== 'failed')
					got.build = polled
				else if (polled?.error) {
					got.error = polled.error
					got.data = polled
				}
			}
		}
		if (got.build) return this.begin(got.build)

		const error = got.error ?? OFFLINE
		if (error.code === 'cancelled') return this.set({ phase: 'idle' })
		// A plan that ran out of time is tried once more, lighter (the first one was refunded).
		if ((error.code === 'timeout' || error.code === 'truncated') && !fast) return this.plan(true)
		this.set({ phase: 'failed', error, ...(got.data ? { units: got.data.units } : {}) })
	}

	/** The plan is in: write the pages, outlining the rest alongside. */
	private begin(build: BuildView, interrupted = false) {
		const pages: RunPage[] = build.pages.map((page) => ({ ...page, startedAt: null, retryAt: null }))
		if (interrupted) return this.set({ phase: 'ready', build, pages, interrupted: true })
		this.gateOpen = pages[0]?.status === 'written'
		this.set({ phase: 'running', build, pages, outlining: false })
		if (pages.some((page) => !page.outlined)) void this.outline()
		this.pump()
	}

	// ------------------------------------------------------------ outline

	private async outline() {
		const state = this.state
		if (this.outlineController || this.outlineTimer !== null || !hasPages(state)) return
		const gen = this.generation
		const buildId = state.build.id
		const controller = new AbortController()
		this.outlineController = controller
		this.patchRunning({ outlining: true })
		const got: { build?: BuildView; error?: ApiError } = {}
		const outcome = await this.deps.api.outlineBuild(
			buildId,
			(event) => {
				if (gen !== this.generation) return
				if (event.t === 'done') got.build = event.data
				else if (event.t === 'error') got.error = event.error
			},
			controller.signal,
		)
		if (gen !== this.generation) return
		this.outlineController = null

		// Another request already outlines (a reload), or the stream broke: read the outcome.
		if (!got.build && (got.error?.code === 'conflict' || (!got.error && outcome !== 'error'))) {
			const polled = await this.poll(buildId, (build) => build.outline === 'done' || build.outline === 'failed', gen)
			if (gen !== this.generation) return
			if (polled?.outline === 'done') got.build = polled
		}
		if (got.build) {
			this.merge(got.build)
			this.patchRunning({ outlining: false })
			return this.pump()
		}

		this.outlineTries++
		const error = got.error ?? OFFLINE
		if (error.code !== 'cancelled' && (error.retryable || !got.error) && this.outlineTries < AI_LIMITS.outlineAttempts) {
			// The server falls back to proven layouts on its own after a second failure.
			this.outlineTimer = this.deps.clock.setTimeout(() => {
				this.outlineTimer = null
				if (gen === this.generation) void this.outline()
			}, 2000)
			return
		}
		this.patchRunning({ outlining: false })
		// The pages waiting on it cannot be written; Retry on any of them outlines again.
		this.setRows((pages) =>
			pages.map((page) =>
				page.outlined || page.status !== 'pending'
					? page
					: { ...page, status: 'failed', error, canRetry: true, retryAt: null },
			),
		)
		this.pump()
	}

	// ------------------------------------------------------------ the page pool

	private patchRunning(patch: Partial<{ outlining: boolean }>) {
		const state = this.state
		if (state.phase === 'running') this.set({ ...state, ...patch })
	}

	private setRows(fn: (pages: RunPage[]) => RunPage[]) {
		const state = this.state
		if (!hasPages(state)) return
		const pages = fn(state.pages)
		if (pages !== state.pages) this.set({ ...state, pages } as RunnerState)
	}

	private patchRow(key: string, patch: Partial<RunPage>) {
		this.setRows((pages) => pages.map((page) => (page.key === key ? { ...page, ...patch } : page)))
	}

	/** A server view of the build: rows this tab is working on keep their own state. */
	private merge(build: BuildView) {
		const state = this.state
		if (!hasPages(state)) return
		const mine = new Map(state.pages.map((page) => [page.key, page]))
		const pages = build.pages.map((server): RunPage => {
			const local = mine.get(server.key)
			if (!local) return { ...server, startedAt: null, retryAt: null }
			const own = this.runs.has(server.key) || local.status !== 'pending' || server.status === 'pending'
			return own
				? {
						...local,
						name: server.name,
						slug: server.slug,
						archetype: server.archetype,
						purpose: server.purpose,
						outlined: server.outlined,
						sections: server.sections,
					}
				: { ...server, startedAt: local.startedAt, retryAt: null }
		})
		this.set({ ...state, build, pages } as RunnerState)
	}

	private openGate() {
		if (this.gateOpen) return
		this.gateOpen = true
		if (this.gateTimer !== null) this.deps.clock.clearTimeout(this.gateTimer)
		this.gateTimer = null
		this.pump()
	}

	/** Starts every page that may start: three at a time, home first and alone. */
	private pump() {
		const state = this.state
		if (state.phase !== 'running') return
		let free = AI_LIMITS.writeConcurrency - this.runs.size
		const home = state.pages[0]?.key
		for (const page of state.pages) {
			if (free <= 0) break
			if (this.runs.has(page.key) || page.status !== 'pending' || !page.outlined) continue
			// The rest wait for the home page's first stage (its write has reached the model,
			// so they read the site context from the cache it wrote), or 20 s.
			if (page.key !== home && !this.gateOpen) continue
			void this.write(page.key)
			free--
		}
		this.settle()
	}

	/** Nothing in flight: the build is ready (or partly, or stopped). */
	private settle() {
		const state = this.state
		if (state.phase !== 'running' || this.runs.size > 0) return
		if (this.outlineController || this.outlineTimer !== null) return
		if (state.pages.some((page) => page.status === 'pending')) {
			if (state.pages.some((page) => page.status === 'pending' && !page.outlined)) void this.outline()
			return
		}
		const { build, pages } = state
		if (pages.some((page) => page.status === 'cancelled')) return this.set({ phase: 'stopped', build, pages })
		this.set({ phase: 'ready', build, pages })
		if (pages.every((page) => page.status === 'written')) {
			if (this.deps.isOpen()) void this.apply()
			else this.deps.notify({ kind: 'ready', build })
		}
	}

	private async write(key: string) {
		const state = this.state
		if (state.phase !== 'running') {
			this.runs.delete(key)
			return
		}
		const gen = this.generation
		const buildId = state.build.id
		const run: PageRun = this.runs.get(key) ?? { active: false, controller: null, timer: null, auto: 0 }
		const controller = new AbortController()
		run.active = true
		run.controller = controller
		run.timer = null
		this.runs.set(key, run)
		const home = state.pages[0]?.key === key
		this.patchRow(key, { status: 'writing', startedAt: this.deps.clock.now(), retryAt: null })
		if (home && !this.gateOpen && this.gateTimer === null)
			this.gateTimer = this.deps.clock.setTimeout(() => {
				this.gateTimer = null
				if (gen === this.generation) this.openGate()
			}, AI_LIMITS.staggerFallbackMs)

		const got: { view?: PageView; error?: ApiError; data?: PageView; accepted?: boolean; attempt?: number } = {}
		const outcome = await this.deps.api.writeBuildPage(
			buildId,
			key,
			(event) => {
				if (gen !== this.generation) return
				if (event.t === 'accepted') {
					got.accepted = true
					got.attempt = event.attempt
					if (event.attempt) this.patchRow(key, { attempts: event.attempt })
				} else if (event.t === 'stage') {
					if (home) this.openGate()
				} else if (event.t === 'done') got.view = event.data
				else if (event.t === 'error') {
					got.error = event.error
					got.data = event.data
				}
			},
			controller.signal,
		)
		if (gen !== this.generation) return
		run.controller = null
		if (home) this.openGate()

		// Set when the outcome was read back from the server: never retried by itself, since
		// a page still writing there would only be refused as busy.
		let readBack = false
		if (!got.view && !got.error && outcome !== 'error') {
			// The stream broke: the server may still finish, so read what it stored.
			readBack = true
			const polled = await this.poll(buildId, (build) => build.pages.find((page) => page.key === key)?.status !== 'writing', gen)
			if (gen !== this.generation) return
			const view = polled?.pages.find((page) => page.key === key)
			if (view?.status === 'written') got.view = view
			else if (view && view.status !== 'writing') {
				got.data = view
				got.error = view.error ?? NOT_WRITTEN
			} else got.error = NOT_WRITTEN
		}
		run.active = false

		// A page the server already has (a 409 that carries it) is as good as done.
		if (!got.view && got.data?.status === 'written') got.view = got.data
		if (got.view) {
			this.runs.delete(key)
			const view = got.view
			this.setRows((pages) =>
				pages.map((page) => (page.key === key ? { ...view, startedAt: page.startedAt, retryAt: null } : page)),
			)
			return this.pump()
		}

		const error = got.error ?? NOT_WRITTEN
		if (error.code === 'not-ready') {
			// Still being outlined: it waits for the outline, silently.
			this.runs.delete(key)
			this.patchRow(key, { status: 'pending', outlined: false, retryAt: null })
			if (!this.outlineController && this.outlineTimer === null) void this.outline()
			return this.pump()
		}
		const automatic =
			error.retryable &&
			!readBack &&
			(got.accepted
				? got.attempt === 1 && run.auto < 1
				: TRANSIENT.has(error.code) && run.auto < 2)
		if (automatic) {
			run.auto++
			const wait = Math.min(30_000, error.retryAfterMs ?? 2000)
			this.patchRow(key, { status: 'writing', error, retryAt: this.deps.clock.now() + wait })
			// The page keeps its place in the pool while it waits, so the pool stays at three.
			run.timer = this.deps.clock.setTimeout(() => {
				run.timer = null
				if (gen === this.generation) void this.write(key)
			}, wait)
			return
		}

		this.runs.delete(key)
		const view = got.data
		this.setRows((pages) =>
			pages.map((page) => {
				if (page.key !== key) return page
				const base = view ? { ...view, startedAt: page.startedAt } : page
				const attempts = view?.attempts ?? page.attempts
				return {
					...base,
					status: error.code === 'cancelled' ? 'cancelled' : 'failed',
					error,
					canRetry: view?.canRetry ?? (error.retryable && attempts < AI_LIMITS.attemptsPerPage),
					retryCostsUnit: view?.retryCostsUnit ?? attempts === AI_LIMITS.attemptsPerPage - 1,
					retryAt: null,
				}
			}),
		)
		this.pump()
	}

	/** Writes a failed page again (the button says when it costs one more AI write). */
	retry = (key: string) => {
		const state = this.state
		if ((state.phase !== 'running' && state.phase !== 'ready') || this.runs.has(key)) return
		const row = state.pages.find((page) => page.key === key)
		if (!row || row.status === 'written') return
		const reopen = (page: RunPage): RunPage => ({ ...page, status: 'pending', error: null, retryAt: null })
		// Pages that failed because the outline gave up all wait on the same outline.
		const pages = state.pages.map((page) =>
			page.key === key || (!row.outlined && !page.outlined && page.status === 'failed') ? reopen(page) : page,
		)
		this.gateOpen = true
		this.set({ phase: 'running', build: state.build, pages, outlining: this.outlineController !== null })
		if (!row.outlined) {
			this.outlineTries = 0
			void this.outline()
		}
		this.pump()
	}

	/** Resume after an interruption: pending and retryable pages start again. */
	continueBuild = () => {
		const state = this.state
		if (state.phase !== 'ready') return
		const pages = state.pages.map((page): RunPage =>
			page.status === 'pending' || (page.status === 'failed' && page.canRetry)
				? { ...page, status: 'pending', error: null, retryAt: null }
				: page,
		)
		this.gateOpen = pages[0]?.status !== 'pending'
		this.set({ phase: 'running', build: state.build, pages, outlining: false })
		// A page another request is still writing is watched until the server settles it.
		for (const page of pages) if (page.status === 'writing') void this.watch(page.key)
		if (pages.some((page) => page.status === 'pending' && !page.outlined)) void this.outline()
		this.pump()
	}

	private async watch(key: string) {
		const state = this.state
		if (state.phase !== 'running' || this.runs.has(key)) return
		const gen = this.generation
		this.runs.set(key, { active: true, controller: null, timer: null, auto: 0 })
		const polled = await this.poll(state.build.id, (build) => build.pages.find((page) => page.key === key)?.status !== 'writing', gen)
		if (gen !== this.generation) return
		this.runs.delete(key)
		const view = polled?.pages.find((page) => page.key === key)
		this.setRows((pages) =>
			pages.map((page) =>
				page.key !== key
					? page
					: view && view.status !== 'writing'
						? { ...view, startedAt: page.startedAt, retryAt: null }
						: { ...page, status: 'failed', error: NOT_WRITTEN, canRetry: true, retryAt: null },
			),
		)
		this.pump()
	}

	// ------------------------------------------------------------ stop, discard, resume

	/** Stops the build: requests are aborted and the server refunds what was not used. */
	stop = async () => {
		const state = this.state
		if (state.phase !== 'planning' && state.phase !== 'running') return
		const buildId = buildIdOf(state)
		this.abortAll()
		if (state.phase === 'planning') {
			this.set({ phase: 'idle' })
			if (buildId) await this.deps.api.cancelBuild(buildId).catch(() => null)
			return
		}
		const stopped = (page: RunPage): RunPage =>
			page.status === 'writing' || page.status === 'pending' ? { ...page, status: 'cancelled', retryAt: null } : page
		const pages = state.pages.map(stopped)
		this.set({ phase: 'stopped', build: state.build, pages })
		const gen = this.generation
		const build = await this.deps.api.cancelBuild(state.build.id).catch(() => null)
		if (!build || gen !== this.generation || this.state.phase !== 'stopped') return
		// A page that finished just before the stop counts; one the server still shows as
		// writing stops within seconds.
		const server = new Map(build.pages.map((page) => [page.key, page]))
		this.set({
			phase: 'stopped',
			build,
			pages: pages.map((page) => {
				const view = server.get(page.key)
				return view?.status === 'written' ? { ...view, startedAt: page.startedAt, retryAt: null } : page
			}),
		})
	}

	/** Throws the build away (cancelled on the server; nothing lands). */
	discard = async () => {
		const state = this.state
		const buildId = buildIdOf(state)
		const cancelled = state.phase === 'stopped' || state.phase === 'landed' || state.phase === 'failed'
		this.abortAll()
		this.set({ phase: 'idle' })
		if (buildId && !cancelled) await this.deps.api.cancelBuild(buildId).catch(() => null)
	}

	/** Back to the compose view with the draft, throwing the current build away. */
	startAgain = () => this.discard()

	/** "Stop it and start over": the build that is in the way is cancelled first. */
	restart = async (buildId: string) => {
		if (this.busy || !this.draft) return
		await this.deps.api.cancelBuild(buildId).catch(() => null)
		const draft = this.draft
		this.set({ phase: 'idle' })
		this.start(draft)
	}

	/** Opens an unfinished build from an earlier visit. Nothing restarts without a click. */
	resume = async (buildId: string) => {
		if (this.busy) return
		this.abortAll()
		this.draft = null
		const gen = this.generation
		let build: BuildView
		try {
			build = await this.deps.api.getBuild(buildId)
		} catch (error) {
			if (gen === this.generation)
				this.set({ phase: 'failed', error: error instanceof AiRequestError ? error.error : OFFLINE })
			return
		}
		if (gen !== this.generation) return
		if (build.status === 'planning') {
			this.set({ phase: 'planning', startedAt: this.deps.clock.now(), retrying: false, buildId, stage: null })
			const polled = await this.poll(buildId, (view) => view.status !== 'planning', gen)
			if (gen !== this.generation) return
			if (!polled || polled.status === 'planning') return this.set({ phase: 'failed', error: OFFLINE })
			build = polled
		}
		if (build.status === 'planned' || build.status === 'writing' || build.status === 'ready')
			return this.begin(build, true)
		if (build.status === 'landed') return this.set({ phase: 'idle' })
		this.set({
			phase: 'failed',
			error: build.error ?? { code: 'expired', status: 410, retryable: false, message: 'That build has expired. Start a new one.' },
		})
	}

	// ------------------------------------------------------------ landing

	/**
	 * Lands the build: the server assembles the payload, the store applies it as one undo
	 * step. Single-flight, so Apply on the chip and on the toast land it once.
	 */
	apply = (): Promise<void> => {
		if (this.landing) return this.landing
		const state = this.state
		if (state.phase !== 'ready' && state.phase !== 'stopped') return Promise.resolve()
		const { build, pages } = state
		const back = state.phase
		this.set({ phase: 'landing', build, pages })
		this.landing = (async () => {
			try {
				const response = await this.deps.api.landBuild(build.id, { saveProfile: this.saveProfile })
				let summary: LandSummary
				let mark: number
				try {
					summary = this.deps.store.applyAiResult(response.landing)
					mark = this.deps.store.historyMark()
				} catch (error) {
					if (!(error instanceof LandError) || error.reason !== 'already-landed') {
						this.set({ phase: back, build, pages, landFailed: true })
						return
					}
					// Already on the site: nothing is applied twice, and Undo stays in the toolbar.
					summary = {
						firstPageId: response.landing.pages[0]?.id ?? null,
						renamed: {},
						pageIds: response.landing.pages.map((page) => page.id),
						notes: response.landing.notes,
						unslotted: [],
					}
					mark = -1
				}
				this.deps.store.setProfile(response.profile)
				this.deps.navigate(summary.firstPageId)
				const landed: LandedState = {
					phase: 'landed',
					build: response.build,
					landing: response.landing,
					summary,
					mark,
					profile: response.profile,
				}
				this.set(landed)
				this.deps.notify({ kind: 'landed', state: landed })
			} catch (error) {
				this.set({
					phase: back,
					build,
					pages,
					error: error instanceof AiRequestError ? error.error : OFFLINE,
				})
			} finally {
				this.landing = null
			}
		})()
		return this.landing
	}
}

// ---------------------------------------------------------------- the hook

const realClock: RunnerClock = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export type RunnerHooks = {
	isOpen?: () => boolean
	notify?: (notice: RunnerNotice) => void
}

/** The runner for one site, bound to the real API, clock, store and router. */
export function useAiBuildRunner(siteId: string, hooks: RunnerHooks = {}) {
	const store = useBuilder()
	const router = useRouter()
	const latest = useRef({ store, router, hooks })
	latest.current = { store, router, hooks }

	const [runner] = useState(
		() =>
			new AiBuildRunner({
				api: {
					createBuild: (body, onEvent, signal) => createBuild(siteId, body, onEvent, signal),
					outlineBuild: (buildId, onEvent, signal) => outlineBuild(siteId, buildId, onEvent, signal),
					writeBuildPage: (buildId, key, onEvent, signal) => writeBuildPage(siteId, buildId, key, onEvent, signal),
					getBuild: (buildId, signal) => getBuild(siteId, buildId, signal),
					cancelBuild: (buildId) => cancelBuild(siteId, buildId),
					landBuild: (buildId, body) => landBuild(siteId, buildId, body),
				},
				clock: realClock,
				store: {
					applyAiResult: (landing) => latest.current.store.applyAiResult(landing),
					setProfile: (profile) => latest.current.store.setProfile(profile),
					historyMark: () => latest.current.store.historyMark(),
				},
				navigate: (pageId) => {
					if (pageId) latest.current.router.push(`/builder/sites/${siteId}/pages/${pageId}`)
				},
				isOpen: () => latest.current.hooks.isOpen?.() ?? true,
				notify: (notice) => latest.current.hooks.notify?.(notice),
			}),
	)

	useEffect(() => () => runner.dispose(), [runner])

	const state = useSyncExternalStore(runner.subscribe, runner.getState, runner.getState)
	return useMemo(
		() => ({
			state,
			brief: runner.brief,
			start: runner.start,
			retry: runner.retry,
			stop: runner.stop,
			continueBuild: runner.continueBuild,
			apply: runner.apply,
			discard: runner.discard,
			resume: runner.resume,
			restart: runner.restart,
			startAgain: runner.startAgain,
			setSaveProfile: runner.setSaveProfile,
		}),
		[state, runner],
	)
}
