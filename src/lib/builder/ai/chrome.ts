/**
 * Header, menu and footer (section 9). The planner proposes the chrome; `normalizeChrome`
 * makes it valid, complete and good: every link goes to a real page, the phone or the
 * owner's email, groups have the shape their panel needs, icons are real and unique,
 * descriptions carry no invented facts, and the result always parses as a full `Chrome`
 * without a single field blanked by the schema's fallbacks.
 *
 * Pure: the routes and the proofs share it.
 */
import { slugOfHref } from '../links'
import { canonicalIcon, isCanonicalIcon, matchIcon, nextIcon } from '../catalog/lexicon'
import { PERSONALITIES } from '../design/personalities'
import type { Archetype, PersonalityId } from '../design/vocab'
import {
	MENU_LIMITS,
	chromeSchema,
	slugify,
	type Chrome,
	type FooterVariant,
	type HeaderVariant,
	type MenuItem,
	type MenuLink,
	type MenuPromo,
} from '../page-schema'
import { formatPhone, telHref } from './brief'
import type { BuildPins, Issue } from './contract'
import { scanClaims } from './facts'
import { clampText, guessArchetype, type PlanReply } from './planner'
import type { NormalizedPage, NormalizedPlan } from './types'

// ---------------------------------------------------------------- destinations

type Named = { slug: string; name: string }

/**
 * The page a planner target names (section 9.8 step 1). `page:<x>` is matched exactly,
 * then after `slugify(x)`, then against each page's slugified name, then with a trailing
 * `s` added or removed (`roof-repairs` ↔ `roof-repair`); anything but an exact match is
 * `repaired`. A bare slug of a real page is tolerated too (repaired). Root-relative paths,
 * domains and other schemes never name a page.
 */
export function matchPageTarget(target: string, pages: Named[]): { slug: string; repaired: boolean } | null {
	const raw = String(target ?? '').trim()
	const bySlug = (slug: string) => pages.find((page) => page.slug === slug)
	if (!/^page:/i.test(raw)) {
		return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw) && bySlug(raw) ? { slug: raw, repaired: true } : null
	}
	const wanted = raw.slice(5).trim()
	if (wanted === '/') return bySlug('/') ? { slug: '/', repaired: false } : null
	if (bySlug(wanted)) return { slug: wanted, repaired: false }
	const slug = slugify(wanted.replace(/^\/+/, ''))
	if (slug === 'home' && bySlug('/')) return { slug: '/', repaired: true }
	const variants = [slug, slug.endsWith('s') ? slug.slice(0, -1) : `${slug}s`]
	for (const candidate of variants) {
		const page = bySlug(candidate) ?? pages.find((item) => item.slug !== '/' && slugify(item.name) === candidate)
		if (page) return { slug: page.slug, repaired: true }
	}
	return null
}

// ---------------------------------------------------------------- the normalizer

export type ChromeInput = {
	reply: PlanReply['chrome']
	/** The build's pages (section 9.8: result pages; in append mode the existing ones come in `existing`). */
	pages: NormalizedPage[]
	existing: Named[]
	site: NormalizedPlan['site']
	contact: { phone: string | null; email: string | null; address: string | null; hours: string[] }
	personality: PersonalityId
	/** A pinned header button text (`pins.ctaLabel`) wins over the planner's. */
	pins: Pick<BuildPins, 'header' | 'footer' | 'menu'> & Partial<Pick<BuildPins, 'ctaLabel'>>
	/** The site's own chrome when its design is kept (append): its header and footer variants stay unless pinned. */
	current: Chrome | null
	/** The next unused landscape photo's stored value, for a mega panel's promo card. */
	promoImage: () => string | null
	/** The owner's corpus: menu descriptions and promo copy go through the facts gate (section 9.3). */
	corpus?: string
	language?: string
}

type Link = { label: string; href: string; description: string; icon?: string }
type Promo = { eyebrow: string; title: string; body: string; ctaLabel: string; href: string; image?: string }
type Item = { label: string; href: string; links: Link[]; style: 'mega' | 'dropdown'; promo: Promo | null; phone?: true }

type Known = Named & { archetype: Archetype | null; inMenu: boolean }

const CALL_LED = new Set<PersonalityId>(['rugged', 'bold', 'friendly'])
const MINIMAL = new Set<PersonalityId>(['refined', 'luxe', 'clinical'])

