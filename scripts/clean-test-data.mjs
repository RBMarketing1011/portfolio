import { MongoClient } from 'mongodb'
import { del, list } from '@vercel/blob'

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db()

// example.com is reserved for documentation, so anything there is a test account.
// The prefixes cover the scripted ones, which use the real domain.
const users = await db
	.collection('users')
	.find({ email: { $regex: /(^(a_|b_|e2e_))|@example\.com$/ } })
	.toArray()
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

// Any blob left from an interrupted run still belongs to a deleted site.
const orphans = await list({ prefix: 'sites/' })
const liveIds = new Set(
	(await db.collection('sites').find({}).toArray()).map((s) =>
		s._id.toString(),
	),
)
const stale = orphans.blobs.filter(
	(b) => !liveIds.has(b.pathname.split('/')[1]),
)
if (stale.length) await del(stale.map((b) => b.url)).catch(() => {})

console.log(
	`removed ${removedUsers.deletedCount} test users, ${removedSites.deletedCount + ownerless.length} sites, ${deadWorkspaces.length} accounts, ${removedMembers.deletedCount} stray memberships, ${stale.length} orphaned blobs`,
)

await client.close()
