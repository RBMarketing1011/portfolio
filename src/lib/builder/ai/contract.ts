/**
 * Everything the "Build with AI" dialog, the build routes and the proofs agree on: the
 * request, the pins, the errors and issues, the stream events and the views the client
 * receives. Types and constants only.
 *
 * Pure: imported by client components, so it never imports server code.
 */
import type { BackgroundSettings } from '@/app/builder/background-settings'
import type { Shape } from '@/app/builder/theme-settings'
import type { Archetype, BackdropId, FontPairId, PaletteId, PersonalityId } from '../design/vocab'
import type { BuilderLook } from '../look'
import type { Chrome, FooterVariant, HeaderVariant, Page } from '../page-schema'
import type { BusinessType, SiteProfile } from '../site-profile'

export const BUILD_MODES = ['site', 'page'] as const
export type BuildMode = (typeof BUILD_MODES)[number]
export const PLACEMENTS = ['replace-site', 'append', 'replace-page'] as const
export type Placement = (typeof PLACEMENTS)[number]
export const BUILD_STATUSES = ['planning', 'planned', 'writing', 'ready', 'failed', 'cancelled', 'landed', 'abandoned'] as const
export type BuildStatus = (typeof BUILD_STATUSES)[number]
export const PAGE_STATUSES = ['pending', 'writing', 'written', 'failed', 'cancelled'] as const
export type PageStatus = (typeof PAGE_STATUSES)[number]
export const OUTLINE_STATUSES = ['none', 'pending', 'running', 'failed', 'done'] as const
export type OutlineStatus = (typeof OUTLINE_STATUSES)[number]

/** Every bound the pipeline enforces. Model output is clamped to these in code, never in a JSON schema. */
export const AI_LIMITS = {
	promptMin: 12, promptMax: 4000,
	pagesMax: 12, pagesDefault: 8, outlinePagesMax: 6, sectionsMin: 2, sectionsMax: 10,
	pageNameMax: 60, slugMax: 60,
	reviewsMax: 12, reviewQuoteMin: 20, reviewQuoteMax: 600, reviewNameMax: 80, reviewRoleMax: 80, reviewSourceMax: 40,
	photosMax: 24, visionPhotosMax: 12, digestMax: 60, dataUrlMaxBytes: 3_750_000,
	ctaLabelMax: 40,
	attemptsPerPage: 3, outlineAttempts: 2, pagesWritingPerBuild: 4, activeBuildsPerWorkspace: 2,
	buildTtlMs: 86_400_000, staleActiveMs: 360_000,
	routeBudgetMs: 285_000, repairCutoffMs: 230_000,
	sdkTimeoutMs: 120_000, sdkMaxRetries: 2,
	leaseMs: 300_000, heartbeatMs: 10_000, watchdogMs: 5_000, cancelRefundWindowMs: 15_000,
	pollMs: 3_000, pollMaxMs: 100_000,
	requestMaxBytes: 64_000, replyMaxChars: 200_000,
	placeholdersPerPage: 2, runawayOutputTokens: 400_000,
	writeConcurrency: 3, staggerFallbackMs: 20_000,
} as const

// ---------------------------------------------------------------- pins and the request

export type PinPages =
	| { kind: 'ai' }
	| { kind: 'count'; count: number } // 1..12, site mode only
	| { kind: 'list'; names: string[] } // 1..12 names (page mode: exactly 1), each 1..60

export type PinPalette =
	| { kind: 'ai'; polarity: 'any' | 'light' | 'dark' }
	| { kind: 'keep' } // the site's current theme colours
	| { kind: 'curated'; id: PaletteId }
	| { kind: 'brand'; accent: string; polarity: 'light' | 'dark' } // #rrggbb
	| { kind: 'custom'; background: string; accent: string; heading: string; body: string }

export type PinFonts =
	| { kind: 'ai' }
	| { kind: 'keep' }
	| { kind: 'pair'; id: FontPairId }
	| { kind: 'custom'; heading: string; body: string } // exact googleFonts families

