'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutTemplate, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBuilder } from '@/lib/builder/builder-context'
import { LOCAL_SITE_ID } from '@/lib/builder/drivers'
import type { Template } from '@/lib/builder/page-schema'
import { SiteLoadError } from '../site-load-error'
import { AddPageDialog } from '../builder/add-page-dialog'

export function BuilderStart({
	templates,
	siteId = LOCAL_SITE_ID,
}: {
	templates: Template[]
	siteId?: string
}) {
	const router = useRouter()
	const store = useBuilder()
	const [open, setOpen] = useState(false)
	const base = `/builder/sites/${siteId}/pages`

	// Landing on the builder with work already saved should resume it.
	useEffect(() => {
		if (!store.hydrated) return
		const target =
			store.pages.find((p) => p.id === store.pageId) ?? store.pages[0]
		if (target) router.replace(`${base}/${target.id}`)
	}, [store.hydrated, store.pages, store.pageId, router, base])

	if (store.loadError) return <SiteLoadError message={store.loadError} />

	if (!store.hydrated || store.pages.length > 0) {
		return (
			<div className='flex h-screen items-center justify-center text-sm text-slate-500'>
				Loading…
			</div>
		)
	}

	return (
		<div className='flex h-screen items-center justify-center px-6'>
			<div className='max-w-md text-center'>
				<span className='mx-auto flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand'>
					<LayoutTemplate className='size-6' />
				</span>
				<h1 className='mt-6 font-display text-2xl font-semibold text-white'>
					Nothing has been built yet
				</h1>
				<p className='mt-3 leading-7 text-slate-400'>
					Start with your home page. It lives at the root of your site, and
					every other page comes after it.
				</p>
				<Button
					onClick={() => setOpen(true)}
					className='mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'>
					<Plus /> Add home page
				</Button>
			</div>

			<AddPageDialog
				open={open}
				onOpenChange={setOpen}
				templates={templates}
				isHome
				onCreate={({ name, slug, templateSlug, inHeader }) => {
					const template = templates.find((t) => t.slug === templateSlug)
					const id = store.addPage(name, slug, template?.blocks ?? [], inHeader)
					router.push(`${base}/${id}`)
				}}
			/>
		</div>
	)
}
