import Link from 'next/link'
import { Mail, Star } from 'lucide-react'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

const GOOGLE_PROFILE = 'https://share.google/3xrgHFcqIik2NjquH'
const GOOGLE_REVIEW = 'https://g.page/r/CfWgE4F5khX6EAI/review'

/** Google's "G" in its own colours; lucide has no brand marks. */
function GoogleIcon() {
	return (
		<svg viewBox='0 0 24 24' aria-hidden className='size-4'>
			<path
				fill='#4285F4'
				d='M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z'
			/>
			<path
				fill='#34A853'
				d='M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z'
			/>
			<path
				fill='#FBBC05'
				d='M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z'
			/>
			<path
				fill='#EA4335'
				d='M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z'
			/>
		</svg>
	)
}

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
			{ href: '/sitemap.xml', label: 'Sitemap' },
			{ href: '/llms.txt', label: 'llms.txt' },
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
				<Link href='/contact'>
					<Mail /> Get In Touch
				</Link>
			</Button>
			<div
				className={cn(
					'mt-3 flex items-center gap-3',
					design === 'centered' && 'justify-center',
				)}>
				<Button
					asChild
					variant='outline'
					size='icon'
					className='border-white/15 bg-transparent hover:bg-white/5'>
					<a
						href={GOOGLE_PROFILE}
						target='_blank'
						rel='noopener noreferrer'
						aria-label={`${site.name} on Google`}>
						<GoogleIcon />
					</a>
				</Button>
				<Button
					asChild
					variant='outline'
					className='border-white/15 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white'>
					<a href={GOOGLE_REVIEW} target='_blank' rel='noopener noreferrer'>
						<Star /> Leave a Review
					</a>
				</Button>
			</div>
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
			<footer
				data-surface='footer'
				className='border-t border-white/10 px-6 py-16 text-center sm:px-10 lg:px-16'>
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
			<footer
				data-surface='footer'
				className='border-t border-white/10 px-6 py-16 sm:px-10 lg:px-16'>
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
		<footer
			data-surface='footer'
			className='border-t border-white/10 px-6 py-16 sm:px-10 lg:px-16'>
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
