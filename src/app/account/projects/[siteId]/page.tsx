import { notFound } from 'next/navigation'
import { ObjectId } from 'mongodb'
import { currentMembership } from '@/lib/workspace/current'
import { appHost, appProtocol } from '@/lib/builder/hosting'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { ProjectSettings, type Project } from './project-settings'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
	params,
}: {
	params: Promise<{ siteId: string }>
}) {
	const { siteId } = await params
	if (!ObjectId.isValid(siteId)) return { title: 'Project' }

	const membership = await currentMembership()
	if (!membership) return { title: 'Project' }

	const doc = await membership.db.collection<SiteDoc>('sites').findOne({
		_id: new ObjectId(siteId),
		workspaceId: membership.workspace._id,
	})

	return { title: doc?.name ?? 'Project' }
}

export default async function ProjectPage({
	params,
}: {
	params: Promise<{ siteId: string }>
}) {
	const { siteId } = await params
	if (!ObjectId.isValid(siteId)) notFound()

	const membership = await currentMembership()
	if (!membership?.permissions.has('projects.view')) notFound()

	// Scoped to the account, so a valid id from another account is simply not here.
	const doc = await membership.db.collection<SiteDoc>('sites').findOne({
		_id: new ObjectId(siteId),
		workspaceId: membership.workspace._id,
	})
	if (!doc) notFound()

	const project: Project = {
		id: doc._id.toString(),
		name: doc.name,
		subdomain: doc.subdomain ?? '',
		customDomain: doc.customDomain ?? null,
		customDomainVerified: Boolean(doc.customDomainVerifiedAt),
		customDomainRecords: doc.customDomainRecords ?? [],
		customDomainMisconfigured: doc.customDomainMisconfigured ?? true,
		customDomainCheckedAt: doc.customDomainCheckedAt?.toISOString() ?? null,
		previewToken: doc.previewToken ?? '',
		status: doc.status ?? 'draft',
		publishedAt: doc.publishedAt?.toISOString() ?? null,
		pages: doc.site?.pages?.length ?? 0,
		images: doc.media?.length ?? 0,
		updatedAt: doc.updatedAt.toISOString(),
		createdAt: doc.createdAt.toISOString(),
	}

	return (
		<ProjectSettings
			project={project}
			appHost={appHost}
			appProtocol={appProtocol}
			can={{
				edit: membership.permissions.has('projects.edit'),
				publish: membership.permissions.has('projects.publish'),
				delete: membership.permissions.has('projects.delete'),
			}}
		/>
	)
}
