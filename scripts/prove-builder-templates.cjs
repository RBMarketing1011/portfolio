/**
 * Proves the page template catalog:
 *
 *   node scripts/prove-builder-templates.cjs
 *
 *  - every template sits in a known category, and every category has 3 to 6;
 *  - every block is a real section, with a real variant;
 *  - every prop is a field that section has, of the right type (select values from
 *    its options, icons that resolve, lists of the right row shape), so nothing
 *    silently falls back to placeholder copy;
 *  - containers only hold the items they accept;
 *  - every template survives the database round trip (templateSchema);
 *  - every template renders on the server, and its opening heading is on the page.
 */
const assert = require('node:assert/strict')
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToStaticMarkup } = rootRequire('react-dom/server')

const { builderTemplates } = loadTs('src/lib/builder/templates/index.ts')
const { TEMPLATE_CATEGORIES } = loadTs('src/lib/builder/template-categories.ts')
const { getSchema } = loadTs('src/lib/builder/schema.ts')
const { resolveIcon } = loadTs('src/lib/builder/icons.ts')
const { isProseHtml } = loadTs('src/lib/builder/rich-text.tsx')
const { templateSchema } = loadTs('src/lib/builder/page-schema.ts')
const { RenderBlocks } = loadTs('src/lib/builder/render.tsx')
const { setMediaIndex } = loadTs('src/lib/builder/media-store.ts')
const { formulaName } = loadTs('src/lib/builder/ids.ts')
const { evaluateFormula } = loadTs('src/lib/builder/formula.ts')

const problems = []
const fail = (where, message) => problems.push(`${where}: ${message}`)

const isScalarList = (field) =>
	field.type === 'list' && field.of?.length === 1 && field.of[0].key === 'value'

function checkValue(where, field, value) {
	switch (field.type) {
		case 'text':
		case 'textarea':
		case 'richtext':
			if (typeof value !== 'string') fail(where, `expected text, got ${typeof value}`)
			else if (!value.trim()) fail(where, 'empty text')
			break
		case 'prose':
			if (!isProseHtml(value)) fail(where, 'prose must be editor HTML')
			break
		case 'number':
		case 'range':
			if (typeof value !== 'number' || Number.isNaN(value)) fail(where, 'expected a number')
			else if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))
				fail(where, `${value} outside ${field.min}..${field.max}`)
			break
		case 'boolean':
			if (typeof value !== 'boolean') fail(where, 'expected true/false')
			break
		case 'select':
			if (!field.options.some((o) => o.value === value))
				fail(where, `"${value}" is not one of ${field.options.map((o) => o.value).join('|')}`)
			break
		case 'icon':
			if (!resolveIcon(value)) fail(where, `icon "${value}" does not exist`)
			break
		case 'image':
			if (typeof value !== 'string') fail(where, 'expected an image reference')
			break
		case 'group':
			if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where, 'expected an object')
			else checkProps(where, field.of, value)
			break
		case 'list':
			if (!Array.isArray(value)) return fail(where, 'expected a list')
			if (value.length === 0) fail(where, 'empty list (leave it out to use the default)')
			if (isScalarList(field)) {
				value.forEach((item, index) => checkValue(`${where}[${index}]`, field.of[0], item))
			} else {
				value.forEach((row, index) => {
					if (!row || typeof row !== 'object') fail(`${where}[${index}]`, 'expected a row')
					else checkProps(`${where}[${index}]`, field.of, row)
				})
			}
			break
		default:
			fail(where, `unhandled field type ${field.type}`)
	}
}

function checkProps(where, fields, props) {
	for (const [key, value] of Object.entries(props)) {
		const field = fields.find((f) => f.key === key)
		if (!field) {
			fail(where, `"${key}" is not a field (has: ${fields.map((f) => f.key).join(', ')})`)
			continue
		}
		checkValue(`${where}.${key}`, field, value)
	}
}

