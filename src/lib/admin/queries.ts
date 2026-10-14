import 'server-only'
import { getDb } from '@/lib/mongo'
import type { SiteDoc } from '@/lib/builder/site-doc'
import {
	MEMBERS,
	ROLES,
	WORKSPACES,
	type MemberDoc,
	type RoleDoc,
	type WorkspaceDoc,
} from '@/lib/workspace/types'

type UserRow = { _id: { toString(): string }; email?: string; name?: string | null; role?: string; createdAt?: Date }

export async function loadAdminData() {
	const db = await getDb()
	const [workspaces, members, roles, sites, users] = await Promise.all([
		db.collection<WorkspaceDoc>(WORKSPACES).find({}).toArray(),
		db.collection<MemberDoc>(MEMBERS).find({}).toArray(),
		db.collection<RoleDoc>(ROLES).find({}).toArray(),
		db
			.collection<SiteDoc>('sites')
			.find({}, { projection: { name: 1, subdomain: 1, customDomain: 1, status: 1, workspaceId: 1, updatedAt: 1, 'site.pages': 1 } })
			.sort({ updatedAt: -1 })
			.toArray(),
		db
			.collection('users')
			.find({}, { projection: { email: 1, name: 1, role: 1, createdAt: 1 } })
			.sort({ createdAt: -1 })
			.toArray() as Promise<UserRow[]>,
	])

	const adminIds = new Set(
		users.filter((u) => u.role === 'admin').map((u) => u._id.toString()),
	)
	const userById = new Map(users.map((u) => [u._id.toString(), u]))
	const accountName = new Map(workspaces.map((w) => [w._id.toString(), w.name]))

	const roleName = new Map(roles.map((r) => [r._id.toString(), r.name]))
	const workspaceById = new Map(workspaces.map((w) => [w._id.toString(), w]))
	const membershipsOf = new Map<
		string,
		{ account: string; role: string; isOwner: boolean }[]
	>()
	for (const m of members) {
		const workspace = workspaceById.get(m.workspaceId.toString())
		if (!workspace) continue
		const list = membershipsOf.get(m.userId) ?? []
		const isOwner = workspace.ownerId === m.userId
		list.push({
			account: workspace.name,
			role: isOwner ? 'Owner' : (roleName.get(m.roleId.toString()) ?? 'Member'),
			isOwner,
		})
		membershipsOf.set(m.userId, list)
	}

	const memberCount = new Map<string, number>()
	const accountsOf = new Map<string, number>()
	for (const m of members) {
		const key = m.workspaceId.toString()
		memberCount.set(key, (memberCount.get(key) ?? 0) + 1)
		accountsOf.set(m.userId, (accountsOf.get(m.userId) ?? 0) + 1)
	}
	const siteCount = new Map<string, number>()
	for (const s of sites)
		siteCount.set(
			s.workspaceId.toString(),
			(siteCount.get(s.workspaceId.toString()) ?? 0) + 1,
		)

	return {
		// An admin's own workspace is not a place to build, so it is not listed.
		accounts: workspaces
			.filter((w) => !adminIds.has(w.ownerId))
			.map((w) => ({
				id: w._id.toString(),
				name: w.name,
				owner: userById.get(w.ownerId)?.email ?? 'Unknown',
				members: memberCount.get(w._id.toString()) ?? 0,
				sites: siteCount.get(w._id.toString()) ?? 0,
				createdAt: w.createdAt,
			}))
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
		sites: sites.map((s) => ({
			id: s._id.toString(),
			name: s.name,
			workspaceId: s.workspaceId.toString(),
			account: accountName.get(s.workspaceId.toString()) ?? 'Unknown',
			address: s.customDomain ?? s.subdomain,
			status: s.status ?? 'draft',
			pages: s.site?.pages?.length ?? 0,
			updatedAt: s.updatedAt,
		})),
		people: users.map((u) => ({
			id: u._id.toString(),
			email: u.email ?? '',
			name: u.name ?? null,
			role: u.role === 'admin' ? ('admin' as const) : ('member' as const),
			accounts: accountsOf.get(u._id.toString()) ?? 0,
			memberships: (membershipsOf.get(u._id.toString()) ?? []).sort(
				(a, b) => Number(b.isOwner) - Number(a.isOwner),
			),
			createdAt: u.createdAt ?? null,
		})),
	}
}

export const formatDate = (date: Date | null) =>
	date
		? date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			})
		: '—'
