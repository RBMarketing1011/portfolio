/**
 * Proves the AI builder's section catalog against the real section kit:
 *
 *   node scripts/prove-builder-catalog.cjs
 *
 *  - the join with schema.ts resolves: 82 layouts across 28 types, equal as a set to
 *    LAYOUT_IDS; every curated variant exists; every schema variant of an AI type is
 *    curated (excluded ones carry a reason); every slot and image path names a field of
 *    a compatible type; item ranges sit inside the schema's fixed/min/max; child kinds
 *    are cards their containers accept and equal CHILD_LAYOUT_IDS;
 *  - excluded variants and the never-types produce no layout, and layoutOf is tolerant;
 *  - the recipes only use layouts that fit their archetype, open with an opener and close
 *    with a closer; the icon lexicon is canonical Lucide;
 *  - catalogText() is byte-identical across calls and under shuffled key insertion, and
 *    stays under 60,000 characters;
 *  - nothing in the catalog imports a client-only or server-only module.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadTs, ROOT } = require('./lib/load-ts.cjs')

const catalogModule = loadTs('src/lib/builder/catalog/index.ts')
const { catalog, buildCatalog, catalogText, renderCatalogText, layoutOf, layoutIdOf, layoutLabel } = catalogModule
const { SECTION_META, NEED_NOTES, ITEM_NOTES, countFor } = loadTs('src/lib/builder/catalog/meta.ts')
const { CHILD_META } = loadTs('src/lib/builder/catalog/children.ts')
const { RECIPES, ARCHETYPE_RULES } = loadTs('src/lib/builder/catalog/recipes.ts')
const { ICON_LEXICON, iconFor, isCanonicalIcon, matchIcon } = loadTs('src/lib/builder/catalog/lexicon.ts')
const { resolvePath, KIND_FIELDS, slotPath } = loadTs('src/lib/builder/catalog/slots.ts')
const { imageSlotsFor } = loadTs('src/lib/builder/catalog/compose.ts')
const vocab = loadTs('src/lib/builder/design/vocab.ts')
const { getSchema, sectionSchemas } = loadTs('src/lib/builder/schema.ts')
const { icons } = require('lucide-react')

let failed = 0
const check = (name, fn) => {
	try {
		fn()
		console.log(`PASS ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}`)
	}
}

const entries = () => [...catalog().values()]
const aiEntries = () => entries().filter((entry) => entry.meta.ai !== 'never')

// ---- the join ------------------------------------------------------------------

check('the catalog joins with schema.ts without an unresolved reference', () => {
	assert.ok(catalog().size > 0)
})

check('82 layouts across 28 types, equal as a set to LAYOUT_IDS', () => {
	const layouts = entries().flatMap((entry) => entry.layouts)
	const types = new Set(layouts.map((layout) => layout.split(':')[0]))
	assert.equal(layouts.length, 82, `${layouts.length} layouts`)
	assert.equal(types.size, 28, `${types.size} types`)
	assert.equal(new Set(layouts).size, layouts.length, 'a layout is listed twice')
	assert.deepEqual([...layouts].sort(), [...vocab.LAYOUT_IDS].sort())
})

check('every layout names a type and variant that exist in schema.ts', () => {
	for (const layout of vocab.LAYOUT_IDS) {
		const [type, variant] = layout.split(':')
		const schema = getSchema(type)
		assert.ok(schema, `${type} is not in schema.ts`)
		if (type === 'media-mosaic') assert.ok(!schema.variants?.length && variant === 'default', layout)
		else assert.ok(schema.variants.some((item) => item.id === variant), `${layout}: no such variant`)
	}
})

check('every schema variant of an AI type is curated, and excluded ones say why', () => {
	for (const entry of aiEntries()) {
		const schema = getSchema(entry.type)
		for (const variant of schema.variants ?? [{ id: 'default' }]) {
			const curated = entry.meta.variants.find((item) => item.id === variant.id)
			assert.ok(curated, `${entry.type}:${variant.id} has no metadata`)
			if (curated.excluded) assert.ok(curated.excluded.length > 20, `${entry.type}:${variant.id} is excluded without a reason`)
			for (const key of ['look', 'use', 'density']) assert.ok(curated[key], `${entry.type}:${variant.id} has no ${key}`)
			assert.ok(curated.text.length, `${entry.type}:${variant.id} names no text tokens`)
		}
	}
})

check('joined labels come from schema.ts', () => {
	assert.equal(catalog().get('page-hero').label, 'Page Hero')
	assert.equal(catalog().get('page-hero').variants.find((item) => item.id === 'centered').label, 'Centered')
	assert.equal(layoutLabel('page-hero:centered'), 'Page Hero (Centered)')
	assert.equal(layoutLabel('split-hero:split'), 'Split Hero (Media Right)')
	assert.equal(layoutLabel('media-mosaic:default'), 'Media Mosaic')
})

check('every slot path exists with a compatible field type', () => {
	let count = 0
	const visit = (type, slots, where) => {
		const schema = getSchema(type)
		for (const slot of slots) {
			const resolved = resolvePath(schema.fields, slot.path)
			assert.ok(resolved, `${where} ${slot.path} does not resolve`)
			assert.ok(KIND_FIELDS[slot.kind].includes(resolved.field.type), `${where} ${slot.path} (${slot.kind}) is a ${resolved.field.type} field`)
			if (slot.kind === 'richtext') assert.equal(resolved.field.type, 'richtext', `${where} ${slot.path}`)
			assert.ok(slot.max > 0, `${where} ${slot.path} has no cap`)
			count++
		}
	}
	for (const entry of aiEntries()) visit(entry.type, entry.meta.slots, entry.type)
	for (const [type, meta] of Object.entries(CHILD_META)) visit(type, meta.slots, `card ${type}`)
	assert.ok(count > 100, `only ${count} slots`)
})

check('every image path is an image field, and slots name only known variants and tweaks', () => {
	for (const entry of aiEntries()) {
		const schema = getSchema(entry.type)
		const ids = entry.meta.variants.map((item) => item.id)
		for (const need of entry.meta.images ?? []) {
			const resolved = resolvePath(schema.fields, need.path)
			assert.ok(resolved && resolved.field.type === 'image', `${entry.type} ${need.path}`)
			for (const id of need.variants ?? []) assert.ok(ids.includes(id), `${entry.type} image variant ${id}`)
		}
		for (const slot of entry.meta.slots) {
			for (const id of slot.variants ?? []) assert.ok(ids.includes(id), `${entry.type} slot variant ${id}`)
			if (slot.tweak) assert.ok(entry.meta.tweaks.includes(slot.tweak), `${entry.type} slot tweak ${slot.tweak} is not one of its tweaks`)
		}
	}
})

check('a richtext slot exists for every richtext title the kit highlights, and plain titles never get one', () => {
	for (const entry of aiEntries()) {
		const titles = entry.meta.slots.filter((slot) => slot.path === 'title')
		const field = getSchema(entry.type).fields.find((item) => item.key === 'title')
		for (const slot of titles) assert.equal(slot.kind === 'richtext', field.type === 'richtext', `${entry.type}.title`)
	}
})

check("item ranges sit inside the schema's fixed, min and max", () => {
	for (const entry of aiEntries()) {
		const rule = entry.meta.items
		if (!rule) continue
		const counts = [rule.count, ...Object.values(rule.byVariant ?? {})]
		for (const count of counts) {
			assert.ok(count.min <= count.ideal && count.ideal <= count.max, `${entry.type}: ${JSON.stringify(count)}`)
			for (const value of count.allowed ?? []) assert.ok(value >= count.min && value <= count.max, `${entry.type} allowed ${value}`)
		}
		if (rule.list !== 'children') {
			const field = getSchema(entry.type).fields.find((item) => item.key === rule.list)
			assert.equal(field?.type, 'list', `${entry.type}.${rule.list}`)
			if (field.fixed !== undefined) for (const count of counts) assert.equal(count.max, field.fixed, `${entry.type}.${rule.list} is fixed`)
		} else assert.ok(getSchema(entry.type).container, `${entry.type} counts children`)
	}
	// The fan is the one fixed list the AI fills: five tiles, exactly the schema's slots.
	const fixed = getSchema('split-hero').fields.find((item) => item.key === 'backdrop').fixed
	const fan = imageSlotsFor({ type: 'split-hero', variant: 'split', items: 0, child: null, tweaks: ['fan'] })
	assert.equal(fan.filter((slot) => slot.path.startsWith('backdrop.')).length, fixed)
	// Numbered cards carry 1..n, inside the field's own range.
	const index = getSchema('feature-card').fields.find((item) => item.key === 'index')
	const most = Math.max(...aiEntries().filter((entry) => entry.meta.children).map((entry) => entry.meta.items.count.max))
	assert.ok(index.min <= 1 && index.max >= most, `index ${index.min}..${index.max} vs ${most} cards`)
	const speed = getSchema('announcement-bar').fields.find((item) => item.key === 'speed')
	assert.ok(speed.min <= 36 && speed.max >= 36)
})

check('child layouts are cards their containers accept, and equal CHILD_LAYOUT_IDS', () => {
	const kinds = []
	for (const [type, meta] of Object.entries(CHILD_META)) {
		const schema = getSchema(type)
		assert.ok(schema?.displayItem, `${type} is not a display item`)
		for (const variant of schema.variants) assert.ok(meta.variants.some((item) => item.id === variant.id), `card ${type}:${variant.id} has no metadata`)
		for (const variant of meta.variants) {
			assert.ok(schema.variants.some((item) => item.id === variant.id), `card ${type}:${variant.id} is not in schema.ts`)
			if (!variant.ai) assert.ok(variant.excluded, `card ${type}:${variant.id} is off without a reason`)
			else kinds.push(`${type}:${variant.id}`)
		}
	}
	assert.deepEqual([...kinds].sort(), [...vocab.CHILD_LAYOUT_IDS].sort())
	for (const entry of aiEntries()) {
		if (!entry.meta.children) continue
		const accepts = getSchema(entry.type).container.accepts
		for (const kind of entry.meta.children.kinds) {
			assert.ok(vocab.CHILD_LAYOUT_IDS.includes(kind), `${entry.type}: ${kind}`)
			assert.ok(accepts.includes(kind.split(':')[0]), `${entry.type} does not accept ${kind}`)
		}
		assert.ok(entry.meta.children.kinds.includes(entry.meta.children.default))
	}
	for (const entry of aiEntries()) assert.equal(Boolean(entry.meta.children), Boolean(getSchema(entry.type).container), entry.type)
})

check('excluded variants and the never-types produce no layout', () => {
	const offered = new Set(entries().flatMap((entry) => entry.layouts))
	for (const entry of entries())
		for (const variant of entry.meta.variants.filter((item) => item.excluded)) assert.ok(!offered.has(`${entry.type}:${variant.id}`), `${entry.type}:${variant.id}`)
	const never = Object.values(SECTION_META).filter((meta) => meta.ai === 'never')
	assert.equal(never.length, 13, `${never.length} never-types`)
	for (const meta of never) {
		assert.deepEqual(catalog().get(meta.type).layouts, [], meta.type)
		assert.equal(layoutOf(`${meta.type}:${getSchema(meta.type).variants?.[0]?.id ?? 'x'}`), null, meta.type)
	}
	for (const excluded of ['announcement-bar:floating']) assert.ok(!offered.has(excluded))
	for (const card of ['testimonial-card:aside', 'related-card:thumbnail', 'client-logo:boxed', 'client-logo:muted'])
		assert.ok(!vocab.CHILD_LAYOUT_IDS.includes(card), card)
	// Display items and in-section primitives are never sections.
	for (const type of ['section-heading', 'filter-bar', 'pagination', 'feature-card']) assert.equal(layoutOf(type), null, type)
})

check('the join refuses curated metadata that does not resolve', () => {
	const broken = (patch) => {
		const meta = { ...SECTION_META, ...patch(SECTION_META) }
		assert.throws(() => buildCatalog(meta, CHILD_META), /catalog:/)
	}
	broken((meta) => ({ chips: { ...meta.chips, variants: meta.chips.variants.filter((item) => item.id !== 'inline') } }))
	broken((meta) => ({ chips: { ...meta.chips, slots: [{ path: 'nope', kind: 'label', max: 10 }] } }))
	broken((meta) => ({ chips: { ...meta.chips, slots: [{ path: 'items[]', kind: 'icon', max: 10 }] } }))
	broken((meta) => ({ 'cta-band': { ...meta['cta-band'], slots: [{ path: 'title', kind: 'richtext', max: 60 }] } }))
	broken((meta) => ({ grid: { ...meta.grid, children: { kinds: ['team-card:card'], default: 'team-card:card' } } }))
	broken((meta) => ({ 'page-hero': { ...meta['page-hero'], variants: [...meta['page-hero'].variants, { ...meta['page-hero'].variants[0], id: 'wide' }] } }))
	broken(() => ({ 'not-a-section': { ...SECTION_META.chips, type: 'not-a-section' } }))
	assert.throws(() => buildCatalog(SECTION_META, { ...CHILD_META, 'client-logo': { ...CHILD_META['client-logo'], variants: CHILD_META['client-logo'].variants.map((item) => ({ ...item, ai: true })) } }), /CHILD_LAYOUT_IDS/)
})

check('layoutOf is tolerant of case, spaces and slashes, and maps unknown variants to the first usable one', () => {
	assert.deepEqual(layoutOf('page-hero:centered'), { type: 'page-hero', variant: 'centered' })
	assert.deepEqual(layoutOf('  Page-Hero : Centered '), { type: 'page-hero', variant: 'centered' })
	assert.deepEqual(layoutOf('FAQ-ACCORDION/boxed'), { type: 'faq-accordion', variant: 'boxed' })
	assert.deepEqual(layoutOf('page hero:left'), { type: 'page-hero', variant: 'left' })
	assert.deepEqual(layoutOf('page-hero:enormous'), { type: 'page-hero', variant: 'centered' })
	assert.deepEqual(layoutOf('faq-accordion'), { type: 'faq-accordion', variant: 'split' })
	assert.deepEqual(layoutOf('announcement-bar:floating'), { type: 'announcement-bar', variant: 'strip' })
	assert.deepEqual(layoutOf('media-mosaic:default'), { type: 'media-mosaic', variant: null })
	assert.deepEqual(layoutOf('media-mosaic'), { type: 'media-mosaic', variant: null })
	assert.equal(layoutIdOf('MEDIA-MOSAIC'), 'media-mosaic:default')
	for (const value of ['', 'nonsense', 'pricing-tiers:cards', 'contact-split', '__proto__', 'constructor:x', 'toString']) assert.equal(layoutOf(value), null, value)
	for (const layout of vocab.LAYOUT_IDS) assert.equal(layoutIdOf(layout), layout)
})

check('slotPath reads ids back into paths, keeping flat dotted keys whole', () => {
	assert.deepEqual(slotPath('s4.faqs.2.answer'), ['faqs', 2, 'answer'])
	assert.deepEqual(slotPath('s5.c2.title'), ['title'])
	assert.deepEqual(slotPath('s3.before.alt'), ['before.alt'])
	assert.deepEqual(slotPath('s2.items.0'), ['items', 0])
	assert.deepEqual(slotPath('s1.action.label'), ['action', 'label'])
	assert.deepEqual(slotPath('s6.rows.1.points.0.text'), ['rows', 1, 'points', 0, 'text'])
})

// ---- roles, needs and recipes ----------------------------------------------------

check('openers and closers match the vocabulary lists', () => {
	const by = (role) => aiEntries().filter((entry) => entry.meta.roles.includes(role)).flatMap((entry) => entry.layouts)
	assert.deepEqual([...by('opener')].sort(), [...vocab.OPENER_LAYOUTS].sort())
	assert.deepEqual([...by('closer')].sort(), [...vocab.CLOSER_LAYOUTS].sort())
	for (const entry of aiEntries()) assert.equal(entry.meta.h1, entry.meta.roles.includes('opener'), entry.type)
})

check('every tweak, surface and fallback is valid, and every tweak is offered somewhere', () => {
	const offered = new Set()
	for (const entry of aiEntries()) {
		for (const tweak of entry.meta.tweaks) {
			assert.ok(vocab.TWEAKS.includes(tweak), `${entry.type}: ${tweak}`)
			offered.add(tweak)
		}
		assert.ok(entry.meta.surfaces.length > 0, entry.type)
		for (const tone of entry.meta.surfaces) assert.ok(vocab.SURFACE_TONES.includes(tone), `${entry.type}: ${tone}`)
		if (entry.meta.fallback) {
			assert.ok(vocab.LAYOUT_IDS.includes(entry.meta.fallback), `${entry.type} fallback`)
			const fallback = SECTION_META[entry.meta.fallback.split(':')[0]]
			assert.deepEqual(fallback.needs, [], `${entry.type} falls back to ${entry.meta.fallback}, which has needs of its own`)
			assert.ok(fallback.roles.some((role) => entry.meta.roles.includes(role)), `${entry.type} falls back to a different role`)
		}
		assert.ok(entry.meta.purpose.length > 30, `${entry.type} purpose`)
		if (entry.meta.pages !== 'all') for (const page of entry.meta.pages) assert.ok(vocab.ARCHETYPES.includes(page), `${entry.type} page ${page}`)
	}
	assert.deepEqual([...offered].sort(), [...vocab.TWEAKS].sort())
	for (const key of [...Object.keys(NEED_NOTES), ...Object.keys(ITEM_NOTES)]) assert.ok(catalog().get(key)?.layouts.length, `note for ${key}`)
})

check('brand bands are offered only to closers whose text holds on the accent (section 8.8)', () => {
	for (const entry of aiEntries()) {
		if (!entry.meta.surfaces.includes('brand')) continue
		assert.ok(entry.meta.roles.includes('closer'), entry.type)
		const centered = entry.meta.variants.find((item) => item.id === 'centered')
		if (entry.type === 'cta-band') assert.deepEqual(centered.text, ['heading', 'body'])
	}
	for (const entry of aiEntries())
		if (entry.meta.surfaces.includes('inverse-glow')) assert.ok(entry.meta.roles.includes('opener') || entry.type === 'cta-band', entry.type)
})

check('the recipes cover every archetype with valid layouts that fit it', () => {
	assert.deepEqual(Object.keys(RECIPES).sort(), [...vocab.ARCHETYPES].sort())
	assert.deepEqual(Object.keys(ARCHETYPE_RULES).sort(), [...vocab.ARCHETYPES].sort())
	for (const archetype of vocab.ARCHETYPES) {
		const steps = RECIPES[archetype]
		const rule = ARCHETYPE_RULES[archetype]
		assert.ok(rule.min >= 2 && rule.min <= rule.max, archetype)
		const first = steps.find((step) => step.role !== 'top-bar')
		assert.equal(first.role, 'opener', `${archetype} opens with ${first.role}`)
		assert.ok(!first.optional, `${archetype}: the opener is optional`)
		const last = steps[steps.length - 1]
		assert.equal(last.role === 'closer', rule.closer, `${archetype} closer`)
		assert.ok(steps.filter((step) => !step.optional).length <= rule.max, `${archetype}: more required steps than its maximum`)
		assert.ok(steps.length >= rule.min, `${archetype}: fewer steps than its minimum`)
		for (const step of steps) {
			assert.ok(step.alternatives.length > 0, `${archetype}: an empty step`)
			for (const alternative of step.alternatives) {
				assert.ok(vocab.LAYOUT_IDS.includes(alternative.layout), `${archetype}: ${alternative.layout}`)
				const [type] = alternative.layout.split(':')
				const meta = SECTION_META[type]
				assert.ok(meta.pages === 'all' || meta.pages.includes(archetype), `${archetype}: ${alternative.layout} does not list ${archetype} among its pages`)
				assert.ok(meta.roles.includes(step.role) || (step.role === 'showcase' && meta.roles.includes('explain')) || (step.role === 'explain' && meta.roles.includes('showcase')) || step.role === 'content' || step.role === 'proof',
					`${archetype}: ${alternative.layout} is not a ${step.role}`)
				if (alternative.child) assert.ok(meta.children?.kinds.includes(alternative.child), `${archetype}: ${alternative.layout}+${alternative.child}`)
				else assert.ok(!meta.children || meta.children.default, alternative.layout)
				for (const tweak of alternative.tweaks ?? []) assert.ok(meta.tweaks.includes(tweak), `${archetype}: ${alternative.layout} ${tweak}`)
				if (alternative.surface) assert.ok(meta.surfaces.includes(alternative.surface), `${archetype}: ${alternative.layout} on ${alternative.surface}`)
			}
		}
	}
})

// ---- icons ----------------------------------------------------------------------

check('the icon lexicon is canonical Lucide, without the names this version lacks', () => {
	const names = Object.values(ICON_LEXICON).flat()
	assert.ok(names.length >= 180, `${names.length} icons`)
	for (const name of names) assert.ok(Object.hasOwn(icons, name), name)
	for (const missing of ['Tooth', 'SolarPanel', 'BrushCleaning']) {
		assert.ok(!names.includes(missing), missing)
		assert.ok(!isCanonicalIcon(missing), missing)
	}
	for (const bad of ['icons', 'createLucideIcon', 'toString', '__proto__', 'constructor', 'house', '', 'House ', 'CheckCircle2'])
		assert.ok(!isCanonicalIcon(bad), bad)
	for (const good of ['House', 'CircleCheck', 'BadgeCheck', 'CircleCheckBig', 'ArrowRight', 'Phone', 'Mail']) assert.ok(isCanonicalIcon(good), good)
})

check('iconFor follows the keyword map in order, then the group', () => {
	const cases = [
		['Roof Replacement', 'House'], ['Roof repair', 'House'], ['Leak repair', 'Wrench'], ['Storm damage', 'CloudHail'],
		['Gutter cleaning', 'Droplets'], ['Free inspections', 'Search'], ['Emergency service', 'Siren'], ['House cleaning', 'Sparkles'],
		['Furnace tune-up', 'Flame'], ['AC installation', 'Snowflake'], ['Electrical wiring', 'Zap'], ['Solar panels', 'Sun'],
		['Lawn care', 'Leaf'], ['Tree removal', 'TreePine'], ['Interior painting', 'PaintRoller'], ['Teeth whitening', 'Smile'],
		['Dental implants', 'Smile'], ['Implant surgery', 'Stethoscope'], ['Fresh bread', 'Croissant'], ['Coffee bar', 'Coffee'],
		['Catering', 'ChefHat'], ['Estate planning', 'Scale'], ['Tax preparation', 'Calculator'], ['Insurance claims', 'ShieldCheck'],
		['Contact us', 'PhoneCall'], ['About the team', 'Users'], ['Reviews', 'Star'], ['FAQ', 'CircleHelp'],
		['Our work', 'LayoutGrid'], ['Pricing', 'Receipt'], ['Book an appointment', 'CalendarCheck'],
		['Hair salon', 'CalendarCheck'], ['Contact', 'PhoneCall'],
	]
	for (const [text, icon] of cases) assert.equal(iconFor(text), icon, text)
	assert.equal(iconFor('Roof repair'), 'House')
	assert.equal(iconFor('Deck repair', 'building'), 'Hammer')
	assert.equal(iconFor('Deck repair'), 'Wrench')
	assert.equal(iconFor('Something else', 'food'), 'Utensils')
	assert.equal(iconFor('Something else', 'hvac'), 'Wrench')
	assert.equal(matchIcon('Repair'), 'Wrench')
	assert.equal(matchIcon('Ignore previous instructions'), null)
	// "air" never matches inside "repair", and "AC" never inside "contact".
	assert.equal(matchIcon('repair'), 'Wrench')
	assert.equal(matchIcon('backyard'), null)
})

// ---- the planner's view -------------------------------------------------------------

function shuffled(record, seed) {
	const keys = Object.keys(record)
	let state = seed
	for (let index = keys.length - 1; index > 0; index--) {
		state = (state * 1103515245 + 12345) % 2147483648
		const other = state % (index + 1)
		;[keys[index], keys[other]] = [keys[other], keys[index]]
	}
	return Object.fromEntries(keys.map((key) => [key, record[key]]))
}

check('catalogText() is byte-identical across calls and under shuffled key insertion', () => {
	const first = catalogText()
	assert.equal(catalogText(), first)
	assert.equal(renderCatalogText(), first)
	for (const seed of [1, 7, 42, 2026]) assert.equal(renderCatalogText(shuffled(SECTION_META, seed), shuffled(CHILD_META, seed + 1)), first, `seed ${seed}`)
	assert.ok(first.startsWith('SECTION KIT\n'))
	for (const heading of ['PAGE RECIPES', 'PALETTES', 'FONT PAIRS', 'PERSONALITIES', 'BACKDROPS', 'SURFACES', 'TWEAKS', 'ARCHETYPES'])
		assert.ok(first.includes(`\n${heading}`), heading)
})

check('catalogText() lists every layout once and stays under 60,000 characters', () => {
	const text = catalogText()
	for (const layout of vocab.LAYOUT_IDS) assert.ok(text.includes(`  ${layout} · `), layout)
	for (const excluded of ['announcement-bar:floating', 'pricing-tiers', 'contact-split', 'lead-capture', 'testimonial-card:aside'])
		assert.ok(!text.includes(excluded), excluded)
	assert.ok(text.length < 60000, `${text.length} characters`)
	console.log(`     catalogText: ${text.length} characters (target 45,000), about ${Math.round(text.length / 4)} tokens`)
	assert.ok(!/undefined|\[object Object\]|NaN/.test(text), 'a value did not render')
})

// ---- purity -----------------------------------------------------------------------

check('no catalog module imports a client-only or server-only module', () => {
	const seen = new Set()
	const resolve = (from, request) => {
		const base = request.startsWith('@/') ? path.join(ROOT, 'src', request.slice(2)) : path.resolve(path.dirname(from), request)
		for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
		throw new Error(`${path.relative(ROOT, from)}: cannot resolve ${request}`)
	}
	const visit = (file) => {
		if (seen.has(file)) return
		seen.add(file)
		const source = fs.readFileSync(file, 'utf8')
		const head = source.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, '')
		assert.ok(!/^['"]use client['"]/.test(head), `${path.relative(ROOT, file)} is a client module`)
		assert.ok(!/import\s+['"]server-only['"]/.test(source), `${path.relative(ROOT, file)} is server-only`)
		for (const match of source.matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
			const request = match[1]
			if (request.startsWith('.') || request.startsWith('@/')) visit(resolve(file, request))
		}
	}
	for (const name of ['types', 'meta', 'children', 'recipes', 'lexicon', 'index', 'compose', 'slots', 'validate'])
		visit(path.join(ROOT, 'src/lib/builder/catalog', `${name}.ts`))
	const local = [...seen].map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
	for (const forbidden of ['src/lib/builder/block-ops.ts', 'src/lib/builder/registry.ts', 'src/lib/builder/hydrate.ts', 'src/lib/builder/icons.ts'])
		assert.ok(!local.includes(forbidden), `the catalog reaches ${forbidden}`)
})

if (failed) {
	console.log(`\n${failed} check(s) failed`)
	process.exit(1)
}
console.log('\ncatalog checks passed')
