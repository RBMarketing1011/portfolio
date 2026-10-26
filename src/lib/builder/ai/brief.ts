/**
 * The owner's request and business details, made safe to build from (sections 4.2 and
 * 10.9). `parseCreateBuild` validates and cleans the dialog's request, `groundBusiness`
 * keeps only the details the owner actually gave, `factCorpus` is the text every claim on
 * the site must trace back to, and `availability` says what the owner's data can support
 * before anything is planned.
 *
 * Pure: the routes and the proofs share it.
 */
import { z } from 'zod'
import { isGoogleFont } from '@/app/builder/google-fonts'
import { SHAPES } from '@/app/builder/theme-settings'
import { FONT_PAIR_IDS, PALETTE_IDS } from '../design/vocab'
import { FOOTER_VARIANTS, HEADER_VARIANTS } from '../page-schema'
import { BUSINESS_TYPE_VALUES, WEEKDAYS, type BusinessType, type SiteProfile, type Weekday } from '../site-profile'
import {
	AI_LIMITS,
	BUILD_MODES,
	DEFAULT_PINS,
	PLACEMENTS,
	type ApiError,
	type BuildMode,
	type BuildPins,
	type BusinessInput,
	type OwnerReview,
	type PinFonts,
	type PinPages,
	type PinPalette,
} from './contract'
import { CLAIM_PATTERNS, normalizeForMatch } from './facts'
import type { Availability, GroundedBusiness, NormalizedRequest, PhotoCandidate } from './types'

export type { Availability, GroundedBusiness } from './types'

// ---------------------------------------------------------------- cleaning

// Controls (C0, DEL, C1), line/paragraph separators and the bidi override and isolate
// characters, which let text read differently from what it is (as in media/storage.ts).
const UNSAFE = new RegExp('[\\p{Cc}\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]', 'gu')

/** Control characters stripped, whitespace collapsed, trimmed. */
export const cleanText = (value: string) => String(value ?? '').replace(/\s+/g, ' ').replace(UNSAFE, '').trim()

const BUSINESS_TYPE_SET = new Set<string>(BUSINESS_TYPE_VALUES)
const isBusinessType = (value: unknown): value is BusinessType => typeof value === 'string' && BUSINESS_TYPE_SET.has(value)

// ---------------------------------------------------------------- the request (section 4.2)

class Invalid {
	constructor(readonly error: ApiError) {}
}

const MESSAGE = {
	invalid: 'Invalid request.',
	promptShort: 'Describe the business or the page in a sentence or two.',
	promptLong: 'Keep the description under 4,000 characters.',
	empty: 'This site is empty, so the AI builds it from scratch.',
	target: 'Choose the page to rebuild.',
	targetGone: 'That page no longer exists.',
	onePage: 'One page takes at most one page name.',
	pageCount: 'Choose between 1 and 12 pages.',
	pageNames: 'Page names must be different.',
	pageName: 'Page names need 1 to 60 characters.',
	colors: 'Colors must be six-digit hex values like #1e3a8a.',
	font: 'That font is not in the font list.',
	cta: 'Keep the button text under 40 characters.',
	reviewText: "Reviews need the review text and the reviewer's name.",
	reviewCount: 'Up to 12 reviews.',
	reviewLong: 'Keep each review under 600 characters.',
	reviewRole: "Keep the reviewer's role under 80 characters.",
	reviewSource: 'Keep the review source under 40 characters.',
	photos: 'One of those photos is not in this project.',
} as const

// A declaration, not an arrow, so a call narrows the code after it the way a `throw` does.
function bad(message: string, field?: string): never {
	throw new Invalid({ code: 'bad-request', message, status: 400, retryable: false, ...(field ? { field } : {}) })
}

type Plain = Record<string, unknown>

const isPlain = (value: unknown): value is Plain =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** An object with only the keys a `.strict()` schema allows. */
function strictObject(value: unknown, keys: readonly string[], field: string): Plain {
	if (!isPlain(value)) bad(MESSAGE.invalid, field || undefined)
	const object = value as Plain
	for (const key of Object.keys(object)) if (!keys.includes(key)) bad(MESSAGE.invalid, field ? `${field}.${key}` : key)
	return object
}

