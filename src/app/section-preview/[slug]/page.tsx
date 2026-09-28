import { notFound } from 'next/navigation'
import { findEntry, findVariant, library } from '@/app/builder/library'
import { readBackground } from '@/app/builder/background-settings'
import { readSettings } from '@/app/builder/theme-settings'
import { googleFontHref } from '@/app/builder/google-fonts'
import { HeaderOptionsProvider } from '@/components/header-options'
import { ScrollArea } from '@/components/ui/scroll-area'
import { InertLinks } from '../inert-links'
import { backgroundCss, surfaceTargetFor, themeCss } from '../theme'

export function generateStaticParams() {
	return library.flatMap((group) =>
		group.entries.map((entry) => ({ slug: entry.slug })),
	)
}

export const metadata = {
	title: 'Section Preview',
	robots: { index: false, follow: false },
}

export default async function SectionPreviewFrame({
	params,
	searchParams,
}: {
	params: Promise<{ slug: string }>
	searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
	const { slug } = await params
	const found = findEntry(slug)

	if (!found) notFound()

	const query = await searchParams
	const flat = new URLSearchParams(
		Object.entries(query).flatMap(([key, value]) =>
			value === undefined
				? []
				: [[key, Array.isArray(value) ? value[0] : value]],
		) as [string, string][],
	)
	const settings = readSettings(flat)
	const background = readBackground(flat)
	const fontHref = googleFontHref([settings.headingFont, settings.bodyFont])

	const { entry, group } = found
	const variant = findVariant(entry, flat.get('v'))

	return (
		<>
			{fontHref && <link rel='stylesheet' href={fontHref} />}
			<style
				// Values are validated hex and allow-listed families, never raw query input.
				dangerouslySetInnerHTML={{ __html: themeCss(settings) }}
			/>
			<style
				// Pattern comes from a fixed set and both angles are clamped integers.
				dangerouslySetInnerHTML={{
					__html: backgroundCss(background, surfaceTargetFor(slug)),
				}}
			/>
			{/* Radix sizes its viewport with a table box, which stretches to the widest
			    intrinsic content. A horizontal scroller would drag the page past the
			    device width, so the preview is pinned to a block box instead.
			    Relative so absolute children (sr-only spans) resolve here and get
			    clipped, rather than against the document and adding a second scrollbar. */}
			<style>{`[data-preview-root] [data-slot='scroll-area-viewport'] > div { display: block !important; position: relative; }`}</style>
			<ScrollArea data-preview-root className='h-screen'>
				<HeaderOptionsProvider value={{ megaMenu: background.megaMenu }}>
					<InertLinks>
						{variant?.preview ?? (
							<div className='flex min-h-screen items-center justify-center p-10'>
								<div className='max-w-md text-center'>
									<p className='font-display text-xl font-semibold text-white'>
										{entry.name}
									</p>
									<p className='mt-3 text-slate-500'>
										This {group.kind} has not been created yet.
									</p>
									<p className='mt-6 text-sm leading-6 text-slate-600'>
										{entry.description}
									</p>
								</div>
							</div>
						)}
					</InertLinks>
				</HeaderOptionsProvider>
			</ScrollArea>
		</>
	)
}
