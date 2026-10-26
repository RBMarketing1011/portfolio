/**
 * The catalog's types: what the AI builder knows about each section beyond its fields.
 * `schema.ts` describes fields for the inspector; this describes what a variant looks
 * like, what a section is for on a page, how many items read well, which images and
 * owner facts it needs, and which strings render placeholder copy when left empty.
 *
 * Types only, and pure: the planner, the composer, the routes and the proofs share them.
 */
import type { Block, Field } from '../types'
import type { OwnerReview } from '../ai/contract'
import type { AssignedImage } from '../ai/types'
import type { Archetype, ChildLayout, Layout, PersonalityId, SurfaceTone, Tweak } from '../design/vocab'
export type { Archetype, ChildLayout, Layout, SurfaceTone, Tweak }

export type Role = 'top-bar' | 'opener' | 'proof' | 'explain' | 'showcase' | 'convert' | 'closer' | 'content' | 'state'
export type Density = 'open' | 'card' | 'panel' | 'media'
export type TextToken = 'heading' | 'body' | 's400' | 's500' | 'accent'

export type Need =
	| 'photo' | 'photo-pair' | 'reviews' | 'facts' | 'contact-facts' | 'ticker-items'
	| 'announcement' | 'prose-headings'
	// never satisfiable in v1 (section 6.10):
	| 'prices' | 'client-logos' | 'people' | 'video' | 'form' | 'deadline' | 'articles' | 'projects' | 'comparison' | 'calculator'

export type ImageRole = 'hero' | 'backdrop' | 'feature' | 'panel' | 'gallery' | 'pair'
export type Aspect = '16:9' | '21:9' | 'any'

export type SlotKind =
	| 'eyebrow' | 'heading' | 'richtext' | 'subhead' | 'paragraph' | 'short' | 'label' | 'button'
	| 'question' | 'answer' | 'item' | 'prose' | 'icon' | 'alt' | 'caption' | 'meta'

export type SlotSpec = {
	/** Field path in the block's props: 'title', 'faqs[].answer', 'rows[].points[].text', 'before.alt'. */
	path: string
	kind: SlotKind
	/** Hard character cap enforced in code; the writer is told 80% of it as the target. */
	max: number
	guide?: string
	/** Only these variants render it (absent = all). */
	variants?: string[]
	/** Only when this tweak is on. */
	tweak?: Tweak
}

export type ImageNeed = {
	path: string // 'mediaSrc', 'backdrop[]', 'rows[].image', 'items[].src', 'before.src'
	role: ImageRole
	aspect: Aspect
	required: boolean
	variants?: string[]
	tweak?: Tweak
}

export type Count = { min: number; max: number; ideal: number; allowed?: number[] }

export type ItemRule = {
	list: string // the main list: 'faqs', 'steps', 'tiles', 'children', …
	count: Count
	byVariant?: Partial<Record<string, Count>>
}

export type VariantMeta = {
	id: string
	density: Density
	look: string // one line: what it looks like (from the component code)
	use: string // one line: when to choose it
	text: TextToken[] // text colours it relies on (brand and inverse surface checks)
	hides?: string[] // field paths this variant does not render
	/** Same type, lighter variant, used by the rhythm repair (card → open). */
	openAlternative?: string
	headingBeside?: true // heading in a side column (faq split, grid beside, detail card)
	/** A schema variant the AI never uses, with the reason (produces no layout). */
	excluded?: string
}

export type ChildKind = ChildLayout // 'feature-card:inline'

export type SectionMeta = {
	type: string
	ai: 'yes' | 'when' | 'never'
	needs: Need[]
	roles: Role[]
	h1: boolean
	purpose: string
	pages: Archetype[] | 'all'
	items?: ItemRule
	children?: { kinds: ChildKind[]; default: ChildKind }
	images?: ImageNeed[]
	slots: SlotSpec[]
	tweaks: Tweak[]
	surfaces: SurfaceTone[]
	fallback?: Layout // when needs are unmet
	placement?: string // planner-facing rule ("right after the opener")
	variants: VariantMeta[]
	/** Code that sets structural props (counts, numbers, spans, styles, data). Pure. */
	design: (spec: ComposeSpec, ctx: ComposeCtx) => DesignOutput
}

