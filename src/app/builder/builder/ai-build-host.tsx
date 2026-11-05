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
	AI_LIMITS,
	DEFAULT_PINS,
	type BuildMode,
	type BuildSummary,
	type CapabilityResponse,
	type OwnerReview,
	type Placement,
} from '@/lib/builder/ai/contract'
import { useBuilder } from '@/lib/builder/builder-context'
import { findFavicon, findLogo, photoCandidates, type LibraryImagesResponse } from '@/lib/builder/library'
import type { SiteProfile } from '@/lib/builder/site-profile'
import type { BrandSource, ComposeLibrary } from './ai-build-compose'
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

/** The logo and favicon a build gives the site, and how to change them before it starts. */
export type AiBrand = {
	logo: string | null
	logoFrom: BrandSource | null
	favicon: string | null
	faviconFrom: BrandSource | null
	/** A picked image (or null to have none). */
	choose: (target: 'logo' | 'favicon', url: string | null) => void
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
	/** The site's content folder and its photos; null where there is no media library. */
	library: ComposeLibrary | null
	/** The logo and favicon the build gives the site; null for a site without a profile. */
	brand: AiBrand | null
	/** The content folder is loading or the brand is saving: the build waits for it. */
	waiting: boolean
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
	library: null,
	brand: null,
	waiting: false,
	done: noop,
} as unknown as AiBuildContextValue

export function useAiBuild(): AiBuildContextValue {
	return useContext(AiBuildContext) ?? disabled
}

const draftKey = (siteId: string) => `rb.ai.draft.${siteId}`

type StoredDraft = Omit<ComposeDraft, 'reviews' | 'targetPageId' | 'libraryIds'> & { photosChosen?: boolean }

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
				// The folder's photos are chosen afresh from the folder as it is now.
				libraryIds: [],
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
	const { reviews, targetPageId: _target, libraryIds: _library, ...rest } = draft
	void _target
	void _library
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

/**
 * What a content folder gives a build: the logo and favicon (the person's pick, else the
 * site's own, else the ones found in the folder) and the photos it may place (never those
 * marks), newest first. One function, so the dialog and a build started without it agree.
 */
function folderChoices(input: {
	listing: LibraryImagesResponse | null
	siteLogo: string | null
	siteFavicon: string | null
	logoChoice: string | null | undefined
	faviconChoice: string | null | undefined
}) {
	const { listing, siteLogo, siteFavicon, logoChoice, faviconChoice } = input
	const foundLogo = listing ? findLogo(listing.images) : null
	const logo = logoChoice !== undefined ? logoChoice : (siteLogo ?? foundLogo?.url ?? null)
	const logoFrom: BrandSource | null =
		logoChoice !== undefined ? (logoChoice ? 'picked' : null) : siteLogo ? 'site' : foundLogo ? 'folder' : null
	const foundFavicon = listing ? findFavicon(listing.images, logo) : null
	const favicon = faviconChoice !== undefined ? faviconChoice : (siteFavicon ?? foundFavicon?.url ?? null)
	const faviconFrom: BrandSource | null =
		faviconChoice !== undefined ? (faviconChoice ? 'picked' : null) : siteFavicon ? 'site' : foundFavicon ? 'folder' : null
	const photos = listing ? photoCandidates(listing.images, [logo, favicon, siteLogo, siteFavicon]) : null
	return { logo, logoFrom, favicon, faviconFrom, photos }
}

