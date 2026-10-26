/**
 * Lands a finished AI build on the builder's draft: the server's pages, chrome and look
 * merged into the current site as one snapshot, so the store can apply it as one undo
 * step. The server assembled the payload from the build; this side knows what the site
 * looks like now (pages renamed or added during the build, the current menu).
 *
 * Rules every placement follows:
 * - Block ids are kept, so the server's per-section surfaces stay attached. Only an id
 *   that already exists elsewhere on the site gets a fresh one, and its surface moves too.
 * - A slug never becomes '/-2': `freeSlug` picks a readable free slug, and every link the
 *   build wrote to the slug it planned follows the rename.
 * - Surfaces of blocks that no longer exist anywhere are dropped, so the look's cap can
 *   never evict a live one.
 * - The result is parsed with `siteSchema` and `sanitizeLook`. Anything wrong throws
 *   `LandError` and changes nothing.
 *
 * Pure: the store, the proofs and the browser share it.
 */
import type { BackgroundSettings } from '@/app/builder/background-settings'
import { PLACEMENTS, type LandingPayload } from './ai/contract'
import type { Archetype } from './design/vocab'
import type { Snapshot } from './history'
import { rewriteSlugRefs, slugOfHref } from './links'
import { sanitizeLook, type BuilderLook } from './look'
import {
	HOME_SLUG,
	siteSchema,
	slugify,
	type Chrome,
	type MenuItem,
	type MenuLink,
	type Page,
	type Site,
} from './page-schema'
import type { Block } from './types'

export type LandInput = { current: Snapshot; landing: LandingPayload; now: string }

export type LandSummary = {
	firstPageId: string | null
	/** Old slug → new slug, for collisions found at landing. */
	renamed: Record<string, string>
	/** Pages this landing created or replaced, in plan order. */
	pageIds: string[]
	notes: string[]
	/** Added pages that neither the menu nor the pages row links, so only the footer does. */
	unslotted: string[]
}

export class LandError extends Error {
	constructor(readonly reason: 'invalid' | 'already-landed' = 'invalid') {
		super(reason)
		this.name = 'LandError'
	}
}

/** pageSchema's slug limit. */
const SLUG_MAX = 120

/** A bare slug as chrome stores it: no slashes around it, '/' for home. */
const asSlug = (value: string) =>
	String(value ?? '')
		.trim()
		.replace(/^\/+|\/+$/g, '') || HOME_SLUG

// ---------------------------------------------------------------- slugs

/** The readable second choice for a taken slug, by the page's archetype (or the slug itself). */
const SLUG_PAIRS: Record<string, string> = {
	services: 'our-services',
	pricing: 'pricing-plans',
	reviews: 'customer-reviews',
	contact: 'contact-us',
	about: 'about-us',
}

/** Cuts a slug so it and its suffix fit the schema's limit. */
const fit = (base: string, suffix = '') =>
	`${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`

/**
 * A slug for a new page that no other page has: the one it wanted, then the archetype's
 * pair (`contact` → `contact-us`), then `<slug>-<first word of the name>`, and only last
 * `<slug>-2`. Leading slashes are stripped and the result is never '/'.
 */
export function freeSlug(
	wanted: string,
	taken: string[],
	hint: { archetype: Archetype; name: string },
): string {
	const used = new Set(taken.map(asSlug))
	const free = (slug: string) => slug !== HOME_SLUG && !used.has(slug)
	const bare = String(wanted ?? '')
		.trim()
		.replace(/^\/+|\/+$/g, '')
	const base = fit(bare || slugify(hint.name))
	if (free(base)) return base

	const pair = Object.hasOwn(SLUG_PAIRS, hint.archetype)
		? SLUG_PAIRS[hint.archetype]
		: Object.hasOwn(SLUG_PAIRS, base)
			? SLUG_PAIRS[base]
			: null
	if (pair && free(pair)) return pair

	const word = slugify(hint.name).split('-')[0]
	if (word && word !== 'page' && !base.split('-').includes(word)) {
		const named = fit(base, `-${word}`)
		if (free(named)) return named
	}

	for (let n = 2; ; n++) {
		const numbered = fit(base, `-${n}`)
		if (free(numbered)) return numbered
	}
}

// ---------------------------------------------------------------- links

/** Block props that hold a link: `href`, or a prefixed one such as `linkHref`. */
const HREF_KEY = /^href$|Href$/

