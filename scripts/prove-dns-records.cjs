/**
 * The records shown to a customer must be the ones Vercel currently recommends,
 * not a constant compiled in months earlier. Vercel is expanding its IP range,
 * and the old values are already ranked below what their dashboard shows.
 */
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const file = path.join(
	__dirname,
	'..',
	'src',
	'lib',
	'builder',
	'dns-records.ts',
)

const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
	fileName: file,
})

const mod = new Module(file, null)
mod.filename = file
mod.paths = Module._nodeModulePaths(path.dirname(file))
mod._compile(outputText, file)
const { requiredRecords } = mod.exports

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

// Shaped exactly like a real /v6/domains/{domain}/config response, with the
// ranks deliberately out of order so nothing can pass by reading index 0.
const config = {
	misconfigured: false,
	recommendedIPv4: [
		{ rank: 2, value: ['76.76.21.21'] },
		{ rank: 1, value: ['216.150.1.1', '216.150.16.1'] },
	],
	recommendedCNAME: [
		{ rank: 2, value: 'cname.vercel-dns.com.' },
		{ rank: 1, value: '3ce87dca2e43a89e.vercel-dns-017.com.' },
	],
}

const apex = requiredRecords('lnm-testing.xyz', config)
record(
	'an apex gets A records, never a CNAME',
	apex.length > 0 && apex.every((item) => item.type === 'A'),
	apex.map((item) => item.type).join(','),
)
record(
	"an apex uses Vercel's rank 1 address",
	apex.some((item) => item.value === '216.150.1.1'),
	apex.map((item) => item.value).join(', '),
)
record(
	'the legacy address is not offered when a recommendation exists',
	!apex.some((item) => item.value === '76.76.21.21'),
	apex.map((item) => item.value).join(', '),
)
record(
	'every rank 1 address is offered',
	apex.length === 2 && apex.some((item) => item.value === '216.150.16.1'),
	`${apex.length} records`,
)

const sub = requiredRecords('www.lnm-testing.xyz', config)
record(
	'a subdomain gets one CNAME on its own label',
	sub.length === 1 && sub[0].type === 'CNAME' && sub[0].name === 'www',
	`${sub[0] && sub[0].type} ${sub[0] && sub[0].name}`,
)
record(
	"a subdomain uses Vercel's account-specific target",
	sub[0].value === '3ce87dca2e43a89e.vercel-dns-017.com',
	sub[0].value,
)
record(
	'the trailing dot is stripped for registrars',
	!sub[0].value.endsWith('.'),
	sub[0].value,
)

// The API can be down; the instructions still have to say something that works.
const offline = requiredRecords('lnm-testing.xyz', null)
record(
	'falls back to the legacy record when Vercel cannot be read',
	offline.length === 1 && offline[0].value === '76.76.21.21',
	offline[0].value,
)

// A registrar will not accept a CNAME at a zone apex, so a two-part TLD must
// not be mistaken for a subdomain.
const couk = requiredRecords('example.co.uk', config)
record(
	'a two-part TLD is treated as an apex',
	couk.every((item) => item.type === 'A'),
	couk.map((item) => item.type).join(','),
)
const deep = requiredRecords('shop.example.co.uk', config)
record(
	'a real subdomain of a two-part TLD still gets a CNAME',
	deep.length === 1 && deep[0].type === 'CNAME' && deep[0].name === 'shop',
	`${deep[0].type} ${deep[0].name}`,
)

// An empty recommendation array must not produce an empty instruction.
const empty = requiredRecords('lnm-testing.xyz', {
	misconfigured: false,
	recommendedIPv4: [],
})
record(
	'an empty recommendation falls back rather than showing nothing',
	empty.length === 1 && empty[0].value === '76.76.21.21',
	empty.map((item) => item.value).join(', '),
)

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
