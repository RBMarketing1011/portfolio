// Ground-truth audit: reads real prop types via the TypeScript compiler, so it does
// not guess the way a regex does. Reports both unexposed props and dead controls.
const path = require('node:path')
const fs = require('node:fs')
const ts = require('typescript')

const root = path.join(__dirname, '..')
const srcDir = path.join(root, 'src')

const registrySrc = fs.readFileSync(
	path.join(srcDir, 'lib', 'builder', 'registry.ts'),
	'utf8',
)
const typeToComponent = new Map()
for (const m of registrySrc.matchAll(/^\t'?([\w-]+)'?:\s*(\w+),/gm)) {
	typeToComponent.set(m[1], m[2])
}

const sectionsDir = path.join(srcDir, 'components', 'sections')
const files = fs
	.readdirSync(sectionsDir)
	.filter((f) => f.endsWith('.tsx'))
	.map((f) => path.join(sectionsDir, f))

const program = ts.createProgram(files, {
	jsx: ts.JsxEmit.ReactJSX,
	target: ts.ScriptTarget.ES2017,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	strict: true,
	skipLibCheck: true,
	baseUrl: root,
	paths: { '@/*': ['src/*'] },
})
const checker = program.getTypeChecker()

/** name -> Map(propName -> typeString) */
const componentProps = new Map()

for (const file of program.getSourceFiles()) {
	if (!file.fileName.includes('components/sections')) continue
	ts.forEachChild(file, (node) => {
		if (!ts.isFunctionDeclaration(node) || !node.name) return
		const isExported = node.modifiers?.some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		)
		if (!isExported) return
		const param = node.parameters[0]
		if (!param) {
			componentProps.set(node.name.text, new Map())
			return
		}
		const type = checker.getTypeAtLocation(param)
		const props = new Map()
		for (const symbol of checker.getPropertiesOfType(type)) {
			const propType = checker.typeToString(
				checker.getTypeOfSymbolAtLocation(symbol, param),
			)
			props.set(symbol.getName(), propType)
		}
		componentProps.set(node.name.text, props)
	})
}

// Top-level schema field keys, read from the real schema objects.
const { loadSchema, fieldKeys, listShapes } = require('./load-schema.cjs')

const schemaFields = new Map()
const variantProps = new Map()
// type -> [key, 'scalar' | 'rows'] for every list field
const listFields = new Map()
for (const schema of loadSchema().sectionSchemas) {
	schemaFields.set(schema.type, fieldKeys(schema))
	listFields.set(schema.type, listShapes(schema))
	if (schema.variantProp) variantProps.set(schema.type, schema.variantProp)
}

const SKIP = new Set(['className', 'children', 'key', 'ref'])
// Props that exist but are not user-editable, with the reason they are exempt.
const EXEMPT = {
	'article-card': ['index'], // set by the parent for numbering
	'client-logo': ['mark'], // ReactNode slot
	'contact-split': ['form'], // ReactNode slot
	'split-hero': ['media'], // ReactNode slot, mediaSrc is the editable one
	'filter-bar': ['onChange'],
	pagination: ['hrefFor', 'onPageChange'],
	// The hydrator sets these from the `body` field when it holds authored HTML.
	callout: ['html'],
	'prose-block': ['html'],
}
// Fields the hydrator remaps rather than passing straight through.
const REMAPPED = { callout: ['body'], 'prose-block': ['body'] }
const isRenderOnly = (t) =>
	/=>/.test(t) || t.includes('ReactNode') || t.includes('LucideIcon')

let unexposed = 0
let dead = 0
let shapeErrors = 0
const lines = []

for (const [type, comp] of [...typeToComponent].sort()) {
	const props = componentProps.get(comp)
	const fields = schemaFields.get(type)
	if (!props) {
		lines.push(`${type}: component ${comp} not found`)
		continue
	}
	if (!fields) {
		lines.push(`${type}: no schema entry`)
		continue
	}
	const vp = variantProps.get(type)
	const exempt = new Set(EXEMPT[type] ?? [])
	const remapped = new Set(REMAPPED[type] ?? [])

	const missing = []
	for (const [name, propType] of props) {
		if (SKIP.has(name) || exempt.has(name) || name === vp || fields.has(name))
			continue
		missing.push(isRenderOnly(propType) ? `${name} (${propType})` : name)
	}
	if (missing.length) {
		unexposed += missing.length
		lines.push(`${type} (${comp})\n  UNEXPOSED: ${missing.join(', ')}`)
	}

	const deadFields = [...fields].filter(
		(f) => !props.has(f) && !remapped.has(f),
	)
	if (deadFields.length) {
		dead += deadFields.length
		lines.push(`${type} (${comp})\n  DEAD: ${deadFields.join(', ')}`)
	}

	// A list whose component prop is a plain array must be stored as one. The
	// hydrator only does that when the single row field is keyed `value`.
	for (const [key, kind] of listFields.get(type) ?? []) {
		const propType = props.get(key)
		if (!propType) continue
		const wantsScalars = /^\(?(string|number)(\s*\|\s*undefined)?\)?\[\]/.test(
			propType.replace(/\s*\|\s*undefined$/, ''),
		)
		if (wantsScalars && kind !== 'scalar') {
			shapeErrors++
			lines.push(
				`${type} (${comp})\n  SHAPE: ${key} feeds ${propType} but its row field is not keyed 'value'`,
			)
		}
		if (!wantsScalars && kind === 'scalar') {
			shapeErrors++
			lines.push(
				`${type} (${comp})\n  SHAPE: ${key} is stored as plain values but feeds ${propType}`,
			)
		}
	}
}

console.log(lines.join('\n') || 'every section matches its schema')
console.log(
	`\n${unexposed} unexposed props, ${dead} dead controls, ${shapeErrors} shape mismatches across ${typeToComponent.size} sections`,
)
process.exit(unexposed + dead + shapeErrors ? 1 : 0)
