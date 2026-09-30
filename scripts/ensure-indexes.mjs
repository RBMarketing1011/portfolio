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
await db.collection('sites').createIndex({ workspaceId: 1, updatedAt: -1 })
// Subdomains and custom domains are hostnames, so they are unique globally.
await db
	.collection('sites')
	.createIndex({ subdomain: 1 }, { unique: true, sparse: true })
// Partial, not sparse: an explicit null is a value, and every project without a
// custom domain holds one, so they would all collide.
await db.collection('sites').createIndex(
	{ customDomain: 1 },
	{
		unique: true,
		partialFilterExpression: { customDomain: { $type: 'string' } },
	},
)
await db
	.collection('sites')
	.createIndex({ previewToken: 1 }, { unique: true, sparse: true })
await db.collection('sites').createIndex({ 'media.pathname': 1 })

// One account per owner. This uniqueness is what makes first-touch creation safe
// against two parallel requests.
await db.collection('workspaces').createIndex({ ownerId: 1 }, { unique: true })
await db
	.collection('workspaceMembers')
	.createIndex({ workspaceId: 1, userId: 1 }, { unique: true })
await db.collection('workspaceMembers').createIndex({ userId: 1 })
await db
	.collection('workspaceRoles')
	.createIndex({ workspaceId: 1, name: 1 }, { unique: true })
await db
	.collection('workspaceInvites')
	.createIndex({ tokenHash: 1 }, { unique: true })
await db
	.collection('workspaceInvites')
	.createIndex({ workspaceId: 1, email: 1 })
await db
	.collection('workspaceInvites')
	.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

await db
	.collection('sessions')
	.createIndex({ sessionToken: 1 }, { unique: true })
await db
	.collection('accounts')
	.createIndex({ provider: 1, providerAccountId: 1 })
// Failed sign-in counters. Expiry is enforced in the query too, so this only
// keeps the collection from growing.
await db
	.collection('authAttempts')
	.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const names = await db.listCollections().toArray()
console.log(
	'indexes ensured on:',
	names
		.map((c) => c.name)
		.sort()
		.join(', '),
)

await client.close()