/** Rewrites every link value in a props tree, sharing whatever did not change. */
function mapHrefs(value: unknown, fix: (href: string) => string): unknown {
	if (Array.isArray(value)) {
		let changed = false
		const next = value.map((item) => {
			const mapped = mapHrefs(item, fix)
			if (mapped !== item) changed = true
			return mapped
		})
		return changed ? next : value
	}
	if (value && typeof value === 'object') {
		let changed = false
		const next: Record<string, unknown> = {}
		for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
			const mapped =
				HREF_KEY.test(key) && typeof inner === 'string' ? fix(inner) : mapHrefs(inner, fix)
			if (mapped !== inner) changed = true
			next[key] = mapped
		}
		return changed ? next : value
	}
	return value
}

function mapBlockHrefs(block: Block, fix: (href: string) => string): Block {
	const props = block.props ? (mapHrefs(block.props, fix) as Block['props']) : block.props
	let childrenChanged = false
	const children = block.children?.map((child) => {
		const mapped = mapBlockHrefs(child, fix)
		if (mapped !== child) childrenChanged = true
		return mapped
	})
	if (props === block.props && !childrenChanged) return block
	return { ...block, props, ...(block.children ? { children } : {}) }
}

/**
 * Points every link at a renamed slug to its new slug: block links (top level, groups,
 * rows, children), menu items and links, promo cards and the header button. Links are
 * matched bare (as chrome stores them) or root-relative (as sections store them), and
 * each keeps its form. Renames apply at once, so `a → b, b → c` never turns `a` into `c`.
 */
export function rewriteHrefs(site: Site, renamed: Record<string, string>): Site {
	const map = new Map<string, string>()
	for (const [from, to] of Object.entries(renamed ?? {})) {
		if (asSlug(from) !== asSlug(to)) map.set(asSlug(from), asSlug(to))
	}
	if (map.size === 0) return site

	const fix = (href: string) => {
		const slug = slugOfHref(href)
		const to = slug === null ? undefined : map.get(slug)
		return slug === null || to === undefined ? href : rewriteSlugRefs(href, slug, to)
	}

	let pagesChanged = false
	const pages = site.pages.map((page) => {
		let changed = false
		const blocks = page.blocks.map((block) => {
			const mapped = mapBlockHrefs(block, fix)
			if (mapped !== block) changed = true
			return mapped
		})
		if (!changed) return page
		pagesChanged = true
		return { ...page, blocks }
	})

	let menuChanged = false
	const menu = site.chrome.menu.map((item) => {
		const href = fix(item.href)
		let linksChanged = false
		const links = item.links.map((link) => {
			const next = fix(link.href)
			if (next === link.href) return link
			linksChanged = true
			return { ...link, href: next }
		})
		const promoHref = item.promo ? fix(item.promo.href) : null
		const promo =
			item.promo && promoHref !== item.promo.href
				? { ...item.promo, href: promoHref ?? '' }
				: item.promo
		if (href === item.href && !linksChanged && promo === item.promo) return item
		menuChanged = true
		return { ...item, href, links, promo }
	})
	const ctaHref = fix(site.chrome.ctaHref)

	if (!pagesChanged && !menuChanged && ctaHref === site.chrome.ctaHref) return site
	return {
		...site,
		chrome: menuChanged || ctaHref !== site.chrome.ctaHref ? { ...site.chrome, menu, ctaHref } : site.chrome,
		pages,
	}
}

/**
 * The chrome without anything that points at a deleted page: its menu links, groups
 * left empty by that, plain items, promo cards and the header button's target.
 */
export function pruneSlug(chrome: Chrome, slug: string): Chrome {
	const target = asSlug(slug)
	const pointsAt = (href: string) => slugOfHref(href) === target
	let changed = false
	const menu: MenuItem[] = []
	for (const item of chrome.menu) {
		if (item.links.length > 0) {
			const links = item.links.filter((link) => !pointsAt(link.href))
			const promo = item.promo && pointsAt(item.promo.href) ? null : item.promo
			if (links.length === 0) {
				changed = true
				continue
			}
			if (links.length !== item.links.length || promo !== item.promo) {
				changed = true
				menu.push({ ...item, links, promo })
				continue
			}
			menu.push(item)
		} else if (pointsAt(item.href)) {
			changed = true
		} else {
			menu.push(item)
		}
	}
	const ctaHref = pointsAt(chrome.ctaHref) ? '' : chrome.ctaHref
	if (!changed && ctaHref === chrome.ctaHref) return chrome
	return { ...chrome, menu, ctaHref }
}