const SERVICE_GROUP = /services?|what we do|treatments|solutions/i
const COMPANY_GROUP = /company|about|more/i
const SERVICE_FAMILY = new Set<Archetype>(['service', 'services', 'area'])
const COMPANY_FAMILY = new Set<Archetype>(['about', 'reviews', 'work', 'faq', 'process'])

const LIMITS = {
	topLabel: 22, megaLabel: 28, linkLabelHard: 80, megaDescription: 90, dropdownDescription: 60,
	promoEyebrow: 24, promoTitle: 48, promoBody: 140, promoCta: 24, button: 22, buttonHard: 60,
	megaMin: 4, megaMax: 8, dropdownMax: 6, top: 8,
} as const

const noStop = (text: string) => text.replace(/[.。]+$/, '').trim()

const randomId = (prefix: string, taken: Set<string>) => {
	for (;;) {
		const id = `${prefix}${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`
		if (!taken.has(id)) {
			taken.add(id)
			return id
		}
	}
}

/**
 * The planner's chrome made complete and valid (section 9.8). `inHeader` is keyed by page
 * slug (it covers existing pages too): true for home and the at most six most important
 * pages in the menu, so "Use my pages instead" in the menu editor degrades gracefully.
 */
export function normalizeChrome(input: ChromeInput): { chrome: Chrome; inHeader: Record<string, boolean>; notes: Issue[] } {
	const notes: Issue[] = []
	const say = (code: Issue['code'], message: string, level: Issue['level'] = 'info') => {
		if (!notes.some((note) => note.code === code && note.message === message)) notes.push({ level, code, message })
	}

	const known: Known[] = [
		...input.pages.map((page) => ({ slug: page.slug, name: page.name, archetype: page.archetype, inMenu: page.inMenu })),
		...input.existing
			.filter((page) => !input.pages.some((item) => item.slug === page.slug))
			.map((page) => ({ slug: page.slug, name: page.name, archetype: guessArchetype(page), inMenu: true })),
	]
	const pageBySlug = new Map(known.map((page) => [page.slug, page]))
	const total = known.length
	const besidesHome = known.filter((page) => page.slug !== '/').length
	const servicePages = known.filter((page) => page.archetype === 'service')
	const hub = known.find((page) => page.archetype === 'services')

	const phoneHref = input.contact.phone
		? input.contact.phone.startsWith('tel:') ? input.contact.phone : telHref(input.contact.phone)
		: null
	const emailHref = input.contact.email
		? input.contact.email.startsWith('mailto:') ? input.contact.email : `mailto:${input.contact.email}`
		: null
	const phoneLabel = input.contact.phone && !input.contact.phone.startsWith('tel:') ? formatPhone(input.contact.phone) : phoneHref?.slice(4) ?? ''

	const gate = (text: string) =>
		input.corpus === undefined ? text : scanClaims(text, input.corpus, {}, { language: input.language }).length ? '' : text

	/** Section 9.8 step 1: a link's destination in the form chrome stores it, or null. */
	const dest = (target: string): string | null => {
		const value = String(target ?? '').trim()
		const lower = value.toLowerCase()
		if (lower === 'tel') return phoneHref
		if (lower === 'email') return emailHref
		if (lower.startsWith('tel:'))
			return phoneHref && lower.replace(/\D/g, '').endsWith(phoneHref.replace(/\D/g, '').slice(-7)) ? phoneHref : null
		if (lower.startsWith('mailto:')) return emailHref && lower === emailHref.toLowerCase() ? emailHref : null
		const page = matchPageTarget(value, known)
		if (!page) return null
		if (page.repaired) say('link-repaired', `A menu link to "${value.slice(0, 60)}" was pointed at the matching page.`)
		return page.slug
	}
	const nameOf = (href: string) => pageBySlug.get(href)?.name ?? ''

	// ---- 2. items, in the planner's order; every destination once
	const seen = new Set<string>()
	let items: Item[] = []
	for (const entry of input.reply.menu ?? []) {
		if (entry.kind === 'phone') {
			if (phoneHref && !seen.has(phoneHref)) {
				seen.add(phoneHref)
				items.push({ label: phoneLabel, href: phoneHref, links: [], style: 'mega', promo: null, phone: true })
			}
			continue
		}
		if (entry.kind === 'page' || !entry.links?.length) {
			const href = dest(entry.target)
			if (!href) {
				if (entry.target) say('menu-adjusted', `A menu entry that pointed nowhere was removed.`)
				continue
			}
			if (href === '/' || seen.has(href)) continue
			seen.add(href)
			items.push({ label: clampText(entry.label || nameOf(href), LIMITS.topLabel), href, links: [], style: 'mega', promo: null })
			continue
		}
		const links: Link[] = []
		for (const link of entry.links) {
			const href = dest(link.target)
			if (!href || href === '/' || seen.has(href)) continue
			seen.add(href)
			links.push({ label: clampText(link.label || nameOf(href), LIMITS.megaLabel), href, description: link.description, icon: link.icon || undefined })
		}
		const promo =
			entry.promo?.show && entry.style === 'mega'
				? { eyebrow: entry.promo.eyebrow, title: entry.promo.title, body: entry.promo.body, ctaLabel: entry.promo.ctaLabel, href: '' }
				: null
		items.push({ label: clampText(entry.label, LIMITS.topLabel) || 'Services', href: '', links, style: entry.style, promo })
	}

	// ---- 3. structure (sections 9.2 to 9.4)
	const groups = () => items.filter((item) => item.links.length || !item.href)
	const flatten = (item: Item): Item[] =>
		item.links.map((link) => ({ label: clampText(nameOf(link.href) || link.label, LIMITS.topLabel), href: link.href, links: [], style: 'mega' as const, promo: null }))

	if (total <= 1) {
		if (items.some((item) => !item.phone)) say('menu-adjusted', 'A one-page site needs no menu: the logo links home.')
		items = items.filter((item) => item.phone)
	} else if (input.pins.menu === 'links') {
		items = items.flatMap((item) => (item.links.length ? flatten(item) : [item]))
	} else if (besidesHome <= 3 && input.pins.menu !== 'mega' && groups().length) {
		items = items.flatMap((item) => (item.links.length ? flatten(item) : [item]))
		say('menu-adjusted', 'With only a few pages, the menu uses plain links.')
	}

	// Three or more service pages deserve their own panel (section 9.5).
	if (total > 1 && servicePages.length >= 3 && input.pins.menu !== 'links') {
		const holder = items.find((item) => item.links.some((link) => servicePages.some((page) => page.slug === link.href)))
		if (!holder) {
			const links: Link[] = []
			for (const page of [...(hub ? [hub] : []), ...servicePages]) {
				items = items.filter((item) => item.href !== page.slug || item.links.length)
				links.push({ label: clampText(page === hub ? 'All services' : page.name, LIMITS.megaLabel), href: page.slug, description: '' })
				seen.add(page.slug)
			}
			items.unshift({ label: 'Services', href: '', links, style: 'mega', promo: null })
			say('menu-adjusted', 'The service pages were grouped under Services.')
		}
	}

	// ---- 4. coverage: every page meant for the menu is reachable
	const reachable = () => new Set(items.flatMap((item) => [item.href, ...item.links.map((link) => link.href)]).filter(Boolean))
	if (total > 1) {
		for (const page of input.pages) {
			if (!page.inMenu || page.slug === '/' || reachable().has(page.slug)) continue
			const family = SERVICE_FAMILY.has(page.archetype) ? SERVICE_GROUP : COMPANY_FAMILY.has(page.archetype) ? COMPANY_GROUP : null
			const group = family ? items.find((item) => item.links.length && family.test(item.label)) : undefined
			const max = group?.style === 'mega' ? LIMITS.megaMax : LIMITS.dropdownMax
			if (group && group.links.length < max) {
				group.links.push({ label: clampText(page.name, LIMITS.megaLabel), href: page.slug, description: '' })
			} else if (items.length < LIMITS.top) {
				const phoneAt = items.findIndex((item) => item.phone)
				const plain: Item = { label: clampText(page.name, LIMITS.topLabel), href: page.slug, links: [], style: 'mega', promo: null }
				if (phoneAt === -1) items.push(plain)
				else items.splice(phoneAt, 0, plain)
			}
		}
	}

	// Megas: 4 to 8 links (extras to More); dropdowns 2 to 6; one link is a plain link; none, nothing.
	const more: Link[] = []
	for (const item of items) {
		if (!item.links.length) continue
		const max = item.style === 'mega' ? LIMITS.megaMax : LIMITS.dropdownMax
		if (item.links.length > max) more.push(...item.links.splice(max))
	}
	if (input.pins.menu === 'dropdown')
		for (const item of items)
			if (item.links.length && item.style === 'mega') {
				item.style = 'dropdown'
				item.promo = null
			}

	// The pinned mega: the main group is a mega panel, with a promo card when it is short.
	if (input.pins.menu === 'mega' && total > 1) {
		const main =
			items.find((item) => item.links.some((link) => pageBySlug.get(link.href)?.archetype === 'service')) ??
			[...items].filter((item) => item.links.length).sort((a, b) => b.links.length - a.links.length)[0]
		if (main) {
			main.style = 'mega'
			if (main.links.length < LIMITS.megaMin && !main.promo) main.promo = { eyebrow: '', title: '', body: '', ctaLabel: '', href: '' }
		} else {
			say('pin-bent', 'The site has too few pages for a mega menu, so it uses plain links.', 'warn')
		}
	}

	// ---- 5. icons, descriptions and promo cards (section 9.3)
	const primaryPage = slugOfHref(input.site.primary.chromeHref)
	const promoHref = primaryPage && pageBySlug.has(primaryPage)
		? primaryPage
		: known.find((page) => page.archetype === 'contact')?.slug ?? ''
	for (const item of items) {
		if (!item.links.length) continue
		const mega = item.style === 'mega'
		for (const link of item.links) {
			link.label = link.label || clampText(nameOf(link.href), LIMITS.megaLabel)
			link.description = gate(noStop(clampText(link.description, mega ? LIMITS.megaDescription : LIMITS.dropdownDescription)))
		}
		fixIcons(item, say)
		if (item.promo && mega) {
			const promo = item.promo
			const filled: Promo = {
				eyebrow: gate(noStop(clampText(promo.eyebrow, LIMITS.promoEyebrow))),
				title: gate(clampText(promo.title || input.site.primary.label, LIMITS.promoTitle)),
				body: gate(clampText(promo.body || input.site.offer, LIMITS.promoBody)),
				ctaLabel: promoHref ? gate(noStop(clampText(promo.ctaLabel || input.site.primary.label, LIMITS.promoCta))) : '',
				href: promoHref,
			}
			if (filled.title && filled.body) {
				const image = input.promoImage()
				item.promo = image ? { ...filled, image } : filled
			} else {
				item.promo = null
			}
		} else {
			item.promo = null
		}
		// A thin mega panel stretches one column across the content width (section 9.3).
		if (mega && item.links.length < LIMITS.megaMin && !item.promo) {
			item.style = 'dropdown'
			say('menu-adjusted', `"${item.label}" has too few links for a mega panel, so it opens as a list.`)
		}
	}
	if (more.length) items.push({ label: 'More', href: '', links: more.slice(0, LIMITS.dropdownMax), style: 'dropdown', promo: null })
	// Flatten single links and drop empty groups only now, after coverage and trimming.
	items = items.flatMap((item) => {
		if (item.href || item.phone) return [item]
		if (!item.links.length) return []
		if (item.links.length === 1 && !item.promo) return flatten(item)
		return [item]
	})

	// ---- 6. the phone entry (section 9.2)
	// A kept design pins the site's own variants (section 9.6); the owner's pins still win.
	const pinnedHeader = input.pins.header !== 'ai' ? input.pins.header : (input.current?.header ?? null)
	const pinnedFooter = input.pins.footer !== 'ai' ? input.pins.footer : (input.current?.footer ?? null)
	const preliminary: HeaderVariant = pinnedHeader ?? input.reply.header ?? PERSONALITIES[input.personality]?.header ?? 'bar'

	// ---- 7. the header button
	const pinnedLabel = String(input.pins.ctaLabel ?? '').trim()
	const buttonHref = dest(input.reply.cta?.target ?? '') ?? (input.site.primary.chromeHref || null)
	let ctaLabel = pinnedLabel
		? clampText(pinnedLabel, LIMITS.buttonHard)
		: clampText(input.reply.cta?.label || input.site.primary.label, LIMITS.button)
	let ctaHref = buttonHref ?? ''
	if (!ctaHref) ctaLabel = ''
	if (!ctaLabel) ctaHref = ''

	const wantsPhone =
		Boolean(phoneHref) && CALL_LED.has(input.personality) && !ctaHref.startsWith('tel:') && preliminary !== 'floating'
	const hasPhone = items.some((item) => item.phone)
	if (wantsPhone && !hasPhone) items.push({ label: phoneLabel, href: phoneHref!, links: [], style: 'mega', promo: null, phone: true })
	if (hasPhone && (ctaHref.startsWith('tel:') || preliminary === 'floating')) items = items.filter((item) => !item.phone)

	// ---- 8. variants (sections 9.1 and 9.7)
	const isLanding = total === 1 && input.pages[0]?.archetype === 'landing'
	const fitHeader = (variant: HeaderVariant): HeaderVariant => {
		if (variant === 'none') return isLanding ? 'none' : 'bar'
		if (variant === 'floating' && items.length > 5) return items.length > 6 ? 'stacked' : 'bar'
		if (variant !== 'stacked' && items.length > 6) return 'stacked'
		return variant
	}
	let header: HeaderVariant
	if (pinnedHeader) {
		header = pinnedHeader
		// A pinned header keeps its look; the menu folds into More until it fits.
		const fits = header === 'floating' ? 5 : header === 'stacked' ? LIMITS.top : 6
		if (items.length > fits) items = foldIntoMore(items, fits)
	} else {
		const wanted = input.reply.header ?? PERSONALITIES[input.personality]?.header ?? 'bar'
		if (items.length > LIMITS.top) items = foldIntoMore(items, LIMITS.top)
		header = fitHeader(wanted)
		if (header !== wanted && input.reply.header) say('menu-adjusted', `The header uses the ${header} layout so the menu fits.`)
	}
	if (header === 'floating') items = items.filter((item) => !item.phone)

	const fitFooter = (variant: FooterVariant | null): FooterVariant => {
		const fallback: FooterVariant =
			total >= 7 || input.personality === 'editorial' ? 'split' : total <= 5 && MINIMAL.has(input.personality) ? 'centered' : 'columns'
		if (!variant) return fallback
		if (variant === 'none') return isLanding ? 'none' : fallback
		if (variant === 'centered' && total > 6) return fallback === 'centered' ? 'columns' : fallback
		return variant
	}
	const footer: FooterVariant = pinnedFooter ?? fitFooter(input.reply.footer)
	const detailCount = [input.contact.phone, input.contact.email, input.contact.address, input.contact.hours.length ? 'hours' : null].filter(Boolean).length
	const footerDetails = detailCount >= 2

	// ---- 9. ids
	const ids = new Set<string>()
	const menu: MenuItem[] = items.slice(0, MENU_LIMITS.items).map((item) => ({
		id: randomId('mi_', ids),
		label: item.label,
		href: item.links.length ? '' : item.href,
		links: item.links.map(
			(link): MenuLink => ({
				id: randomId('ml_', ids),
				label: link.label,
				href: link.href,
				description: link.description,
				...(link.icon ? { icon: link.icon } : {}),
			}),
		),
		style: item.style,
		promo: item.promo ? (item.promo as MenuPromo) : null,
	}))

	// ---- 10. which pages show in the plain pages row ("Use my pages instead")
	const inHeader: Record<string, boolean> = {}
	const order = items.flatMap((item) => (item.links.length ? item.links.map((link) => link.href) : [item.href]))
	const important = order.filter((href) => pageBySlug.has(href) && href !== '/').slice(0, 6)
	for (const page of known) inHeader[page.slug] = page.slug === '/' || important.includes(page.slug)

	// ---- 11. the final gate: the schema must keep every value as written
	const draft = { header, footer, ctaLabel, ctaHref, menu, footerDetails }
	const chrome = chromeSchema.parse(draft)
	assertKept(draft, chrome)
	return { chrome, inHeader, notes }
}

