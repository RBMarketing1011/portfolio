/**
 * The marker test: proves that a composed and written section can never publish
 * component placeholder copy, sample media or a link that goes nowhere.
 *
 *   node scripts/prove-builder-compose.cjs
 *
 * For every layout × {min, typical, max} items × each allowed surface × {photos, none
 * where allowed} (and each tweak, child card and personality the layout offers):
 * compose → fill every slot with a unique marker → applySlots → validateBlock → render
 * through the real hydrateProps and RenderBlocks with renderToStaticMarkup. Then:
 *   (a) every marker appears (interactive lists are rendered with each row active);
 *   (b) no harvested default appears (each component rendered with no props);
 *   (c) none of the known placeholder strings appears;
 *   (d) openers render exactly one <h1>, other sections none;
 *   (e) every href is a fixture page path, tel: or mailto: (or a prose heading anchor);
 *   (f) every img src is a fixture image value.
 * Also composePage for all 14 archetype recipes, the composer's invariants, the
 * validator's refusals, and the slot cleaning rules of section 10.5.
 *
 * Fixture images are /section-images paths and data: URLs (and media: refs whose index
 * entries point at them): outside Next, next/image throws on a remote host.
 *
 * A check that fails only because a renderer fix of section 14.1 has not landed yet
 * (#11 testimonial attribution, #12 empty fan tiles, #13 the hero photo's alt text,
 * #6 media refs in scalar image lists) is reported as XFAIL and does not fail the run;
 * once the fix lands it must pass.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadTs, rootRequire, ROOT } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToStaticMarkup } = rootRequire('react-dom/server')

const { catalog } = loadTs('src/lib/builder/catalog/index.ts')
const { SECTION_META, countFor, clampCount } = loadTs('src/lib/builder/catalog/meta.ts')
const { CHILD_META } = loadTs('src/lib/builder/catalog/children.ts')
const { RECIPES, ARCHETYPE_RULES } = loadTs('src/lib/builder/catalog/recipes.ts')
const { composeSection, composePage, imageSlotsFor, newBlockId, slotImages } = loadTs('src/lib/builder/catalog/compose.ts')
const { applySlots, slotsFor, cleanSlotValue, cutAtSentence } = loadTs('src/lib/builder/catalog/slots.ts')
const { validateBlock, validatePage } = loadTs('src/lib/builder/catalog/validate.ts')
const { ICON_LEXICON } = loadTs('src/lib/builder/catalog/lexicon.ts')
const { BLOCK_KEY } = loadTs('src/lib/builder/look.ts')
const vocab = loadTs('src/lib/builder/design/vocab.ts')
const { getSchema } = loadTs('src/lib/builder/schema.ts')
const { anchorId } = loadTs('src/lib/builder/ids.ts')
const { RenderBlocks } = loadTs('src/lib/builder/render.tsx')
const { setMediaIndex } = loadTs('src/lib/builder/media-store.ts')

// ---------------------------------------------------------------- reporting

let passed = 0
let failed = 0
let expected = 0
const pendingSeen = new Set()
const report = (name, problems, pending) => {
	if (!problems.length) {
		passed++
		return
	}
	const fixes = [...new Set(problems.map((problem) => problem.fix).filter(Boolean))]
	const allPending = problems.every((problem) => problem.fix && pending.has(problem.fix))
	if (allPending) {
		expected++
		fixes.forEach((fix) => pendingSeen.add(fix))
		console.log(`XFAIL ${name}: waits for 14.1 ${fixes.join(', ')} (${problems[0].message.slice(0, 120)})`)
		return
	}
	failed++
	const real = problems.filter((problem) => !(problem.fix && pending.has(problem.fix)))
	console.log(`FAIL ${name}: ${real.slice(0, 4).map((problem) => problem.message.slice(0, 200)).join(' | ')}${real.length > 4 ? ` (+${real.length - 4} more)` : ''}`)
}
const check = (name, fn) => {
	try {
		fn()
		passed++
		console.log(`PASS ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}`)
	}
}

// ---------------------------------------------------------------- fixtures

const IMAGE_FILES = fs.readdirSync(path.join(ROOT, 'public/section-images')).filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
const PATHS = IMAGE_FILES.map((name) => `/section-images/${name}`)
const MEDIA = PATHS.slice(0, 6).map((url, index) => ({ id: `fx${index + 1}`, url }))
const pixel = (rgb) => {
	// A 1×1 PNG of one colour, so each data URL is distinct.
	const zlib = require('node:zlib')
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		return c >>> 0
	})
	const crc = (buf) => {
		let c = 0xffffffff
		for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
		return (c ^ 0xffffffff) >>> 0
	}
	const chunk = (type, data) => {
		const length = Buffer.alloc(4)
		length.writeUInt32BE(data.length)
		const body = Buffer.concat([Buffer.from(type), data])
		const sum = Buffer.alloc(4)
		sum.writeUInt32BE(crc(body))
		return Buffer.concat([length, body, sum])
	}
	const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])
	const raw = Buffer.from([0, ...rgb])
	const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
	return `data:image/png;base64,${png.toString('base64')}`
}
const DATA_URLS = [pixel([200, 80, 40]), pixel([40, 120, 200]), pixel([90, 160, 90])]
setMediaIndex(MEDIA)

// What blocks may store, and what a rendered <img> may show.
const POOL = [...MEDIA.map((item) => `media:${item.id}`), ...PATHS.slice(6), ...DATA_URLS]
const DIRECT_POOL = [...PATHS, ...DATA_URLS]
const RENDERED = new Set([...PATHS, ...DATA_URLS])

const PAGES = [
	{ key: 'p1', name: 'Home', path: '/', archetype: 'home' },
	{ key: 'p2', name: 'Services', path: '/services', archetype: 'services' },
	{ key: 'p3', name: 'Roof Repair', path: '/roof-repair', archetype: 'service' },
	{ key: 'p4', name: 'Roof Replacement', path: '/roof-replacement', archetype: 'service' },
	{ key: 'p5', name: 'Storm Damage', path: '/storm-damage', archetype: 'service' },
	{ key: 'p6', name: 'About', path: '/about', archetype: 'about' },
	{ key: 'p7', name: 'Reviews', path: '/reviews', archetype: 'reviews' },
	{ key: 'p8', name: 'FAQ', path: '/faq', archetype: 'faq' },
	{ key: 'p9', name: 'Contact', path: '/contact', archetype: 'contact' },
]
// More service pages, so a related-card grid can be composed at every count it allows.
const MORE_SERVICES = ['Gutters', 'Skylights', 'Metal Roofs', 'Inspections', 'Siding'].map((name, index) => ({
	key: `p${10 + index}`, name, path: `/${name.toLowerCase().replace(/\s+/g, '-')}`, archetype: 'service',
}))
const SERVICE_PAGES = [...PAGES.filter((page) => page.archetype === 'service'), ...MORE_SERVICES]
const OTHER_PAGES = PAGES.filter((page) => page.archetype !== 'service')
const PHONE = { display: '(512) 555-0142', href: 'tel:+15125550142' }
const EMAIL = { display: 'hello@summitroofing.test', href: 'mailto:hello@summitroofing.test' }
const FACTS = [
	{ value: 'Since 2004', label: 'Family-owned in Austin' },
	{ value: '2,000+', label: 'Roofs replaced' },
	{ value: '48 hours', label: 'From inspection to written estimate' },
	{ value: '12', label: 'Crew leads on staff' },
	{ value: '3', label: 'Counties served' },
	{ value: '1', label: 'Point of contact per job' },
]
const CONTACT_FACTS = [
	{ label: 'Phone', value: PHONE.display },
	{ label: 'Email', value: EMAIL.display },
	{ label: 'Address', value: '1200 Barton Springs Rd, Austin, TX 78704' },
	{ label: 'Hours', value: 'Monday to Friday 7:00 to 18:00' },
	{ label: 'Areas served', value: 'Austin, Round Rock, Cedar Park' },
	{ label: 'Prices', value: 'Free inspections' },
]
const TICKER = ['Roof repair', 'Roof replacement', 'Storm damage', 'Gutters', 'Skylights', 'Inspections', 'Insurance claims', 'Metal roofs', 'Attic ventilation', 'Chimney flashing', 'Siding', 'Soffits']
const REVIEWS = Array.from({ length: 12 }, (_, index) => ({
	quote: `They fixed the leak over our kitchen in one visit and cleaned up every nail, review number ${index + 1}.`,
	name: `Reviewer ${String.fromCharCode(65 + index)}.`,
	role: index % 3 === 0 ? '' : `Homeowner, Round Rock ${index}`,
	source: index % 2 === 0 ? '' : 'Google review',
}))
const PERSONALITIES = [...vocab.PERSONALITY_IDS]

function makeCtx(overrides = {}) {
	return {
		personality: 'rugged',
		polarity: 'light',
		primary: { label: 'Free inspection', href: '/contact' },
		secondaryFor: (archetype) =>
			archetype === 'contact' || archetype === 'landing' ? null
				: archetype === 'services' ? { href: '/roof-repair', meaning: 'the first service page' }
					: archetype === 'pricing' ? { href: '/faq', meaning: 'the FAQ' }
						: { href: '/services', meaning: 'all roofing services' },
		phone: PHONE,
		email: EMAIL,
		pages: PAGES,
		facts: FACTS,
		contactFacts: CONTACT_FACTS,
		ticker: TICKER,
		announcement: 'Free roof inspections through May',
		images: () => [],
		reviews: () => [],
		...overrides,
	}
}

const VALIDATE = {
	pagePaths: [...PAGES, ...MORE_SERVICES].map((page) => page.path),
	email: EMAIL.display,
	mediaIds: new Set(MEDIA.map((item) => item.id)),
	imageValues: new Set(DIRECT_POOL),
	reviews: REVIEWS,
}

// ---------------------------------------------------------------- the renderer's fixes still pending (section 14.1)

const renderBlocks = (blocks) => renderToStaticMarkup(React.createElement(RenderBlocks, { blocks, linkBase: '' }))
const pending = new Set()
{
	const card = { id: 'blk_probe00001', type: 'grid', variant: 'centered', props: { columns: '3' }, children: [{ id: 'blk_probe00002', type: 'testimonial-card', variant: 'card', props: { quote: 'A real quote from a customer.', name: 'Pat' } }] }
	if (/Role Or Title|Company Name/.test(renderBlocks([card]))) pending.add('#11')
	const hero = { id: 'blk_probe00003', type: 'split-hero', variant: 'split', props: { title: 't', eyebrow: 'e', description: 'd', actions: [], backdrop: [], mediaSrc: PATHS[0], mediaLabel: 'probe photo label' } }
	const html = renderBlocks([hero])
	if (/>Image 1</.test(html)) pending.add('#12')
	if (!/alt="probe photo label"/.test(html)) pending.add('#13')
	try {
		const fan = renderBlocks([{ ...hero, props: { ...hero.props, backdrop: MEDIA.slice(0, 5).map((item) => `media:${item.id}`) } }])
		if (/src="media:/.test(fan) || /url=media%3A/.test(fan)) pending.add('#6')
	} catch {
		pending.add('#6')
	}
	console.log(pending.size ? `Renderer fixes not landed yet: ${[...pending].join(' ')} (their checks report XFAIL)` : 'Renderer fixes of 14.1 #6, #11, #12, #13 are in.')
}

// ---------------------------------------------------------------- harvested defaults (b)

const decode = (text) =>
	text.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
const textNodes = (html) =>
	html
		.split(/<[^>]*>/)
		.map((node) => decode(node).replace(/\s+/g, ' ').trim())
		.filter((node) => node.length >= 3)

// Words the kit hard-codes as structure, not sample content: they render on real pages too.
const STRUCTURAL = new Set(['Read', 'Previous', 'Next', 'Recommended'])
const HARVEST = new Map() // default text → the type it came from
{
	const add = (type, html) => {
		for (const node of textNodes(html)) if (!STRUCTURAL.has(node) && !HARVEST.has(node)) HARVEST.set(node, type)
	}
	for (const [type, meta] of Object.entries(SECTION_META)) {
		if (meta.ai === 'never') continue
		const schema = getSchema(type)
		for (const variant of schema.variants ?? [{ id: undefined }]) {
			const block = { id: `blk_harvest${String(HARVEST.size).padStart(3, '0')}`, type, ...(variant.id ? { variant: variant.id } : {}), props: {} }
			if (schema.container) {
				const kinds = [schema.container.defaultChild, ...Object.keys(CHILD_META)]
				for (const kind of new Set(kinds)) {
					for (const childVariant of getSchema(kind).variants ?? [{}]) {
						const children = Array.from({ length: 3 }, (_, index) => ({ id: `blk_h${index}`, type: kind, ...(childVariant.id ? { variant: childVariant.id } : {}) }))
						add(type, renderBlocks([{ ...block, children }]))
					}
				}
			} else add(type, renderBlocks([block]))
		}
	}
}

const PLACEHOLDERS = ['Image 1', 'Lorem', 'Client Name', 'Role Or Title', 'Company Name', 'Acme', 'Book An Assessment', 'Eyebrow Badge', 'Detail Label', 'See What All The Hype Is About', 'Media slot', 'Form slot', 'Primary Button', 'Secondary Button', 'Main Image', 'This is the']
const FIX_OF = { 'Role Or Title': '#11', 'Company Name': '#11', 'Image 1': '#12', 'Image 2': '#12', 'Image 3': '#12', 'Image 4': '#12', 'Image 5': '#12' }

// ---------------------------------------------------------------- filling and rendering

let tokenCount = 0
const ICONS = ['House', 'Hammer', 'Wrench', 'Droplets', 'Search', 'Siren', 'Sparkles', 'Flame', 'Snowflake', 'Zap', 'Sun', 'Leaf', 'Shovel', 'Truck']
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** Unique markers for every slot; icons get real, distinct names. */
function markerValues(slots) {
	const values = new Map()
	const markers = new Map() // marker → slot id
	const icons = new Map() // slot id → icon
	const iconIndex = new Map()
	for (const slot of slots) {
		if (slot.kind === 'icon') {
			const section = slot.id.split('.')[0]
			const at = iconIndex.get(section) ?? 0
			iconIndex.set(section, at + 1)
			const icon = ICONS[at % ICONS.length]
			values.set(slot.id, icon)
			icons.set(slot.id, icon)
			continue
		}
		const token = `⟦m${++tokenCount}⟧`
		markers.set(token, slot.id)
		if (slot.kind === 'richtext') values.set(slot.id, `${token} [[hl]]`)
		else if (slot.kind === 'question') values.set(slot.id, `${token}?`)
		else if (slot.kind === 'prose') {
			const heads = [1, 2, 3].map(() => `⟦m${++tokenCount}⟧`)
			for (const head of heads) markers.set(head, `${slot.id} (heading)`)
			values.set(slot.id, `<p>${token}</p>${heads.map((head) => `<h2>Part ${head}</h2><p>Body.</p>`).join('')}`)
		} else values.set(slot.id, token)
	}
	return { values, markers, icons }
}

