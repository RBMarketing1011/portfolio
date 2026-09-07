// Seeds the template catalog into MongoDB. Run with `pnpm db:seed`.
import { MongoClient } from 'mongodb'
import { builderTemplates } from '../src/lib/builder/templates.ts'

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set. Run `pnpm db:up` first.')
	process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const db = client.db()
const collection = db.collection('templates')

await collection.createIndex({ slug: 1 }, { unique: true })

for (const [index, template] of builderTemplates.entries()) {
	await collection.updateOne(
		{ slug: template.slug },
		{ $set: { ...template, order: index, seededAt: new Date() } },
		{ upsert: true },
	)
}

const stale = await collection.deleteMany({
	slug: { $nin: builderTemplates.map((t) => t.slug) },
})

console.log(`seeded ${builderTemplates.length} templates into ${db.databaseName}`)
if (stale.deletedCount) console.log(`removed ${stale.deletedCount} stale templates`)

await client.close()
