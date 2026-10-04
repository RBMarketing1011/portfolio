// Loads this project's TypeScript source straight into a plain Node script, so a
// proof exercises the real modules instead of a copy that can drift from them.
//
// It transpiles per file (no type checking: `tsc` owns that), resolves the `@/`
// alias and extensionless relative imports the way the bundler does, and stubs the
// Next-only markers that would otherwise throw outside the framework.
//
//   const { loadTs } = require('./lib/load-ts.cjs')           // from a .cjs script
//   const { loadTs } = createRequire(import.meta.url)('./lib/load-ts.cjs') // from .mjs
//   const text = loadTs('src/lib/media/text.ts')
//
// Packages (mongodb, sharp, zod, react...) come from node_modules as normal.
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(ROOT, 'src')
const rootRequire = Module.createRequire(path.join(ROOT, 'package.json'))

const EXTENSIONS = ['.ts', '.tsx', '.js', '.cjs', '.json']

// `server-only` throws on import by design; outside Next there is no server/client
// split to protect, so it resolves to nothing.
const mocks = new Map([
	['server-only', {}],
	['client-only', {}],
])
const cache = new Map()

function resolveLocal(base) {
	const candidates = [
		base,
		...EXTENSIONS.map((ext) => base + ext),
		...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
	]
	for (const candidate of candidates) {
		try {
			if (fs.statSync(candidate).isFile()) return candidate
		} catch {
			// not a file, keep looking
		}
	}
	return null
}

function load(file) {
	const abs = path.resolve(ROOT, file)
	if (cache.has(abs)) return cache.get(abs).exports
	if (!/\.(ts|tsx)$/.test(abs)) return rootRequire(abs)

	const { outputText } = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			jsx: ts.JsxEmit.ReactJSX,
			esModuleInterop: true,
		},
		fileName: abs,
	})

	const mod = new Module(abs, null)
	mod.filename = abs
	mod.paths = Module._nodeModulePaths(path.dirname(abs))
	// Registered before executing, so a circular import sees the partial exports
	// exactly as it would under the real module system.
	cache.set(abs, mod)

	mod.require = (request) => {
		if (mocks.has(request)) return mocks.get(request)
		if (request.startsWith('@/')) {
			const found = resolveLocal(path.join(SRC, request.slice(2)))
			if (!found) throw new Error(`load-ts: cannot resolve ${request} from ${abs}`)
			return load(found)
		}
		if (request.startsWith('.')) {
			const found = resolveLocal(path.resolve(path.dirname(abs), request))
			if (!found) throw new Error(`load-ts: cannot resolve ${request} from ${abs}`)
			return load(found)
		}
		return rootRequire(request)
	}

	try {
		mod._compile(outputText, abs)
	} catch (error) {
		cache.delete(abs)
		throw error
	}
	return mod.exports
}

module.exports = {
	/** Path is relative to the project root, e.g. `src/lib/media/text.ts`. */
	loadTs: load,
	/** Replace a bare import (`next/server`, `@vercel/blob`) with a stand-in. */
	mock: (request, exports) => mocks.set(request, exports),
	/** Forget every loaded module, so the next load re-reads the files. */
	clearCache: () => cache.clear(),
	/**
	 * `require` anchored at the project root. A script kept outside the repo (the
	 * scratchpad) cannot resolve `mongodb`, `sharp` or `zod` on its own; this can.
	 */
	rootRequire,
	ROOT,
}