/** Folds the plain page links past the limit into a "More" dropdown (sections 9.1 and 9.8 step 3). */
function foldIntoMore(items: Item[], limit: number): Item[] {
	if (items.length <= limit) return items
	const keep = [...items]
	const moved: Link[] = []
	for (let index = keep.length - 1; index >= 0 && keep.length > limit - 1; index--) {
		const item = keep[index]
		if (item.links.length || item.phone || !item.href) continue
		moved.unshift({ label: item.label, href: item.href, description: '' })
		keep.splice(index, 1)
	}
	if (!moved.length) return keep.slice(0, limit)
	const existing = keep.find((item) => item.label === 'More' && item.style === 'dropdown')
	if (existing) existing.links.push(...moved)
	else keep.push({ label: 'More', href: '', links: moved, style: 'dropdown', promo: null })
	const more = keep.find((item) => item.label === 'More' && item.style === 'dropdown')!
	more.links = more.links.slice(0, LIMITS.dropdownMax)
	return keep.slice(0, limit)
}

/**
 * Icons on every link of a panel or on none (section 9.3): a name that is not a canonical
 * Lucide icon is replaced from the lexicon by the link's words, a repeat is re-picked,
 * and when any link still has none the whole panel goes without.
 */
function fixIcons(item: Item, say: (code: Issue['code'], message: string) => void) {
	if (!item.links.some((link) => link.icon)) {
		for (const link of item.links) delete link.icon
		return
	}
	const used = new Set<string>()
	for (const link of item.links) {
		const words = `${link.label} ${link.description} ${link.href.replace(/-/g, ' ')}`
		const given = link.icon ? canonicalIcon(link.icon) : null
		let icon = given && !used.has(given) ? given : null
		if (!icon) {
			const matched = matchIcon(words)
			icon = matched && !used.has(matched) ? matched : nextIcon(used, given ?? matched ?? undefined)
			if (!isCanonicalIcon(icon) || used.has(icon)) icon = null
			else if (link.icon) say('icon-replaced', `The menu icon "${link.icon.slice(0, 40)}" was replaced with ${icon}.`)
		}
		if (!icon) {
			for (const other of item.links) delete other.icon
			return
		}
		used.add(icon)
		link.icon = icon
	}
}

