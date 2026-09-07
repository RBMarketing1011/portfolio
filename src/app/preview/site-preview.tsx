'use client'

import { useEffect, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { BuiltFooter, BuiltHeader } from '@/components/built-chrome'
import { Button } from '@/components/ui/button'
import { RenderBlocks } from '@/lib/builder/render'
import { siteSchema, HOME_SLUG, type Site } from '@/lib/builder/page-schema'

const STORAGE_KEY = 'reynoldsbuilt.builder.v1'

function load(): Site | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed = siteSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

export function SitePreview() {
	const params = useParams<{ slug?: string[] }>()
	const [site, setSite] = useState<Site | null>(null)
	const [ready, setReady] = useState(false)

	useEffect(() => {
		setSite(load())
		setReady(true)
	}, [])

	if (!ready) return null

	if (!site || site.pages.length === 0) {
		return (
			<div className='flex min-h-screen items-center justify-center px-6'>
				<div className='max-w-sm text-center'>
					<h1 className='font-display text-2xl font-semibold text-white'>
						Nothing to preview yet
					</h1>
					<p className='mt-3 leading-7 text-slate-400'>
						Add a page in the builder and it will show up here.
					</p>
					<Button
						asChild
						className='mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href='/sections/pages'>Open the builder</Link>
					</Button>
				</div>
			</div>
		)
	}

	const wanted = params.slug?.join('/')
	const page = wanted
		? site.pages.find((p) => p.slug === wanted)
		: (site.pages.find((p) => p.slug === HOME_SLUG) ?? site.pages[0])
	if (!page) notFound()

	return (
		<>
			<BuiltHeader
				chrome={site.chrome}
				pages={site.pages.filter((p) => p.inHeader)}
				current={page.slug}
			/>
			<main>
				<RenderBlocks blocks={page.blocks} />
			</main>
			<BuiltFooter chrome={site.chrome} pages={site.pages} />
		</>
	)
}
