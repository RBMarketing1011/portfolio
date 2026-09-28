import { MongoClient } from 'mongodb'
import { del, list } from '@vercel/blob'

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db()

const users = await db
	.collection('users')
	.find({ email: /^(a_|b_|e2e_)/ })
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
	`removed ${removedUsers.deletedCount} test users, ${removedSites.deletedCount} sites, ${stale.length} orphaned blobs`,
)

await client.close()
