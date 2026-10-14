import Link from 'next/link'
import { CloudOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
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

			<Card className='relative w-full max-w-lg text-center'>
				<CardHeader className='gap-3'>
					<CloudOff className='mx-auto size-8 text-primary' />
					<CardTitle className='font-display text-3xl tracking-tight'>
						This site isn&rsquo;t live yet
					</CardTitle>
					{host && (
						<CardDescription className='font-mono'>{host}</CardDescription>
					)}
				</CardHeader>
				<CardContent>
					<p className='text-muted-foreground'>
						The address is pointed here correctly, but whoever owns this site
						hasn&rsquo;t published it. If it belongs to you, sign in and set it live.
						Otherwise, get in touch with whoever runs it.
					</p>
				</CardContent>
				<CardFooter className='flex-col gap-6'>
					<div className='flex flex-wrap items-center justify-center gap-3'>
						<Button asChild>
							<Link href={`${baseUrl}/account/projects`}>Sign in to publish</Link>
						</Button>
						<Button asChild variant='outline'>
							<Link href={`${baseUrl}/contact`}>Get in touch</Link>
						</Button>
					</div>
					<p className='text-xs text-muted-foreground'>
						Powered by{' '}
						<Button asChild variant='link' className='h-auto p-0 text-xs'>
							<Link href={baseUrl}>{site.name}</Link>
						</Button>
					</p>
				</CardFooter>
			</Card>
		</div>
	)
}
