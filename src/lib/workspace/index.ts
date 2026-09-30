import 'server-only'
import { ObjectId, type Db } from 'mongodb'
import { getDb } from '@/lib/mongo'
import {
	ADMIN_ROLE_NAME,
	ALL_PERMISSIONS,
	sanitizePermissions,
	type Permission,
} from './permissions'
import {
	MEMBERS,
	ROLES,
	WORKSPACES,
	type MemberDoc,
	type RoleDoc,
	type WorkspaceDoc,
} from './types'

export type Membership = {
	db: Db
	userId: string
	workspace: WorkspaceDoc
	member: MemberDoc
	role: RoleDoc
	permissions: Set<Permission>
	/** The account holder. Always has every permission and cannot be removed. */
	isOwner: boolean
}

/**
 * Every signed-in user has exactly one account of their own, created the first
 * time they need it. Joining someone else's account does not replace it.
 *
 * Each step is a separate idempotent upsert rather than one insert sequence. A
 * page renders its layout and its body concurrently, so a brand new user fires
 * two of these at once; the one that loses the race on `workspaces` used to
 * return the winner's document before the winner's member row had landed, and
 * the caller then saw "not a member" on the very first page load.
 */
export async function ensureOwnWorkspace(userId: string) {
	const db = await getDb()
	const workspaces = db.collection<WorkspaceDoc>(WORKSPACES)

	// A session outliving its user (deleted account, restored database) must not
	// conjure an account for a person who no longer exists.
	const user = ObjectId.isValid(userId)
		? await db.collection('users').findOne({ _id: new ObjectId(userId) })
		: null
	if (!user) return null

	const now = new Date()
	const handle = (user.email as string | undefined)?.split('@')[0]

	let workspace = await workspaces.findOne({ ownerId: userId })
	if (!workspace) {
		await workspaces
			.updateOne(
				{ ownerId: userId },
				{
					$setOnInsert: {
						// The account switcher is unusable when every entry reads the same.
						name: handle ? `${handle}'s account` : 'My account',
						ownerId: userId,
						createdAt: now,
						updatedAt: now,
					},
				},
				{ upsert: true },
			)
			.catch(() => {})
		workspace = await workspaces.findOne({ ownerId: userId })
		if (!workspace) return null
	}

	const roles = db.collection<RoleDoc>(ROLES)
	let role = await roles.findOne({ workspaceId: workspace._id, system: true })
	if (!role) {
		await roles
			.updateOne(
				{ workspaceId: workspace._id, name: ADMIN_ROLE_NAME },
				{
					$setOnInsert: {
						workspaceId: workspace._id,
						name: ADMIN_ROLE_NAME,
						permissions: ALL_PERMISSIONS,
						system: true,
						createdAt: now,
					},
				},
				{ upsert: true },
			)
			.catch(() => {})
		role = await roles.findOne({ workspaceId: workspace._id, system: true })
		if (!role) return null
	}

	await db
		.collection<MemberDoc>(MEMBERS)
		.updateOne(
			{ workspaceId: workspace._id, userId },
			{
				$setOnInsert: {
					workspaceId: workspace._id,
					userId,
					roleId: role._id,
					createdAt: now,
				},
			},
			{ upsert: true },
		)
		.catch(() => {})

	return workspace
}

/**
 * The account a request acts on.
 *
 * `preferred` means the id is only a selection (the cookie), so one that is no
 * longer theirs falls back to their own account. Without that fallback a stale
 * cookie makes `/account` unreachable and it bounces against `/sign-in` forever.
 * An authorization check must NOT pass `preferred`: for those the named account
 * is the only acceptable answer, or a caller reaches someone else's site simply
 * by owning an account of their own.
 */
export async function resolveMembership(
	userId: string,
	workspaceId?: string | ObjectId | null,
	{ preferred = false }: { preferred?: boolean } = {},
): Promise<Membership | null> {
	const db = await getDb()

	const requested =
		workspaceId instanceof ObjectId
			? workspaceId
			: workspaceId && ObjectId.isValid(workspaceId)
				? new ObjectId(workspaceId)
				: null

	const members = db.collection<MemberDoc>(MEMBERS)

	let member = requested
		? await members.findOne({ workspaceId: requested, userId })
		: null

	if (!member && (preferred || !requested)) {
		const own = await ensureOwnWorkspace(userId)
		member = own
			? await members.findOne({ workspaceId: own._id, userId })
			: null
	}

	if (!member) return null

	const [workspace, role] = await Promise.all([
		db
			.collection<WorkspaceDoc>(WORKSPACES)
			.findOne({ _id: member.workspaceId }),
		db.collection<RoleDoc>(ROLES).findOne({ _id: member.roleId }),
	])
	if (!workspace || !role) return null

	const isOwner = workspace.ownerId === userId

	return {
		db,
		userId,
		workspace,
		member,
		role,
		// The owner is never gated by a role, or a bad role edit locks them out of
		// the account they own with nobody able to fix it.
		permissions: new Set(
			isOwner ? ALL_PERMISSIONS : sanitizePermissions(role.permissions),
		),
		isOwner,
	}
}

export const can = (membership: Membership, permission: Permission) =>
	membership.permissions.has(permission)

/** Every account this user can act in, their own first. */
export async function listMemberships(userId: string) {
	await ensureOwnWorkspace(userId)
	const db = await getDb()

	const members = await db
		.collection<MemberDoc>(MEMBERS)
		.find({ userId })
		.toArray()
	if (!members.length) return []

	const workspaces = await db
		.collection<WorkspaceDoc>(WORKSPACES)
		.find({ _id: { $in: members.map((m) => m.workspaceId) } })
		.toArray()

	return workspaces
		.map((workspace) => ({
			id: workspace._id.toString(),
			name: workspace.name,
			isOwner: workspace.ownerId === userId,
		}))
		.sort(
			(a, b) =>
				Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name),
		)
}

export async function adminRoleId(db: Db, workspaceId: ObjectId) {
	const role = await db
		.collection<RoleDoc>(ROLES)
		.findOne({ workspaceId, system: true })
	return role?._id ?? null
}