export type ChildMeta = {
	type: string
	variants: (VariantMeta & { ai: boolean })[]
	slots: SlotSpec[]
	data?: 'review' | 'page-link' | 'photo' | 'ticker' // filled from owner data, never written
	design: (index: number, total: number, ctx: ComposeCtx) => Record<string, unknown>
}

export type CatalogEntry = {
	type: string
	label: string // schema.label
	description: string // schema.description
	variantProp?: string
	fields: Field[]
	meta: SectionMeta
	variants: (VariantMeta & { label: string })[] // schema label joined in
	layouts: Layout[]
}

export type ComposeSpec = {
	key: string // 's1'…
	layout: Layout
	type: string
	variant: string | null
	items: number
	child: ChildKind | null
	surface: SurfaceTone
	tweaks: Tweak[]
	job: string
	images: AssignedImage[]
	reviews: OwnerReview[] // allocated to this section
}

export type DesignOutput = {
	props: Record<string, unknown> // structural and data props
	rows?: Record<string, Record<string, unknown>[]> // pre-sized list rows with their data
	children?: { kind: ChildKind; props: Record<string, unknown> }[]
	/** Button targets, told to the writer. `slot` is the path inside the block ('actions.0.label'). */
	links: { slot: string; href: string; meaning: string }[]
}

/** What a page's sections are composed against (section 6.11). */
export type ComposeCtx = {
	personality: PersonalityId
	polarity: 'light' | 'dark'
	primary: { label: string; href: string } // '/contact' | 'tel:+15125550142' | 'mailto:…'
	secondaryFor: (archetype: Archetype) => { href: string; meaning: string } | null
	phone: { display: string; href: string } | null
	email: { display: string; href: string } | null
	pages: { key: string; name: string; path: string; archetype: Archetype }[]
	facts: { value: string; label: string }[]
	contactFacts: { label: string; value: string }[]
	ticker: string[] // services or areas
	/** What a chips strip lists when it differs from the page's ticker (areas first); the ticker otherwise. */
	chips?: string[]
	announcement: string | null // a verified fact the owner announced (offer, opening), else null
	images: (sectionKey: string) => AssignedImage[]
	reviews: (sectionKey: string) => OwnerReview[]
	/**
	 * The page being composed. `composePage` sets it; a section composed on its own reads
	 * `custom`. The secondary button target, the related-card targets and the prose length
	 * depend on it.
	 */
	page?: { key: string; path: string; archetype: Archetype }
}

/** One string the writer fills, addressed by id (section 10.3). */
export type ResolvedSlot = {
	id: string // 's3.faqs.2.answer', 's5.c2.title' for a container's third child
	blockId: string // the block the path is inside: the section, or the child card
	path: (string | number)[] // inside that block's props: ['faqs', 2, 'answer'], ['before.alt']
	kind: SlotKind
	max: number
	guide?: string
}

export type ComposedSection = {
	key: string // the section key, 's3'
	block: Block // id 'blk_' + 10 hex, matches BLOCK_KEY
	slots: ResolvedSlot[]
	/** Full slot ids ('s3.actions.0.label'), so the manifest can name each button's target. */
	links: { slot: string; href: string; meaning: string }[]
	images: AssignedImage[] // as placed, with concrete paths ('rows.1.image', 'c2.src')
}

/** One image a section needs, at a concrete path inside its block (section 6.9). */
export type ImageSlot = {
	path: string // 'mediaSrc', 'backdrop.3', 'rows.1.image', 'before.src', 'c2.src'
	role: ImageRole
	aspect: Aspect
	required: boolean
}

export type SlotProblem = { slot: ResolvedSlot; problems: string[]; value: string }

export type ValidateCtx = {
	pagePaths: string[] // '/', '/roof-repair': pages in the result and existing pages
	email: string | null // the business email a mailto: may use
	mediaIds: Set<string> // ids of the site's media entries
	imageValues: Set<string> // other image values the build may store (Blob URLs from the digest)
	reviews: OwnerReview[]
	/** When given, validatePage also checks that a marketing page ends on a closer. */
	archetype?: Archetype
}
