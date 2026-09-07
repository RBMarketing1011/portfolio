// Emits every section's fields so the browser sweep can assert a control exists
// for each one, rather than trusting that the schema and component merely match.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.join(__dirname, '..')
const schemaPath = path.join(root, 'src', 'lib', 'builder', 'schema.ts')

const program = ts.createProgram([schemaPath], {
	target: ts.ScriptTarget.ES2017,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	skipLibCheck: true,
	baseUrl: root,
	paths: { '@/*': ['src/*'] },
})
const file = program.getSourceFile(schemaPath)

// Shared row-field arrays are referenced by name, so resolve them up front.
const sharedArrays = new Map()
ts.forEachChild(file, (node) => {
	if (!ts.isVariableStatement(node)) return
	for (const decl of node.declarationList.declarations) {
		if (
			ts.isIdentifier(decl.name) &&
			decl.initializer &&
			ts.isArrayLiteralExpression(decl.initializer)
		) {
			sharedArrays.set(decl.name.text, decl.initializer)
		}
	}
})

/** Reads the literal call helpers back into { key, label, type }. */
function readField(node) {
	if (ts.isCallExpression(node)) {
		const fn = node.expression.getText(file)
		const args = node.arguments
		const key = args[0] && ts.isStringLiteral(args[0]) ? args[0].text : null
		const label = args[1] && ts.isStringLiteral(args[1]) ? args[1].text : null
		const map = {
			text: 'text',
			area: 'textarea',
			rich: 'richtext',
			num: 'number',
			bool: 'boolean',
			list: 'list',
			tint: 'tint',
		}
		if (!map[fn] || !key) return null
		const out = { key, label, type: map[fn] }
		if (fn === 'list') {
			out.rowLabel =
				args[2] && ts.isStringLiteral(args[2]) ? args[2].text : null
			const of = args[3]
			const arr = of && ts.isIdentifier(of) ? sharedArrays.get(of.text) : of
			out.of =
				arr && ts.isArrayLiteralExpression(arr)
					? arr.elements.map(readField).filter(Boolean)
					: []
		}
		return out
	}
	if (ts.isObjectLiteralExpression(node)) {
		const out = {}
		for (const prop of node.properties) {
			if (!ts.isPropertyAssignment(prop)) continue
			const name = prop.name.getText(file)
			if (ts.isStringLiteral(prop.initializer))
				out[name] = prop.initializer.text
			else if (ts.isArrayLiteralExpression(prop.initializer) && name === 'of')
				out.of = prop.initializer.elements.map(readField).filter(Boolean)
		}
		return out.key ? out : null
	}
	if (ts.isIdentifier(node)) {
		const shared = {
			eyebrow: { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
			description: {
				key: 'description',
				label: 'Description',
				type: 'textarea',
			},
			columns: { key: 'columns', label: 'Columns', type: 'select' },
		}
		return shared[node.getText(file)] ?? null
	}
	return null
}

const sections = []
function visit(node) {
	if (
		ts.isVariableDeclaration(node) &&
		node.name.getText(file) === 'sectionSchemas' &&
		node.initializer &&
		ts.isArrayLiteralExpression(node.initializer)
	) {
		for (const entry of node.initializer.elements) {
			if (!ts.isObjectLiteralExpression(entry)) continue
			const section = { fields: [], variants: [] }
			for (const prop of entry.properties) {
				if (!ts.isPropertyAssignment(prop)) continue
				const name = prop.name.getText(file)
				if (ts.isStringLiteral(prop.initializer))
					section[name] = prop.initializer.text
				if (name === 'fields' && ts.isArrayLiteralExpression(prop.initializer))
					section.fields = prop.initializer.elements
						.map(readField)
						.filter(Boolean)
				if (name === 'variants') section.hasVariants = true
				if (name === 'container') section.container = true
			}
			if (section.type) sections.push(section)
		}
	}
	ts.forEachChild(node, visit)
}
visit(file)

fs.writeFileSync(
	path.join(root, '.section-manifest.json'),
	JSON.stringify(sections),
)
const fieldCount = sections.reduce((n, s) => n + s.fields.length, 0)
console.log(`${sections.length} sections, ${fieldCount} top-level fields`)
const noLabel = sections.flatMap((s) =>
	s.fields.filter((f) => !f.label).map((f) => `${s.type}.${f.key}`),
)
if (noLabel.length) console.log('fields without a label:', noLabel.join(', '))
