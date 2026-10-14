import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import {
	AiWriteError,
	builderAiConfigured,
	writeBlocks,
} from '@/lib/builder/ai-writer'
import { blockSchema } from '@/lib/builder/page-schema'
import { readSiteProfile } from '@/lib/builder/site-profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** A long page takes the model a while to write. */
export const maxDuration = 300

type Params = { params: Promise<{ siteId: string }> }

const bodySchema = z.object({
	page: z.object({
		name: z.string().trim().min(1).max(120),
		slug: z.string().trim().min(1).max(120),
	}),
	blocks: z.array(blockSchema).min(1).max(30),
	instructions: z.string().max(2000).optional(),
	scope: z.enum(['page', 'section']),
	options: z.object({
		text: z.boolean(),
		replaceImages: z.boolean(),
		fillImages: z.boolean(),
	}),
})

/** Whether AI writing is available, so the builder can hide it when it is not. */
export async function GET(_request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		await requireSitePermission(siteId, 'projects.edit')
		return NextResponse.json({ enabled: builderAiConfigured() })
	} catch (error) {
		return errorResponse(error)
	}
}

/**
 * Writes copy (and picks images) for the sections sent, from the project's business
 * details. Returns the same sections with new props; nothing is saved here. The
 * builder applies the result to its draft, so the owner can review it and undo.
 */
export async function POST(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'projects.edit')

		let json: unknown
		try {
			json = await request.json()
		} catch {
			return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
		}
		const parsed = bodySchema.safeParse(json)
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

		const body = parsed.data
		const blocks = await writeBlocks({
			db,
			workspaceId: site.workspaceId,
			profile: readSiteProfile(site.profile),
			projectName: site.name,
			siteMedia: (site.media ?? []).map(({ id, name, url }) => ({ id, name, url })),
			page: body.page,
			blocks: body.blocks,
			instructions: body.instructions,
			options: body.options,
			scope: body.scope,
		})
		return NextResponse.json({ blocks })
	} catch (error) {
		if (error instanceof AiWriteError)
			return NextResponse.json({ error: error.message }, { status: error.status })
		console.error('[builder-ai]', error)
		return errorResponse(error)
	}
}
