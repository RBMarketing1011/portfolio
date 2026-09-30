import { notFound } from 'next/navigation'
import { currentMembership } from '@/lib/workspace/current'
import { appHost } from '@/lib/builder/hosting'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { ProjectsTable, type ProjectRow } from './projects-table'

export const metadata = { title: 'Projects' }
export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
	const membership = await currentMembership()
	if (!membership?.permissions.has('projects.view')) notFound()

	const docs = await membership.db
		.collection<SiteDoc>('sites')
		.find({ workspaceId: membership.workspace._id })
		.sort({ updatedAt: -1 })
		.toArray()

	const rows: ProjectRow[] = docs.map((doc) => ({
		id: doc._id.toString(),
		name: doc.name,
		address:
			doc.customDomain && doc.customDomainVerifiedAt
				? doc.customDomain
				: `${doc.subdomain ?? ''}.${appHost}`,
		status: doc.status ?? 'draft',
		pages: doc.site?.pages?.length ?? 0,
		updatedAt: doc.updatedAt.toISOString(),
	}))

	return (
		<ProjectsTable
			initial={rows}
			canCreate={membership.permissions.has('projects.create')}
		/>
	)
}