function enumValue<T extends string>(values: readonly T[], value: unknown, field: string): T {
	if (typeof value === 'string' && (values as readonly string[]).includes(value)) return value as T
	return bad(MESSAGE.invalid, field)
}

function bool(value: unknown, fallback: boolean, field: string): boolean {
	if (value === undefined) return fallback
	if (typeof value !== 'boolean') bad(MESSAGE.invalid, field)
	return value as boolean
}

function str(value: unknown, field: string, message: string = MESSAGE.invalid): string {
	if (value === undefined || value === null) return ''
	if (typeof value !== 'string') bad(message, field)
	return cleanText(value as string)
}

const HEX = /^#?[0-9a-fA-F]{6}$/
function hex(value: unknown, field: string): string {
	if (typeof value !== 'string' || !HEX.test(value.trim())) bad(MESSAGE.colors, field)
	const digits = (value as string).trim().replace(/^#/, '').toLowerCase()
	return `#${digits}`
}

const emailOk = (value: string) => z.string().email().safeParse(value).success

function parsePages(value: unknown, mode: BuildMode): PinPages {
	if (value === undefined) return { kind: 'ai' }
	const raw = strictObject(value, ['kind', 'count', 'names'], 'pins.pages')
	// Rule 5 comes before the shape of the pin itself: one page takes no page count.
	if (mode === 'page') {
		const one = raw.kind === 'ai' || (raw.kind === 'list' && Array.isArray(raw.names) && raw.names.length === 1)
		if (!one) bad(MESSAGE.onePage, 'pins.pages')
	}
	switch (raw.kind) {
		case 'ai':
			return { kind: 'ai' }
		case 'count': {
			const count = raw.count
			if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > AI_LIMITS.pagesMax)
				bad(MESSAGE.pageCount, 'pins.pages.count')
			return { kind: 'count', count: count as number }
		}
		case 'list': {
			if (!Array.isArray(raw.names) || raw.names.length < 1 || raw.names.length > AI_LIMITS.pagesMax)
				bad(MESSAGE.pageCount, 'pins.pages.names')
			const names = (raw.names as unknown[]).map((name, index) => {
				const clean = str(name, `pins.pages.names.${index}`, MESSAGE.pageName)
				if (!clean || clean.length > AI_LIMITS.pageNameMax) bad(MESSAGE.pageName, `pins.pages.names.${index}`)
				return clean
			})
			const seen = new Set<string>()
			names.forEach((name, index) => {
				const key = name.toLowerCase()
				if (seen.has(key)) bad(MESSAGE.pageNames, `pins.pages.names.${index}`)
				seen.add(key)
			})
			return { kind: 'list', names }
		}
	}
	return bad(MESSAGE.invalid, 'pins.pages.kind')
}

function parsePalette(value: unknown): PinPalette {
	if (value === undefined) return { kind: 'ai', polarity: 'any' }
	const raw = strictObject(value, ['kind', 'polarity', 'id', 'accent', 'background', 'heading', 'body'], 'pins.palette')
	switch (raw.kind) {
		case 'ai':
			return { kind: 'ai', polarity: raw.polarity === undefined ? 'any' : enumValue(['any', 'light', 'dark'] as const, raw.polarity, 'pins.palette.polarity') }
		case 'keep':
			return { kind: 'keep' }
		case 'curated': {
			const id = typeof raw.id === 'string' ? PALETTE_IDS.find((item) => item.toLowerCase() === (raw.id as string).trim().toLowerCase()) : undefined
			if (!id) bad(MESSAGE.colors, 'pins.palette.id')
			return { kind: 'curated', id: id! }
		}
		case 'brand':
			return {
				kind: 'brand',
				accent: hex(raw.accent, 'pins.palette.accent'),
				polarity: enumValue(['light', 'dark'] as const, raw.polarity, 'pins.palette.polarity'),
			}
		case 'custom':
			return {
				kind: 'custom',
				background: hex(raw.background, 'pins.palette.background'),
				accent: hex(raw.accent, 'pins.palette.accent'),
				heading: hex(raw.heading, 'pins.palette.heading'),
				body: hex(raw.body, 'pins.palette.body'),
			}
	}
	return bad(MESSAGE.invalid, 'pins.palette.kind')
}

