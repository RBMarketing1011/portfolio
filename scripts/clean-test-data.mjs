import { MongoClient } from 'mongodb'
import { del, list } from '@vercel/blob'

// This deletes people. A hosted cluster is somebody's production until proven
// otherwise, so it needs saying twice.
const uri = process.env.MONGODB_URI ?? ''
const host = uri
	.replace(/^mongodb(\+srv)?:\/\//, '')
	.replace(/^[^@]*@/, '')
	.split(/[/?]/)[0]
const local =
	/^mongodb:\/\//.test(uri) && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)
if (!local && process.env.ALLOW_PROD_CLEAN !== '1') {
	console.error(
		`Refusing to clean "${host || '(no MONGODB_URI)'}": not a local database. Set ALLOW_PROD_CLEAN=1 if you really mean it.`,
	)
	process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const db = client.db()

// example.com and example.test are reserved for documentation and testing, so
// an address there can only be a test account. Nothing else is ever matched.
const users = await db
	.collection('users')
	.find({ email: { $regex: /@example\.(com|test)$/i } })
	.toArray()
if (users.length)
	console.log('removing:', users.map((u) => u.email).join(', '))
const ids = users.map((u) => u._id.toString())

const sites = await db
	.collection('sites')
	.find({ ownerId: { $in: ids } })
	.toArray()

for (const site of sites) {
	const urls = (site.media ?? []).map((m) => m.url)
	if (urls.length) await del(urls).catch(() => {})
}

const removedSites = await db
	.collection('sites')
	.deleteMany({ ownerId: { $in: ids } })
const removedUsers = await db
	.collection('users')
	.deleteMany({ _id: { $in: users.map((u) => u._id) } })

// Everything the auth flows leave behind for those addresses.
const emails = users.map((u) => u.email)
for (const name of [
	'platformInvites',
	'workspaceInvites',
	'passwordResets',
	'verification_tokens',
])
	await db
		.collection(name)
		.deleteMany({ $or: [{ email: { $in: emails } }, { identifier: { $in: emails } }] })
await db
	.collection('authAttempts')
	.deleteMany({ _id: { $regex: /@example\.(com|test)$/i } })

// Accounts, roles, memberships and invitations all hang off a user. Deleting the
// user without them leaves orphans that still satisfy a membership lookup.
const liveUserIds = new Set(
	(
		await db
			.collection('users')
			.find({}, { projection: { _id: 1 } })
			.toArray()
	).map((u) => u._id.toString()),
)

const deadWorkspaces = (await db.collection('workspaces').find({}).toArray())
	.filter((w) => !liveUserIds.has(w.ownerId))
	.map((w) => w._id)

if (deadWorkspaces.length) {
	await db.collection('workspaces').deleteMany({ _id: { $in: deadWorkspaces } })
	for (const name of ['workspaceRoles', 'workspaceMembers', 'workspaceInvites'])
		await db
			.collection(name)
			.deleteMany({ workspaceId: { $in: deadWorkspaces } })
	await db
		.collection('sites')
		.deleteMany({ workspaceId: { $in: deadWorkspaces } })
}

// A membership pointing at a user who no longer exists survives the sweep above
// when the account itself is still someone else's.
const removedMembers = await db
	.collection('workspaceMembers')
	.deleteMany({ userId: { $nin: [...liveUserIds] } })

// A run that was interrupted between the two deletes leaves a site with no owner.
const owners = new Set(
	(
		await db
			.collection('users')
			.find({}, { projection: { _id: 1 } })
			.toArray()
	).map((u) => u._id.toString()),
)
const ownerless = await db
	.collection('sites')
	.find({})
	.toArray()
	.then((all) => all.filter((s) => !owners.has(s.ownerId)))
for (const site of ownerless) {
	const urls = (site.media ?? []).map((m) => m.url)
	if (urls.length) await del(urls).catch(() => {})
}
if (ownerless.length)
	await db
		.collection('sites')
		.deleteMany({ _id: { $in: ownerless.map((s) => s._id) } })

// Any blob left from an interrupted run still belongs to a deleted site. The
// sweep compares the blob store against THIS database, so pointed at a local
// proof database with the production blob token it would wipe every live
// customer's media. It only runs when asked for, against a store you mean.
let stale = []
if (process.env.CLEAN_BLOBS === '1') {
	const orphans = await list({ prefix: 'sites/' })
	const liveIds = new Set(
		(await db.collection('sites').find({}).toArray()).map((s) =>
			s._id.toString(),
		),
	)
	stale = orphans.blobs.filter((b) => !liveIds.has(b.pathname.split('/')[1]))
	if (stale.length) await del(stale.map((b) => b.url)).catch(() => {})
} else {
	console.log('blob sweep skipped (set CLEAN_BLOBS=1 to run it)')
}

console.log(
	`removed ${removedUsers.deletedCount} test users, ${removedSites.deletedCount + ownerless.length} sites, ${deadWorkspaces.length} accounts, ${removedMembers.deletedCount} stray memberships, ${stale.length} orphaned blobs`,
)

await client.close()
