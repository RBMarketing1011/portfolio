import Link from 'next/link'
import { ArrowRight, FolderKanban, Globe, Images, Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { currentMembership } from '@/lib/workspace/current'
import { StatusPill } from './projects/projects-table'
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
		<div className='space-y-8'>
			<div>
				<h1 className='font-display text-3xl font-semibold'>{workspace.name}</h1>
				<p className='mt-2 text-muted-foreground'>
					Signed in as <span className='text-foreground'>{session?.user?.email}</span> ·{' '}
					{membership.isOwner ? 'Account owner' : membership.role.name}
				</p>
			</div>

			<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
				{stats.map((stat) => (
					<Card key={stat.label} className='gap-2 py-4'>
						<CardHeader className='px-4'>
							<CardDescription className='flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest'>
								<stat.icon className='size-3.5' />
								{stat.label}
							</CardDescription>
							<CardTitle className='font-display text-3xl'>{stat.value}</CardTitle>
						</CardHeader>
					</Card>
				))}
			</div>

			<section className='space-y-4'>
				<div className='flex items-end justify-between gap-4'>
					<h2 className='font-display text-xl font-semibold'>Recent projects</h2>
					<Button asChild variant='link' className='h-auto p-0'>
						<Link href='/account/projects'>All projects</Link>
					</Button>
				</div>

				{sites.length === 0 ? (
					<Card className='border-dashed text-center'>
						<CardHeader>
							<CardTitle>No projects yet</CardTitle>
							<CardDescription>
								<Button asChild variant='link' className='h-auto p-0'>
									<Link href='/account/projects'>Create the first one</Link>
								</Button>
							</CardDescription>
						</CardHeader>
					</Card>
				) : (
					<div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
						{sites.slice(0, 6).map((item) => (
							<Link
								key={item._id.toString()}
								href={`/account/projects/${item._id.toString()}`}
								className='rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>
								<Card className='h-full gap-2 py-4 transition-colors hover:border-primary/40'>
									<CardHeader className='px-4'>
										<CardTitle className='truncate font-display text-lg'>{item.name}</CardTitle>
										<CardDescription>{item.site?.pages?.length ?? 0} pages</CardDescription>
										<CardAction>
											<StatusPill status={item.status === 'live' ? 'live' : 'draft'} />
										</CardAction>
									</CardHeader>
								</Card>
							</Link>
						))}
					</div>
				)}
			</section>
		</div>
	)
}