const INTERACTIVE = { 'tabs-showcase': 'items', 'faq-accordion': 'faqs', 'media-gallery': 'items' }

/** Renders, plus one render per row for lists that show only the active row (tabs, accordions, galleries). */
function renders(blocks) {
	const out = [renderBlocks(blocks)]
	blocks.forEach((block, index) => {
		const list = INTERACTIVE[block.type]
		const rows = block.props?.[list]
		if (!Array.isArray(rows)) return
		for (let shift = 1; shift < rows.length; shift++) {
			const rotated = { ...block, props: { ...block.props, [list]: [...rows.slice(shift), ...rows.slice(0, shift)] } }
			out.push(renderBlocks(blocks.map((item, at) => (at === index ? rotated : item))))
		}
	})
	return out
}

function imageSrcs(html) {
	return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((match) => {
		const src = decode(match[1])
		if (src.startsWith('/_next/image?')) return decodeURIComponent(new URLSearchParams(src.split('?')[1]).get('url') ?? '')
		return src
	})
}

/** Checks (a)-(f) on rendered blocks. */
function inspect(blocks, filled, { openers }) {
	const problems = []
	const add = (message, fix) => problems.push({ message, fix })
	let htmls
	try {
		htmls = renders(blocks)
	} catch (error) {
		add(`render threw: ${error.message.split('\n')[0]}`, blocks.some((block) => block.type === 'split-hero' && block.props?.backdrop?.some((src) => String(src).startsWith('media:'))) ? '#6' : undefined)
		return problems
	}
	const all = htmls.join('\n')
	// (a) every marker appears.
	for (const [marker, id] of filled.markers) {
		if (all.includes(marker)) continue
		const hero = blocks.find((block) => block.type === 'split-hero')
		add(`marker for ${id} is missing`, hero && /\.mediaLabel$/.test(id) ? '#13' : undefined)
	}
	for (const [id, icon] of filled.icons) if (!all.includes(`lucide-${kebab(icon)}`)) add(`icon ${icon} for ${id} did not render`)
	for (const html of htmls) {
		const nodes = textNodes(html)
		const text = nodes.join(' \n ')
		// (b) harvested defaults.
		for (const node of nodes) {
			if (HARVEST.has(node)) add(`default "${node}" (${HARVEST.get(node)}) rendered`, FIX_OF[node])
		}
		for (const [value, type] of HARVEST) if (value.length >= 12 && text.includes(value) && !nodes.includes(value)) add(`default "${value}" (${type}) rendered`, FIX_OF[value])
		// (c) known placeholders.
		for (const placeholder of PLACEHOLDERS) if (html.includes(placeholder)) add(`placeholder "${placeholder}" rendered`, FIX_OF[placeholder])
		if (/\[\[|\]\]/.test(text)) add('literal [[brackets]] rendered')
		// (d) one H1, on openers only.
		const h1 = (html.match(/<h1[\s>]/g) ?? []).length
		if (h1 !== openers) add(`${h1} <h1> elements, wants ${openers}`)
		// (e) hrefs.
		const anchors = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => `#${match[1]}`))
		for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
			const href = decode(match[1])
			const ok = VALIDATE.pagePaths.includes(href) || href === PHONE.href || href === EMAIL.href || (href.startsWith('#') && href.length > 1 && anchors.has(href))
			if (!ok) add(`href "${href}" is not a fixture page, tel: or mailto:`)
		}
		// (f) images.
		for (const src of imageSrcs(html)) if (!RENDERED.has(src)) add(`img src "${src.slice(0, 60)}" is not a fixture image`)
		if (/Unknown section type|could not render/.test(html)) add('a section did not render')
	}
	return problems
}

