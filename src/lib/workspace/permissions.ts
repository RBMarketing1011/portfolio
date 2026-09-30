/**
 * The whole permission vocabulary. Roles are just a named subset of these, so a
 * key that is not in here cannot be granted and a key removed from here stops
 * granting anything the moment it is gone.
 */
export const PERMISSION_GROUPS = [
	{
		id: 'projects',
		label: 'Projects',
		permissions: [
			{ key: 'projects.view', label: 'View projects' },
			{ key: 'projects.create', label: 'Create projects' },
			{ key: 'projects.edit', label: 'Edit pages and content' },
			{ key: 'projects.publish', label: 'Set a project live or take it down' },
			{ key: 'projects.delete', label: 'Delete projects' },
		],
	},
	{
		id: 'media',
		label: 'Media',
		permissions: [
			{ key: 'media.upload', label: 'Upload images' },
			{ key: 'media.delete', label: 'Delete images' },
		],
	},
	{
		id: 'team',
		label: 'Team',
		permissions: [
			{ key: 'team.view', label: 'See who is on the account' },
			{ key: 'team.invite', label: 'Invite people' },
			{ key: 'team.manage', label: 'Change roles and remove people' },
		],
	},
	{
		id: 'account',
		label: 'Account',
		permissions: [
			{ key: 'roles.manage', label: 'Create and edit roles' },
			{ key: 'account.manage', label: 'Change account settings' },
		],
	},
] as const

export type Permission =
	(typeof PERMISSION_GROUPS)[number]['permissions'][number]['key']

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap(
	(group) => group.permissions.map((permission) => permission.key),
)

const VALID = new Set<string>(ALL_PERMISSIONS)

export const isPermission = (value: string): value is Permission =>
	VALID.has(value)

/** Anything stored against a role is filtered through this, so a key that was
 *  retired still sitting in an old document simply stops counting. */
export const sanitizePermissions = (values: unknown): Permission[] =>
	Array.isArray(values)
		? [
				...new Set(
					values.filter(
						(v): v is Permission => typeof v === 'string' && isPermission(v),
					),
				),
			]
		: []

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
	PERMISSION_GROUPS.flatMap((group) =>
		group.permissions.map((permission) => [permission.key, permission.label]),
	),
) as Record<Permission, string>

/** The one role every account starts with. It is not editable: an account that
 *  can edit its own admin role can lock itself out of its own projects. */
export const ADMIN_ROLE_NAME = 'Admin'