// ---------------------------------------------------------------- the menu

const SERVICE_FAMILY = /services?|what we do|treatments|solutions/i
const COMPANY_FAMILY = /company|about|more/i

/** Which menu group a new page belongs in, by its archetype. */
function familyOf(archetype: Archetype): RegExp | null {
	if (archetype === 'service' || archetype === 'services' || archetype === 'area') return SERVICE_FAMILY
	if (
		archetype === 'about' ||
		archetype === 'reviews' ||
		archetype === 'work' ||
		archetype === 'faq' ||
		archetype === 'process'
	)
		return COMPANY_FAMILY
	return null
}

/** A group takes one more link while it has at most this many (a mega panel holds 8). */
const GROUP_LINKS_MAX = 7
/** The menu takes one more plain item while it has at most this many. */
const MENU_ITEMS_MAX = 5
/** The pages row shows at most this many pages. */
const HEADER_PAGES_MAX = 6

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** `mi_`/`ml_` + 8 base-36 characters, as the chrome normalizer writes them. */
function freshMenuId(prefix: 'mi_' | 'ml_', used: Set<string>) {
	for (;;) {
		const bytes = new Uint8Array(8)
		crypto.getRandomValues(bytes)
		const id = prefix + Array.from(bytes, (byte) => ALPHABET[byte % 36]).join('')
		if (!used.has(id)) {
			used.add(id)
			return id
		}
	}
}

/** A trailing phone or email entry, which closes the menu. */
const isContactItem = (item: MenuItem) => item.links.length === 0 && /^(tel|mailto):/i.test(item.href)

/** Whether any menu item, link or promo already goes to this slug. */
const menuLinks = (chrome: Chrome, slug: string) =>
	chrome.menu.some(
		(item) =>
			(item.links.length === 0 && slugOfHref(item.href) === slug) ||
			item.links.some((link) => slugOfHref(link.href) === slug),
	)

/**
 * Adds new pages to the current menu without rebuilding it: each goes into the first
 * group of its family (Services for service pages, Company for about and the like)
 * while that group has room, else becomes a plain item while the menu has room, else
 * is left to the footer, which lists every page. With no custom menu (the pages row)
 * the menu is untouched and new pages show in the header while it has room.
 */
export function slotIntoMenu(
	chrome: Chrome,
	pages: Page[],
	add: LandingPayload['menuAdd'],
): { chrome: Chrome; inHeader: Record<string, boolean> } {
	const inHeader: Record<string, boolean> = {}
	const adding = new Set(add.map((entry) => entry.pageId))

	if (chrome.menu.length === 0) {
		let shown = pages.filter((page) => page.inHeader && !adding.has(page.id)).length
		for (const entry of add) {
			inHeader[entry.pageId] = shown < HEADER_PAGES_MAX
			if (inHeader[entry.pageId]) shown++
		}
		return { chrome, inHeader }
	}

	const used = new Set(chrome.menu.flatMap((item) => [item.id, ...item.links.map((link) => link.id)]))
	let menu = chrome.menu
	for (const entry of add) {
		inHeader[entry.pageId] = false
		const slug = asSlug(entry.slug)
		if (menuLinks({ ...chrome, menu }, slug)) continue

		const family = familyOf(entry.archetype)
		const at = family ? menu.findIndex((item) => item.links.length > 0 && family.test(item.label)) : -1
		if (at !== -1 && menu[at].links.length <= GROUP_LINKS_MAX) {
			const group = menu[at]
			const icons = group.links.every((link) => Boolean(link.icon))
			const link: MenuLink = {
				id: freshMenuId('ml_', used),
				label: entry.label,
				href: slug,
				description: '',
				...(icons && entry.icon ? { icon: entry.icon } : {}),
			}
			menu = menu.map((item, index) => (index === at ? { ...item, links: [...item.links, link] } : item))
			continue
		}

		if (menu.length <= MENU_ITEMS_MAX) {
			const item: MenuItem = {
				id: freshMenuId('mi_', used),
				label: entry.label,
				href: slug,
				links: [],
				style: 'mega',
				promo: null,
			}
			// Before a phone or email entry, which conventionally closes the menu.
			let index = menu.length
			while (index > 0 && isContactItem(menu[index - 1])) index--
			menu = [...menu.slice(0, index), item, ...menu.slice(index)]
		}
		// Otherwise the footer, which lists every page, is where it is linked.
	}
	return { chrome: menu === chrome.menu ? chrome : { ...chrome, menu }, inHeader }
}

