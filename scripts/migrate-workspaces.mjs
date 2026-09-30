/**
 * Backfills the account model onto data that predates it: every distinct site
 * owner gets a workspace, an Admin role, a membership, and their sites are
 * pointed at it. Safe to run repeatedly.
 */
import { randomBytes } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'

const ALL_PERMISSIONS = [
	'projects.view',
	'projects.create',
	'projects.edit',
	'projects.publish',
	'projects.delete',
	'media.upload',
	'media.delete',
	'team.view',
	'team.invite',
	'team.manage',
	'roles.manage',
	'account.manage',
]

const slugify = (value) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'site'

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db()

const users = await db.collection('users').find({}).toArray()
let workspacesMade = 0
let membershipsMade = 0
let renamed = 0

// "My account" for everyone makes the account switcher unreadable.
for (const stale of await db
	.collection('workspaces')
	.find({ name: 'My account' })
	.toArray()) {
	const owner = users.find((user) => user._id.toString() === stale.ownerId)
	const handle = owner?.email?.split('@')[0]
	if (!handle) continue
	await db
		.collection('workspaces')
		.updateOne({ _id: stale._id }, { $set: { name: `${handle}'s account` } })
	renamed += 1
}

for (const user of users) {
	const userId = user._id.toString()
	let workspace = await db.collection('workspaces').findOne({ ownerId: userId })

	if (!workspace) {
		const now = new Date()
		const inserted = await db.collection('workspaces').insertOne({
			name: `${(user.email ?? 'my').split('@')[0]}'s account`,
			ownerId: userId,
			createdAt: now,
			updatedAt: now,
		})
		workspace = { _id: inserted.insertedId }
		workspacesMade += 1
	}

	let role = await db
		.collection('workspaceRoles')
		.findOne({ workspaceId: workspace._id, system: true })
	if (!role) {
		const inserted = await db.collection('workspaceRoles').insertOne({
			workspaceId: workspace._id,
			name: 'Admin',
			permissions: ALL_PERMISSIONS,
			system: true,
			createdAt: new Date(),
		})
		role = { _id: inserted.insertedId }
	} else {
		// An Admin role that has drifted from the catalogue is how an owner loses
		// access to a feature added after their account was created.
		await db
			.collection('workspaceRoles')
			.updateOne({ _id: role._id }, { $set: { permissions: ALL_PERMISSIONS } })
	}

	const member = await db
		.collection('workspaceMembers')
		.findOne({ workspaceId: workspace._id, userId })
	if (!member) {
		await db.collection('workspaceMembers').insertOne({
			workspaceId: workspace._id,
			userId,
			roleId: role._id,
			createdAt: new Date(),
		})
		membershipsMade += 1
	}
}

const sites = await db.collection('sites').find({}).toArray()
let sitesMoved = 0
const takenSubdomains = new Set(
	sites.map((site) => site.subdomain).filter(Boolean),
)

for (const site of sites) {
	const patch = {}

	if (!site.workspaceId) {
		const workspace = await db
			.collection('workspaces')
			.findOne({ ownerId: site.ownerId })
		if (!workspace) {
			console.warn(`site ${site._id} has no resolvable owner; left alone`)
			continue
		}
		patch.workspaceId = workspace._id
	}

	// `slug` was per account and never reached a URL. A subdomain is a hostname,
	// so it has to be unique across every account.
	if (!site.subdomain) {
		const base = slugify(site.slug || site.name || 'site')
		const root = base.length >= 3 ? base : `${base}-site`
		let candidate = root
		let n = 2
		while (takenSubdomains.has(candidate)) {
			candidate = `${root}-${n}`
			n += 1
		}
		takenSubdomains.add(candidate)
		patch.subdomain = candidate
	}

	if (site.customDomain === undefined) patch.customDomain = null
	if (site.customDomainVerifiedAt === undefined)
		patch.customDomainVerifiedAt = null
	if (site.customDomainRecords === undefined) patch.customDomainRecords = []
	if (site.customDomainMisconfigured === undefined)
		patch.customDomainMisconfigured = true
	if (site.customDomainCheckedAt === undefined)
		patch.customDomainCheckedAt = null
	if (!site.previewToken)
		patch.previewToken = randomBytes(24).toString('base64url')
	if (!site.status) patch.status = 'draft'
	if (site.publishedAt === undefined) patch.publishedAt = null

	if (Object.keys(patch).length) {
		await db
			.collection('sites')
			.updateOne(
				{ _id: new ObjectId(site._id) },
				{ $set: patch, $unset: { slug: '' } },
			)
		sitesMoved += 1
	}
}

console.log(
	`workspaces created: ${workspacesMade}, renamed: ${renamed}, memberships created: ${membershipsMade}, sites updated: ${sitesMoved}`,
)

await client.close()