// (g) Every text field the variant renders is filled: a slot nobody wrote leaves an empty
// element even where the kit has no default to leak. Fields behind a switch that is off,
// a variant's `hides`, and attribution the owner's review may not have are exempt.
const SWITCHED = { 'stat-hero': { showLink: ['linkLabel', 'linkHref'] }, 'detail-card': { showNote: ['note'] } }
const OPTIONAL = { 'testimonial-card': ['role', 'company'] }
const TEXTISH = new Set(['text', 'textarea', 'richtext', 'prose'])
function unfilled(block) {
	const missing = []
	const schema = getSchema(block.type)
	const meta = SECTION_META[block.type] ?? CHILD_META[block.type]
	const variant = meta?.variants.find((item) => item.id === (block.variant ?? 'default'))
	const hidden = new Set([...(variant?.hides ?? []), ...(OPTIONAL[block.type] ?? [])])
	for (const [toggle, keys] of Object.entries(SWITCHED[block.type] ?? {})) if (block.props?.[toggle] !== true) keys.forEach((key) => hidden.add(key))
	const walk = (fields, props, at, pattern) => {
		for (const field of fields) {
			const name = `${pattern}${field.key}`
			if (hidden.has(name)) continue
			const value = props?.[field.key]
			if (TEXTISH.has(field.type)) {
				if (typeof value !== 'string' || !value.trim()) missing.push(`${at}${field.key}`)
			} else if (field.type === 'group') walk(field.of ?? [], value, `${at}${field.key}.`, `${name}.`)
			else if (field.type === 'list' && Array.isArray(value)) {
				const scalar = field.of?.length === 1 && field.of[0].key === 'value'
				if (scalar) value.forEach((item, index) => TEXTISH.has(field.of[0].type) && (typeof item !== 'string' || !item.trim()) && missing.push(`${at}${field.key}.${index}`))
				else value.forEach((row, index) => walk(field.of ?? [], row, `${at}${field.key}.${index}.`, `${name}[].`))
			}
		}
	}
	walk(schema.fields, block.props, '', '')
	block.children?.forEach((child, index) => missing.push(...unfilled(child).map((item) => `c${index}.${item}`)))
	return missing
}

const stripIds = (value) => JSON.parse(JSON.stringify(value, (key, item) => (key === 'id' ? undefined : item)))