/** A bug guard (section 9.8 step 11): no string blanked and no list emptied by the schema's `.catch`. */
function assertKept(draft: Record<string, unknown>, parsed: Record<string, unknown>, path = 'chrome') {
	const fail = (where: string) => {
		const message = `normalizeChrome produced a value the chrome schema dropped at ${where}`
		if (process.env.NODE_ENV !== 'production') throw new Error(message)
		console.error('[ai-build]', message)
	}
	for (const [key, value] of Object.entries(draft)) {
		if (!Object.hasOwn(parsed, key)) {
			// A key the schema does not know yet (an older schema) is not a blanking.
			continue
		}
		const after = parsed[key]
		if (typeof value === 'string' && value && after !== value) fail(`${path}.${key}`)
		else if (Array.isArray(value)) {
			if (!Array.isArray(after) || after.length !== value.length) fail(`${path}.${key}`)
			else value.forEach((entry, index) => {
				if (entry && typeof entry === 'object') assertKept(entry as Record<string, unknown>, after[index] as Record<string, unknown>, `${path}.${key}.${index}`)
			})
		} else if (value && typeof value === 'object') {
			if (!after || typeof after !== 'object') fail(`${path}.${key}`)
			else assertKept(value as Record<string, unknown>, after as Record<string, unknown>, `${path}.${key}`)
		}
	}
}