function parseFonts(value: unknown): PinFonts {
	if (value === undefined) return { kind: 'ai' }
	const raw = strictObject(value, ['kind', 'id', 'heading', 'body'], 'pins.fonts')
	switch (raw.kind) {
		case 'ai':
			return { kind: 'ai' }
		case 'keep':
			return { kind: 'keep' }
		case 'pair': {
			const id = FONT_PAIR_IDS.find((item) => item === raw.id)
			if (!id) bad(MESSAGE.font, 'pins.fonts.id')
			return { kind: 'pair', id: id! }
		}
		case 'custom': {
			// Exact families: the font list is case-sensitive, like the stylesheet URL it builds.
			for (const key of ['heading', 'body'] as const)
				if (typeof raw[key] !== 'string' || !isGoogleFont(raw[key] as string)) bad(MESSAGE.font, `pins.fonts.${key}`)
			return { kind: 'custom', heading: raw.heading as string, body: raw.body as string }
		}
	}
	return bad(MESSAGE.invalid, 'pins.fonts.kind')
}

const PIN_KEYS = ['pages', 'palette', 'fonts', 'shape', 'header', 'footer', 'menu', 'ctaLabel', 'keepDesign', 'updateMenu'] as const

function parsePins(value: unknown, mode: BuildMode): BuildPins {
	const raw = value === undefined ? {} : strictObject(value, PIN_KEYS, 'pins')
	const pages = parsePages(raw.pages, mode)
	const palette = parsePalette(raw.palette)
	const fonts = parseFonts(raw.fonts)
	const option = <T extends string>(values: readonly T[], key: string, current: unknown): 'ai' | T =>
		current === undefined || current === 'ai' ? 'ai' : enumValue(values, current, `pins.${key}`)
	const shape = option(SHAPES, 'shape', raw.shape)
	const header = option(HEADER_VARIANTS, 'header', raw.header)
	const footer = option(FOOTER_VARIANTS, 'footer', raw.footer)
	const menu = raw.menu === undefined ? 'ai' : enumValue(['ai', 'mega', 'dropdown', 'links'] as const, raw.menu, 'pins.menu')
	const ctaLabel = str(raw.ctaLabel, 'pins.ctaLabel', MESSAGE.cta)
	if (ctaLabel.length > AI_LIMITS.ctaLabelMax) bad(MESSAGE.cta, 'pins.ctaLabel')
	const pins: BuildPins = {
		pages,
		palette,
		fonts,
		shape,
		header,
		footer,
		menu,
		ctaLabel,
		keepDesign: bool(raw.keepDesign, DEFAULT_PINS.keepDesign, 'pins.keepDesign'),
		updateMenu: bool(raw.updateMenu, DEFAULT_PINS.updateMenu, 'pins.updateMenu'),
	}
	// One page is always slotted into the owner's menu and keeps the owner's design (sections 2.3, 9.6).
	if (mode === 'page') return { ...pins, updateMenu: false, keepDesign: true }
	return pins
}

const BUSINESS_KEYS = ['name', 'type', 'phone', 'email', 'city', 'region', 'areas'] as const