/** Images for a section's slots, from the fixture pool (direct paths for the fan while #6 is pending). */
function assignImages(section, offset = 0) {
	const slots = imageSlotsFor(section)
	return slots.map((slot, index) => {
		const fan = slot.path.startsWith('backdrop.')
		const pool = fan && pending.has('#6') ? DIRECT_POOL : POOL
		return { path: slot.path, ref: `img${index + 1}`, value: pool[(index + offset) % pool.length], shows: `Photo ${index + 1} of a roofing job` }
	})
}

/** One layout case: compose on every allowed surface, fill, apply, validate, render. */
function runCase(name, spec, ctx) {
	const problems = []
	let composed
	try {
		const surfaces = SECTION_META[spec.type].surfaces
		const versions = surfaces.map((surface) => composeSection({ ...spec, surface }, ctx))
		composed = versions[0]
		const shape = JSON.stringify(stripIds(versions[0].block))
		for (const version of versions.slice(1))
			if (JSON.stringify(stripIds(version.block)) !== shape) problems.push({ message: `the surface changed the block (${version.block.type})` })
	} catch (error) {
		report(name, [{ message: `compose threw: ${error.message}` }], pending)
		return null
	}
	const extra = []
	if (spec.type === 'table-of-contents') {
		// A table of contents lists the headings of the prose after it.
		extra.push(composeSection({ ...spec, key: `${spec.key}b`, layout: 'prose-block:marked', type: 'prose-block', variant: 'marked', items: 0, child: null, tweaks: [] }, ctx))
	}
	const sections = [composed, ...extra]
	const slots = sections.flatMap((section) => section.slots)
	const filled = markerValues(slots)
	const applied = applySlots(sections.map((section) => section.block), slots, filled.values, () => [])
	for (const problem of applied.problems) problems.push({ message: `slot ${problem.slot.id}: ${problem.problems.join(', ')}` })
	for (const block of applied.blocks) {
		for (const problem of validateBlock(block, VALIDATE)) problems.push({ message: `invalid: ${problem}` })
		for (const field of unfilled(block)) problems.push({ message: `${block.type}.${field} renders empty` })
	}
	const openers = SECTION_META[spec.type].roles.includes('opener') ? 1 : 0
	problems.push(...inspect(applied.blocks, filled, { openers }))
	report(name, problems, pending)
	return { composed, applied }
}

// ---------------------------------------------------------------- every layout

const pageFor = (meta) => {
	const archetype = meta.pages === 'all' ? 'service' : meta.pages[0]
	const page = PAGES.find((item) => item.archetype === archetype) ?? { key: 'px', path: '/services', archetype }
	return { key: page.key, path: page.path, archetype }
}

let cases = 0
let personalityAt = 0
const nextPersonality = () => PERSONALITIES[personalityAt++ % PERSONALITIES.length]
const countsOf = (count) => [...new Set([count.min, count.ideal, count.max].map((value) => clampCount(count, value)))]

for (const layout of vocab.LAYOUT_IDS) {
	const [type, variantId] = layout.split(':')
	const meta = SECTION_META[type]
	const variant = variantId === 'default' ? null : variantId
	const rule = countFor(meta.items, variant)
	const page = pageFor(meta)
	const needsPhoto = (meta.images ?? []).some((need) => need.required && !need.tweak)
	const photoModes = needsPhoto ? [true] : (meta.images ?? []).length ? [true, false] : [false]
	const kinds = meta.children ? meta.children.kinds : [null]

	for (const kind of kinds) {
		const childType = kind?.split(':')[0]
		for (const count of rule ? countsOf(rule) : [0]) {
			for (const photos of childType === 'media-card' ? [true] : photoModes) {
				for (const tweak of [null, ...meta.tweaks]) {
					// Tweaks once each, at the typical count; base cases at every count.
					if (tweak && rule && count !== clampCount(rule, rule.ideal)) continue
					const personality = nextPersonality()
					const facts = type === 'stat-hero' || type === 'stat-band' ? FACTS.slice(0, Math.max(count, 3) === 2 ? 2 : count) : FACTS
					// Related cards are one per real page: from the home page, `count` service pages.
					const related = childType === 'related-card'
					const ctx = makeCtx({
						personality,
						polarity: personality === 'technical' || personality === 'bold' ? 'dark' : 'light',
						page: related ? { key: 'p1', path: '/', archetype: 'home' } : page,
						pages: related ? [...OTHER_PAGES, ...SERVICE_PAGES.slice(0, Math.max(count, 2))] : PAGES,
						facts: type === 'stat-hero' ? FACTS.slice(0, count) : type === 'stat-band' ? FACTS.slice(0, count) : facts,
						contactFacts: type === 'detail-card' ? CONTACT_FACTS.slice(0, count) : CONTACT_FACTS,
						ticker: type === 'chips' || type === 'marquee' ? TICKER.slice(0, count) : TICKER,
					})
					const spec = {
						key: `s${++cases}`,
						layout,
						type,
						variant,
						items: count,
						child: kind,
						surface: 'plain',
						tweaks: tweak ? [tweak] : [],
						job: 'Fixture job.',
						images: [],
						reviews: childType === 'testimonial-card' ? REVIEWS.slice(0, count) : [],
					}
					if (photos) spec.images = assignImages(spec, cases)
					runCase(`${layout}${kind ? `+${kind}` : ''} ×${count}${tweak ? ` +${tweak}` : ''}${photos ? ' photos' : ''} (${personality})`, spec, ctx)
				}
			}
		}
	}
}
console.log(`${cases} layout cases`)

// ---------------------------------------------------------------- every recipe as a page

for (const archetype of vocab.ARCHETYPES) {
	const page = PAGES.find((item) => item.archetype === archetype) ?? { key: 'px', name: archetype, path: '/services', archetype }
	const ctx = makeCtx({ personality: nextPersonality() })
	const sections = RECIPES[archetype].map((step, index) => {
		const alternative = step.alternatives[0]
		const [type, variantId] = alternative.layout.split(':')
		const meta = SECTION_META[type]
		const variant = variantId === 'default' ? null : variantId
		const rule = countFor(meta.items, variant)
		const child = alternative.child ?? meta.children?.default ?? null
		const items = rule ? clampCount(rule, rule.ideal) : 0
		const section = {
			key: `s${index + 1}`,
			layout: alternative.layout,
			type,
			variant,
			label: alternative.layout,
			job: 'Fixture job.',
			items,
			child,
			surface: alternative.surface ?? 'plain',
			tweaks: alternative.tweaks ?? [],
			images: [],
			reviews: child?.startsWith('testimonial-card') ? [0, 1, 2, 3] : [],
		}
		return section
	})
	const images = new Map(sections.map((section, index) => [section.key, assignImages(section, index * 3)]))
	const pageCtx = { ...ctx, images: (key) => images.get(key) ?? [], reviews: (key) => (sections.find((section) => section.key === key)?.reviews ?? []).map((at) => REVIEWS[at]) }
	const normalized = {
		key: page.key, id: 'pg_0123456789', name: page.name, slug: page.path === '/' ? '/' : page.path.slice(1), path: page.path,
		archetype, purpose: 'Fixture page.', keyword: 'roofing Austin', inMenu: true, outlined: true,
		openerHint: null, closerHint: null, photoAllocation: [], sections,
	}
	const problems = []
	try {
		const composed = composePage(normalized, pageCtx)
		const slots = composed.sections.flatMap((section) => section.slots)
		const filled = markerValues(slots)
		const applied = applySlots(composed.blocks, slots, filled.values, () => [])
		for (const problem of applied.problems) problems.push({ message: `slot ${problem.slot.id}: ${problem.problems.join(', ')}` })
		for (const entry of validatePage(applied.blocks, { ...VALIDATE, archetype })) problems.push({ message: `invalid ${entry.blockId || 'page'}: ${entry.problems.join('; ')}` })
		for (const block of applied.blocks) for (const field of unfilled(block)) problems.push({ message: `${block.type}.${field} renders empty` })
		const count = applied.blocks.length
		const rule = ARCHETYPE_RULES[archetype]
		if (count < rule.min || count > rule.max + 1) problems.push({ message: `${count} sections, the archetype wants ${rule.min}-${rule.max}` })
		problems.push(...inspect(applied.blocks, filled, { openers: 1 }))
	} catch (error) {
		problems.push({ message: `threw: ${error.message}` })
	}
	report(`recipe ${archetype} as a page`, problems, pending)
}