/**
 * The chrome with every link to a page that is not landing removed (section 4.7 step 3):
 * links to skipped pages, groups they empty, single-link groups flattened, and a header
 * button that pointed at one. Links to the phone, email and other sites stay.
 */
export function pruneChrome(chrome: Chrome, keepSlugs: string[]): Chrome {
	const keep = new Set(keepSlugs.map((slug) => String(slug ?? '').replace(/^\/+/, '') || '/'))
	const kept = (href: string) => {
		const slug = slugOfHref(href)
		return slug === null || keep.has(slug)
	}
	const menu: MenuItem[] = []
	for (const item of chrome.menu) {
		if (!item.links.length) {
			if (item.href && kept(item.href)) menu.push(item)
			continue
		}
		const links = item.links.filter((link) => kept(link.href))
		const promo = item.promo && (!item.promo.href || kept(item.promo.href)) ? item.promo : null
		if (!links.length) continue
		if (links.length === 1 && !promo) {
			menu.push({ ...item, label: links[0].label || item.label, href: links[0].href, links: [], promo: null })
			continue
		}
		menu.push({ ...item, links, promo })
	}
	const button = chrome.ctaHref && !kept(chrome.ctaHref)
	return chromeSchema.parse({
		...chrome,
		menu,
		ctaLabel: button ? '' : chrome.ctaLabel,
		ctaHref: button ? '' : chrome.ctaHref,
	})
}