function checkBlock(where, block, parent) {
	const schema = getSchema(block.type)
	if (!schema) return fail(where, `unknown section "${block.type}"`)
	const here = `${where} ${block.type}`
	if (block.variant && !schema.variants?.some((v) => v.id === block.variant))
		fail(here, `variant "${block.variant}" is not one of ${(schema.variants ?? []).map((v) => v.id).join('|')}`)
	if (parent) {
		if (!parent.container.accepts.includes(block.type)) fail(here, `${parent.type} does not accept ${block.type}`)
	} else if (schema.displayItem && !schema.bare) {
		// A bare item renders its own measure and the builder wraps it in a section.
		// Anything else at the top level renders with no page gutters.
		fail(here, 'is an item, not a section; it belongs inside a container or a collection page')
	}
	if (block.props) checkProps(here, schema.fields, block.props)
	// Two price cards leave a lopsided gap on desktop; every template offers three.
	if (block.type === 'pricing-tiers' && block.props?.tiers?.length !== 3)
		fail(here, `has ${block.props?.tiers?.length ?? 'default'} tiers, wants exactly 3`)
	if (block.type === 'roi-calculator' && block.props?.outputs) {
		const scope = Object.fromEntries(
			(block.props.inputs ?? []).map((input, index) => [formulaName(input.label, index), input.value]),
		)
		for (const output of block.props.outputs) {
			const value = evaluateFormula(output.formula, scope)
			if (typeof value !== 'number' || !Number.isFinite(value)) fail(here, `formula "${output.formula}" does not evaluate (${value})`)
		}
	}
	if (block.children) {
		if (!schema.container) fail(here, 'has children but is not a container')
		else block.children.forEach((child, index) => checkBlock(`${here}>${index}`, child, schema))
	}
}

// ---- catalog shape -----------------------------------------------------------
const categoryIds = TEMPLATE_CATEGORIES.map((c) => c.id)
const slugs = new Set()
const ids = new Set()
const collectIds = (blocks) =>
	blocks.forEach((b) => {
		if (ids.has(b.id)) fail(b.id, 'duplicate block id')
		ids.add(b.id)
		if (b.children) collectIds(b.children)
	})

for (const template of builderTemplates) {
	const where = `[${template.slug}]`
	if (slugs.has(template.slug)) fail(where, 'duplicate slug')
	slugs.add(template.slug)
	if (!categoryIds.includes(template.category)) fail(where, `unknown category "${template.category}"`)
	if (!template.name || !template.description) fail(where, 'needs a name and a description')
	if (!template.blocks.length) fail(where, 'has no sections')
	if (!templateSchema.safeParse(template).success) fail(where, 'does not survive templateSchema (the database round trip)')
	collectIds(template.blocks)
	template.blocks.forEach((block, index) => checkBlock(`${where}#${index}`, block))
}

const counts = {}
for (const id of categoryIds) counts[id] = builderTemplates.filter((t) => t.category === id).length
for (const [id, count] of Object.entries(counts))
	if (count < 3 || count > 6) fail(`category ${id}`, `has ${count} templates, wants 3 to 6`)

// ---- rendering ---------------------------------------------------------------
setMediaIndex([])
const strip = (value) => String(value).replace(/\[\[|\]\]/g, '')
const decode = (html) =>
	html
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
const originalError = console.error
for (const template of builderTemplates) {
	const where = `[${template.slug}] render`
	const errors = []
	console.error = (...args) => errors.push(args.join(' '))
	let html = ''
	try {
		html = renderToStaticMarkup(React.createElement(RenderBlocks, { blocks: template.blocks }))
	} catch (error) {
		fail(where, `threw ${error.message}`)
	} finally {
		console.error = originalError
	}
	for (const message of errors) if (!/useLayoutEffect/.test(message)) fail(where, `logged: ${message.slice(0, 160)}`)
	const first = template.blocks[0]
	const heading = first.props?.title ?? first.props?.message
	if (html && heading && !decode(html.replace(/<[^>]+>/g, '')).includes(strip(heading)))
		fail(where, `opening heading "${strip(heading).slice(0, 40)}" is not on the page`)
	if (html && /Unknown section type/.test(html)) fail(where, 'renders an unknown section')
}