// ---------------------------------------------------------------- the composer's invariants

const ctx = makeCtx({ page: { key: 'p3', path: '/roof-repair', archetype: 'service' } })
const baseSpec = (layout, extra = {}) => {
	const [type, variant] = layout.split(':')
	return { key: 's1', layout, type, variant: variant === 'default' ? null : variant, items: 0, child: null, surface: 'plain', tweaks: [], job: '', images: [], reviews: [], ...extra }
}

check('block ids are blk_ plus 10 hex and pass BLOCK_KEY; children get their own', () => {
	for (let index = 0; index < 50; index++) assert.match(newBlockId(), /^blk_[0-9a-f]{10}$/)
	const section = composeSection(baseSpec('grid:centered', { items: 6, child: 'feature-card:numbered' }), ctx)
	const ids = [section.block.id, ...section.block.children.map((child) => child.id)]
	assert.equal(new Set(ids).size, ids.length)
	for (const id of ids) assert.ok(BLOCK_KEY.test(id), id)
	section.block.children.forEach((child, index) => assert.equal(child.props.index, index + 1))
})

check('slot ids address rows and children, and links name the full slot id', () => {
	const faq = composeSection(baseSpec('faq-accordion:split', { items: 5 }), ctx)
	assert.ok(faq.slots.some((slot) => slot.id === 's1.faqs.4.answer' && slot.path.join('.') === 'faqs.4.answer'))
	assert.equal(faq.block.props.faqs.length, 5)
	const grid = composeSection(baseSpec('grid:centered', { items: 3 }), ctx)
	const childSlot = grid.slots.find((slot) => slot.id === 's1.c2.title')
	assert.ok(childSlot && childSlot.blockId === grid.block.children[2].id && childSlot.path.join() === 'title')
	const hero = composeSection(baseSpec('page-hero:left'), ctx)
	assert.deepEqual(hero.links.map((link) => link.slot), ['s1.actions.0.label', 's1.actions.1.label'])
	assert.equal(hero.links[0].href, '/contact')
	assert.equal(hero.links[1].href, '/services')
})

check('buttons go to the primary action and a different secondary page, never the page itself', () => {
	const home = makeCtx({ page: { key: 'p2', path: '/services', archetype: 'services' }, secondaryFor: () => ({ href: '/services', meaning: 'itself' }) })
	const hero = composeSection(baseSpec('page-hero:centered'), home)
	assert.equal(hero.block.props.actions.length, 1, 'a secondary target that is the page itself is dropped')
	const one = composeSection(baseSpec('page-hero:centered', { tweaks: ['one-button'] }), ctx)
	assert.equal(one.block.props.actions.length, 1)
	assert.deepEqual(composeSection(baseSpec('page-hero:centered', { tweaks: ['no-buttons'] }), ctx).block.props.actions, [])
	const band = composeSection(baseSpec('cta-band:centered'), ctx)
	assert.equal(band.block.props.actions[1].href, PHONE.href, 'the closer offers the phone')
	const split = composeSection(baseSpec('split-cta:cards'), makeCtx({ personality: 'refined', page: { key: 'p6', path: '/about', archetype: 'about' } }))
	assert.equal(split.block.props.paths[1].href, '/services', 'a refined brand gets the secondary page')
	assert.equal(composeSection(baseSpec('split-cta:cards'), ctx).block.props.paths[1].href, PHONE.href, 'a call-led brand gets the phone')
	const tel = composeSection(baseSpec('cta-band:card'), makeCtx({ primary: { label: 'Call now', href: PHONE.href } }))
	assert.equal(tel.block.props.actions[0].icon, 'Phone')
	assert.notEqual(tel.block.props.actions[1]?.href, PHONE.href, 'never the phone twice')
})

check('owner data is placed verbatim and only when there is enough of it', () => {
	const hero = composeSection(baseSpec('page-hero:centered', { tweaks: ['hero-stats'] }), ctx)
	assert.deepEqual(hero.block.props.stats, FACTS.slice(0, 3))
	assert.deepEqual(composeSection(baseSpec('page-hero:centered', { tweaks: ['hero-stats'] }), makeCtx({ facts: FACTS.slice(0, 1) })).block.props.stats, [])
	assert.deepEqual(composeSection(baseSpec('page-hero:centered'), ctx).block.props.stats, [])
	assert.equal(composeSection(baseSpec('stat-band:divided', { items: 6 }), ctx).block.props.stats.length, 6)
	assert.equal(composeSection(baseSpec('stat-band:divided', { items: 4 }), ctx).block.props.stats.length, 3)
	assert.equal(composeSection(baseSpec('stat-hero:cards'), makeCtx({ facts: FACTS.slice(0, 3) })).block.props.stats.length, 2)
	assert.equal(composeSection(baseSpec('stat-hero:cards'), ctx).block.props.showLink, false, 'the default hype link is switched off')
	const reviews = composeSection(baseSpec('carousel:bars', { child: 'testimonial-card:card', reviews: REVIEWS.slice(0, 1) }), ctx)
	assert.equal(reviews.block.props.size, 'full')
	assert.equal(reviews.block.children[0].variant, 'bare')
	assert.equal(reviews.block.children[0].props.featured, true)
	assert.equal(reviews.block.children[0].props.quote, REVIEWS[0].quote)
	assert.ok(!('role' in reviews.block.children[0].props), 'an empty role is left out, never defaulted')
	const related = composeSection(baseSpec('grid:centered', { child: 'related-card:list' }), makeCtx({ page: { key: 'p2', path: '/services', archetype: 'services' } }))
	assert.deepEqual(related.block.children.map((child) => child.props.href), ['/roof-repair', '/roof-replacement', '/storm-damage'])
	const detail = composeSection(baseSpec('detail-card:card', { items: 5 }), ctx)
	assert.deepEqual(detail.block.props.details, CONTACT_FACTS.slice(0, 5))
	assert.equal(detail.block.props.action.href, PHONE.href)
	assert.equal(detail.block.props.showNote, false)
	const ticker = composeSection(baseSpec('marquee:inline', { child: 'client-logo:wordmark' }), ctx)
	assert.deepEqual(ticker.block.children.map((child) => child.props.name), TICKER.slice(0, 12))
	assert.ok(ticker.block.children.every((child) => !child.props.src))
})

