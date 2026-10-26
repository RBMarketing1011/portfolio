/**
 * The pipeline's internal types and the shape of an `aiBuilds` document. Shared by the
 * infrastructure (leases, budget, views) and the pipeline (planning, writing, landing),
 * so neither imports the other's implementation. Types only.
 */
import type { ObjectId } from 'mongodb'
import type { BackgroundSettings } from '@/app/builder/background-settings'
import type { ThemeSettings } from '@/app/builder/theme-settings'
import type { Archetype, ChildLayout, Layout, PersonalityId, SurfaceTone, Tweak } from '../design/vocab'
import type { ResolvedDesign } from '../design/generate'
import type { Chrome, Page } from '../page-schema'
import type { BusinessType } from '../site-profile'
import type {
	ApiError, BuildMode, BuildPins, BuildStatus, BusinessInput, CallUsage, Issue, NeedsInput, OutlineStatus,
	OwnerReview, PageStatus, Placement, ProfileField,
} from './contract'

export type NormalizedRequest = {
	mode: BuildMode; placement: Placement; targetPageId: string | null
	prompt: string; pins: BuildPins; business: BusinessInput; reviews: OwnerReview[]
	photoIds: string[]; useLibrary: boolean; fast: boolean
}

export type PhotoCandidate = {
	ref: string // 'img1'…, stable within the build
	source: 'upload' | 'project' | 'library' // upload = picked in the dialog for this build
	value: string // what a block stores: 'media:<id>' (project media) or the Blob URL (library)
	url: string // what the model may fetch: a Blob URL, or a data: URL (fixtures); never sent to the client
	kind: 'photo' | 'illustration' | 'graphic' | 'screenshot' | 'unknown'
	width: number | null
	height: number | null
	orientation: 'landscape' | 'portrait' | 'square' | 'panorama' | 'unknown'
	light: 'dark' | 'mid' | 'light' | 'unknown'
	caption: string // ≤ 120
	tags: string[] // ≤ 8; filename-derived tags excluded
	colors: string[] // ≤ 3 colour names
	vision: boolean // sent to the planner as an image block
}

export type PhotoNote = {
	ref: string; description: string; subject: string
	shape: 'landscape' | 'portrait' | 'square' | 'panorama' // what the planner saw (fills a missing orientation)
	pair: 'none' | 'before' | 'after'; pairKey: string
}

export type AssignedImage = { path: string; ref: string; value: string; shows: string }

export type ImagePlan = {
	pool: PhotoCandidate[]
	notes: PhotoNote[]
	uses: Record<string, number> // ref → times assigned
	byPage: Record<string, Record<string, AssignedImage[]>> // pageKey → sectionKey → images in slot order
}

export type SitePlan = {
	name: string; language: string; businessType: BusinessType
	tagline: string; description: string; audience: string; offer: string; voice: string
	personality: PersonalityId; services: string[]; areas: string[]
	primary: { label: string; href: string; chromeHref: string } // '/contact' + 'contact', or 'tel:+1…' for both
}

export type NormalizedSection = {
	key: string // 's1'…, unique within the page
	layout: Layout; type: string; variant: string | null
	label: string // 'Page Hero (Centered)': schema labels joined by the catalog
	job: string; items: number; child: ChildLayout | null; surface: SurfaceTone; tweaks: Tweak[]
	images: string[] // planner refs (assignment result lives in ImagePlan)
	reviews: number[] // indexes into request.reviews allocated to this section
}

export type NormalizedPage = {
	key: string // 'p1'..'p12', plan order; p1 is home on replace-site
	id: string // 'pg_' + 10 hex, or the target page id (replace-page)
	name: string; slug: string // slug '/' only for a replace-site home
	path: string // section form: '/', '/roof-repair'
	archetype: Archetype; purpose: string; keyword: string; inMenu: boolean
	outlined: boolean
	openerHint: Layout | null; closerHint: Layout | null; photoAllocation: string[]
	sections: NormalizedSection[]
}

export type NormalizedPlan = {
	site: SitePlan
	facts: { value: string; label: string; quote: string }[] // provenance-checked (section 7.10)
	pages: NormalizedPage[]
	issues: Issue[]
}

/** The business details the site may use, each verified against the owner's own inputs (section 10.9). */
export type GroundedBusiness = {
	name: string // '' when unknown
	phone: { display: string; href: string } | null // href 'tel:+<country><digits>'
	email: { display: string; href: string } | null // href 'mailto:<email>'
	city: string; region: string; areas: string[]
	address: string // street, city, region, postal code from the profile ('' when none)
	hours: string[] // the profile's hours as plain lines ("Monday to Friday 7:00 to 18:00")
	priceRange: string
	sources: Record<'name' | 'phone' | 'email' | 'city' | 'region' | 'areas', 'edits' | 'prompt' | 'profile' | 'none'>
}

/** What the owner's data can support before planning (section 7.9), also shown to the planner (section 7.10). */
export type Availability = {
	reviews: number; facts: number; contactFacts: ('phone' | 'email' | 'address' | 'hours' | 'areas' | 'priceRange')[]
	services: number; areas: number; announcement: boolean
	photos: { eligible: number; landscape: number; portrait: number; square: number; panorama: number; pairs: number }
	unavailable: string[] // e.g. 'stat-band:* (fewer than 3 facts)'
}

export type WrittenPage = {
	page: Page // pageSchema shape, server ids, seo set
	blockLooks: Record<string, BackgroundSettings>
	needsInput: NeedsInput[]
}

export type BuildPageDoc = {
	key: string; pageId: string; name: string; slug: string
	status: PageStatus
	attempts: number // 0..3
	leaseId: string | null; leaseUntil: Date | null
	startedAt: Date | null; writtenAt: Date | null
	reachedModel: boolean
	refunded: boolean // the page's base unit was given back
	extraUnits: number // units reserved for a third attempt (never refunded once used)
	lastError: ApiError | null
	issues: Issue[]
	written: WrittenPage | null
	usage: CallUsage
}

export type AiBuildDoc = {
	_id: string // 'bld_' + 24 hex (12 random bytes)
	siteId: ObjectId; workspaceId: ObjectId; userId: string
	/** Present only while planning|planned|writing|ready: the partial unique index keys on it. */
	active?: true
	status: BuildStatus
	mode: BuildMode; placement: Placement; targetPageId: string | null
	input: NormalizedRequest
	snapshot: {
		siteRev: number
		pages: { id: string; name: string; slug: string; blocks: number }[]
		chrome: Chrome
		theme: ThemeSettings | null // the parsed current theme when the site has pages
	}
	/** Frozen at plan time, so a profile edit during the build cannot change what later pages may say. */
	context: { business: GroundedBusiness; corpus: string; availability: Availability } | null
	plan: NormalizedPlan | null
	design: ResolvedDesign | null
	chrome: Chrome | null // null = keep the site's chrome
	images: ImagePlan | null
	/** siteContextText(...), frozen at plan time: byte-identical for every write and repair of this build. */
	writerContext: string | null
	outline: { status: OutlineStatus; attempts: number; leaseId: string | null; leaseUntil: Date | null }
	pages: BuildPageDoc[]
	profilePatch: { field: ProfileField; value: string | string[] }[]
	budget: { day: string; reserved: number; refunded: number } // day = UTC date of the reservation
	usage: CallUsage
	model: string; servedModels: string[]; fallbackUsed: boolean; requestIds: string[] // last 30
	issues: Issue[]
	error: ApiError | null
	cancelRequestedAt: Date | null
	createdAt: Date; updatedAt: Date; expiresAt: Date
	landedAt: Date | null
}