// ---- the dialog's search and grouping ------------------------------------------
{
	const search = loadTs('src/lib/builder/template-search.ts')
	const all = builderTemplates
	const slugsOf = (list) => list.map((t) => t.slug)
	const check = (label, fn) => {
		try {
			fn()
		} catch (error) {
			fail(`search: ${label}`, error.message.split(String.fromCharCode(10))[0])
		}
	}
	check('an empty search lists everything', () => assert.equal(search.searchTemplates(all, '  ').length, all.length))
	check('every template is found by its own name', () => {
		for (const t of all) assert.ok(slugsOf(search.searchTemplates(all, t.name)).includes(t.slug), t.slug)
	})
	check('keywords are searched', () => assert.ok(slugsOf(search.searchTemplates(all, 'adwords')).includes('landing-google-ads')))
	check('every word must match', () => {
		const found = slugsOf(search.searchTemplates(all, 'contact form'))
		assert.ok(found.includes('contact-form'))
		assert.ok(!found.includes('pricing-three-tiers'))
	})
	check('a category name finds its templates', () => {
		const found = search.searchTemplates(all, 'pricing')
		for (const t of all.filter((t) => t.category === 'pricing')) assert.ok(found.includes(t), t.slug)
	})
	check('nonsense finds nothing', () => assert.deepEqual(search.searchTemplates(all, 'xyzzy qwerty'), []))
	check('All groups every template, in category order', () => {
		const groups = search.groupTemplates(all, search.ALL_TEMPLATES)
		assert.deepEqual(groups.map((g) => g.id), TEMPLATE_CATEGORIES.map((c) => c.id))
		assert.equal(groups.reduce((n, g) => n + g.items.length, 0), all.length)
	})
	check('a category tab shows only that category', () => {
		const groups = search.groupTemplates(all, 'landing')
		assert.equal(groups.length, 1)
		assert.ok(groups[0].items.every((t) => t.category === 'landing'))
	})
	check('an unknown category still lists, under Other', () => {
		const stray = { ...all[0], slug: 'stray', category: 'retired' }
		const groups = search.groupTemplates([stray], search.ALL_TEMPLATES)
		assert.deepEqual(groups.map((g) => g.id), ['other'])
	})
	check('counts follow the search', () => {
		const found = search.searchTemplates(all, 'webinar')
		assert.equal(search.countInCategory(found, search.ALL_TEMPLATES), found.length)
		assert.ok(search.countInCategory(found, 'events') >= 1)
		assert.equal(search.countInCategory(found, 'pricing'), 0)
	})
	check('the sidebar is All plus every category', () => {
		const tabs = search.templateTabs(all)
		assert.equal(tabs[0].id, 'all')
		assert.equal(tabs.length, TEMPLATE_CATEGORIES.length + 1)
	})
	check('Blank page stays listed unless the search is for something else', () => {
		assert.ok(search.blankMatches(''))
		assert.ok(search.blankMatches('blank'))
		assert.ok(search.blankMatches('Blank Page'))
		assert.ok(!search.blankMatches('contact'))
	})
}

if (problems.length) {
	console.log(problems.join('\n'))
	console.log(`\n${problems.length} problems`)
	process.exit(1)
}
const total = builderTemplates.length
const blocks = builderTemplates.reduce((n, t) => n + t.blocks.length, 0)
console.log(
	`${total} templates, ${blocks} sections, ${categoryIds.length} categories: ` +
		Object.entries(counts).map(([id, n]) => `${id} ${n}`).join(', '),
)
console.log('template checks passed')