check('structure follows the counts that fill the grid', () => {
	assert.deepEqual(composeSection(baseSpec('bento-grid:accent', { items: 6 }), ctx).block.props.tiles.map((tile) => tile.span), ['2', '1', '1', '2', '2', '1'])
	assert.deepEqual(composeSection(baseSpec('bento-grid:accent', { items: 8, tweaks: ['cols-4'] }), ctx).block.props.tiles.map((tile) => tile.span), ['2', '1', '1', '2', '1', '1', '2', '2'])
	assert.equal(composeSection(baseSpec('bento-grid:accent', { items: 8 }), ctx).block.props.tiles.length, 6, 'eight tiles need four columns')
	assert.equal(composeSection(baseSpec('process-steps:columns', { items: 5 }), ctx).block.props.steps.length, 3)
	assert.deepEqual(composeSection(baseSpec('process-steps:timeline', { items: 4 }), ctx).block.props.steps.map((step) => step.number), ['01', '02', '03', '04'])
	assert.equal(composeSection(baseSpec('grid:centered', { items: 4, child: 'feature-card:card' }), ctx).block.props.columns, '2')
	assert.equal(composeSection(baseSpec('grid:centered', { items: 4, child: 'feature-card:card', tweaks: ['cols-4'] }), ctx).block.props.columns, '4')
	assert.equal(composeSection(baseSpec('grid:centered', { items: 6, child: 'feature-card:inline' }), ctx).block.props.columns, '3')
	assert.equal(composeSection(baseSpec('grid:beside', { items: 3, child: 'feature-card:inline' }), ctx).block.children.length, 4)
	const faq = composeSection(baseSpec('faq-accordion:split', { items: 3 }), makeCtx({ page: { key: 'p8', path: '/faq', archetype: 'faq' } }))
	assert.equal(faq.block.props.faqs.length, 6, 'six questions per group on the FAQ page')
	assert.equal(faq.block.props.openFirst, true)
	const before = composeSection(baseSpec('before-after:rows', { items: 5 }), makeCtx({ personality: 'luxe' }))
	assert.equal(before.block.props.before.length, 4)
	assert.equal(before.block.props.after.length, 4)
	assert.equal(before.block.props.before[0].icon, 'Minus')
})

check('photos land at their slots; the fan is all five or none', () => {
	const spec = baseSpec('split-hero:split', { tweaks: ['fan'] })
	const slots = imageSlotsFor(spec)
	assert.deepEqual(slots.map((slot) => slot.path), ['mediaSrc', 'backdrop.0', 'backdrop.1', 'backdrop.2', 'backdrop.3', 'backdrop.4'])
	const full = composeSection({ ...spec, images: slots.map((slot, index) => ({ path: slot.path, ref: `img${index}`, value: DIRECT_POOL[index], shows: '' })) }, ctx)
	assert.equal(full.block.props.mediaSrc, DIRECT_POOL[0])
	assert.deepEqual(full.block.props.backdrop, DIRECT_POOL.slice(1, 6))
	const short = composeSection({ ...spec, images: slots.slice(0, 4).map((slot, index) => ({ path: slot.path, ref: `img${index}`, value: DIRECT_POOL[index], shows: '' })) }, ctx)
	assert.deepEqual(short.block.props.backdrop, [], 'three fan photos are no fan')
	assert.deepEqual(composeSection(baseSpec('split-hero:split'), ctx).block.props.backdrop, [])
	const compare = composeSection({ ...baseSpec('image-compare:stacked'), images: [{ path: 'before.src', ref: 'a', value: PATHS[0], shows: '' }, { path: 'after.src', ref: 'b', value: PATHS[1], shows: '' }] }, ctx)
	assert.equal(compare.block.props['before.src'], PATHS[0])
	assert.equal(compare.block.props['after.src'], PATHS[1])
	const bento = baseSpec('bento-grid:accent', { items: 6, tweaks: ['tile-images'] })
	const tiles = imageSlotsFor(bento)
	assert.deepEqual(tiles.map((slot) => slot.path), ['tiles.0.image', 'tiles.3.image', 'tiles.4.image'])
	const placed = composeSection({ ...bento, images: tiles.map((slot, index) => ({ path: slot.path, ref: `img${index}`, value: PATHS[index], shows: '' })) }, ctx)
	assert.deepEqual(placed.block.props.tiles.map((tile) => tile.mediaSide ?? null), ['right', null, null, 'left', 'right', null])
	// Images without concrete paths fill the slots in order.
	const generic = composeSection({ ...baseSpec('feature-rows:alternating', { items: 2 }), images: [{ path: 'rows[].image', ref: 'a', value: PATHS[2], shows: '' }, { path: 'rows[].image', ref: 'b', value: PATHS[3], shows: '' }] }, ctx)
	assert.deepEqual(generic.block.props.rows.map((row) => row.image), [PATHS[2], PATHS[3]])
	const media = imageSlotsFor(baseSpec('masonry:above', { items: 6, child: 'media-card:bare' }))
	assert.equal(media.length, 6)
	assert.ok(media.every((slot) => /^c\d\.src$/.test(slot.path) && slot.aspect === 'any'))
})

check('alt and caption slots are paired with the photo they describe', () => {
	const shows = (spec) => {
		const slots = imageSlotsFor(spec)
		const section = composeSection({ ...spec, images: slots.map((slot, index) => ({ path: slot.path, ref: `img${index}`, value: DIRECT_POOL[index], shows: `shows ${slot.path}` })) }, ctx)
		return Object.fromEntries(slotImages(section).map((item) => [item.slot, item.shows]))
	}
	assert.deepEqual(shows(baseSpec('split-hero:split', { tweaks: ['fan'] })), { 's1.mediaLabel': 'shows mediaSrc' })
	assert.deepEqual(shows(baseSpec('image-compare:stacked')), { 's1.before.alt': 'shows before.src', 's1.after.alt': 'shows after.src' })
	const gallery = shows(baseSpec('media-gallery:bottom', { items: 4 }))
	assert.equal(gallery['s1.items.2.alt'], 'shows items.2.src')
	assert.equal(gallery['s1.items.3.caption'], 'shows items.3.src')
	assert.equal(shows(baseSpec('grid:centered', { items: 3, child: 'media-card:card' }))['s1.c1.caption'], 'shows c1.src')
	assert.deepEqual(shows(baseSpec('figure:below')), { 's1.alt': 'shows src', 's1.caption': 'shows src' })
})

