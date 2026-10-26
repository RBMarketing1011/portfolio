'use client'

/**
 * "Build with AI", mounted once for the site being edited (inside BuilderProvider, in
 * BuilderShell), so a build keeps running while the person moves between pages, the
 * pages list and the library. Every entry point opens it through `useAiBuild()`.
 *
 * The dialog's state lives here rather than in the builder store, which stays free of
 * AI concerns: what is being composed, whether the dialog is open, and the runner.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { isGoogleFont } from '@/app/builder/google-fonts'
import {
	DEFAULT_PINS,
	type BuildMode,
	type BuildSummary,
	type CapabilityResponse,
	type OwnerReview,
	type Placement,
} from '@/lib/builder/ai/contract'
import { useBuilder } from '@/lib/builder/builder-context'
import type { SiteProfile } from '@/lib/builder/site-profile'
import { AiBuildDialog } from './ai-build-dialog'
import {
	cleanPrompt,
	emptyBusiness,
	emptyDraft,
	landedCopy,
	openNeedsInput,
	useAiBuildRunner,
	validateDraft,
	type ComposeDraft,
	type DraftProblem,
	type RunnerNotice,
	type RunnerState,
} from './ai-build-runner'
import { fetchCapability } from './builder-ai'
import { MAX_UPLOAD, toWebpWithSize } from './media-picker'

export type AiOpenRequest = {
	mode: BuildMode
	/** Default: replace-site on an empty site, append otherwise. */
	placement?: Placement
	/** replace-page */
	targetPageId?: string | null
	/** Prefills the page-name pin (page mode). */
	pageName?: string
}

export type AiBuildContextValue = {
	/** capability.enabled && store.remote */
	enabled: boolean
	capability: CapabilityResponse | null
	state: RunnerState
	dialogOpen: boolean
	/** No request: reopen the current view. */
	open: (request?: AiOpenRequest) => void
	minimize: () => void
	/** Lands a ready build (the chip, the toast, the partial and stopped views). */
	apply: () => Promise<void>
	/** Open bracketed placeholders on the pages of the last landing. */
	needsInputCount: number
	/** An unlanded build from an earlier visit, offered as "Unfinished build · Resume". */
	resumable: BuildSummary | null
	resume: () => void
	/** What the compose view holds. */
	draft: ComposeDraft
	updateDraft: (next: ComposeDraft) => void
	/** Validates the draft and starts the build; false (with `problem` set) when it does not validate. */
	submit: (draft?: ComposeDraft) => boolean
	problem: DraftProblem | null
	/** Uploads running from the compose view. */
	uploading: number
	upload: (files: File[]) => void
	/** The review view's Done: the needs-input badge goes away. */
	done: () => void
	runner: ReturnType<typeof useAiBuildRunner>
	/** The element focused before the dialog opened, so focus can go back to it. */
	returnFocus: React.RefObject<HTMLElement | null>
}

const AiBuildContext = createContext<AiBuildContextValue | null>(null)

const noop = () => {}
const idle: RunnerState = { phase: 'idle' }

/** Outside the host (or before it mounts) AI is simply off. */
const disabled = {
	enabled: false,
	capability: null,
	state: idle,
	dialogOpen: false,
	open: noop,
	minimize: noop,
	apply: async () => {},
	needsInputCount: 0,
	resumable: null,
	resume: noop,
	draft: emptyDraft(),
	updateDraft: noop,
	submit: () => false,
	problem: null,
	uploading: 0,
	upload: noop,
	done: noop,
} as unknown as AiBuildContextValue

export function useAiBuild(): AiBuildContextValue {
	return useContext(AiBuildContext) ?? disabled
}

const draftKey = (siteId: string) => `rb.ai.draft.${siteId}`

type StoredDraft = Omit<ComposeDraft, 'reviews' | 'targetPageId'> & { photosChosen?: boolean }

