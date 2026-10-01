import Link from 'next/link'
import { LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SectionsIndexPage() {
	return (
		<div className='flex h-screen items-center justify-center px-6'>
			<div className='max-w-md text-center'>
				<span className='mx-auto flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand'>
					<LayoutTemplate className='size-6' />
				</span>
				<h1 className='mt-6 font-display text-2xl font-semibold text-white'>
					Section library
				</h1>
				<p className='mt-3 leading-7 text-slate-400'>
					Every section you can put on a page, with each variant rendered at
					full size. Choose one from the list to preview it.
				</p>
				<Button
					asChild
					className='mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'>
					<Link href='/builder/site-header'>Start with the site header</Link>
				</Button>
			</div>
		</div>
	)
}