check('a table of contents lists the written <h2>s of the prose after it', () => {
	const toc = composeSection(baseSpec('table-of-contents:card'), ctx)
	const prose = composeSection({ ...baseSpec('prose-block:marked'), key: 's2' }, makeCtx({ page: { key: 'px', path: '/services', archetype: 'article' } }))
	assert.equal(prose.slots[0].max, 12000, 'an article body may run to 12,000 characters')
	const values = new Map([['s1.title', 'In this guide'], ['s2.body', '<h1>Big</h1><p>Intro with <a href="javascript:alert(1)">a link</a>.</p><h2>Signs of a leak</h2><p>One.</p><h2>What we check</h2><h2>Costs &amp; timing</h2>']])
	const applied = applySlots([toc.block, prose.block], [...toc.slots, ...prose.slots], values, () => [])
	assert.deepEqual(applied.problems, [])
	assert.deepEqual(applied.blocks[0].props.items.map((item) => item.label), ['Big', 'Signs of a leak', 'What we check', 'Costs & timing'])
	assert.ok(!/<a\b|javascript/i.test(applied.blocks[1].props.body))
	assert.deepEqual(validatePage(applied.blocks, VALIDATE).filter((entry) => entry.blockId === applied.blocks[0].id), [])
})

// ---------------------------------------------------------------- the validator refuses what must not ship

const valid = () => {
	const section = composeSection({ ...baseSpec('page-hero:left') }, ctx)
	const filled = markerValues(section.slots)
	return applySlots([section.block], section.slots, filled.values, () => []).blocks[0]
}
const grid = () => {
	const section = composeSection(baseSpec('grid:centered', { items: 3, child: 'feature-card:numbered' }), ctx)
	return applySlots([section.block], section.slots, markerValues(section.slots).values, () => []).blocks[0]
}

check('validateBlock passes a written block and names what is wrong with a broken one', () => {
	assert.deepEqual(validateBlock(valid(), VALIDATE), [])
	const empty = valid()
	delete empty.props.description
	assert.ok(validateBlock(empty, VALIDATE).some((problem) => /description: slot is empty/.test(problem)))
	const link = valid()
	link.props.actions[0].href = '/nowhere'
	assert.ok(validateBlock(link, VALIDATE).some((problem) => /not a page/.test(problem)))
	const script = valid()
	script.props.actions[0].href = 'javascript:alert(1)'
	assert.ok(validateBlock(script, VALIDATE).length)
	const mail = valid()
	mail.props.actions[0].href = 'mailto:someone@else.test'
	assert.ok(validateBlock(mail, VALIDATE).some((problem) => /business email/.test(problem)))
	const shortPhone = valid()
	shortPhone.props.actions[0].href = 'tel:123'
	assert.ok(validateBlock(shortPhone, VALIDATE).length)
	const lists = valid()
	delete lists.props.stats
	assert.ok(validateBlock(lists, VALIDATE).some((problem) => /stats: must be set/.test(problem)))
	const icon = valid()
	icon.props.actions[0].icon = 'createLucideIcon'
	assert.ok(validateBlock(icon, VALIDATE).some((problem) => /canonical/.test(problem)))
	const variant = valid()
	variant.variant = 'wide'
	assert.ok(validateBlock(variant, VALIDATE).length)
	const numbered = grid()
	numbered.children[1].props.index = 1
	assert.ok(validateBlock(numbered, VALIDATE).some((problem) => /index 2/.test(problem)))
	const misfit = grid()
	misfit.children.pop()
	assert.ok(validateBlock(misfit, VALIDATE).some((problem) => /children/.test(problem)))
})

check('validateBlock refuses sample media, foreign photos, altered reviews and holes', () => {
	const spot = composeSection({ ...baseSpec('spotlight:split'), images: [{ path: 'mediaSrc', ref: 'a', value: 'media:fx1', shows: '' }] }, ctx)
	const written = applySlots([spot.block], spot.slots, markerValues(spot.slots).values, () => []).blocks[0]
	assert.deepEqual(validateBlock(written, VALIDATE), [])
	for (const bad of ['/hub/hub.png', '/scheduler/scheduler.png', 'media:unknown', 'https://example.com/photo.jpg']) {
		const copy = structuredClone(written)
		copy.props.mediaSrc = bad
		assert.ok(validateBlock(copy, VALIDATE).some((problem) => /mediaSrc/.test(problem)), bad)
	}
	const reviews = composeSection(baseSpec('masonry:centered', { child: 'testimonial-card:card', reviews: REVIEWS.slice(0, 3) }), ctx)
	const review = applySlots([reviews.block], reviews.slots, markerValues(reviews.slots).values, () => []).blocks[0]
	assert.deepEqual(validateBlock(review, VALIDATE), [])
	review.children[0].props.quote += ' Highly recommended!'
	assert.ok(validateBlock(review, VALIDATE).some((problem) => /word for word/.test(problem)))
	const bento = composeSection(baseSpec('bento-grid:numbered', { items: 4 }), ctx)
	const tiles = applySlots([bento.block], bento.slots, markerValues(bento.slots).values, () => []).blocks[0]
	assert.deepEqual(validateBlock(tiles, VALIDATE), [])
	tiles.props.tiles[0].span = '1'
	assert.ok(validateBlock(tiles, VALIDATE).some((problem) => /hole/.test(problem)))
})

check('validatePage checks the opener, the closer, the top bar and repeats', () => {
	const page = (...layouts) =>
		layouts.map((layout, index) => {
			const section = composeSection({ ...baseSpec(layout, { items: 0 }), key: `s${index + 1}` }, ctx)
			return applySlots([section.block], section.slots, markerValues(section.slots).values, () => []).blocks[0]
		})
	const good = page('page-hero:left', 'faq-accordion:split', 'cta-band:split')
	assert.deepEqual(validatePage(good, { ...VALIDATE, archetype: 'service' }), [])
	assert.ok(validatePage(page('faq-accordion:split', 'cta-band:split'), VALIDATE).some((entry) => entry.blockId === '' && /no opener/.test(entry.problems[0])))
	assert.ok(validatePage(page('faq-accordion:split', 'page-hero:left', 'cta-band:split'), VALIDATE).some((entry) => /not the first/.test(entry.problems.join())))
	const twice = page('page-hero:left', 'page-hero:centered', 'cta-band:split')
	assert.ok(validatePage(twice, VALIDATE).some((entry) => entry.blockId === twice[1].id))
	assert.ok(validatePage(page('page-hero:left', 'faq-accordion:split'), { ...VALIDATE, archetype: 'service' }).some((entry) => /closer/.test(entry.problems.join())))
	assert.deepEqual(validatePage(page('page-hero:compact', 'faq-accordion:stacked'), { ...VALIDATE, archetype: 'contact' }), [])
	const repeated = page('page-hero:left', 'faq-accordion:split', 'faq-accordion:split', 'cta-band:split')
	assert.ok(validatePage(repeated, { ...VALIDATE, archetype: 'service' }).some((entry) => entry.blockId === repeated[2].id))
	assert.deepEqual(validatePage(repeated, { ...VALIDATE, archetype: 'faq' }), [], 'the FAQ page may group its questions')
	const bar = page('announcement-bar:strip', 'page-hero:left', 'cta-band:split')
	assert.deepEqual(validatePage(bar, VALIDATE), [])
	const late = page('page-hero:left', 'announcement-bar:strip', 'cta-band:split')
	assert.ok(validatePage(late, VALIDATE).some((entry) => entry.blockId === late[1].id))
})

