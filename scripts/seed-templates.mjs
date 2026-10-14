// Seeds the page template catalog into MongoDB. Run with `pnpm db:seed`.
// The catalog is TypeScript split across modules, so it is loaded through the
// same loader the proofs use rather than imported directly.
import { createRequire } from 'node:module'
import { MongoClient } from 'mongodb'

const require = createRequire(import.meta.url)
const { loadTs } = require('./lib/load-ts.cjs')
const { builderTemplates } = loadTs('src/lib/builder/templates/index.ts')
const { templateSchema } = loadTs('src/lib/builder/page-schema.ts')

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set. Run `pnpm db:up` first.')
	process.exit(1)
}

// Refuse to seed anything the app would then throw away when it reads it back.
const invalid = builderTemplates.filter((t) => !templateSchema.safeParse(t).success)
if (invalid.length) {
	console.error(`not seeding: ${invalid.map((t) => t.slug).join(', ')} fail templateSchema`)
	process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const db = client.db()
const collection = db.collection('templates')

await collection.createIndex({ slug: 1 }, { unique: true })

for (const [index, template] of builderTemplates.entries()) {
	// JSON round trip so no `undefined` reaches the driver (it would store null).
	const doc = JSON.parse(JSON.stringify(template))
	await collection.replaceOne(
		{ slug: template.slug },
		{ ...doc, order: index, seededAt: new Date() },
		{ upsert: true },
	)
}

const stale = await collection.deleteMany({
	slug: { $nin: builderTemplates.map((t) => t.slug) },
})

console.log(`seeded ${builderTemplates.length} templates into ${db.databaseName}`)
if (stale.deletedCount) console.log(`removed ${stale.deletedCount} stale templates`)

await client.close()