/** The unsent draft from an earlier visit. Reviews come from sessionStorage only. */
function readDraft(siteId: string): { draft: ComposeDraft; photosChosen: boolean } | null {
	try {
		const raw = window.localStorage.getItem(draftKey(siteId))
		if (!raw) return null
		const saved = JSON.parse(raw) as Partial<StoredDraft>
		const base = emptyDraft()
		let reviews: OwnerReview[] = []
		try {
			const pasted = window.sessionStorage.getItem(draftKey(siteId))
			if (pasted) reviews = (JSON.parse(pasted) as OwnerReview[]).filter((r) => r && typeof r.quote === 'string')
		} catch {
			reviews = []
		}
		return {
			draft: {
				...base,
				mode: saved.mode === 'page' ? 'page' : 'site',
				placement: saved.placement ?? base.placement,
				prompt: typeof saved.prompt === 'string' ? saved.prompt : '',
				pins: { ...DEFAULT_PINS, ...(saved.pins ?? {}) },
				business: { ...emptyBusiness(), ...(saved.business ?? {}) },
				photoIds: Array.isArray(saved.photoIds) ? saved.photoIds.filter((id) => typeof id === 'string') : [],
				useLibrary: saved.useLibrary === true,
				reviews,
			},
			photosChosen: saved.photosChosen === true,
		}
	} catch {
		return null
	}
}

function writeDraft(siteId: string, draft: ComposeDraft, photosChosen: boolean) {
	const { reviews, targetPageId: _target, ...rest } = draft
	void _target
	try {
		window.localStorage.setItem(draftKey(siteId), JSON.stringify({ ...rest, photosChosen }))
	} catch {
		// Private mode or a full quota: the dialog works without the saved draft.
	}
	try {
		if (reviews.length) window.sessionStorage.setItem(draftKey(siteId), JSON.stringify(reviews))
		else window.sessionStorage.removeItem(draftKey(siteId))
	} catch {
		// Same: reviews just do not survive a reload.
	}
}

function clearDraft(siteId: string) {
	try {
		window.localStorage.removeItem(draftKey(siteId))
	} catch {
		// Nothing to clear.
	}
	try {
		window.sessionStorage.removeItem(draftKey(siteId))
	} catch {
		// Nothing to clear.
	}
}

/** The profile's business details as the dialog's fields. */
function businessFrom(profile: SiteProfile | null): ComposeDraft['business'] {
	const business = profile?.business
	if (!business) return emptyBusiness()
	return {
		name: business.name,
		type: business.type === 'LocalBusiness' ? '' : business.type,
		phone: business.phone,
		email: business.email,
		city: business.city,
		region: business.region,
		areas: [...business.serviceArea],
	}
}

const isEmptyBusiness = (business: ComposeDraft['business']) =>
	!business.name && !business.type && !business.phone && !business.email && !business.city && !business.region && business.areas.length === 0

/** Selected for a build until the person picks: the newest photos, up to the limit. */
const NEWEST_SELECTED = 24