function parseBusiness(value: unknown): BusinessInput {
	const raw = value === undefined ? {} : strictObject(value, BUSINESS_KEYS, 'business')
	const text = (key: (typeof BUSINESS_KEYS)[number], max: number, message: string) => {
		const clean = str(raw[key], `business.${key}`)
		if (clean.length > max) bad(message, `business.${key}`)
		return clean
	}
	const name = text('name', 120, 'Keep the business name under 120 characters.')
	const phone = text('phone', 40, 'Keep the phone number under 40 characters.')
	const email = text('email', 254, 'That email address does not look right.')
	if (email && !emailOk(email)) bad('That email address does not look right.', 'business.email')
	const city = text('city', 80, 'Keep the city under 80 characters.')
	const region = text('region', 80, 'Keep the state or region under 80 characters.')

	let areas: string[] = []
	if (raw.areas !== undefined) {
		if (!Array.isArray(raw.areas)) bad(MESSAGE.invalid, 'business.areas')
		const list = raw.areas as unknown[]
		if (list.length > 30) bad('List up to 30 areas.', 'business.areas')
		const seen = new Set<string>()
		list.forEach((area, index) => {
			const clean = str(area, `business.areas.${index}`)
			if (clean.length > 80) bad('Keep each area under 80 characters.', `business.areas.${index}`)
			const key = clean.toLowerCase()
			if (clean && !seen.has(key)) {
				seen.add(key)
				areas.push(clean)
			}
		})
		areas = areas.slice(0, 30)
	}

	let type: BusinessType | '' = ''
	if (raw.type !== undefined && raw.type !== '') {
		if (!isBusinessType(raw.type)) bad('Choose a business type from the list.', 'business.type')
		type = raw.type as BusinessType
	}
	return { name, type, phone, email, city, region, areas }
}

function parseReviews(value: unknown): OwnerReview[] {
	if (value === undefined) return []
	if (!Array.isArray(value)) bad(MESSAGE.invalid, 'reviews')
	const list = value as unknown[]
	if (list.length > AI_LIMITS.reviewsMax) bad(MESSAGE.reviewCount, 'reviews')
	return list.map((item, index) => {
		const raw = strictObject(item, ['quote', 'name', 'role', 'source'], `reviews.${index}`)
		const quote = str(raw.quote, `reviews.${index}.quote`, MESSAGE.reviewText)
		if (quote.length < AI_LIMITS.reviewQuoteMin) bad(MESSAGE.reviewText, `reviews.${index}.quote`)
		if (quote.length > AI_LIMITS.reviewQuoteMax) bad(MESSAGE.reviewLong, `reviews.${index}.quote`)
		const name = str(raw.name, `reviews.${index}.name`, MESSAGE.reviewText)
		if (!name || name.length > AI_LIMITS.reviewNameMax) bad(MESSAGE.reviewText, `reviews.${index}.name`)
		const role = str(raw.role, `reviews.${index}.role`)
		if (role.length > AI_LIMITS.reviewRoleMax) bad(MESSAGE.reviewRole, `reviews.${index}.role`)
		const source = str(raw.source, `reviews.${index}.source`)
		if (source.length > AI_LIMITS.reviewSourceMax) bad(MESSAGE.reviewSource, `reviews.${index}.source`)
		return { quote, name, role, source }
	})
}

const DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]*)$/

/** A `data:` image the model may be sent: a listed type, at most 3.75 MB once decoded. */
export function isAllowedDataImage(url: string): boolean {
	const match = DATA_IMAGE.exec(String(url ?? ''))
	if (!match) return false
	const data = match[2].replace(/\s/g, '')
	const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
	return Math.floor((data.length * 3) / 4) - padding <= AI_LIMITS.dataUrlMaxBytes
}

function parsePhotoIds(
	value: unknown,
	media: { id: string; url: string }[] | undefined,
	blobUrlOk: ((url: string) => boolean) | undefined,
): string[] {
	if (value === undefined) return []
	if (!Array.isArray(value)) bad(MESSAGE.photos, 'photoIds')
	const ids: string[] = []
	;(value as unknown[]).forEach((id, index) => {
		if (typeof id !== 'string' || !id.trim() || id.length > 200) bad(MESSAGE.photos, `photoIds.${index}`)
		const clean = (id as string).trim()
		if (!ids.includes(clean)) ids.push(clean)
	})
	if (ids.length > AI_LIMITS.photosMax) bad(MESSAGE.photos, 'photoIds')
	if (media) {
		ids.forEach((id, index) => {
			const entry = media.find((item) => item.id === id)
			const url = entry?.url ?? ''
			const ok = Boolean(entry) && (url.startsWith('data:') ? isAllowedDataImage(url) : Boolean(blobUrlOk?.(url)))
			if (!ok) bad(MESSAGE.photos, `photoIds.${index}`)
		})
	}
	return ids
}

