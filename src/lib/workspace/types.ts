import type { ObjectId } from 'mongodb'
import type { Permission } from './permissions'

/**
 * Auth.js owns the `accounts` collection for provider links, so the tenant is
 * `workspaces` in the database. Everywhere a person can read it, it is "account".
 */
export type WorkspaceDoc = {
	_id: ObjectId
	name: string
	ownerId: string
	createdAt: Date
	updatedAt: Date
}

export type RoleDoc = {
	_id: ObjectId
	workspaceId: ObjectId
	name: string
	permissions: Permission[]
	/** The built-in Admin role. Cannot be edited, renamed, or deleted. */
	system: boolean
	createdAt: Date
}

export type MemberDoc = {
	_id: ObjectId
	workspaceId: ObjectId
	userId: string
	roleId: ObjectId
	createdAt: Date
}

export type InviteDoc = {
	_id: ObjectId
	workspaceId: ObjectId
	email: string
	roleId: ObjectId
	/** Only the hash is stored; the raw token exists solely in the emailed link. */
	tokenHash: string
	invitedBy: string
	expiresAt: Date
	createdAt: Date
}

export const WORKSPACES = 'workspaces'
export const ROLES = 'workspaceRoles'
export const MEMBERS = 'workspaceMembers'
export const INVITES = 'workspaceInvites'
