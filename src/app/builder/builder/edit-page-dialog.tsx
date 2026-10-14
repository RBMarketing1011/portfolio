'use client'

import { useEffect, useState } from 'react'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HOME_SLUG, slugify, type Page } from '@/lib/builder/page-schema'

/**
 * A page's own settings: its name, its address, and whether the site header links
 * to it. The home page always lives at `/`, so its address is not editable.
 */
export function EditPageDialog({
	open,
	onOpenChange,
	page,
	usesCustomMenu,
	onSave,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	page: Page
	/** A built header menu replaces the automatic list of pages. */
	usesCustomMenu: boolean
	onSave: (patch: { name: string; slug?: string; inHeader: boolean }) => void
}) {
	const isHome = page.slug === HOME_SLUG
	const [name, setName] = useState(page.name)
	const [slug, setSlug] = useState(page.slug)
	const [inHeader, setInHeader] = useState(page.inHeader)

	useEffect(() => {
		if (!open) return
		setName(page.name)
		setSlug(page.slug)
		setInHeader(page.inHeader)
	}, [open, page])

	const cleanSlug = slugify(slug.replace(/^\/+/, ''))
	const ready = name.trim() !== '' && (isHome || slug.trim() !== '')

	const save = () => {
		if (!ready) return
		onSave({
			name: name.trim(),
			...(isHome ? {} : { slug: cleanSlug }),
			inHeader,
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Edit page</DialogTitle>
					<DialogDescription>
						{usesCustomMenu
							? 'The page’s name and its address.'
							: 'The page’s name, its address, and whether it is linked in the header.'}
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(event) => {
						event.preventDefault()
						save()
					}}
					className='space-y-5'>
					<div className='space-y-2'>
						<Label htmlFor='edit-page-name'>Page name</Label>
						<Input
							id='edit-page-name'
							autoFocus
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>

					<div className='space-y-2'>
						<Label htmlFor='edit-page-slug'>Slug</Label>
						{isHome ? (
							<div
								id='edit-page-slug'
								className='flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/4 px-3 text-sm'>
								<Home className='size-3.5 shrink-0 text-brand' />
								<span className='font-medium text-white'>{HOME_SLUG}</span>
								<span className='truncate text-xs text-slate-500'>
									The home page always lives here
								</span>
							</div>
						) : (
							<>
								<div className='flex items-center gap-1.5'>
									<span className='text-sm text-slate-500'>/</span>
									<Input
										id='edit-page-slug'
										value={slug}
										onChange={(event) => setSlug(event.target.value)}
									/>
								</div>
								{slug.trim() && cleanSlug !== slug && (
									<p className='text-xs text-slate-500'>
										Saved as /{cleanSlug}
									</p>
								)}
								<p className='text-xs text-slate-500'>
									Changing it breaks any link to the old address.
								</p>
							</>
						)}
					</div>

					{/* A built header menu decides the navigation, so this only shows without one. */}
					{!usesCustomMenu && (
						<label className='flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-white/4 p-3'>
							<input
								type='checkbox'
								checked={inHeader}
								onChange={(event) => setInHeader(event.target.checked)}
								className='mt-0.5 size-4 accent-brand'
							/>
							<span>
								<span className='block text-sm font-medium text-white'>
									Show in the site header
								</span>
								<span className='mt-0.5 block text-xs leading-5 text-slate-500'>
									Adds a link to this page in the navigation at the top of your site.
								</span>
							</span>
						</label>
					)}

					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
							className='border-white/20 bg-transparent'>
							Cancel
						</Button>
						<Button
							type='submit'
							disabled={!ready}
							className='bg-brand font-bold text-ink hover:bg-brand-strong'>
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