const TOP_KEYS = ['mode', 'placement', 'targetPageId', 'prompt', 'pins', 'business', 'reviews', 'photoIds', 'useLibrary', 'fast'] as const

/**
 * Validates a create request in the order of section 4.2's table; the first failure is a
 * 400 `bad-request` naming the field. When the site's `media` is given, every photo id must
 * be one of its entries with a `data:` image within the limits or a URL `blobUrlOk` accepts
 * (the route passes `assertBlobUrl`, which is server-only).
 */
export function parseCreateBuild(
	body: unknown,
	site: { pages: { id: string }[]; media?: { id: string; url: string }[] },
	opts: { blobUrlOk?: (url: string) => boolean } = {},
): { ok: true; request: NormalizedRequest } | { ok: false; error: ApiError } {
	try {
		const raw = strictObject(body, TOP_KEYS, '')

		if (typeof raw.prompt !== 'string') bad(MESSAGE.promptShort, 'prompt')
		const prompt = cleanText(raw.prompt as string)
		if (prompt.length < AI_LIMITS.promptMin) bad(MESSAGE.promptShort, 'prompt')
		if (prompt.length > AI_LIMITS.promptMax) bad(MESSAGE.promptLong, 'prompt')

		const mode = enumValue(BUILD_MODES, raw.mode, 'mode')
		const placement = enumValue(PLACEMENTS, raw.placement, 'placement')
		const pages = Array.isArray(site?.pages) ? site.pages : []

		if (pages.length === 0 && placement !== 'replace-site') bad(MESSAGE.empty, 'placement')

		if (raw.targetPageId !== undefined && raw.targetPageId !== null && typeof raw.targetPageId !== 'string')
			bad(MESSAGE.invalid, 'targetPageId')
		let targetPageId: string | null = null
		if (placement === 'replace-page') {
			if (mode !== 'page' || !raw.targetPageId) bad(MESSAGE.target, 'targetPageId')
			if (!pages.some((page) => page.id === raw.targetPageId))
				throw new Invalid({ code: 'not-found', message: MESSAGE.targetGone, status: 404, retryable: false, field: 'targetPageId' })
			targetPageId = raw.targetPageId as string
		}

		const pins = parsePins(raw.pins, mode)
		const business = parseBusiness(raw.business)
		const reviews = parseReviews(raw.reviews)
		const photoIds = parsePhotoIds(raw.photoIds, site?.media, opts.blobUrlOk)

		return {
			ok: true,
			request: {
				mode,
				placement,
				targetPageId,
				prompt,
				pins,
				business,
				reviews,
				photoIds,
				useLibrary: bool(raw.useLibrary, false, 'useLibrary'),
				fast: bool(raw.fast, false, 'fast'),
			},
		}
	} catch (error) {
		if (error instanceof Invalid) return { ok: false, error: error.error }
		throw error
	}
}

/** Pages a build may plan: one for a page build, else the pinned list or count, else the default (section 4.2 step 5). */
export function pageCapOf(request: Pick<NormalizedRequest, 'mode' | 'pins'>): number {
	if (request.mode === 'page') return 1
	const pages = request.pins.pages
	const cap = pages.kind === 'list' ? pages.names.length : pages.kind === 'count' ? pages.count : AI_LIMITS.pagesDefault
	return Math.min(AI_LIMITS.pagesMax, Math.max(1, Math.trunc(cap) || 1))
}

// ---------------------------------------------------------------- phones and emails

