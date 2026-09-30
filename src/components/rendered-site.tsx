'use client'

import { notFound } from 'next/navigation'
import { googleFontHref } from '@/app/builder/google-fonts'
import { backgroundCss, themeCss } from '@/app/section-preview/theme'
import { BuiltFooter, BuiltHeader } from '@/components/built-chrome'
import { mergeLook, type BuilderLook } from '@/lib/builder/builder-context'
import { setMediaIndex } from '@/lib/builder/media-store'
import { RenderBlocks } from '@/lib/builder/render'
import { HOME_SLUG, type Site } from '@/lib/builder/page-schema'
import type { MediaEntry } from '@/lib/builder/site-doc'

/** The same stylesheet the builder canvas gets, so the two surfaces agree. */
function lookCss(look: BuilderLook) {
	return [
		themeCss(look.theme),
		backgroundCss(look.page),
		backgroundCss(look.header, 'header', false),
		backgroundCss(look.footer, 'footer', false),
		...Object.entries(look.blocks).map(([id, surface]) =>
			backgroundCss(surface, 'page', false, `[data-block-id='${id}'] > *`),
		),
	].join('\n')
}

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
}: {
	site: Site
	look: Record<string, unknown>
	media: MediaEntry[]
	slug?: string[]
	linkBase?: string
}) {
	// Refs resolve to CDN URLs rather than the browser's local library.
	setMediaIndex(media)

	const wanted = slug?.join('/')
	const page = wanted
		? site.pages.find((item) => item.slug === wanted)
		: (site.pages.find((item) => item.slug === HOME_SLUG) ?? site.pages[0])
	if (!page) notFound()

	const merged = mergeLook(look)
	const fontHref = googleFontHref([
		merged.theme.headingFont,
		merged.theme.bodyFont,
	])

	return (
		<>
			{fontHref && <link rel='stylesheet' href={fontHref} />}
			<style dangerouslySetInnerHTML={{ __html: lookCss(merged) }} />
			<BuiltHeader
				chrome={site.chrome}
				pages={site.pages.filter((item) => item.inHeader)}
				current={page.slug}
				linkBase={linkBase}
			/>
			<main>
				<RenderBlocks blocks={page.blocks} />
			</main>
			<BuiltFooter
				chrome={site.chrome}
				pages={site.pages}
				linkBase={linkBase}
			/>
		</>
	)
}
