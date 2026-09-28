'use client'

import { useEffect, useState } from 'react'
import { FilePlus2, Home } from 'lucide-react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { HOME_SLUG, slugify, type Template } from '@/lib/builder/page-schema'
import { TemplateThumbnail } from './template-thumbnail'

export function AddPageDialog({
	open,
	onOpenChange,
	templates,
	isHome = false,
	onCreate,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	templates: Template[]
	/** The first page a site gets is the home page and owns `/`. */
	isHome?: boolean
	onCreate: (input: {
		name: string
		slug: string
		templateSlug: string | null
		inHeader: boolean
	}) => void
}) {
	const [name, setName] = useState('')
	const [slug, setSlug] = useState('')
	const [slugTouched, setSlugTouched] = useState(false)
	const [inHeader, setInHeader] = useState(true)
	const [templateSlug, setTemplateSlug] = useState<string | null>(null)

	useEffect(() => {
		if (!open) return
		setName(isHome ? 'Home' : '')
		setSlug('')
		setSlugTouched(false)
		setInHeader(true)
		setTemplateSlug(null)
	}, [open, isHome])

	// The slug tracks the name until the user edits it, then it stops.
	useEffect(() => {
		if (!slugTouched) setSlug(name ? slugify(name) : '')
	}, [name, slugTouched])

	const selected = templates.find((t) => t.slug === templateSlug) ?? null

	const submit = () => {
		if (!name.trim()) return
		onCreate({
			name: name.trim(),
			slug: isHome ? HOME_SLUG : slug.trim() || slugify(name),
			templateSlug,
			inHeader,
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl'>
				<DialogHeader className='shrink-0 border-b border-white/10 px-6 py-5'>
					<DialogTitle>
						{isHome ? 'Add your home page' : 'Add a page'}
					</DialogTitle>
					<DialogDescription>
						{isHome
							? 'Your first page is the home page. It lives at / and every other page comes after it.'
							: 'Name it, check the slug, then start from scratch or from a template.'}
					</DialogDescription>
				</DialogHeader>

				<div className='grid shrink-0 gap-4 border-b border-white/10 px-6 py-5 sm:grid-cols-[1fr_1fr_auto]'>
					<div className='space-y-2'>
						<Label htmlFor='page-name'>Page name</Label>
						<Input
							id='page-name'
							autoFocus
							value={name}
							placeholder='About Us'
							onChange={(event) => setName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter') submit()
							}}
						/>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='page-slug'>Slug</Label>
						{isHome ? (
							<div
								id='page-slug'
								className='flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/4 px-3 text-sm'>
								<Home className='size-3.5 shrink-0 text-brand' />
								<span className='font-medium text-white'>{HOME_SLUG}</span>
								<span className='truncate text-xs text-slate-500'>
									Home page
								</span>
							</div>
						) : (
							<div className='flex items-center gap-1.5'>
								<span className='text-sm text-slate-500'>/</span>
								<Input
									id='page-slug'
									value={slug}
									placeholder='about-us'
									onChange={(event) => {
										setSlugTouched(true)
										setSlug(event.target.value)
									}}
									onKeyDown={(event) => {
										if (event.key === 'Enter') submit()
									}}
								/>
							</div>
						)}
					</div>
					<div className='space-y-2'>
						<Label htmlFor='page-in-header'>Navigation</Label>
						<label
							htmlFor='page-in-header'
							className='flex h-9 cursor-pointer items-center gap-2.5 rounded-md border border-white/10 bg-white/4 px-3 text-sm text-slate-300'>
							<input
								id='page-in-header'
								type='checkbox'
								checked={inHeader}
								onChange={(event) => setInHeader(event.target.checked)}
								className='size-4 accent-brand'
							/>
							Add to header
						</label>
					</div>
				</div>

				<div className='grid min-h-0 flex-1 grid-cols-[15rem_1fr]'>
					<ScrollArea className='min-h-0 border-r border-white/10'>
						<div className='p-3'>
							<p className='px-2 pb-2 text-xs font-semibold uppercase tracking-widest text-slate-500'>
								Start from
							</p>
							<ul className='space-y-0.5'>
								<li>
									<button
										type='button'
										onClick={() => setTemplateSlug(null)}
										aria-pressed={templateSlug === null}
										className={cn(
											'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
											templateSlug === null
												? 'bg-brand/15 text-white'
												: 'text-slate-400 hover:bg-white/5 hover:text-white',
										)}>
										<FilePlus2 className='size-4 shrink-0' />
										Blank page
									</button>
								</li>
								{templates.map((template) => (
									<li key={template.slug}>
										<button
											type='button'
											onClick={() => setTemplateSlug(template.slug)}
											aria-pressed={templateSlug === template.slug}
											className={cn(
												'flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors',
												templateSlug === template.slug
													? 'bg-brand/15 text-white'
													: 'text-slate-400 hover:bg-white/5 hover:text-white',
											)}>
											<span className='truncate text-sm'>{template.name}</span>
											<span className='truncate text-xs text-slate-500'>
												{template.blocks.length} sections
											</span>
										</button>
									</li>
								))}
							</ul>
						</div>
					</ScrollArea>

					<div className='flex min-h-0 min-w-0 flex-col'>
						<div className='shrink-0 border-b border-white/10 px-6 py-3'>
							<p className='text-sm font-medium text-white'>
								{selected ? selected.name : 'Blank page'}
							</p>
							<p className='mt-0.5 text-xs text-slate-500'>
								{selected
									? selected.description
									: 'No sections. Build it yourself from the section library.'}
							</p>
						</div>
						<div className='min-h-0 flex-1 overflow-hidden bg-black/30'>
							{selected ? (
								<TemplateThumbnail
									key={selected.slug}
									blocks={selected.blocks}
								/>
							) : (
								<div className='flex h-full items-center justify-center px-6 text-center text-sm text-slate-500'>
									An empty canvas. Add sections once the page exists.
								</div>
							)}
						</div>
					</div>
				</div>

				<DialogFooter className='shrink-0 border-t border-white/10 px-6 py-4'>
					<Button
						variant='outline'
						onClick={() => onOpenChange(false)}
						className='border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
						Cancel
					</Button>
					<Button
						onClick={submit}
						disabled={!name.trim()}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						Create page
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
