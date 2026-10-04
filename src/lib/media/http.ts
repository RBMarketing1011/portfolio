import 'server-only'
import type { ObjectId } from 'mongodb'
import type { z } from 'zod'
import { HttpError, errorResponse } from '@/lib/auth/guards'
import { parseObjectId } from './collections'
import { MediaError } from './errors'

/**
 * Route plumbing shared by every media endpoint, so each handler is its own
 * logic and nothing else:
 *
 *   export async function PATCH(request: Request, { params }: Params) {
 *     try {
 *       const { db, workspace } = await requireMedia('write')
 *       const id = parseId((await params).id)
 *       const body = await parseBody(request, assetPatchSchema)
 *       ...
 *       return json({ asset })
 *     } catch (error) {
 *       return mediaError(error)
 *     }
 *   }
 */

/** Never cached: the library changes under the person's hands. */
export const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** MediaError (and its subclasses) -> `{ error }` with its status; anything else is the account guards' 401/403/404 or a 500. */
export function mediaError(error: unknown) {
	if (error instanceof MediaError)
		return Response.json({ error: error.message }, { status: error.status })
	// `errorResponse` answers 500 without a word, which leaves nothing to debug from.
	if (!(error instanceof HttpError)) console.error('[media]', error)
	return errorResponse(error)
}

/**
 * Reads and validates a JSON body. A missing, malformed or invalid body is a 400
 * carrying the schema's own first message (our schemas' messages are written for
 * people), never a stack or the offending value.
 */
export async function parseBody<S extends z.ZodType>(
	request: Request,
	schema: S,
): Promise<z.output<S>> {
	const body = await request.json().catch(() => null)
	const parsed = schema.safeParse(body)
	if (!parsed.success)
		throw new MediaError(
			parsed.error.issues[0]?.message || 'That request was not valid.',
			400,
		)
	return parsed.data
}

/** A path segment that must be an id. A bad one is a 404, the same as an unknown one, so ids cannot be probed. */
export function parseId(value: string, what = 'Image'): ObjectId {
	const id = parseObjectId(value)
	if (!id) throw new MediaError(`${what} not found.`, 404)
	return id
}
