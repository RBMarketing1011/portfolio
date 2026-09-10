'use client'

import { useState } from 'react'
import { FilterBar, Grid, RelatedCard, Section } from '@/components/sections'

export type FilterableCaseStudy = {
	slug: string
	name: string
	service: string
	category: string
	summary: string
}

export function CaseStudyFilter({
	items,
	filters,
}: {
	items: FilterableCaseStudy[]
	filters: string[]
}) {
	const [active, setActive] = useState(filters[0])
	const visible =
		active === filters[0]
			? items
			: items.filter((item) => item.service === active)

	return (
		<>
			<Section className='py-0 lg:py-0'>
				<FilterBar
					className='mt-10'
					filters={filters}
					defaultValue={filters[0]}
					onChange={setActive}
					resultCount={visible.length}
				/>
			</Section>

			<Grid className='pt-12' columns={2}>
				{visible.map((item) => (
					<RelatedCard
						key={item.slug}
						title={item.name}
						meta={`${item.service} · ${item.category}`}
						description={item.summary}
						href={`/case-studies/${item.slug}`}
					/>
				))}
			</Grid>
		</>
	)
}
