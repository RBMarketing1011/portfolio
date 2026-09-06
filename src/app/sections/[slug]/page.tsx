import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { entryVariants, findEntry, library } from '../library'
import { PreviewFrame } from '../preview-frame'

export function generateStaticParams() {
	return library.flatMap((group) =>
		group.entries.map((entry) => ({ slug: entry.slug })),
	)
}

export default async function SectionPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const found = findEntry(slug)

	if (!found) notFound()

	// Numbered in the toolbar; the descriptive names stay in the library for authoring.
	const variants = entryVariants(found.entry).map((variant, index) => ({
		id: variant.id,
		name: `Variant ${index + 1}`,
	}))

	return (
		<Suspense fallback={null}>
			<PreviewFrame slug={slug} name={found.entry.name} variants={variants} />
		</Suspense>
	)
}
