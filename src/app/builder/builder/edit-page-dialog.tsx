'use client'

import { useEffect, useState } from 'react'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import { HOME_SLUG, slugify, type Page } from '@/lib/builder/page-schema'

// The saved page drops a longer value altogether, so the fields stop at the limit.
const SEO_LIMITS = { title: 70, description: 160 } as const

export type PagePatch = {
	name: string
	slug?: string
	inHeader: boolean
	/** Absent when both fields are empty, so the site's own title and description apply. */
	seo: Page['seo']
}

/**
 * A page's own settings: its name, its address, whether the site header links to it,
 * and how it shows in search results. The home page always lives at `/`, so its
 * address is not editable.
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
	onSave: (patch: PagePatch) => void
}) {
	const isHome = page.slug === HOME_SLUG
	const [name, setName] = useState(page.name)
	const [slug, setSlug] = useState(page.slug)
	const [inHeader, setInHeader] = useState(page.inHeader)
	const [seoTitle, setSeoTitle] = useState(page.seo?.title ?? '')
	const [seoDescription, setSeoDescription] = useState(
		page.seo?.description ?? '',
	)

	useEffect(() => {
		if (!open) return
		setName(page.name)
		setSlug(page.slug)
		setInHeader(page.inHeader)
		setSeoTitle(page.seo?.title ?? '')
		setSeoDescription(page.seo?.description ?? '')
	}, [open, page])

	const cleanSlug = slugify(slug.replace(/^\/+/, ''))
	const ready = name.trim() !== '' && (isHome || slug.trim() !== '')

	const save = () => {
		if (!ready) return
		const title = seoTitle.trim().slice(0, SEO_LIMITS.title)
		const description = seoDescription
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, SEO_LIMITS.description)
		onSave({
			name: name.trim(),
			...(isHome ? {} : { slug: cleanSlug }),
			inHeader,
			seo: title || description ? { title, description } : undefined,
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Edit page</DialogTitle>
					<DialogDescription>
						{usesCustomMenu
							? 'The page’s name, its address, and how it shows in search results.'
							: 'The page’s name, its address, whether it is linked in the header, and how it shows in search results.'}
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
						<div className='flex items-start gap-3 rounded-md border border-white/10 bg-white/4 p-3'>
							<Checkbox
								id='edit-page-in-header'
								checked={inHeader}
								onCheckedChange={(checked) => setInHeader(checked === true)}
								className='mt-0.5'
							/>
							<div>
								<Label
									htmlFor='edit-page-in-header'
									className='cursor-pointer text-sm font-medium text-white'>
									Show in the site header
								</Label>
								<p className='mt-0.5 text-xs leading-5 text-slate-500'>
									Adds a link to this page in the navigation at the top of your site.
								</p>
							</div>
						</div>
					)}

					<div className='space-y-2'>
						<div className='flex items-baseline justify-between gap-3'>
							<Label htmlFor='edit-page-seo-title'>Search title</Label>
							<span className='text-xs tabular-nums text-slate-500'>
								{seoTitle.length}/{SEO_LIMITS.title}
							</span>
						</div>
						<Input
							id='edit-page-seo-title'
							value={seoTitle}
							maxLength={SEO_LIMITS.title}
							placeholder={name.trim() || page.name}
							onChange={(event) => setSeoTitle(event.target.value)}
						/>
						<p className='text-xs leading-5 text-slate-500'>
							The title in search results and the browser tab. Empty uses the
							page name and the site name.
						</p>
					</div>

					<div className='space-y-2'>
						<div className='flex items-baseline justify-between gap-3'>
							<Label htmlFor='edit-page-seo-description'>
								Search description
							</Label>
							<span className='text-xs tabular-nums text-slate-500'>
								{seoDescription.length}/{SEO_LIMITS.description}
							</span>
						</div>
						<Textarea
							id='edit-page-seo-description'
							rows={3}
							value={seoDescription}
							maxLength={SEO_LIMITS.description}
							onChange={(event) => setSeoDescription(event.target.value)}
							className='min-h-20 resize-none'
						/>
						<p className='text-xs leading-5 text-slate-500'>
							A sentence or two under the title in search results. Empty uses the
							site’s description.
						</p>
					</div>

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
