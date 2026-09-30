import Link from 'next/link'
import { CloudOff } from 'lucide-react'
import { baseUrl } from '@/lib/app-url'
import { site } from '@/lib/site'

/**
 * Shown when a hostname genuinely points here and belongs to a project that is
 * simply not published. A 404 would tell the visitor the address is wrong when
 * it is not.
 */
export function SiteInactive({ host }: { host?: string }) {
	return (
		<div className='relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6 py-16'>
			<div
				aria-hidden
				className='pointer-events-none absolute inset-0 opacity-60'
				style={{
					background:
						'radial-gradient(60rem 40rem at 50% -10%, color-mix(in oklab, var(--color-brand) 18%, transparent), transparent 70%)',
				}}
			/>

			<div className='relative w-full max-w-lg text-center'>
				<span className='inline-flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur'>
					<CloudOff className='size-6 text-brand' />
				</span>

				<h1 className='mt-8 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl'>
					This site isn&rsquo;t live yet
				</h1>

				{host && (
					<p className='mt-3 font-mono text-sm text-slate-500'>{host}</p>
				)}

				<p className='mx-auto mt-5 max-w-md leading-7 text-slate-400'>
					The address is pointed here correctly, but whoever owns this site
					hasn&rsquo;t published it. If it belongs to you, sign in and set it
					live. Otherwise, get in touch with whoever runs it.
				</p>

				<div className='mt-9 flex flex-wrap items-center justify-center gap-3'>
					<Link
						href={`${baseUrl}/account/projects`}
						className='rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-brand-strong'>
						Sign in to publish
					</Link>
					<Link
						href={`${baseUrl}/contact`}
						className='rounded-md border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5'>
						Get in touch
					</Link>
				</div>

				<p className='mt-14 text-xs text-slate-600'>
					Powered by{' '}
					<Link
						href={baseUrl}
						className='font-semibold text-slate-400 transition-colors hover:text-brand'>
						{site.name}
					</Link>
				</p>
			</div>
		</div>
	)
}