export function AiBuildHost({ children }: { children: React.ReactNode }) {
	const store = useBuilder()
	const { siteId, remote } = store
	const [capability, setCapability] = useState<CapabilityResponse | null>(null)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [draft, setDraft] = useState<ComposeDraft>(emptyDraft)
	const [photosChosen, setPhotosChosen] = useState(false)
	const [problem, setProblem] = useState<DraftProblem | null>(null)
	const [uploading, setUploading] = useState(0)
	const [reviewDone, setReviewDone] = useState(false)
	const returnFocus = useRef<HTMLElement | null>(null)
	const openRef = useRef(false)
	openRef.current = dialogOpen
	const latest = useRef(store)
	latest.current = store

	const refreshCapability = useCallback(() => {
		if (!remote) return
		fetchCapability(siteId).then(setCapability, () => {
			// Unknown stays unknown: entry points stay hidden until an answer arrives.
		})
	}, [remote, siteId])

	useEffect(() => {
		refreshCapability()
	}, [refreshCapability])

	// The draft from an earlier visit, once (localStorage only exists in the browser).
	const restored = useRef(false)
	useEffect(() => {
		if (restored.current || !remote) return
		restored.current = true
		const saved = readDraft(siteId)
		if (saved) {
			setDraft(saved.draft)
			setPhotosChosen(saved.photosChosen)
		}
	}, [remote, siteId])

	useEffect(() => {
		if (restored.current && remote) writeDraft(siteId, draft, photosChosen)
	}, [draft, photosChosen, remote, siteId])

	const notify = useCallback(
		(notice: RunnerNotice) => {
			if (notice.kind === 'ready') {
				toast('Your site is ready.', {
					duration: 15000,
					action: {
						label: 'Apply',
						onClick: () => {
							setDialogOpen(true)
							void runnerRef.current?.apply()
						},
					},
				})
				return
			}
			const landed = notice.state
			const copy = landedCopy(landed, landed.landing.needsInput.length)
			clearDraft(siteId)
			setDraft((current) => ({ ...emptyDraft(), business: current.business }))
			setPhotosChosen(false)
			setReviewDone(false)
			toast(copy.title, {
				description: copy.description,
				duration: 12000,
				action: {
					label: 'Undo',
					onClick: () => {
						const current = latest.current
						if (landed.mark >= 0 && current.historyMark() === landed.mark) current.undo()
						else toast('Use Undo in the toolbar to step back.')
					},
				},
			})
		},
		[siteId],
	)

	const runner = useAiBuildRunner(siteId, { isOpen: () => openRef.current, notify })
	const runnerRef = useRef(runner)
	runnerRef.current = runner
	const state = runner.state

	const enabled = remote && Boolean(capability?.enabled)
	const busy = state.phase === 'planning' || state.phase === 'running' || state.phase === 'landing'

	// A build that just landed, or was thrown away, must not come back as "Resume";
	// the units it used change the cost line too.
	const settled = state.phase === 'idle' || state.phase === 'landed'
	useEffect(() => {
		if (settled) refreshCapability()
	}, [settled, refreshCapability])

	// The newest photos start selected, until the person picks for themselves.
	const newest = useMemo(
		() =>
			[...store.media]
				.sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0))
				.slice(0, NEWEST_SELECTED)
				.map((item) => item.id),
		[store.media],
	)
	useEffect(() => {
		if (photosChosen) return
		setDraft((current) =>
			current.photoIds.join() === newest.join() ? current : { ...current, photoIds: newest },
		)
	}, [newest, photosChosen])

	const draftRef = useRef(draft)
	draftRef.current = draft
	const updateDraft = useCallback((next: ComposeDraft) => {
		if (next.photoIds !== draftRef.current.photoIds) setPhotosChosen(true)
		setDraft(next)
		setProblem(null)
	}, [])

	const open = useCallback(
		(request?: AiOpenRequest) => {
			if (typeof document !== 'undefined')
				returnFocus.current = (document.activeElement as HTMLElement | null) ?? null
			refreshCapability()
			const phase = runnerRef.current.state.phase
			// A build in flight, or finished and waiting for Apply, is shown as it is.
			const inUse = phase === 'planning' || phase === 'running' || phase === 'landing' || phase === 'ready' || phase === 'stopped'
			if (request && !inUse) {
				if (phase === 'landed' || phase === 'failed') void runnerRef.current.discard()
				const pages = latest.current.pages
				const placement =
					request.placement ?? (pages.length === 0 ? 'replace-site' : 'append')
				setDraft((current) => ({
					...current,
					mode: request.mode,
					placement,
					targetPageId: placement === 'replace-page' ? (request.targetPageId ?? null) : null,
					pins: {
						...current.pins,
						pages:
							request.mode === 'page'
								? request.pageName
									? { kind: 'list', names: [request.pageName] }
									: { kind: 'ai' }
								: current.mode === 'page'
									? { kind: 'ai' }
									: current.pins.pages,
					},
					business: isEmptyBusiness(current.business)
						? businessFrom(latest.current.profile)
						: current.business,
				}))
				setProblem(null)
			} else {
				setDraft((current) =>
					isEmptyBusiness(current.business)
						? { ...current, business: businessFrom(latest.current.profile) }
						: current,
				)
			}
			setDialogOpen(true)
		},
		[refreshCapability],
	)

	const minimize = useCallback(() => setDialogOpen(false), [])

	const submit = useCallback(
		(input?: ComposeDraft) => {
			const next = input ?? draft
			const current = latest.current
			const found = validateDraft(next, { pageIds: current.pages.map((page) => page.id), isFont: isGoogleFont })
			if (found) {
				setProblem(found)
				return false
			}
			setProblem(null)
			const pageMode = next.mode === 'page'
			runnerRef.current.start({
				...next,
				prompt: cleanPrompt(next.prompt),
				targetPageId: next.placement === 'replace-page' ? next.targetPageId : null,
				pins: {
					...next.pins,
					ctaLabel: next.pins.ctaLabel.trim(),
					// One page always keeps the design and slots into the owner's menu.
					...(pageMode || next.placement === 'replace-page' ? { keepDesign: true, updateMenu: false } : {}),
				},
				business: {
					...next.business,
					name: next.business.name.trim(),
					phone: next.business.phone.trim(),
					email: next.business.email.trim(),
					city: next.business.city.trim(),
					region: next.business.region.trim(),
					areas: next.business.areas.map((area) => area.trim()).filter(Boolean),
				},
				reviews: next.reviews.map((review) => ({
					quote: review.quote.trim(),
					name: review.name.trim(),
					role: review.role.trim(),
					source: review.source.trim(),
				})),
			})
			setDialogOpen(true)
			return true
		},
		[draft],
	)

	const upload = useCallback(
		(files: File[]) => {
			if (files.length === 0) return
			setUploading((count) => count + files.length)
			void (async () => {
				for (const file of files) {
					try {
						if (file.size > MAX_UPLOAD) throw new Error('size')
						const { blob, width, height } = await toWebpWithSize(file)
						const item = await latest.current.uploadMedia(
							file.name.replace(/\.[^.]+$/, '') || 'photo',
							blob,
							{ width, height },
						)
						setPhotosChosen(true)
						setDraft((current) =>
							current.photoIds.includes(item.id) || current.photoIds.length >= NEWEST_SELECTED
								? current
								: { ...current, photoIds: [item.id, ...current.photoIds] },
						)
					} catch {
						setProblem({
							field: 'photoIds',
							message: `${file.name} could not be uploaded. Use a JPG, PNG or WebP under 12 MB.`,
						})
					} finally {
						setUploading((count) => count - 1)
					}
				}
			})()
		},
		[],
	)

	const apply = useCallback(() => {
		setDialogOpen(true)
		return runnerRef.current.apply()
	}, [])

	const resumable = useMemo(() => {
		const first = capability?.builds?.[0]
		if (!first || busy || state.phase === 'ready' || state.phase === 'stopped' || state.phase === 'landed')
			return null
		return first.status === 'planned' || first.status === 'writing' || first.status === 'ready' ? first : null
	}, [capability, busy, state.phase])

	const resume = useCallback(() => {
		if (!resumable) return
		void runnerRef.current.resume(resumable.id)
		setDialogOpen(true)
	}, [resumable])

	const needsInputCount =
		state.phase === 'landed' && !reviewDone ? openNeedsInput(state.landing.needsInput, store.site).length : 0

	const done = useCallback(() => {
		setReviewDone(true)
		setDialogOpen(false)
	}, [])

	const value: AiBuildContextValue = {
		enabled,
		capability,
		state,
		dialogOpen: enabled && dialogOpen,
		open,
		minimize,
		apply,
		needsInputCount,
		resumable,
		resume,
		draft,
		updateDraft,
		submit,
		problem,
		uploading,
		upload,
		done,
		runner,
		returnFocus,
	}

	return (
		<AiBuildContext.Provider value={value}>
			{children}
			{enabled && (
				<>
					<Toaster position='bottom-right' theme='dark' />
					<AiBuildDialog ai={value} />
				</>
			)}
		</AiBuildContext.Provider>
	)
}
