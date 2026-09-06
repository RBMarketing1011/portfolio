'use client'

import { useState } from 'react'
import { Pagination, Section } from '@/components/sections'
import { GlassCard } from '@/components/ui/glass-card'

const PER_PAGE = 4
const TOTAL_PAGES = 12
const TOTAL_RESULTS = PER_PAGE * TOTAL_PAGES

// Preview-only: pages in state so the component can be clicked through in the library.
export function PaginationDemo() {
	const [page, setPage] = useState(1)
	const start = (page - 1) * PER_PAGE + 1

	return (
		<Section>
			{/* Marks the pager as state-driven so the preview's link blocker lets clicks through. */}
			<div data-preview-interactive>
				<Pagination
					page={page}
					totalPages={TOTAL_PAGES}
					onPageChange={setPage}
				/>
			</div>
			<div className='mt-10'>
				<p className='text-center text-sm text-slate-500'>
					Showing{' '}
					<span className='tabular-nums text-slate-300'>
						{start}&ndash;{start + PER_PAGE - 1}
					</span>{' '}
					of{' '}
					<span className='tabular-nums text-slate-300'>{TOTAL_RESULTS}</span>{' '}
					&middot; page{' '}
					<span className='tabular-nums text-slate-300'>{page}</span> of{' '}
					{TOTAL_PAGES}
				</p>
				<div className='mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
					{Array.from({ length: PER_PAGE }, (_, index) => (
						<GlassCard key={index} className='p-6'>
							<p className='eyebrow'>Page {page}</p>
							<p className='mt-3 font-display text-lg font-semibold text-white'>
								Result {start + index}
							</p>
							<p className='mt-2 text-sm leading-6 text-slate-400'>
								The cards below the pager change with the selected page.
							</p>
						</GlassCard>
					))}
				</div>
			</div>
		</Section>
	)
}
