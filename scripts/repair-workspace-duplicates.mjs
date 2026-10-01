/**
 * Repairs the duplicate accounts, members, and roles created while the unique
 * indexes were missing, then creates those indexes so it cannot happen again.
 *
 *   node --env-file=.env scripts/repair-workspace-duplicates.mjs          # dry run
 *   node --env-file=.env scripts/repair-workspace-duplicates.mjs --apply  # write
 *
 * Mongo's upsert is only idempotent under concurrency when a unique index backs
 * the filter. Without one, the two concurrent ensureOwnWorkspace calls that a
 * single page render fires both miss their findOne and both insert.
 */
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set.')
	process.exit(1)
}

const apply = process.argv.includes('--apply')
const label = apply ? 'APPLY' : 'DRY RUN'

const client = new MongoClient(uri)
await client.connect()
const db = client.db()

const workspaces = db.collection('workspaces')
const members = db.collection('workspaceMembers')
const roles = db.collection('workspaceRoles')
const invites = db.collection('workspaceInvites')
const sites = db.collection('sites')

const oldest = (docs) =>
	[...docs].sort((a, b) => {
		const byDate =
			new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
		return byDate !== 0 ? byDate : String(a._id).localeCompare(String(b._id))
	})

let merged = 0
let droppedMembers = 0
let droppedRoles = 0

console.log(`\n=== ${label} ===\n`)

// 1. One account per owner. Keep whichever actually holds work.
const ownerGroups = await workspaces
	.aggregate([
		{ $group: { _id: '$ownerId', ids: { $push: '$_id' }, n: { $sum: 1 } } },
		{ $match: { n: { $gt: 1 } } },
	])
	.toArray()

for (const group of ownerGroups) {
	const docs = await workspaces.find({ _id: { $in: group.ids } }).toArray()
	const weighed = await Promise.all(
		docs.map(async (doc) => ({
			doc,
			weight:
				(await sites.countDocuments({ workspaceId: doc._id })) * 1000 +
				(await members.countDocuments({ workspaceId: doc._id })),
		})),
	)
	const heaviest = Math.max(...weighed.map((w) => w.weight))
	const contenders = weighed.filter((w) => w.weight === heaviest).map((w) => w.doc)
	const keeper = oldest(contenders)[0]
	const losers = docs.filter((d) => !d._id.equals(keeper._id))

	console.log(
		`owner ${group._id}: keeping ${keeper._id}, merging ${losers.length} other(s)`,
	)

	for (const loser of losers) {
		const counts = {
			sites: await sites.countDocuments({ workspaceId: loser._id }),
			members: await members.countDocuments({ workspaceId: loser._id }),
			roles: await roles.countDocuments({ workspaceId: loser._id }),
			invites: await invites.countDocuments({ workspaceId: loser._id }),
		}
		console.log(`   ${loser._id} -> ${JSON.stringify(counts)}`)

		if (apply) {
			for (const [collection, name] of [
				[sites, 'sites'],
				[members, 'members'],
				[roles, 'roles'],
				[invites, 'invites'],
			]) {
				if (counts[name])
					await collection.updateMany(
						{ workspaceId: loser._id },
						{ $set: { workspaceId: keeper._id } },
					)
			}
			await workspaces.deleteOne({ _id: loser._id })
		}
		merged += 1
	}
}
if (!ownerGroups.length) console.log('no owners with more than one account')

// 2. One member row per person per account. Repointing above can create more.
const memberGroups = await members
	.aggregate([
		{
			$group: {
				_id: { workspaceId: '$workspaceId', userId: '$userId' },
				ids: { $push: '$_id' },
				n: { $sum: 1 },
			},
		},
		{ $match: { n: { $gt: 1 } } },
	])
	.toArray()

console.log(`\nduplicate member groups: ${memberGroups.length}`)
for (const group of memberGroups) {
	const docs = await members.find({ _id: { $in: group.ids } }).toArray()
	const [keeper, ...losers] = oldest(docs)
	console.log(
		`  user ${group._id.userId} in ${group._id.workspaceId}: dropping ${losers.length}`,
	)
	if (apply)
		await members.deleteMany({ _id: { $in: losers.map((d) => d._id) } })
	droppedMembers += losers.length
	void keeper
}

// 3. One role per name per account, with members repointed off the losers.
const roleGroups = await roles
	.aggregate([
		{
			$group: {
				_id: { workspaceId: '$workspaceId', name: '$name' },
				ids: { $push: '$_id' },
				n: { $sum: 1 },
			},
		},
		{ $match: { n: { $gt: 1 } } },
	])
	.toArray()

console.log(`\nduplicate role groups: ${roleGroups.length}`)
for (const group of roleGroups) {
	const docs = await roles.find({ _id: { $in: group.ids } }).toArray()
	const [keeper, ...losers] = oldest(docs)
	const loserIds = losers.map((d) => d._id)
	const affected = await members.countDocuments({ roleId: { $in: loserIds } })
	console.log(
		`  "${group._id.name}" in ${group._id.workspaceId}: dropping ${losers.length}, repointing ${affected} member(s)`,
	)
	if (apply) {
		if (affected)
			await members.updateMany(
				{ roleId: { $in: loserIds } },
				{ $set: { roleId: keeper._id } },
			)
		await roles.deleteMany({ _id: { $in: loserIds } })
	}
	droppedRoles += losers.length
}

// 4. The indexes that make the upserts idempotent in the first place.
const wanted = [
	[workspaces, { ownerId: 1 }, { unique: true }],
	[members, { workspaceId: 1, userId: 1 }, { unique: true }],
	[members, { userId: 1 }, {}],
	[roles, { workspaceId: 1, name: 1 }, { unique: true }],
]

console.log('\nindexes:')
for (const [collection, key, options] of wanted) {
	const exists = (await collection.indexes()).some(
		(index) => JSON.stringify(index.key) === JSON.stringify(key),
	)
	console.log(
		`  ${collection.collectionName} ${JSON.stringify(key)} ${exists ? 'present' : 'MISSING'}`,
	)
	if (apply && !exists) await collection.createIndex(key, options)
}

console.log(
	`\n${label}: merged ${merged} account(s), dropped ${droppedMembers} member row(s) and ${droppedRoles} role(s).`,
)
if (!apply) console.log('Nothing was written. Re-run with --apply to commit.')

await client.close()
