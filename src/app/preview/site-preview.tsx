'use client'

import { useEffect, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { googleFontHref } from '@/app/builder/google-fonts'
import { lookCss } from '@/app/section-preview/theme'
import {
	BuiltFooter,
	BuiltHeader,
	type SiteBrand,
} from '@/components/built-chrome'
import { brandFromProfile, readSiteProfile } from '@/lib/builder/site-profile'
import { Button } from '@/components/ui/button'
import { readLook } from '@/lib/builder/builder-context'
import { LOCAL_SITE_ID } from '@/lib/builder/drivers'
import {
	builtSiteVars,
	cssText,
	sanitizeLook,
	type BuilderLook,
} from '@/lib/builder/look'
import { setMediaIndex } from '@/lib/builder/media-store'
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

export function SitePreview({ siteId = LOCAL_SITE_ID }: { siteId?: string }) {
	const params = useParams<{ slug?: string[] }>()
	const [site, setSite] = useState<Site | null>(null)
	const [look, setLook] = useState<BuilderLook | null>(null)
	const [brand, setBrand] = useState<SiteBrand | undefined>(undefined)
	const [ready, setReady] = useState(false)

	useEffect(() => {
		if (siteId === LOCAL_SITE_ID) {
			setMediaIndex(null)
			setSite(load())
			// Browser storage is as untrusted as anything else, so it is read strictly too.
			setLook(sanitizeLook(readLook()))
			setReady(true)
			return
		}
		let live = true
		fetch(`/api/sites/${siteId}`, { cache: 'no-store' })
			.then((response) => (response.ok ? response.json() : null))
			.then((body) => {
				if (!live) return
				const parsed = body ? siteSchema.safeParse(body.site.site) : null
				// The library comes with the site, so refs resolve to their CDN URLs.
				setMediaIndex(body?.site?.media ?? [])
				setSite(parsed?.success ? parsed.data : null)
				setLook(sanitizeLook(body?.site?.look ?? {}))
				if (body?.site)
					setBrand(brandFromProfile(readSiteProfile(body.site.profile), body.site.name))
				setReady(true)
			})
			.catch(() => {
				if (live) setReady(true)
			})
		return () => {
			live = false
		}
	}, [siteId])

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
						<Link href='/builder/pages'>Open the builder</Link>
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

	const linkBase = `/preview/${siteId}`
	const fontHref = look
		? googleFontHref([look.theme.headingFont, look.theme.bodyFont])
		: ''
	// The same stylesheet the hosted site gets: this page's block surfaces, and the
	// header's hero trim and anchor offset.
	const css = look
		? cssText(
				[
					lookCss(look, { blockIds: page.blocks.map((block) => block.id) }),
					builtSiteVars(site.chrome.header),
				].join('\n'),
			)
		: ''

	return (
		<>
			{fontHref && <link rel='stylesheet' href={fontHref} />}
			{css && <style dangerouslySetInnerHTML={{ __html: css }} />}
			<BuiltHeader
				chrome={site.chrome}
				pages={site.pages.filter((p) => p.inHeader)}
				current={page.slug}
				linkBase={linkBase}
				brand={brand}
			/>
			<main>
				<RenderBlocks blocks={page.blocks} linkBase={linkBase} />
			</main>
			<BuiltFooter
				chrome={site.chrome}
				pages={site.pages}
				linkBase={linkBase}
				brand={brand}
			/>
		</>
	)
}