export function AiBuildHost({ children }: { children: React.ReactNode }) {
	const store = useBuilder()
	const { siteId, remote, library, loadLibrary, folderImages, setLibraryFolder, saveBrand } = store
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

	// The content folder: its images, which of them the person left selected, and the
	// logo and favicon (theirs, or found in the folder, or picked here).
	const [listing, setListing] = useState<LibraryImagesResponse | null>(null)
	const [listingError, setListingError] = useState<string | null>(null)
	const [libraryChosen, setLibraryChosen] = useState(false)
	const [logoChoice, setLogoChoice] = useState<string | null | undefined>(undefined)
	const [faviconChoice, setFaviconChoice] = useState<string | null | undefined>(undefined)
	// The folder is being read or the brand saved before a build starts.
	const [preparing, setPreparing] = useState(false)
	const preparingRef = useRef(false)
	// Bumped when a landing resets the draft, so the folder's photos are selected again.
	const [reselect, setReselect] = useState(0)

	useEffect(() => {
		if (dialogOpen && remote) loadLibrary()
	}, [dialogOpen, remote, loadLibrary])

	const folderId = library.folderId
	useEffect(() => {
		if (!dialogOpen || !folderId) return
		let live = true
		setListingError(null)
		folderImages(folderId).then(
			(body) => {
				if (live) setListing(body)
			},
			(error: Error) => {
				if (live) setListingError(error.message)
			},
		)
		return () => {
			live = false
		}
	}, [dialogOpen, folderId, folderImages])
	const folderListing = folderId && listing?.folderId === folderId ? listing : null

	const profile = store.profile
	const siteLogo = profile?.brand.logo ?? null
	const siteFavicon = profile?.brand.favicon ?? null
	const { logo, logoFrom, favicon, faviconFrom, photos: folderPhotos } = useMemo(
		() => folderChoices({ listing: folderListing, siteLogo, siteFavicon, logoChoice, faviconChoice }),
		[folderListing, siteLogo, siteFavicon, logoChoice, faviconChoice],
	)

	// Every photo in the folder starts selected, until the person picks for themselves.
	useEffect(() => {
		if (libraryChosen || !folderPhotos) return
		const ids = folderPhotos.slice(0, AI_LIMITS.libraryPicksMax).map((image) => image.id)
		setDraft((current) => (current.libraryIds.join() === ids.join() ? current : { ...current, libraryIds: ids }))
	}, [folderPhotos, libraryChosen, reselect])

	const chooseFolder = useCallback(
		(next: string | null) => {
			setLibraryChosen(false)
			setListing(null)
			setListingError(null)
			setProblem(null)
			setDraft((current) => ({ ...current, libraryIds: [] }))
			setLibraryFolder(next).catch((error: Error) =>
				setProblem({ field: 'library', message: error.message || 'That folder could not be saved. Try again.' }),
			)
		},
		[setLibraryFolder],
	)

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
			setLibraryChosen(false)
			setReselect((count) => count + 1)
			setLogoChoice(undefined)
			setFaviconChoice(undefined)
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

	// The newest photos start selected, until the person picks for themselves. The site's
	// logo and favicon are uploads too, but never photos.
	const newest = useMemo(
		() =>
			[...store.media]
				.filter((item) => item.src !== siteLogo && item.src !== siteFavicon)
				.sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0))
				.slice(0, NEWEST_SELECTED)
				.map((item) => item.id),
		[store.media, siteLogo, siteFavicon],
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
		if (next.libraryIds !== draftRef.current.libraryIds) setLibraryChosen(true)
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
			if (preparingRef.current) return true
			const pageMode = next.mode === 'page'
			const base: ComposeDraft = {
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
				// A content folder is this business's own; the whole library may hold others'.
				useLibrary: folderId ? false : next.useLibrary,
			}

			preparingRef.current = true
			setPreparing(true)
			void (async () => {
				try {
					// The folder as it is now, also when the build starts without the dialog
					// having shown it (the empty site's own "Build my site").
					const now = folderId ? (folderListing ?? (await folderImages(folderId).catch(() => null))) : null
					if (folderId && !now) {
						setProblem({ field: 'library', message: 'The content folder could not be read. Try again.' })
						setDialogOpen(true)
						return
					}
					const chosen = folderChoices({ listing: now, siteLogo, siteFavicon, logoChoice, faviconChoice })
					const photos = chosen.photos ?? []
					const inFolder = new Set(photos.map((image) => image.id))
					const libraryIds = !folderId
						? []
						: libraryChosen
							? next.libraryIds.filter((id) => inFolder.has(id))
							: photos.slice(0, AI_LIMITS.libraryPicksMax).map((image) => image.id)

					// The logo and favicon are the site's from now on, so the plan sees them too.
					const brand: Partial<SiteProfile['brand']> = {}
					if (profile && chosen.logo !== siteLogo) brand.logo = chosen.logo
					if (profile && chosen.favicon !== siteFavicon) brand.favicon = chosen.favicon
					if (Object.keys(brand).length > 0) {
						try {
							await saveBrand(brand)
						} catch (error) {
							setProblem({
								field: 'photos.logo',
								message: (error instanceof Error && error.message) || 'The logo could not be saved. Try again.',
							})
							setDialogOpen(true)
							return
						}
						setLogoChoice(undefined)
						setFaviconChoice(undefined)
					}
					runnerRef.current.start({ ...base, libraryIds })
					setDialogOpen(true)
				} finally {
					preparingRef.current = false
					setPreparing(false)
				}
			})()
			return true
		},
		[
			draft, folderId, folderListing, folderImages, siteLogo, siteFavicon, logoChoice, faviconChoice, libraryChosen,
			profile, saveBrand,
		],
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

	const composeLibrary = useMemo<ComposeLibrary | null>(
		() =>
			remote
				? {
						folders: library.folders,
						folderId,
						photos: folderPhotos,
						error: library.error ?? listingError,
						onFolder: chooseFolder,
					}
				: null,
		[remote, library.folders, library.error, folderId, folderPhotos, listingError, chooseFolder],
	)

	const brand = useMemo<AiBrand | null>(
		() =>
			profile
				? {
						logo,
						logoFrom,
						favicon,
						faviconFrom,
						choose: (target, url) => {
							setProblem(null)
							if (target === 'logo') setLogoChoice(url)
							else setFaviconChoice(url)
						},
					}
				: null,
		[profile, logo, logoFrom, favicon, faviconFrom],
	)

	const waiting = preparing || Boolean(dialogOpen && folderId && !folderListing && !listingError)

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
		library: composeLibrary,
		brand,
		waiting,
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
