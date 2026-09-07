// Guards against the registry and schema drifting apart. Dev-only.
const fs = require('fs')

const reg = fs.readFileSync('src/lib/builder/registry.ts', 'utf8')
const sch = fs.readFileSync('src/lib/builder/schema.ts', 'utf8')

const body = reg.slice(
	reg.indexOf('sectionRegistry'),
	reg.indexOf('export function isKnownSection'),
)
const regKeys = [...body.matchAll(/^\t'?([a-z][a-z0-9-]*)'?:/gm)].map(
	(m) => m[1],
)
const schKeys = [...sch.matchAll(/^\t\ttype: '([^']+)'/gm)].map((m) => m[1])

const onlySchema = schKeys.filter((k) => !regKeys.includes(k))
const onlyRegistry = regKeys.filter((k) => !schKeys.includes(k))

console.log('registry keys: ' + regKeys.length)
console.log('schema types:  ' + schKeys.length)
console.log(
	onlySchema.length
		? 'MISSING FROM REGISTRY: ' + onlySchema.join(', ')
		: 'registry covers every schema type',
)
console.log(
	onlyRegistry.length
		? 'MISSING FROM SCHEMA: ' + onlyRegistry.join(', ')
		: 'schema covers every registry key',
)

if (onlySchema.length || onlyRegistry.length) process.exit(1)
