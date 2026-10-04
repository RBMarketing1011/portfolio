import { requireMedia } from '@/lib/media/access'
import { MediaError } from '@/lib/media/errors'
import { json, mediaError, parseBody } from '@/lib/media/http'
import { tagPatchSchema } from '@/lib/media/schemas'
import { deleteTag, mergeTag, renameTag } from '@/lib/media/tags'
import { slugify } from '@/lib/media/text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

const SLUG_MAX = 60

/**
 * The path segment as a tag identity. Anything that cannot be one is a 404, the
 * same as an unknown tag, rather than a value handed to the database.
 */
function parseSlug(segment: string): string {
	// Checked before any work, so a megabyte segment costs nothing.
	if (segment.length > SLUG_MAX * 3) throw new MediaError('Tag not found.', 404)
	let text: string
	try {
		text = decodeURIComponent(segment)
	} catch {
		// A real slug never contains a bare `%`, so broken encoding is junk.
		throw new MediaError('Tag not found.', 404)
	}
	if (text.trim().length > SLUG_MAX) throw new MediaError('Tag not found.', 404)
	const slug = slugify(text)
	if (!slug || slug.length > SLUG_MAX) throw new MediaError('Tag not found.', 404)
	return slug
}

export async function PATCH(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('write', request)
		const slug = parseSlug((await params).slug)
		const body = await parseBody(request, tagPatchSchema)

		if (body.label !== undefined) {
			const result = await renameTag(db, workspace._id, slug, body.label)
			return json({
				affected: result.affected,
				slug: result.slug,
				merged: result.merged,
			})
		}

		const into = slugify(body.mergeInto ?? '')
		if (!into) throw new MediaError('That tag name is not valid.', 400)
		if (into === slug)
			throw new MediaError('A tag cannot be merged into itself.', 400)
		const result = await mergeTag(db, workspace._id, slug, into)
		return json({ affected: result.affected, slug: into, merged: true })
	} catch (error) {
		return mediaError(error)
	}
}

export async function DELETE(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('delete', request)
		const slug = parseSlug((await params).slug)
		const { affected } = await deleteTag(db, workspace._id, slug)
		return json({ affected })
	} catch (error) {
		return mediaError(error)
	}
}
