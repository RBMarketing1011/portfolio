// Dev-only: checks each schema field against the component's defaults by rendering
// nothing — it only proves the schema/registry contract, not runtime behaviour.
// Runtime edit/reset behaviour is verified by verify-inspector.mjs in the browser.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', 'src', 'lib', 'builder')
const schemaSrc = fs.readFileSync(path.join(root, 'schema.ts'), 'utf8')

const entries = [...schemaSrc.matchAll(/\n\t\ttype: '([\w-]+)',/g)]
const problems = []

for (let i = 0; i < entries.length; i++) {
	const start = entries[i].index
	const end = i + 1 < entries.length ? entries[i + 1].index : schemaSrc.length
	const body = schemaSrc.slice(start, end)
	const type = entries[i][1]

	const hasVariants = /variants:/.test(body)
	const hasVariantProp = /variantProp:/.test(body)
	if (hasVariants !== hasVariantProp) {
		problems.push(
			`${type}: ${hasVariants ? 'variants without variantProp' : 'variantProp without variants'}`,
		)
	}

	// A select field with no options renders an empty dropdown.
	for (const m of body.matchAll(/type: 'select'/g)) {
		const after = body.slice(m.index, m.index + 400)
		if (!/options:/.test(after))
			problems.push(`${type}: select field has no options`)
	}

	// A list field with no `of` cannot add rows.
	for (const m of body.matchAll(/type: 'list'/g)) {
		const after = body.slice(m.index, m.index + 400)
		if (!/of:/.test(after))
			problems.push(`${type}: list field has no row fields`)
	}

	const keys = [...body.matchAll(/key: '([\w.]+)'/g)].map((m) => m[1])
	const dupes = keys.filter((k, idx) => keys.indexOf(k) !== idx)
	if (dupes.length)
		problems.push(
			`${type}: duplicate field keys ${[...new Set(dupes)].join(', ')}`,
		)
}

console.log(problems.join('\n') || `${entries.length} schemas well formed`)
process.exit(problems.length ? 1 : 0)
