import { notFound } from 'next/navigation'
import { findEntry, library } from '@/app/sections/library'
import { readSettings } from '@/app/sections/theme-settings'
import { googleFontHref } from '@/app/sections/google-fonts'
import { ScrollArea } from '@/components/ui/scroll-area'
import { InertLinks } from '../inert-links'
import { themeCss } from '../theme'

export function generateStaticParams() {
	return library.flatMap((group) =>
		group.entries.map((entry) => ({ slug: entry.slug })),
	)
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
	const fontHref = googleFontHref([settings.headingFont, settings.bodyFont])

	const { entry, group } = found

	return (
		<>
			{fontHref && <link rel='stylesheet' href={fontHref} />}
			<style
				// Values are validated hex and allow-listed families, never raw query input.
				dangerouslySetInnerHTML={{ __html: themeCss(settings) }}
			/>
			{/* Radix sizes its viewport with a table box, which stretches to the widest
			    intrinsic content. A horizontal scroller would drag the page past the
			    device width, so the preview is pinned to a block box instead. */}
			<style>{`[data-preview-root] [data-slot='scroll-area-viewport'] > div { display: block !important; }`}</style>
			<ScrollArea data-preview-root className='h-screen bg-background'>
				<InertLinks>
					{entry.preview ?? (
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
			</ScrollArea>
		</>
	)
}
