import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set.')
	process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const db = client.db()

// Auth.js creates users itself, but nothing stops a duplicate email without this.
await db.collection('users').createIndex({ email: 1 }, { unique: true })
await db.collection('sites').createIndex({ ownerId: 1, updatedAt: -1 })
await db.collection('sites').createIndex({ 'media.pathname': 1 })
await db
	.collection('sessions')
	.createIndex({ sessionToken: 1 }, { unique: true })
await db
	.collection('accounts')
	.createIndex({ provider: 1, providerAccountId: 1 })

const names = await db.listCollections().toArray()
console.log(
	'indexes ensured on:',
	names
		.map((c) => c.name)
		.sort()
		.join(', '),
)

await client.close()
