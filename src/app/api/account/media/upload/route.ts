import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { z } from 'zod'
import { requireMediaIn } from '@/lib/media/access'
import { registerUploadedBlob } from '@/lib/media/assets'
import { assetsOf, parseObjectId } from '@/lib/media/collections'
import { MediaError } from '@/lib/media/errors'
import { json, mediaError } from '@/lib/media/http'
import { objectIdSchema, uploadPayloadSchema } from '@/lib/media/schemas'
import { isOwnedPathname } from '@/lib/media/storage'
import { MEDIA_CONTENT_TYPES, MEDIA_LIMITS } from '@/lib/media/types'
import { getDb } from '@/lib/mongo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const GENERATE = 'blob.generate-client-token'
const COMPLETED = 'blob.upload-completed'

/** What the token carries to the completion webhook, which has no session of its own. */
const tokenPayloadSchema = z.object({
	workspaceId: objectIdSchema,
	userId: z.string().min(1),
	folderId: objectIdSchema.nullable().optional(),
	filename: z.string().min(1).max(255),
})

const badRequest = () => new MediaError('That request was not valid.', 400)

/** The Blob client cannot add our header, so the workspace rides in `clientPayload`. */
function parseClientPayload(raw: unknown) {
	if (typeof raw !== 'string')
		throw new MediaError('Reload the page and try again.', 400)
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		throw new MediaError('Reload the page and try again.', 400)
	}
	const parsed = uploadPayloadSchema.safeParse(value)
	if (!parsed.success)
		throw new MediaError('Reload the page and try again.', 400)
	return parsed.data
}

/**
 * Registers the blob from the signed token payload. The webhook retries on any
 * non-2xx, so every failure is logged and swallowed: the browser registers the same
 * blob too, and registration is idempotent.
 */
async function onUploadCompleted({
	blob,
	tokenPayload,
}: {
	blob: { url: string; pathname: string }
	tokenPayload?: string | null
}) {
	try {
		const parsed = tokenPayloadSchema.safeParse(JSON.parse(tokenPayload || ''))
		if (!parsed.success) {
			console.error('[media] upload webhook: unusable token payload')
			return
		}
		const { workspaceId, userId, folderId, filename } = parsed.data
		if (!isOwnedPathname(blob.pathname, workspaceId)) {
			console.error('[media] upload webhook: pathname outside the workspace')
			return
		}
		const owner = parseObjectId(workspaceId)
		if (!owner) return
		await registerUploadedBlob(
			await getDb(),
			{ workspaceId: owner, userId },
			{
				url: blob.url,
				pathname: blob.pathname,
				filename,
				folderId: parseObjectId(folderId ?? null),
			},
		)
	} catch (error) {
		console.error('[media] upload webhook failed', error)
	}
}

export async function POST(request: Request) {
	try {
		// The body decides which of the two very different calls this is.
		const body = (await request.json().catch(() => null)) as HandleUploadBody | null
		if (!body || typeof body !== 'object' || typeof body.type !== 'string')
			throw badRequest()

		if (body.type === COMPLETED) {
			// Server to server, no session: handleUpload verifies Vercel's signature.
			try {
				const result = await handleUpload({
					body,
					request,
					onBeforeGenerateToken: async () => {
						throw badRequest()
					},
					onUploadCompleted,
				})
				return json(result)
			} catch (error) {
				console.error('[media] upload webhook rejected', error)
				throw badRequest()
			}
		}

		if (body.type !== GENERATE) throw badRequest()

		const payload = parseClientPayload(body.payload?.clientPayload)
		const { db, workspace, userId } = await requireMediaIn(
			'write',
			payload.workspaceId,
		)
		const workspaceId = workspace._id.toString()

		const result = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname, clientPayload) => {
				// The same string the authorisation above read, but never assume the SDK
				// hands back what we parsed: demand the same account.
				const again = parseClientPayload(clientPayload)
				if (again.workspaceId.toLowerCase() !== payload.workspaceId.toLowerCase())
					throw new MediaError('Reload the page and try again.', 400)

				if (typeof pathname !== 'string' || !isOwnedPathname(pathname, workspaceId))
					throw new MediaError('That upload location is not allowed.', 400)

				const [usage] = await assetsOf(db)
					.aggregate<{ count: number; bytes: number }>([
						{ $match: { workspaceId: workspace._id } },
						{
							$group: {
								_id: null,
								count: { $sum: 1 },
								bytes: { $sum: '$bytes' },
							},
						},
					])
					.toArray()
				if ((usage?.count ?? 0) >= MEDIA_LIMITS.maxAssets)
					throw new MediaError('Your library is full. Delete some images first.', 429)
				if ((usage?.bytes ?? 0) >= MEDIA_LIMITS.maxTotalBytes)
					throw new MediaError(
						'Your library has used all of its storage. Delete some images first.',
						429,
					)

				return {
					// Spread: the SDK types this as a mutable array.
					allowedContentTypes: [...MEDIA_CONTENT_TYPES],
					maximumSizeInBytes: MEDIA_LIMITS.maxBytes,
					addRandomSuffix: true,
					// Pinned here, because anything the browser sends back later is its own
					// claim. The filename comes from the REQUESTED pathname: the completion
					// event's pathname already carries the random suffix.
					tokenPayload: JSON.stringify({
						workspaceId,
						userId,
						folderId: again.folderId ?? null,
						filename: pathname.split('/').pop() ?? '',
					}),
				}
			},
			// Also what makes the SDK embed the token payload and a callback URL.
			onUploadCompleted,
		})
		return json(result)
	} catch (error) {
		return mediaError(error)
	}
}