// ---------------------------------------------------------------- landing

/** Every block id in a tree, children included. */
function collectIds(blocks: Block[], into: Set<string>) {
	for (const block of blocks) {
		into.add(block.id)
		if (block.children) collectIds(block.children, into)
	}
	return into
}

/** The catalog's block id format, generated here so this module does not import the catalog. */
const freshBlockId = () => `blk_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`

/**
 * Gives a fresh id to any block whose id is already taken. A top-level block's surface
 * moves with it when it collided with a block that stays on the site, and is copied when
 * it collided with another incoming block.
 */
function reid(
	blocks: Block[],
	seen: Set<string>,
	kept: Set<string>,
	looks: Record<string, BackgroundSettings> | null,
): Block[] {
	let changed = false
	const next = blocks.map((block) => {
		let id = block.id
		if (seen.has(id)) {
			do id = freshBlockId()
			while (seen.has(id))
			if (looks && Object.hasOwn(looks, block.id)) {
				looks[id] = looks[block.id]
				if (kept.has(block.id)) delete looks[block.id]
			}
		}
		seen.add(id)
		const children = block.children ? reid(block.children, seen, kept, null) : block.children
		if (id === block.id && children === block.children) return block
		changed = true
		return { ...block, id, ...(children ? { children } : {}) }
	})
	return changed ? next : blocks
}

/** Whether the target already holds any block this landing brings: it landed before. */
const holdsAny = (page: Page, incoming: Page) => {
	const ids = new Set(page.blocks.map((block) => block.id))
	return incoming.blocks.some((block) => ids.has(block.id))
}

