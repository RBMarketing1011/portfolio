'use client'

import { useState } from 'react'
import { ArticleCard, FilterBar, Grid, Section } from '@/components/sections'

export type FilterableArticle = {
	slug: string
	title: string
	excerpt: string
	category: string
	readTime: string
}

export function ArticleFilter({
	items,
	filters,
}: {
	items: FilterableArticle[]
	filters: string[]
}) {
	const [active, setActive] = useState(filters[0])
	const visible =
		active === filters[0]
			? items
			: items.filter((item) => item.category === active)

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

			<Grid className='pt-12'>
				{visible.map((item) => (
					<ArticleCard
						key={item.slug}
						title={item.title}
						excerpt={item.excerpt}
						category={item.category}
						readTime={item.readTime}
						href={`/blog/${item.slug}`}
					/>
				))}
			</Grid>
		</>
	)
}
