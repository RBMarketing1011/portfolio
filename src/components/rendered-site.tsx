'use client'

import { notFound } from 'next/navigation'
import { googleFontHref } from '@/app/builder/google-fonts'
import { lookCss } from '@/app/section-preview/theme'
import {
	BuiltFooter,
	BuiltHeader,
	type SiteBrand,
} from '@/components/built-chrome'
import { builtSiteVars, cssText, sanitizeLook } from '@/lib/builder/look'
import { setMediaIndex } from '@/lib/builder/media-store'
import { RenderBlocks } from '@/lib/builder/render'
import { HOME_SLUG, type Site } from '@/lib/builder/page-schema'
import type { MediaEntry } from '@/lib/builder/site-doc'

/**
 * One renderer for every surface a built site appears on: the signed-in
 * preview, a shared preview link, and a live domain. They differ only in where
 * the data came from and what the internal links are prefixed with.
 */
export function RenderedSite({
	site,
	look,
	media,
	slug,
	linkBase = '',
	brand,
}: {
	site: Site
	look: Record<string, unknown>
	media: MediaEntry[]
	slug?: string[]
	linkBase?: string
	/** Whose site this is: logo or name in the header and footer. */
	brand?: SiteBrand
}) {
	// Refs resolve to CDN URLs rather than the browser's local library.
	setMediaIndex(media)

	const wanted = slug?.join('/')
	const page = wanted
		? site.pages.find((item) => item.slug === wanted)
		: (site.pages.find((item) => item.slug === HOME_SLUG) ?? site.pages[0])
	if (!page) notFound()

	// Whatever was stored, only a rebuilt look reaches the stylesheet.
	const merged = sanitizeLook(look)
	const fontHref = googleFontHref([
		merged.theme.headingFont,
		merged.theme.bodyFont,
	])
	// The same stylesheet the builder canvas gets, so the two surfaces agree: this page's
	// block surfaces only, and the header's hero trim and anchor offset.
	const css = cssText(
		[
			lookCss(merged, { blockIds: page.blocks.map((block) => block.id) }),
			builtSiteVars(site.chrome.header),
		].join('\n'),
	)

	return (
		<>
			{fontHref && <link rel='stylesheet' href={fontHref} />}
			<style dangerouslySetInnerHTML={{ __html: css }} />
			<BuiltHeader
				chrome={site.chrome}
				pages={site.pages.filter((item) => item.inHeader)}
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
