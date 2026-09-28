'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SiteLoadError({ message }: { message: string }) {
	return (
		<div className='flex h-screen items-center justify-center px-6'>
			<div className='max-w-md text-center'>
				<span className='mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive'>
					<AlertTriangle className='size-6' />
				</span>
				<h1 className='mt-6 font-display text-2xl font-semibold text-white'>
					That site is not available
				</h1>
				<p className='mt-3 leading-7 text-slate-400'>{message}</p>
				<Button
					asChild
					className='mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'>
					<Link href='/builder/sites'>Back to my sites</Link>
				</Button>
			</div>
		</div>
	)
}