const PHONE_IN_TEXT = /\+?\(?\d[\d\s().-]{5,}\d/g
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const digitsOf = (value: string) => String(value ?? '').replace(/\D/g, '')
const phoneDigitsOk = (value: string) => {
	const count = digitsOf(value).length
	return count >= 7 && count <= 15
}

/**
 * A phone as a `tel:` link: the owner's `+` kept, a North American 10-digit number given
 * its +1, anything else dialled as written. Null when it is not 7 to 15 digits.
 */
export function telHref(phone: string): string | null {
	const raw = String(phone ?? '').trim()
	const digits = digitsOf(raw)
	if (digits.length < 7 || digits.length > 15) return null
	if (raw.startsWith('+')) return `tel:+${digits}`
	if (digits.length === 10 && /^[2-9]/.test(digits)) return `tel:+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
	return `tel:${digits}`
}

/** "(512) 555-0142" for a North American number; anyone else's number as they wrote it. */
export function formatPhone(phone: string): string {
	const raw = String(phone ?? '').trim()
	let digits = digitsOf(raw)
	if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
	else if (raw.startsWith('+') && !raw.startsWith('+1')) return raw
	if (digits.length === 10 && /^[2-9]/.test(digits))
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
	return raw
}

const firstPhone = (text: string) => [...String(text ?? '').matchAll(PHONE_IN_TEXT)].map((match) => match[0].trim()).find(phoneDigitsOk) ?? ''
const firstEmail = (text: string) => [...String(text ?? '').matchAll(EMAIL_IN_TEXT)].map((match) => match[0]).find(emailOk) ?? ''

// ---------------------------------------------------------------- hours

const dayIndex = (day: Weekday) => WEEKDAYS.indexOf(day)
const hhmm = (time: string) => String(time ?? '').replace(/^0(\d)/, '$1')

function dayList(days: Weekday[]): string {
	const sorted = [...new Set(days)].filter((day) => dayIndex(day) >= 0).sort((a, b) => dayIndex(a) - dayIndex(b))
	if (!sorted.length) return ''
	const run = sorted.every((day, index) => index === 0 || dayIndex(day) === dayIndex(sorted[index - 1]) + 1)
	if (sorted.length >= 3 && run) return `${sorted[0]} to ${sorted[sorted.length - 1]}`
	if (sorted.length === 1) return sorted[0]
	return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`
}

/** The profile's opening hours as plain lines: "Monday to Friday 7:00 to 18:00". */
export function hoursLines(hours: SiteProfile['business']['hours']): string[] {
	return (hours ?? [])
		.map((row) => {
			const days = dayList(row.days ?? [])
			return days ? `${days} ${hhmm(row.opens)} to ${hhmm(row.closes)}` : ''
		})
		.filter(Boolean)
}

// ---------------------------------------------------------------- grounding (section 10.9)

/**
 * The business details a site may use, each one the owner gave: the dialog's edits win,
 * then the prompt, then the saved profile. A phone or email is kept only when the owner
 * wrote it somewhere; a name only from the edits or the profile (the planner's reading of
 * the prompt is checked against the corpus in `normalizePlan`). Nothing is ever invented.
 */
export function groundBusiness(input: { request: NormalizedRequest; profile: SiteProfile; projectName: string }): GroundedBusiness {
	const edits = input.request.business
	const stored = input.profile.business
	const prompt = input.request.prompt

	type Source = GroundedBusiness['sources']['name']
	const pick = (candidates: [string, Source][]): [string, Source] =>
		candidates.find(([value]) => value.trim() !== '') ?? ['', 'none']

	const [phoneValue, phoneSource] = pick([
		[phoneDigitsOk(edits.phone) ? edits.phone.trim() : '', 'edits'],
		[firstPhone(prompt), 'prompt'],
		[phoneDigitsOk(stored.phone) ? stored.phone.trim() : '', 'profile'],
	])
	const tel = phoneValue ? telHref(phoneValue) : null

	const [emailValue, emailSource] = pick([
		[emailOk(edits.email) ? edits.email.trim() : '', 'edits'],
		[firstEmail(prompt), 'prompt'],
		[emailOk(stored.email) ? stored.email.trim() : '', 'profile'],
	])

	const [name, nameSource] = pick([
		[cleanText(edits.name), 'edits'],
		[cleanText(stored.name), 'profile'],
	])
	const [city, citySource] = pick([
		[cleanText(edits.city), 'edits'],
		[cleanText(stored.city), 'profile'],
	])
	const [region, regionSource] = pick([
		[cleanText(edits.region), 'edits'],
		[cleanText(stored.region), 'profile'],
	])
	const editAreas = (edits.areas ?? []).map(cleanText).filter(Boolean)
	const storedAreas = (stored.serviceArea ?? []).map(cleanText).filter(Boolean)
	const areas = editAreas.length ? editAreas : storedAreas
	const areasSource: Source = editAreas.length ? 'edits' : storedAreas.length ? 'profile' : 'none'

	const street = cleanText(stored.street)
	const locality = [cleanText(stored.city), [cleanText(stored.region), cleanText(stored.postalCode)].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(', ')
	const address = street ? [street, locality].filter(Boolean).join(', ') : ''

	return {
		name,
		phone: tel ? { display: phoneValue, href: tel } : null,
		email: emailValue ? { display: emailValue, href: `mailto:${emailValue}` } : null,
		city,
		region,
		areas: [...new Set(areas)].slice(0, 30),
		address,
		hours: hoursLines(stored.hours),
		priceRange: cleanText(stored.priceRange),
		sources: {
			name: nameSource,
			phone: tel ? phoneSource : 'none',
			email: emailValue ? emailSource : 'none',
			city: citySource,
			region: regionSource,
			areas: areasSource,
		},
	}
}

/**
 * The owner's own words, normalized for matching (section 10.9 step 3): the prompt, the
 * business edits, the profile's business name, description, phone, email, address, hours,
 * areas and price range, the project name, the reviews and, once planned, the page names.
 */
export function factCorpus(input: {
	request: NormalizedRequest
	profile: SiteProfile
	projectName: string
	reviews: OwnerReview[]
	pageNames?: string[]
}): string {
	const { request, profile } = input
	const stored = profile.business
	const parts = [
		request.prompt,
		request.business.name,
		request.business.phone,
		request.business.email,
		request.business.city,
		request.business.region,
		...(request.business.areas ?? []),
		stored.name,
		stored.description,
		stored.phone,
		stored.email,
		stored.street,
		stored.city,
		stored.region,
		stored.postalCode,
		...hoursLines(stored.hours),
		...(stored.serviceArea ?? []),
		stored.priceRange,
		input.projectName,
		...(input.reviews ?? []).flatMap((review) => [review.quote, review.name, review.role, review.source]),
		...(input.pageNames ?? []),
	]
	return normalizeForMatch(parts.filter((part) => typeof part === 'string' && part.trim()).join(' \n '))
}

// ---------------------------------------------------------------- availability (section 7.9)

/** Something announced: an offer, an opening or a deadline. A bare "offer" or "special" is not enough. */
export const ANNOUNCEMENT =
	/\b(special offer|\w+ special|limited[- ]time|\d+\s?% off|discount|promo(tion)?|grand opening|now open|opening soon|new location|on sale|sale ends|offer ends|book by|until (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)\b/i

/** Kinds a photo slot may use; screenshots, logos and the like never fill a photo slot by choice. */
export const PHOTO_KINDS: readonly PhotoCandidate['kind'][] = ['photo', 'illustration', 'graphic', 'unknown']

/** The longest "a, b, c and d" list in the brief: a rough count of the services it names. */
function listedServices(prompt: string): number {
	let best = 0
	for (const sentence of String(prompt ?? '').split(/[.!?;:\n]+/)) {
		const parts = sentence
			.split(/,|\band\b|\bor\b|&/i)
			.map((part) => part.trim())
			.filter(Boolean)
		if (parts.length < 3) continue
		const short = parts.filter((part) => part.split(/\s+/).length <= 5)
		if (short.length >= 3) best = Math.max(best, short.length)
	}
	return best
}

/** Distinct claims (numbers, years, prices, ratings, availability, credentials) in the owner's own text. */
function factCount(text: string): number {
	const phone = CLAIM_PATTERNS.find((pattern) => pattern.kind === 'phone')!.re
	// A phone number is a contact detail, and the digits inside it are not facts.
	const own = String(text ?? '').replace(phone, ' ')
	const seen = new Set<string>()
	for (const { kind, re } of CLAIM_PATTERNS) {
		if (kind === 'phone') continue
		for (const match of own.matchAll(re)) seen.add(normalizeForMatch(match[0]))
	}
	seen.delete('')
	return seen.size
}

const PAIR_WORDS = { before: /\bbefore\b/i, after: /\bafter\b/i }

export function availability(input: {
	request: NormalizedRequest
	business: GroundedBusiness
	pool: PhotoCandidate[]
	profile: SiteProfile
}): Availability {
	const { request, business, pool, profile } = input
	const ownText = [request.prompt, request.business.name, profile.business.description, profile.business.priceRange].join(' \n ')
	const facts = factCount(ownText)

	const contactFacts: Availability['contactFacts'] = []
	if (business.phone) contactFacts.push('phone')
	if (business.email) contactFacts.push('email')
	if (business.address) contactFacts.push('address')
	if (business.hours.length) contactFacts.push('hours')
	if (business.areas.length) contactFacts.push('areas')
	if (business.priceRange) contactFacts.push('priceRange')

	const usable = pool.filter((photo) => PHOTO_KINDS.includes(photo.kind))
	const count = (orientation: PhotoCandidate['orientation']) => usable.filter((photo) => photo.orientation === orientation).length
	const words = (photo: PhotoCandidate) => [photo.caption, ...photo.tags].join(' ')
	const befores = usable.filter((photo) => PAIR_WORDS.before.test(words(photo))).length
	const afters = usable.filter((photo) => PAIR_WORDS.after.test(words(photo))).length
	const photos = {
		eligible: usable.length,
		landscape: count('landscape'),
		portrait: count('portrait'),
		square: count('square'),
		panorama: count('panorama'),
		pairs: Math.min(befores, afters),
	}
	const seen = pool.filter((photo) => photo.vision).length
	const announcement = ANNOUNCEMENT.test(request.prompt)

	const unavailable: string[] = []
	if (!request.reviews.length) unavailable.push('testimonial-card:* (no reviews)')
	if (facts < 3) unavailable.push('stat-band:* (fewer than 3 facts)')
	if (facts < 2) unavailable.push('stat-hero:* (fewer than 2 facts)', 'hero-stats (fewer than 2 facts)')
	if (contactFacts.length < 2) unavailable.push('detail-card:* (fewer than 2 contact details)')
	else if (contactFacts.length < 4) unavailable.push('detail-card:inline (fewer than 4 contact details)')
	if (!announcement) unavailable.push('announcement-bar:* (nothing announced)')
	if (!photos.eligible) {
		unavailable.push(
			'split-hero:* (no photos)', 'spotlight:* (no photos)', 'feature-rows:* (no photos)', 'tabs-showcase:* (no photos)',
			'media-gallery:* (no photos)', 'media-mosaic:default (no photos)', 'figure:* (no photos)', 'media-card:* (no photos)',
		)
	} else {
		if (!photos.landscape && !photos.panorama && seen === 0) unavailable.push('split-hero:* (no landscape photo)')
		if (photos.eligible < 5) unavailable.push('media-mosaic:default (fewer than 5 photos)')
		if (photos.eligible < 4) unavailable.push('media-gallery:* (fewer than 4 photos)')
	}
	// The planner can see a pair in the photos it is shown, so only an unseen pool rules it out.
	if (!photos.pairs && seen < 2) unavailable.push('image-compare:* (no before/after pair)')

	return {
		reviews: request.reviews.length,
		facts,
		contactFacts,
		services: listedServices(request.prompt),
		areas: business.areas.length,
		announcement,
		photos,
		unavailable,
	}
}