export type MenuPin = 'ai' | 'mega' | 'dropdown' | 'links'

export type BuildPins = {
	pages: PinPages
	palette: PinPalette
	fonts: PinFonts
	shape: 'ai' | Shape
	header: 'ai' | HeaderVariant
	footer: 'ai' | FooterVariant
	menu: MenuPin
	/** The header button's text; '' lets the AI decide. */
	ctaLabel: string
	/** append: keep the current theme, backdrop and header/footer looks. Forced true for replace-page and for mode 'page'; ignored for replace-site. */
	keepDesign: boolean
	/** append in mode 'site' only: the planner returns a complete menu for old and new pages. Off: new pages are slotted in.
	 *  Forced false for mode 'page' (one new page is always slotted into the owner's menu, section 9.6); ignored otherwise. */
	updateMenu: boolean
}

export const DEFAULT_PINS: BuildPins = {
	pages: { kind: 'ai' },
	palette: { kind: 'ai', polarity: 'any' },
	fonts: { kind: 'ai' },
	shape: 'ai',
	header: 'ai',
	footer: 'ai',
	menu: 'ai',
	ctaLabel: '',
	keepDesign: true,
	updateMenu: true,
}

export type OwnerReview = {
	quote: string // 20..600, placed verbatim
	name: string // 1..80
	role: string // ≤ 80, e.g. "Homeowner, Round Rock"; '' when not given
	source: string // ≤ 40, e.g. "Google review"; '' when not given
}

/** The dialog's business details. Non-empty values beat the prompt and the saved profile. */
export type BusinessInput = {
	name: string; type: BusinessType | ''; phone: string; email: string; city: string; region: string; areas: string[]
}

export type CreateBuildRequest = {
	mode: BuildMode
	placement: Placement
	targetPageId: string | null // required for replace-page
	prompt: string // 12..4000 after cleaning
	pins: BuildPins
	business: BusinessInput
	reviews: OwnerReview[] // ≤ 12
	photoIds: string[] // ≤ 24 site.media ids picked for this build (uploads land in site.media first)
	useLibrary: boolean // also consider the account media library
	fast: boolean // set only by the client's automatic retry after a plan timeout
}

export type LandRequest = { saveProfile: boolean }

// ---------------------------------------------------------------- errors and issues

export const AI_ERROR_CODES = [
	'bad-request', 'unauthorized', 'forbidden', 'not-found', 'not-configured', 'conflict', 'not-ready',
	'busy', 'expired', 'too-large', 'daily-limit', 'global-limit', 'token-limit', 'rate-limited',
	'refused', 'timeout', 'cancelled', 'invalid-reply', 'truncated', 'upstream', 'config',
	'attempts-exhausted', 'home-failed', 'network',
] as const
export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

export type ApiError = {
	code: AiErrorCode
	message: string // one plain sentence; never provider text, prompts or owner data
	status: number
	retryable: boolean
	retryAfterMs?: number
	field?: string // bad-request: first failing path, e.g. 'reviews.2.quote'
	buildId?: string // conflict: the build that is already active
}

export const ISSUE_CODES = [
	'placeholder', 'fallback-copy', 'text-trimmed', 'link-repaired', 'fact-removed', 'icon-replaced',
	'section-replaced', 'section-dropped', 'section-added', 'count-adjusted', 'variant-rotated',
	'surface-changed', 'color-repaired', 'font-replaced', 'menu-adjusted', 'photo-reused', 'page-skipped',
	'pin-bent', 'slug-renamed', 'outline-fallback', 'no-testimonials', 'no-stats',
	'photos-unseen', 'name-missing',
] as const
export type IssueCode = (typeof ISSUE_CODES)[number]
export type Issue = {
	level: 'info' | 'warn'
	code: IssueCode
	message: string // one plain sentence for the review view
	pageKey?: string
	blockId?: string
	path?: string
}

export type CallUsage = {
	inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; calls: number; ms: number
}