// ---------------------------------------------------------------- cleaning (section 10.5)

const slot = (kind, max, id = 's1.title') => ({ id, blockId: 'b', path: id.split('.').slice(1), kind, max })
const one = (kind, max, value, gate = () => []) => {
	const block = { id: 'b', type: 'page-hero', variant: 'left', props: {} }
	const target = slot(kind, max)
	const result = applySlots([block], [target], new Map([[target.id, value]]), gate)
	return { value: result.blocks[0].props.title, problems: result.problems.flatMap((problem) => problem.problems), result }
}

check('richtext keeps the first highlight of one to three words and unwraps the rest', () => {
	assert.equal(cleanSlotValue('Roofs done [[right]] in [[Austin]]', 'richtext'), 'Roofs done [[right]] in Austin')
	assert.equal(cleanSlotValue('[[A very long highlight here]] and [[short]]', 'richtext'), 'A very long highlight here and [[short]]')
	assert.equal(cleanSlotValue('Plain [[heading]]', 'heading'), 'Plain heading')
	assert.equal(cleanSlotValue('Stray ]] brackets [[', 'richtext'), 'Stray brackets')
})

check('text is trimmed, unquoted and stripped of tags and markdown', () => {
	assert.equal(cleanSlotValue('  "Book an inspection."  ', 'button'), 'Book an inspection')
	assert.equal(cleanSlotValue('<b>Fast</b> and **clean** _work_', 'short'), 'Fast and clean work')
	assert.equal(cleanSlotValue('What does it cost', 'question'), 'What does it cost?')
	assert.equal(cleanSlotValue('Roofing.', 'eyebrow'), 'Roofing')
	assert.equal(cleanSlotValue("'Don't wait'", 'paragraph'), "'Don't wait'")
	assert.equal(cleanSlotValue('Tom &amp; Sons', 'label'), 'Tom & Sons')
})

check('lengths: headings must fit, paragraphs end on a whole sentence, labels on a word', () => {
	assert.deepEqual(one('heading', 20, 'A heading that is far too long to fit').problems, ['too long: 37 characters'])
	assert.equal(one('heading', 20, 'A heading that is far too long to fit').value, undefined, 'a value with a problem is not written')
	assert.equal(one('paragraph', 40, 'One short sentence. Another one that runs past the cap.').value, 'One short sentence.')
	assert.deepEqual(one('paragraph', 10, 'No sentence fits in this cap at all.').problems, ['too long: 36 characters'])
	assert.equal(one('label', 12, 'Areas we serve today').value, 'Areas we')
	assert.equal(cutAtSentence('Hi there. Bye now.', 9), 'Hi there.')
	assert.equal(one('richtext', 16, 'Roofs [[done]] right').value, 'Roofs [[done]] right', 'brackets do not count toward the cap')
	assert.deepEqual(one('richtext', 15, 'Roofs [[done]] right').problems, ['too long: 16 characters'])
})

check('prose is sanitized, plain text becomes paragraphs, and an over-long body ends on a whole block', () => {
	const prose = (value, max = 6000) => {
		const block = { id: 'b', type: 'prose-block', variant: 'plain', props: {} }
		const target = { id: 's1.body', blockId: 'b', path: ['body'], kind: 'prose', max }
		return applySlots([block], [target], new Map([[target.id, value]]), () => [])
	}
	assert.equal(prose('First paragraph.\n\n## A heading\n\nSecond.').blocks[0].props.body, '<p>First paragraph.</p><h2>A heading</h2><p>Second.</p>')
	const dirty = prose('<p onclick="x()">Hi <script>alert(1)</script><img src=x onerror=alert(1)></p>').blocks[0].props.body
	assert.ok(!/script|onclick|onerror|<img/i.test(dirty), dirty)
	assert.equal(prose('<p>One.</p><p>Two two two two.</p>', 15).blocks[0].props.body, '<p>One.</p>')
})

check('placeholders are counted per page: a third one is a problem', () => {
	const block = { id: 'b', type: 'faq-accordion', variant: 'split', props: { faqs: [{}, {}, {}] } }
	const slots = [0, 1, 2].map((index) => ({ id: `s1.faqs.${index}.answer`, blockId: 'b', path: ['faqs', index, 'answer'], kind: 'answer', max: 420 }))
	const values = new Map(slots.map((item, index) => [item.id, `We have held the licence [License number ${index}] since then.`]))
	const result = applySlots([block], slots, values, () => [])
	assert.equal(result.placeholders.length, 2)
	assert.equal(result.placeholders[0].path, 'faqs.0.answer')
	assert.equal(result.problems.length, 1)
	assert.match(result.problems[0].problems[0], /placeholder limit/)
	assert.equal(applySlots([block], [slots[0]], new Map([[slots[0].id, 'A [[highlight]] is not a placeholder.']]), () => []).placeholders.length, 0)
})

check('the gate decides, missing values are problems, and icons are repaired in code', () => {
	const gated = one('paragraph', 220, 'Open 24/7.', (value) => (/24\/7/.test(value) ? ['unsupported claim: "24/7" is not in the facts'] : []))
	assert.deepEqual(gated.problems, ['unsupported claim: "24/7" is not in the facts'])
	assert.equal(gated.result.problems[0].value, 'Open 24/7.')
	assert.deepEqual(one('paragraph', 220, '   ').problems, ['missing'])
	const block = { id: 'b', type: 'bento-grid', variant: 'accent', props: { tiles: [{ title: 'Roof repair' }, { title: 'Gutter cleaning' }, { title: 'Storm damage' }] } }
	const slots = [0, 1, 2].map((index) => ({ id: `s1.tiles.${index}.icon`, blockId: 'b', path: ['tiles', index, 'icon'], kind: 'icon', max: 40 }))
	const result = applySlots([block], slots, new Map([['s1.tiles.0.icon', 'Tooth'], ['s1.tiles.1.icon', 'House'], ['s1.tiles.2.icon', 'House']]), () => [])
	const icons = result.blocks[0].props.tiles.map((tile) => tile.icon)
	assert.deepEqual(result.problems, [])
	assert.equal(icons[0], 'House', 'an unknown icon is replaced from the row title')
	assert.equal(new Set(icons).size, 3, `duplicates are re-picked: ${icons}`)
	assert.ok(icons.every((icon) => Object.values(ICON_LEXICON).flat().includes(icon) || icon === 'House'))
	assert.equal(block.props.tiles[0].icon, undefined, 'the input blocks are not changed')
})

// ---------------------------------------------------------------- summary

const left = [...pending].filter((fix) => !pendingSeen.has(fix))
console.log(`\n${passed} passed, ${expected} expected failures${pending.size ? ` (14.1 ${[...pending].join(', ')} not landed yet)` : ''}, ${failed} failed`)
if (pending.size && left.length) console.log(`(no case depended on ${left.join(', ')})`)
if (failed) process.exit(1)
console.log('compose checks passed')