function land({ current, landing, now }: LandInput): Snapshot & LandSummary {
	if (!landing || !PLACEMENTS.includes(landing.placement)) throw new LandError('invalid')
	const incoming = Array.isArray(landing.pages) ? landing.pages : []
	if (incoming.length === 0) throw new LandError('invalid')
	const placement = landing.placement
	const site = current.site
	const targetId = placement === 'replace-page' ? landing.targetPageId : null
	const target = targetId ? (site.pages.find((page) => page.id === targetId) ?? null) : null

	// The same payload can arrive twice (the chip and the toast both offer Apply).
	const existing = new Set(site.pages.map((page) => page.id))
	if (incoming.some((page) => page.id !== targetId && existing.has(page.id)))
		throw new LandError('already-landed')
	if (target && holdsAny(target, incoming[0])) throw new LandError('already-landed')

	const notes = [...(Array.isArray(landing.notes) ? landing.notes : [])]
	const menuAdd = Array.isArray(landing.menuAdd) ? landing.menuAdd : []
	const archetypeOf = (id: string): Archetype =>
		menuAdd.find((entry) => entry.pageId === id)?.archetype ?? 'custom'
	const renamed: Record<string, string> = {}

	/** Settles each new page's slug against `taken`, recording renames for the links. */
	const settle = (pages: Page[], taken: string[], home: boolean) => {
		const keptByIncoming = new Set<string>()
		return pages.map((page, index) => {
			const slug =
				home && index === 0
					? HOME_SLUG
					: freeSlug(page.slug, taken, { archetype: archetypeOf(page.id), name: page.name })
			taken.push(slug)
			// A link to '/' always means the home page, so a stray '/' slug is never a rename.
			const from = asSlug(page.slug)
			if (from !== slug && from !== HOME_SLUG && !keptByIncoming.has(from)) renamed[from] = slug
			keptByIncoming.add(slug)
			return page.slug === slug ? page : { ...page, slug }
		})
	}

	let added: Page[]
	let others: Page[]
	let chrome = site.chrome
	let incomingChrome: Chrome | null = null

	if (placement === 'replace-site') {
		added = settle(incoming, [], true)
		others = []
		incomingChrome = landing.chrome ?? null
	} else if (placement === 'replace-page' && target) {
		const { id, name, slug, inHeader, createdAt } = target
		added = [{ ...incoming[0], id, name, slug, inHeader, createdAt, updatedAt: now }]
		others = site.pages.filter((page) => page.id !== target.id)
	} else {
		if (placement === 'replace-page')
			notes.push('The page you rebuilt was deleted during the build, so it was added as a new page.')
		const pages = placement === 'replace-page' ? incoming.slice(0, 1) : incoming
		added = settle(pages, site.pages.map((page) => page.slug), false)
		others = site.pages
		if (placement === 'append') incomingChrome = landing.chrome ?? null
	}

	for (const [from, to] of Object.entries(renamed)) {
		if (to === HOME_SLUG) continue
		const page = added.find((item) => item.slug === to)
		notes.push(`${page?.name ?? 'A new page'} is at /${to} because /${from} was already taken.`)
	}

	// Links the build wrote to a slug it planned follow that page to its final slug. The
	// pages that were already here keep theirs: they point at the page that owns the slug.
	const rewritten = rewriteHrefs({ version: 1, chrome: incomingChrome ?? chrome, pages: added }, renamed)
	added = rewritten.pages
	if (incomingChrome) chrome = rewritten.chrome

	// Ids are kept; only an id already used elsewhere on the site is replaced.
	const kept = collectIds(
		others.flatMap((page) => page.blocks),
		new Set<string>(),
	)
	const blockLooks: Record<string, BackgroundSettings> = { ...(landing.blockLooks ?? {}) }
	const seen = new Set(kept)
	added = added.map((page) => {
		const blocks = reid(page.blocks, seen, kept, blockLooks)
		return blocks === page.blocks ? page : { ...page, blocks }
	})

	// Placement order: a replaced page keeps its place, new pages come after the others.
	let pages: Page[] =
		placement === 'replace-page' && target
			? site.pages.map((page) => (page.id === target.id ? added[0] : page))
			: [...others, ...added]

	// New pages slot into the owner's menu when the build did not bring a whole one.
	if (placement === 'append' && !incomingChrome) {
		const add = menuAdd.flatMap((entry) => {
			const page = added.find((item) => item.id === entry.pageId)
			return page ? [{ ...entry, slug: page.slug }] : []
		})
		const slotted = slotIntoMenu(chrome, pages, add)
		chrome = slotted.chrome
		const withHeader = (page: Page) =>
			Object.hasOwn(slotted.inHeader, page.id) && page.inHeader !== slotted.inHeader[page.id]
				? { ...page, inHeader: slotted.inHeader[page.id] }
				: page
		pages = pages.map(withHeader)
		added = added.map(withHeader)
	}

	const parsed = siteSchema.safeParse({ version: 1, chrome, pages })
	if (!parsed.success) throw new LandError('invalid')
	const nextSite = parsed.data

	const base = current.look
	const design = landing.look
	const chromeLook = design
		? { theme: design.theme, page: design.page, header: design.header, footer: design.footer }
		: { theme: base.theme, page: base.page, header: base.header, footer: base.footer }
	let blocks: Record<string, BackgroundSettings>
	if (placement === 'replace-site') {
		blocks = blockLooks
	} else if (placement === 'replace-page' && target) {
		blocks = { ...base.blocks }
		for (const block of target.blocks) delete blocks[block.id]
		Object.assign(blocks, blockLooks)
	} else {
		blocks = { ...base.blocks, ...blockLooks }
	}
	const live = collectIds(
		nextSite.pages.flatMap((page) => page.blocks),
		new Set<string>(),
	)
	const look: BuilderLook = sanitizeLook({
		...(placement === 'replace-page' ? base : chromeLook),
		blocks: Object.fromEntries(Object.entries(blocks).filter(([id]) => live.has(id))),
	})

	const finalPages = nextSite.pages.filter((page) => added.some((item) => item.id === page.id))
	const reachable = (page: Page) =>
		nextSite.chrome.menu.length > 0 ? menuLinks(nextSite.chrome, asSlug(page.slug)) : page.inHeader
	return {
		site: nextSite,
		look,
		firstPageId: added[0]?.id ?? null,
		renamed,
		pageIds: added.map((page) => page.id),
		notes,
		unslotted:
			placement === 'append'
				? finalPages.filter((page) => !reachable(page)).map((page) => page.id)
				: [],
	}
}

/**
 * The next snapshot with the build landed, plus what the landing did. Throws
 * `LandError('already-landed')` when this payload is already on the site and
 * `LandError('invalid')` when it does not parse; either way nothing changes.
 */
export function landAiResult(input: LandInput): Snapshot & LandSummary {
	try {
		return land(input)
	} catch (error) {
		if (error instanceof LandError) throw error
		throw new LandError('invalid')
	}
}