/** A bracketed placeholder left on a written page, e.g. "[License number]". */
export type NeedsInput = { pageKey: string; pageId: string; blockId: string; path: string; text: string }

// ---------------------------------------------------------------- streams and views

export type StreamEvent<T> =
	| { t: 'accepted'; buildId: string; key?: string; attempt?: number; reserved?: number }
	| { t: 'stage'; stage: 'thinking' | 'writing' | 'checking' | 'repairing' }
	| { t: 'hb'; ms: number }
	| { t: 'done'; data: T }
	| { t: 'error'; error: ApiError; data?: T }

export type DesignView = {
	polarity: 'light' | 'dark'
	personality: PersonalityId
	palette: { id: PaletteId | 'custom' | 'keep'; name: string; colors: { background: string; accent: string; heading: string; body: string } }
	fonts: { id: FontPairId | 'custom' | 'keep'; heading: string; body: string }
	shape: Shape
	buttons: 'solid' | 'gradient'
	backdrop: BackdropId | 'keep'
}

export type ChromeView = {
	kept: boolean // true: the site's own header and footer stay
	header: HeaderVariant
	footer: FooterVariant
	cta: string
	menu: { label: string; kind: 'mega' | 'dropdown' | 'link' | 'phone'; links: number }[]
}

export type ProfileField =
	| 'business.name' | 'business.type' | 'business.description' | 'business.phone' | 'business.email'
	| 'business.city' | 'business.region' | 'business.serviceArea' | 'seo.description'

export const PROFILE_FIELD_LABELS: Record<ProfileField, string> = {
	'business.name': 'Business name', 'business.type': 'Business type', 'business.description': 'Tagline',
	'business.phone': 'Phone', 'business.email': 'Email', 'business.city': 'City', 'business.region': 'State or region',
	'business.serviceArea': 'Areas served', 'seo.description': 'Search description',
}

export type PageView = {
	key: string; pageId: string; name: string; slug: string; archetype: Archetype; purpose: string
	outlined: boolean
	sections: { layout: string; label: string }[]
	status: PageStatus
	attempts: number
	canRetry: boolean // status 'failed', attempts < 3, build planned|writing|ready
	retryCostsUnit: boolean // attempts === 2
	error: ApiError | null
	issues: Issue[]
	needsInput: NeedsInput[]
}

export type BuildView = {
	id: string
	status: BuildStatus
	mode: BuildMode; placement: Placement; targetPageId: string | null
	createdAt: string; updatedAt: string; expiresAt: string
	design: DesignView | null // null while planning, or when the look is kept
	chrome: ChromeView | null // null while planning
	facts: { value: string; label: string }[] // verified facts the copy may use
	profileFill: { field: ProfileField; label: string; value: string }[] // what landing would fill (empty fields only)
	photosUsed: number
	outline: OutlineStatus
	pages: PageView[]
	issues: Issue[]
	units: { reserved: number; refunded: number }
	error: ApiError | null
}

export type BuildSummary = {
	id: string; status: BuildStatus; mode: BuildMode; placement: Placement; createdAt: string; pages: number; written: number
}

export type CapabilityResponse = {
	enabled: boolean
	units: { used: number; limit: number; resetsAt: string }
	library: { photos: number }
	builds: BuildSummary[] // this person's unexpired builds for the site, newest first, ≤ 3
}

export type LandingPayload = {
	buildId: string
	placement: Placement
	targetPageId: string | null
	pages: Page[] // plan order, server block ids, page.seo set
	chrome: Chrome | null // null = keep the current chrome
	menuAdd: { pageId: string; slug: string; label: string; archetype: Archetype; icon: string }[] // append without a menu update
	look: Pick<BuilderLook, 'theme' | 'page' | 'header' | 'footer'> | null // null = keep the current look
	blockLooks: Record<string, BackgroundSettings> // keyed by landed top-level block ids
	skipped: { key: string; name: string; reason: string }[]
	needsInput: NeedsInput[]
	notes: string[]
}

export type LandResponse = { landing: LandingPayload; profile: SiteProfile; build: BuildView }
