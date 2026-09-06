import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

const columns = [
	{
		heading: 'Services',
		links: [
			{ href: '/services', label: 'What we do' },
			{ href: '/solutions', label: 'Solutions' },
			{ href: '/industries', label: 'Industries' },
			{ href: '/process', label: 'How we work' },
		],
	},
	{
		heading: 'Company',
		links: [
			{ href: '/about', label: 'About Us' },
			{ href: '/portfolio', label: 'Portfolio' },
			{ href: '/case-studies', label: 'Case Studies' },
			{ href: '/contact', label: 'Contact' },
		],
	},
	{
		heading: 'Resources',
		links: [
			{ href: '/blog', label: 'Blog' },
			{ href: '/llms.txt', label: 'llms.txt' },
			{ href: '/sitemap.xml', label: 'Sitemap' },
		],
	},
]

export default function SiteFooter({
	design = 'columns',
}: {
	/** How the wordmark block and link columns are arranged. */
	design?: 'columns' | 'centered' | 'split'
}) {
	const brand = (
		<div>
			<Wordmark size='sm' />
			<p
				className={cn(
					'mt-4 leading-7 text-slate-400',
					design === 'centered' ? 'mx-auto max-w-md' : 'max-w-xs',
				)}>
				{site.tagline}.
			</p>
			<Button
				asChild
				variant='outline'
				className='mt-6 border-white/15 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white'>
				<a href={`mailto:${site.email}`}>
					<Mail /> {site.email}
				</a>
			</Button>
		</div>
	)

	const linkColumns = columns.map((column) => (
		<div key={column.heading}>
			<p
				className={cn(
					'font-display text-sm font-semibold text-white',
					design === 'split' && 'border-t border-white/12 pt-4',
				)}>
				{column.heading}
			</p>
			<ul className='mt-4 space-y-3'>
				{column.links.map((link) => (
					<li key={link.href}>
						<Link
							href={link.href}
							className='text-slate-400 transition-colors hover:text-white'>
							{link.label}
						</Link>
					</li>
				))}
			</ul>
		</div>
	))

	const legal = (
		<div
			className={cn(
				'flex flex-col gap-2 text-sm text-slate-500',
				design === 'centered'
					? 'items-center'
					: 'sm:flex-row sm:items-center sm:justify-between',
			)}>
			<p>
				© {new Date().getFullYear()} {site.name}. All rights reserved.
			</p>
			<p>{site.domain}</p>
		</div>
	)

	if (design === 'centered') {
		return (
			<footer className='border-t border-white/10 bg-ink px-6 py-16 text-center sm:px-10 lg:px-16'>
				<div className='mx-auto max-w-6xl'>
					<div className='flex flex-col items-center'>{brand}</div>
					<div className='mt-12 grid gap-10 sm:grid-cols-3'>{linkColumns}</div>
					<Separator className='my-10 bg-white/10' />
					{legal}
				</div>
			</footer>
		)
	}

	if (design === 'split') {
		return (
			<footer className='border-t border-white/10 bg-ink px-6 py-16 sm:px-10 lg:px-16'>
				<div className='mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.4fr]'>
					{brand}
					<div className='grid gap-8 sm:grid-cols-3'>{linkColumns}</div>
				</div>
				<div className='mx-auto mt-14 max-w-6xl border-t border-white/10 pt-8'>
					{legal}
				</div>
			</footer>
		)
	}

	return (
		<footer className='border-t border-white/10 bg-ink px-6 py-16 sm:px-10 lg:px-16'>
			<div className='mx-auto max-w-6xl'>
				<div className='grid gap-12 md:grid-cols-[1.5fr_repeat(3,1fr)]'>
					{brand}
					{linkColumns}
				</div>

				<Separator className='my-10 bg-white/10' />

				{legal}
			</div>
		</footer>
	)
}
