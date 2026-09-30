import Link from 'next/link'
import { ArrowRight, FolderKanban, Globe, Images, Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { currentMembership } from '@/lib/workspace/current'
import { MEMBERS, type MemberDoc } from '@/lib/workspace/types'
import type { SiteDoc } from '@/lib/builder/site-doc'

export const metadata = { title: 'Overview' }
export const dynamic = 'force-dynamic'

export default async function AccountOverviewPage() {
	const session = await auth()
	const membership = await currentMembership()
	if (!membership) return null

	const { db, workspace } = membership
	const sites = await db
		.collection<SiteDoc>('sites')
		.find({ workspaceId: workspace._id })
		.sort({ updatedAt: -1 })
		.toArray()

	const people = await db
		.collection<MemberDoc>(MEMBERS)
		.countDocuments({ workspaceId: workspace._id })

	const live = sites.filter((site) => site.status === 'live').length
	const pages = sites.reduce(
		(total, item) => total + (item.site?.pages?.length ?? 0),
		0,
	)
	const images = sites.reduce(
		(total, item) => total + (item.media?.length ?? 0),
		0,
	)

	const stats = [
		{ label: 'Projects', value: sites.length, icon: FolderKanban },
		{ label: 'Live', value: live, icon: Globe },
		{ label: 'Pages', value: pages, icon: ArrowRight },
		{ label: 'Images', value: images, icon: Images },
		{ label: 'People', value: people, icon: Users },
	]

	return (
		<div className='space-y-10'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					{workspace.name}
				</h1>
				<p className='mt-2 leading-7 text-slate-400'>
					Signed in as{' '}
					<span className='text-white'>{session?.user?.email}</span> ·{' '}
					{membership.isOwner ? 'Account owner' : membership.role.name}
				</p>
			</div>

			<dl className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
				{stats.map((stat) => (
					<div
						key={stat.label}
						className='rounded-xl border border-white/10 bg-white/3 p-4'>
						<dt className='flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500'>
							<stat.icon className='size-3.5' />
							{stat.label}
						</dt>
						<dd className='mt-2 font-display text-3xl font-semibold text-white'>
							{stat.value}
						</dd>
					</div>
				))}
			</dl>

			<section>
				<div className='flex items-end justify-between gap-4'>
					<h2 className='font-display text-xl font-semibold text-white'>
						Recent projects
					</h2>
					<Link
						href='/account/projects'
						className='text-sm text-brand hover:text-brand-strong'>
						All projects
					</Link>
				</div>

				{sites.length === 0 ? (
					<p className='mt-6 rounded-xl border border-dashed border-white/15 py-12 text-center text-sm text-slate-500'>
						No projects yet.{' '}
						<Link href='/account/projects' className='text-brand'>
							Create the first one
						</Link>
						.
					</p>
				) : (
					<ul className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
						{sites.slice(0, 6).map((item) => (
							<li key={item._id.toString()}>
								<Link
									href={`/account/projects/${item._id.toString()}`}
									className='block rounded-xl border border-white/10 bg-white/3 p-4 transition-colors hover:border-brand/40'>
									<p className='truncate font-display text-lg font-semibold text-white'>
										{item.name}
									</p>
									<p className='mt-1 text-xs text-slate-500'>
										{item.site?.pages?.length ?? 0} pages ·{' '}
										{item.status === 'live' ? 'Live' : 'Draft'}
									</p>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	)
}
