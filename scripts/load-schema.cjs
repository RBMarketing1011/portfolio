// Loads the real section schema by transpiling schema.ts, so the guards read
// actual objects instead of regexing source that helper functions now build.
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const schemaPath = path.join(
	__dirname,
	'..',
	'src',
	'lib',
	'builder',
	'schema.ts',
)

function loadSchema() {
	const source = fs.readFileSync(schemaPath, 'utf8')
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
		},
		fileName: schemaPath,
	})

	const mod = new Module(schemaPath, null)
	mod.filename = schemaPath
	mod.paths = Module._nodeModulePaths(path.dirname(schemaPath))
	// `./types` is types-only, so the transpiled require must resolve to nothing.
	const originalRequire = mod.require.bind(mod)
	mod.require = (request) =>
		request.startsWith('.') ? {} : originalRequire(request)
	mod._compile(outputText, schemaPath)

	return mod.exports
}

/** Every top-level field key a section exposes, dotted keys reduced to their root. */
function fieldKeys(schema) {
	const keys = new Set()
	for (const field of schema.fields ?? []) {
		keys.add(String(field.key).split('.')[0])
	}
	return keys
}

/** [key, 'scalar' | 'rows'] for every list field on a section. */
function listShapes(schema) {
	return (schema.fields ?? [])
		.filter((field) => field.type === 'list')
		.map((field) => {
			const of = field.of ?? []
			const scalar = of.length === 1 && of[0].key === 'value'
			return [field.key, scalar ? 'scalar' : 'rows']
		})
}

module.exports = { loadSchema, fieldKeys, listShapes }
