import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentMembership } from '@/lib/workspace/current'
import type { SiteDoc } from '@/lib/builder/site-doc'

export const metadata = { title: 'Media' }
export const dynamic = 'force-dynamic'

export default async function MediaPage() {
	const membership = await currentMembership()
	if (!membership?.permissions.has('projects.view')) notFound()

	const docs = await membership.db
		.collection<SiteDoc>('sites')
		.find({ workspaceId: membership.workspace._id })
		.sort({ updatedAt: -1 })
		.toArray()

	const images = docs.flatMap((doc) =>
		(doc.media ?? []).map((item) => ({
			...item,
			projectId: doc._id.toString(),
			projectName: doc.name,
		})),
	)

	return (
		<div className='space-y-6'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Media
				</h1>
				<p className='mt-2 leading-7 text-slate-400'>
					Every image uploaded across this account&rsquo;s projects.
				</p>
			</div>

			{images.length === 0 ? (
				<p className='rounded-xl border border-dashed border-white/15 py-16 text-center text-sm text-slate-500'>
					Nothing uploaded yet. Images are added from inside the builder.
				</p>
			) : (
				<ul className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
					{images.map((image) => (
						<li
							key={`${image.projectId}-${image.id}`}
							className='overflow-hidden rounded-xl border border-white/10 bg-white/3'>
							<div className='relative aspect-video bg-white/5'>
								<Image
									src={image.url}
									alt={image.name}
									fill
									sizes='(min-width: 1024px) 20vw, 45vw'
									className='object-cover'
								/>
							</div>
							<div className='p-3'>
								<p className='truncate text-xs text-white'>{image.name}</p>
								<Link
									href={`/account/projects/${image.projectId}`}
									className='mt-1 block truncate text-xs text-slate-500 hover:text-brand'>
									{image.projectName}
								</Link>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
