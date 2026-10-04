import 'server-only'
import { requirePermission } from '@/lib/auth/guards'
import type { Permission } from '@/lib/workspace/permissions'
import { MediaError } from './errors'

/**
 * The library reuses the permissions the account already has, because a new key
 * would not reach existing roles: a role stores its keys when it is created, so
 * anyone but the owner would be locked out of the new feature until migrated.
 *
 *   view   anyone who can see projects can see the pool of images
 *   write  upload, rename, tag, move, organise
 *   delete remove images, folders and tags everywhere
 */
export const MEDIA_PERMISSION = {
	view: 'projects.view',
	write: 'media.upload',
	delete: 'media.delete',
} as const satisfies Record<string, Permission>

export type MediaAccess = keyof typeof MEDIA_PERMISSION

/** Every media request names the account the page was rendered for. */
export const MEDIA_WORKSPACE_HEADER = 'x-media-workspace'

const OBJECT_ID = /^[a-f0-9]{24}$/i

/**
 * Resolves the caller's account and checks their role.
 *
 * The account is DEMANDED, never guessed. `requirePermission` without an id uses
 * the `rb.workspace` cookie as a preference and quietly falls back to the user's
 * own account; the cookie is shared by every tab, so a person with account A's
 * library open in one tab and account B selected in another would have tab one's
 * "delete all matching" land on B's files. So the page sends the account it was
 * rendered for in `x-media-workspace`, and a missing or malformed header is a 400
 * rather than a fallback. A non-member is a 404, so ids cannot be probed.
 *
 * Throws `MediaError` / `HttpError` for the route's `mediaError`. The returned
 * membership carries `db`, `workspace` and `userId`.
 */
export async function requireMedia(access: MediaAccess, request: Request) {
	const workspaceId = request.headers.get(MEDIA_WORKSPACE_HEADER)
	if (!workspaceId || !OBJECT_ID.test(workspaceId))
		throw new MediaError('Reload the page and try again.', 400)
	return requirePermission(MEDIA_PERMISSION[access], workspaceId)
}

/**
 * The same demand for a caller that has the account id some other way: the
 * upload token request carries it in its `clientPayload`, because that request is
 * made by the Vercel Blob client, which cannot add our header.
 */
export const requireMediaIn = (access: MediaAccess, workspaceId: string) =>
	requirePermission(MEDIA_PERMISSION[access], workspaceId)
