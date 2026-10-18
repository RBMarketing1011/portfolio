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
	.collection('platformInvites')
	.createIndex({ tokenHash: 1 }, { unique: true })
await db.collection('platformInvites').createIndex({ email: 1 })
await db
	.collection('platformInvites')
	.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Blog posts. The app also creates these itself on first use.
await db.collection('blogPosts').createIndex({ slug: 1 }, { unique: true })
await db.collection('blogPosts').createIndex({ status: 1, publishAt: -1 })

// Password reset links. Looked up by hash; expiry is enforced in the query too.
await db
	.collection('passwordResets')
	.createIndex({ tokenHash: 1 }, { unique: true })
await db.collection('passwordResets').createIndex({ userId: 1 })
await db
	.collection('passwordResets')
	.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// Magic-link tokens: looked up by identifier and hash on redemption, single use
// (the adapter deletes them), and the TTL only clears the ones nobody opened.
await db
	.collection('verification_tokens')
	.createIndex({ identifier: 1, token: 1 }, { unique: true })
await db
	.collection('verification_tokens')
	.createIndex({ expires: 1 }, { expireAfterSeconds: 0 })

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

// Media library. Every query leads with the workspace, so every index does too.
const media = db.collection('mediaAssets')
// A blob is registered once per workspace. The unique index is what makes the
// upload webhook and the browser's own registration safe to race.
await media.createIndex({ workspaceId: 1, pathname: 1 }, { unique: true })
// One index per sort the library offers, each ending in _id in the same direction.
// Paging needs the _id tiebreak, and an index on { workspaceId, createdAt } cannot
// serve a sort by { createdAt, _id }: measured, it scans and sorts the whole library
// on every page. With _id in the key the default view reads 60 entries, not 5,000.
await media.createIndex({ workspaceId: 1, createdAt: -1, _id: -1 })
await media.createIndex({ workspaceId: 1, folderId: 1, createdAt: -1, _id: -1 })
await media.createIndex({ workspaceId: 1, nameKey: 1, _id: 1 })
await media.createIndex({ workspaceId: 1, bytes: -1, _id: -1 })
await media.createIndex({ workspaceId: 1, pixels: -1, _id: -1 })
// Multikey: `terms` narrows a text search, `tags.slug` serves tag: and the review queue.
await media.createIndex({ workspaceId: 1, terms: 1 })
await media.createIndex({ workspaceId: 1, 'tags.slug': 1 })
await media.createIndex({ workspaceId: 1, colorNames: 1 })
await media.createIndex({ workspaceId: 1, sha256: 1 })
await media.createIndex({ workspaceId: 1, 'tagging.status': 1 })
// Superseded by the _id-suffixed versions above (and by dropping project import).
for (const stale of [
	'workspaceId_1_createdAt_-1',
	'workspaceId_1_folderId_1_createdAt_-1',
	'workspaceId_1_origin.siteId_1',
]) {
	await media.dropIndex(stale).catch(() => {})
}
// Two siblings cannot share a name. A null parent is a value, so top-level
// folders collide with each other too, which is what we want.
await db
	.collection('mediaFolders')
	.createIndex({ workspaceId: 1, parentId: 1, nameKey: 1 }, { unique: true })
await db
	.collection('mediaTagRules')
	.createIndex({ workspaceId: 1, from: 1 }, { unique: true })
await db
	.collection('mediaSavedSearches')
	.createIndex({ workspaceId: 1, createdAt: -1 })
// Daily AI-spend counters. Housekeeping only; the day is part of the key.
await db
	.collection('mediaAiUsage')
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
