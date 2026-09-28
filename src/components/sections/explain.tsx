'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Check, Minus, Workflow, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { rowId } from '@/lib/builder/ids'
import { cn } from '@/lib/utils'
import { Section, SectionHeading } from './primitives'

// Rotating accent edges so a set of cards reads as a group rather than one repeated card.
const accentEdges = [
	'border-brand/50 from-brand/18',
	'border-brand/22 from-brand/8',
	'border-brand/34 from-brand/12',
	'border-brand/16 from-brand/6',
	'border-brand/42 from-brand/15',
	'border-brand/26 from-brand/10',
]

export function FeatureRows({
	rows = [
		{
			eyebrow: 'Eyebrow',
			title: 'This is the first feature row heading',
			description:
				'This is the row description. Rows alternate sides so the eye zig-zags down the page instead of scanning a flat column.',
			points: [
				'This is a supporting point',
				'Three or four keeps the row balanced against the media',
				'Points are optional if the description carries it',
			],
		},
		{
			eyebrow: 'Eyebrow',
			title: 'This is the second feature row heading',
			description:
				'Each row takes its own media slot. Use these when a capability needs a visual to actually land.',
			points: [
				'The media flips to the opposite side automatically',
				'Rows stack vertically on mobile with media first',
				'Add as many rows as the page can carry',
			],
		},
	],
	layout = 'alternating',
}: {
	rows?: {
		eyebrow: string
		title: string
		description: string
		points: (string | { text?: string; icon?: LucideIcon })[]
		/** Real screenshot. Falls back to an empty media slot when absent. */
		image?: string
		/** Overrides the automatic zig-zag for this row. */
		mediaSide?: 'left' | 'right'
	}[]
	/** How each row arranges its copy against its media. */
	layout?: 'alternating' | 'cards' | 'stacked'
}) {
	return (
		<Section>
			<div
				className={cn(
					layout === 'alternating' && 'space-y-20 lg:space-y-28',
					layout === 'cards' && 'space-y-6',
					layout === 'stacked' && 'space-y-16',
				)}>
				{rows.map((row, index) => {
					// Unset keeps the zig-zag; set pins this row to one side.
					const mediaLeft = row.mediaSide
						? row.mediaSide === 'left'
						: layout === 'alternating' && index % 2 === 1
					const media = (className: string) =>
						row.image ? (
							<div className={cn('relative overflow-hidden', className)}>
								<Image
									src={row.image}
									alt=''
									fill
									sizes='(min-width: 1024px) 36rem, 100vw'
									className='object-cover'
								/>
							</div>
						) : (
							<div
								className={cn(
									'flex items-center justify-center bg-white/3 px-6 text-center text-sm text-slate-500',
									className,
								)}>
								Media slot for this row
							</div>
						)
					const heading = (
						<>
							<p className='eyebrow'>{row.eyebrow}</p>
							<h3 className='mt-4 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl'>
								{row.title}
							</h3>
						</>
					)
					const points = (
						<ul className='space-y-3'>
							{(row.points ?? []).map((point, pointIndex) => {
								const text =
									typeof point === 'string' ? point : (point?.text ?? '')
								const Glyph =
									typeof point === 'string' ? Check : (point?.icon ?? Check)
								return (
									<li key={pointIndex} className='flex gap-3 text-slate-300'>
										<Glyph className='mt-1 size-4 shrink-0 text-brand' />
										<span className='leading-7'>{text}</span>
									</li>
								)
							})}
						</ul>
					)

					if (layout === 'stacked') {
						return (
							<div key={index} className='border-t border-white/10 pt-10'>
								{media('h-64 rounded-xl border border-white/10 sm:h-80')}
								<div className='mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]'>
									<div>{heading}</div>
									<div>
										<p className='leading-8 text-slate-400'>
											{row.description}
										</p>
										<div className='mt-6'>{points}</div>
									</div>
								</div>
							</div>
						)
					}

					const copy = (
						<div className={mediaLeft ? 'lg:order-2' : ''}>
							{heading}
							<p className='mt-5 leading-8 text-slate-400'>{row.description}</p>
							<div className='mt-7'>{points}</div>
						</div>
					)

					if (layout === 'cards') {
						return (
							<GlassCard
								key={index}
								variant='accent'
								className={cn(
									'grid items-center gap-10 p-8 lg:grid-cols-2 lg:p-10',
									accentEdges[index % accentEdges.length],
								)}>
								{copy}
								<div className={mediaLeft ? 'lg:order-1' : ''}>
									{media('aspect-video rounded-lg border border-white/10')}
								</div>
							</GlassCard>
						)
					}

					return (
						<div
							key={index}
							className='grid items-center gap-12 lg:grid-cols-2'>
							{copy}
							<GlassCard
								className={cn(
									'aspect-video w-full overflow-hidden',
									mediaLeft && 'lg:order-1',
								)}>
								{media('h-full w-full')}
							</GlassCard>
						</div>
					)
				})}
			</div>
		</Section>
	)
}

export function ProcessSteps({
	eyebrow = 'Eyebrow',
	title = 'This is the process steps heading',
	description = 'This is the process description. It frames the numbered steps below.',
	steps = [
		{
			number: '01',
			title: 'This is the first step',
			summary:
				'This is the step summary. One or two lines on what happens during this stage.',
			detail: [
				'This is a detail line under the step',
				'Three or four is usually enough',
				'Detail lines are optional per step',
			],
		},
		{
			number: '02',
			title: 'This is the second step',
			summary:
				'Steps read top to bottom with the number pinned to the left on desktop.',
			detail: [
				'Each step carries its own detail list',
				'Keep the lists roughly the same length',
				'Anything longer belongs on its own page',
			],
		},
		{
			number: '03',
			title: 'This is the third step',
			summary:
				'Three to five steps is the range where this section still reads quickly.',
			detail: [
				'The number is decorative and grayed back',
				'Titles stay short and active',
				'Summaries carry the actual explanation',
			],
		},
	],
	numberStyle = 'outline',
	layout = 'cards',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	steps?: {
		number: string
		title: string
		summary: string
		detail: (string | { text?: string; icon?: LucideIcon })[]
	}[]
	/** How the timeline's number badge is filled. */
	numberStyle?: 'outline' | 'solid' | 'muted'
	/** How the numbered steps are drawn. */
	layout?: 'cards' | 'timeline' | 'columns'
}) {
	const detailList = (
		items: (string | { text?: string; icon?: LucideIcon })[] = [],
	) => (
		<ul className='space-y-3'>
			{items.map((item, index) => {
				const text = typeof item === 'string' ? item : (item?.text ?? '')
				const Glyph = typeof item === 'string' ? Check : (item?.icon ?? Check)
				return (
					<li key={index} className='flex gap-3 text-slate-300'>
						<Glyph className='mt-1 size-4 shrink-0 text-brand' />
						<span className='leading-7'>{text}</span>
					</li>
				)
			})}
		</ul>
	)

	const badge = cn(
		numberStyle === 'solid' &&
			'border-brand bg-brand font-bold text-ink',
		numberStyle === 'muted' &&
			'border-white/15 bg-white/5 text-slate-300',
		numberStyle === 'outline' && 'border-brand/40 bg-ink text-brand',
	)

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>

			{layout === 'timeline' && (
				<ol className='mt-12 border-l border-white/10 pl-12 sm:pl-20'>
					{steps.map((step, index) => (
						<li
							key={index}
							className='relative pb-12 last:pb-0 sm:grid sm:grid-cols-[1fr_1fr] sm:gap-10'>
							<span
								aria-hidden
								className={cn(
									'absolute -left-12 flex size-11 items-center justify-center rounded-full border font-display text-sm font-semibold sm:-left-20 sm:size-12',
									badge,
								)}>
								{step.number}
							</span>
							<div>
								<h3 className='font-display text-2xl font-semibold text-white'>
									{step.title}
								</h3>
								<p className='mt-3 leading-8 text-slate-400'>{step.summary}</p>
							</div>
							<div className='mt-6 sm:mt-0'>{detailList(step.detail)}</div>
						</li>
					))}
				</ol>
			)}

			{layout === 'columns' && (
				<ol className='mt-12 grid gap-8 md:grid-cols-3'>
					{steps.map((step, index) => (
						<li key={index} className='border-t-2 border-brand/40 pt-6'>
							<span className='font-display text-6xl font-semibold text-brand/25'>
								{step.number}
							</span>
							<h3 className='mt-4 font-display text-xl font-semibold text-white'>
								{step.title}
							</h3>
							<p className='mt-3 leading-7 text-slate-400'>{step.summary}</p>
							<div className='mt-6'>{detailList(step.detail)}</div>
						</li>
					))}
				</ol>
			)}

			{layout === 'cards' && (
				<ol className='mt-12 space-y-5'>
					{steps.map((step, index) => (
						<GlassCard
							key={index}
							asChild
							variant='accent'
							className={accentEdges[index % accentEdges.length]}>
							<li className='grid gap-8 p-8 lg:grid-cols-[auto_1fr_1fr] lg:items-start'>
								<span className='font-display text-5xl font-semibold text-brand/30'>
									{step.number}
								</span>
								<div>
									<h3 className='font-display text-2xl font-semibold text-white'>
										{step.title}
									</h3>
									<p className='mt-3 leading-8 text-slate-400'>
										{step.summary}
									</p>
								</div>
								{detailList(step.detail)}
							</li>
						</GlassCard>
					))}
				</ol>
			)}
		</Section>
	)
}

export function BentoGrid({
	eyebrow = 'Eyebrow',
	title = 'This is the bento grid heading',
	description = 'This is the bento description. Mixed tile sizes stop a capability overview from reading flat.',
	// Spans must total a multiple of three or the last row leaves holes.
	tiles = [
		{
			title: 'This is the lead tile',
			blurb:
				'The first tile spans two columns and carries the heaviest idea in the set.',
			span: 2,
		},
		{
			title: 'This is a standard tile',
			blurb: 'Standard tiles take a title and two lines.',
		},
		{
			title: 'This is a standard tile',
			blurb: 'Keep blurbs even so the rows sit level.',
		},
		{
			title: 'This is a wide tile',
			blurb:
				'Wide tiles alternate sides down the block so the grid never reads flat.',
			span: 2,
		},
		{
			title: 'This is a wide tile',
			blurb:
				'Three wide and three standard tiles fill three rows of a three column grid exactly.',
			span: 2,
		},
		{
			title: 'This is the closing tile',
			blurb: 'The last tile closes the final row with no gap left over.',
		},
	],
	tileStyle = 'accent',
	columns = 3,
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	tiles?: {
		title: string
		blurb: string
		/** How many columns this tile spans. */
		span?: number
		icon?: LucideIcon
		/** Optional media beside the copy, on either side. */
		image?: string
		mediaSide?: 'left' | 'right'
		/** Authored HTML shown instead of an image. */
		html?: string
	}[]
	/** How many columns the grid runs at its widest. */
	columns?: 3 | 4
	/** How each tile is drawn. Spans stay the same across all three. */
	tileStyle?: 'accent' | 'divided' | 'numbered'
}) {
	const gridCols = columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

	const spanClass = (tile: { span?: number }) => {
		const span = Math.min(Math.max(tile.span ?? 1, 1), columns)
		if (span <= 1) return ''
		return span === 2
			? 'lg:col-span-2'
			: span === 3
				? 'lg:col-span-3'
				: 'lg:col-span-4'
	}

	// A tile is only split into two panes when it actually has something to show.
	const tileBody = (tile: {
		title: string
		blurb: string
		image?: string
		html?: string
		mediaSide?: 'left' | 'right'
		icon?: LucideIcon
	}) => {
		const copy = (
			<div className='min-w-0'>
				<h3 className='font-display text-lg font-semibold text-white'>
					{tile.title}
				</h3>
				<p className='mt-3 leading-7 text-slate-400'>{tile.blurb}</p>
			</div>
		)

		if (!tile.image && !tile.html) return copy

		const slot = tile.image ? (
			<div className='relative min-h-36 overflow-hidden rounded-lg border border-white/10'>
				<Image
					src={tile.image}
					alt=''
					fill
					sizes='(min-width: 1024px) 24rem, 100vw'
					className='object-cover'
				/>
			</div>
		) : (
			<div
				className='rounded-lg border border-white/10 bg-white/3 p-4 text-sm leading-7 text-slate-300 [&>p]:mt-3 [&>p:first-child]:mt-0 [&>ul]:mt-3 [&>ul]:space-y-2 [&>ul]:pl-5 [&>ul>li]:list-disc [&>ul>li]:marker:text-brand'
				dangerouslySetInnerHTML={{ __html: tile.html ?? '' }}
			/>
		)

		return (
			<div className='grid items-center gap-5 sm:grid-cols-2'>
				{copy}
				<div className={tile.mediaSide === 'left' ? 'sm:order-first' : ''}>
					{slot}
				</div>
			</div>
		)
	}

	if (tileStyle === 'divided') {
		return (
			<Section>
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
				<div
					className={cn(
						'mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2',
						gridCols,
					)}>
					{tiles.map((tile, index) => {
						const Icon = tile.icon
						return (
							<div key={index} className={cn('bg-ink p-7', spanClass(tile))}>
								{Icon && (
									<Icon className='mb-3 size-5 shrink-0 text-brand' />
								)}
								{tileBody(tile)}
							</div>
						)
					})}
				</div>
			</Section>
		)
	}

	if (tileStyle === 'numbered') {
		return (
			<Section>
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
				<div className={cn('mt-12 grid gap-5 sm:grid-cols-2', gridCols)}>
					{tiles.map((tile, index) => (
						<div
							key={index}
							className={cn(
								'rounded-xl border border-white/12 p-7',
								spanClass(tile),
							)}>
							<span className='font-display text-sm font-semibold tracking-[0.2em] text-brand'>
								{String(index + 1).padStart(2, '0')}
							</span>
							<div className='mt-4'>{tileBody(tile)}</div>
						</div>
					))}
				</div>
			</Section>
		)
	}

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<div className={cn('mt-12 grid gap-5 sm:grid-cols-2', gridCols)}>
				{tiles.map((tile, index) => {
					const Icon = tile.icon ?? Workflow
					return (
						<GlassCard
							key={index}
							variant='accent'
							className={cn(
								'p-7',
								accentEdges[index % accentEdges.length],
								spanClass(tile),
							)}>
							<span className='flex size-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
								<Icon className='size-5 text-brand' />
							</span>
							<div className='mt-5'>{tileBody(tile)}</div>
						</GlassCard>
					)
				})}
			</div>
		</Section>
	)
}

export function TabsShowcase({
	eyebrow = 'Eyebrow',
	title = 'This is the tabs showcase heading',
	description = 'This is the tabs description. Use it when several products or workflows would otherwise stack the page.',
	items = [
		{
			label: 'Tab One',
			title: 'This is the first panel heading',
			body: 'This is the panel body. Each tab holds a heading, a paragraph, and a media slot, so the panels stay the same shape as you move between them.',
			points: [
				'This is a panel point',
				'Three points per panel keeps the height stable',
				'Panels swap without the page jumping',
			],
		},
		{
			label: 'Tab Two',
			title: 'This is the second panel heading',
			body: 'Keep the copy length similar across panels. Wildly different lengths make the section resize as the user clicks through it.',
			points: [
				'Labels stay to one or two words',
				'Four or five tabs is the practical limit',
				'The first tab is selected by default',
			],
		},
		{
			label: 'Tab Three',
			title: 'This is the third panel heading',
			body: 'On mobile the tab list scrolls horizontally rather than wrapping, so the panel below never shifts position.',
			points: [
				'Tabs are keyboard navigable',
				'Each panel can carry its own media',
				'Content is only rendered for the active tab',
			],
		},
	],
	tabStyle = 'pills',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	items?: {
		label: string
		title: string
		body: string
		points: (string | { text?: string; icon?: LucideIcon })[]
		/** Real screenshot. Falls back to an empty media slot when absent. */
		image?: string
	}[]
	/** Where the tab list sits and how the active tab is marked. */
	tabStyle?: 'pills' | 'underline' | 'side'
}) {
	const side = tabStyle === 'side'
	// Nothing outside the block references these, so the index keeps two tabs that
	// share a label from driving one panel.
	const tabs = items.map((item, index) => ({
		...item,
		id: rowId(item.label, index),
	}))
	const [active, setActive] = useState<string | undefined>()
	const value = tabs.some((t) => t.id === active) ? active : tabs[0]?.id

	if (tabs.length === 0) return null

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<Tabs
				value={value}
				onValueChange={setActive}
				orientation={side ? 'vertical' : 'horizontal'}
				className={cn(
					'mt-12',
					side && 'gap-0 lg:grid lg:grid-cols-[14rem_1fr] lg:gap-10',
				)}>
				<TabsList
					className={cn(
						'h-auto bg-transparent p-0',
						tabStyle === 'pills' && 'flex w-full flex-wrap justify-start gap-2',
						tabStyle === 'underline' &&
							'flex w-full justify-start gap-8 rounded-none border-b border-white/10',
						side &&
							'flex w-full flex-col items-stretch gap-1 lg:sticky lg:top-24',
					)}>
					{tabs.map((item) => (
						<TabsTrigger
							key={item.id}
							value={item.id}
							className={cn(
								'text-sm font-medium text-slate-400',
								tabStyle === 'pills' &&
									'rounded-lg border border-white/10 bg-white/3 px-5 py-2.5 data-[state=active]:border-brand/40 data-[state=active]:bg-brand/10 data-[state=active]:text-white',
								tabStyle === 'underline' &&
									'-mb-px rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-4 data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-white',
								side &&
									'justify-start rounded-lg border-0 border-l-2 border-transparent bg-transparent px-4 py-3 text-left data-[state=active]:border-brand data-[state=active]:bg-brand/8 data-[state=active]:text-white',
							)}>
							{item.label}
						</TabsTrigger>
					))}
				</TabsList>
				{tabs.map((item) => (
					<TabsContent
						key={item.id}
						value={item.id}
						className={cn('mt-8', side && 'lg:mt-0')}>
						<GlassCard
							className={cn(
								'grid items-center gap-10 p-8 lg:p-10',
								!side && 'lg:grid-cols-2',
							)}>
							<div>
								<h3 className='font-display text-2xl font-semibold text-white'>
									{item.title}
								</h3>
								<p className='mt-4 leading-8 text-slate-400'>{item.body}</p>
								<ul className='mt-6 space-y-3'>
									{(item.points ?? []).map((point, pointIndex) => {
										const text =
											typeof point === 'string' ? point : (point?.text ?? '')
										const Glyph =
											typeof point === 'string' ? Check : (point?.icon ?? Check)
										return (
											<li
												key={pointIndex}
												className='flex gap-3 text-slate-300'>
												<Glyph className='mt-1 size-4 shrink-0 text-brand' />
												<span className='leading-7'>{text}</span>
											</li>
										)
									})}
								</ul>
							</div>
							{item.image ? (
								<div className='relative aspect-video overflow-hidden rounded-lg border border-white/10'>
									<Image
										src={item.image}
										alt=''
										fill
										sizes='(min-width: 1024px) 32rem, 100vw'
										className='object-cover'
									/>
								</div>
							) : (
								<div className='flex aspect-video items-center justify-center rounded-lg border border-white/10 bg-white/3 px-6 text-center text-sm text-slate-500'>
									Media slot for this panel
								</div>
							)}
						</GlassCard>
					</TabsContent>
				))}
			</Tabs>
		</Section>
	)
}

export function ComparisonTable({
	eyebrow = 'Eyebrow',
	title = 'This is the comparison table heading',
	description = 'This is the comparison description. It handles the objection before the visitor raises it.',
	columns = ['This Option', 'Second Option', 'Third Option'],
	rows = [
		{ label: 'This is a comparison row', values: [true, false, false] },
		{
			label: 'Each row is one point of difference',
			values: [true, true, false],
		},
		{ label: 'Rows read as plain statements', values: [true, false, true] },
		{
			label: 'Five to seven rows is the sweet spot',
			values: [true, false, false],
		},
		{
			label: 'The first column is the recommended one',
			values: [true, true, false],
		},
	],
	tableStyle = 'accent',
	highlight = 1,
	yesIcon: YesIcon = Check,
	noIcon: NoIcon = Minus,
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	columns?: string[]
	rows?: { label: string; values: boolean[] }[]
	/** Which column is marked as the recommended one. 0 highlights none. */
	highlight?: number
	yesIcon?: LucideIcon
	noIcon?: LucideIcon
	/** How the table itself is drawn. */
	tableStyle?: 'accent' | 'rules' | 'zebra'
}) {
	// 1-based so a plain "none" is expressible, and clamped to the real columns.
	const featured = Math.min(Math.max(highlight, 0), columns.length) - 1

	const mark = (value: boolean) =>
		value ? (
			<YesIcon className='size-5 text-brand' />
		) : (
			<NoIcon className='size-5 text-slate-700' />
		)

	const table = (
		<table className='w-full min-w-2xl border-collapse text-left'>
			<thead>
				<tr
					className={cn(
						tableStyle === 'accent' && 'border-b border-brand/20',
						tableStyle === 'rules' && 'border-b border-white/15',
						tableStyle === 'zebra' && 'border-b border-white/10',
					)}>
					<th className='p-5 text-sm font-medium text-slate-500'>&nbsp;</th>
					{columns.map((column, index) => (
						<th
							key={index}
							className={cn(
								'p-5 text-sm font-semibold',
								tableStyle === 'rules' && 'uppercase tracking-[0.14em]',
								index === featured
									? cn(
											'text-brand',
											tableStyle === 'accent' && 'bg-brand/8',
											tableStyle === 'zebra' && 'border-t-2 border-brand',
										)
									: 'text-slate-400',
							)}>
							{column}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row, rowIndex) => (
					<tr
						key={rowIndex}
						className={cn(
							tableStyle === 'accent' &&
								'border-b border-brand/10 last:border-b-0',
							tableStyle === 'rules' &&
								'border-b border-white/8 last:border-b-0',
							tableStyle === 'zebra' && rowIndex % 2 === 1 && 'bg-white/3',
						)}>
						<td className='p-5 leading-7 text-slate-300'>{row.label}</td>
						{columns.map((_, index) => (
							<td
								key={index}
								className={cn(
									'p-5',
									index === featured && tableStyle === 'accent' && 'bg-brand/8',
								)}>
								{mark(Boolean((row.values ?? [])[index]))}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	)

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			{tableStyle === 'rules' ? (
				<div className='mt-12 overflow-x-auto'>{table}</div>
			) : (
				<GlassCard
					variant={tableStyle === 'accent' ? 'accent' : 'default'}
					className={cn(
						'mt-12 overflow-x-auto',
						tableStyle === 'accent' && 'border-brand/30 from-brand/12',
					)}>
					{table}
				</GlassCard>
			)}
		</Section>
	)
}

export function Chips({
	label = 'Built With',
	items = [
		'Chip One',
		'Chip Two',
		'Chip Three',
		'Chip Four',
		'Chip Five',
		'Chip Six',
	],
	align = 'left',
	variant = 'outline',
	className,
}: {
	label?: string
	items?: string[]
	/** Where the label and the chip row sit across the section. */
	align?: 'left' | 'center' | 'right'
	variant?: 'outline' | 'solid' | 'inline'
	className?: string
}) {
	const justify = cn(
		align === 'center' && 'justify-center',
		align === 'right' && 'justify-end',
	)
	const alignText = cn(
		align === 'center' && 'text-center',
		align === 'right' && 'text-right',
	)

	// No pills at all, just a dot-separated line under the label.
	if (variant === 'inline') {
		return (
			<div className={cn(alignText, className)}>
				<p className='eyebrow'>{label}</p>
				<ul
					className={cn(
						'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300',
						justify,
					)}>
					{items.map((item, index) => (
							<li key={index} className='flex items-center gap-3'>
							{item}
							{index < items.length - 1 && (
								<span aria-hidden className='text-slate-600'>
									&middot;
								</span>
							)}
						</li>
					))}
				</ul>
			</div>
		)
	}

	return (
		<div className={cn(alignText, className)}>
			<p className='eyebrow'>{label}</p>
			<ul className={cn('mt-4 flex flex-wrap gap-2', justify)}>
				{items.map((item, index) => (
					<li key={index}>
						<Badge
							variant='outline'
							className={cn(
								'px-3 py-1',
								variant === 'solid'
									? 'border-brand/40 bg-brand/12 font-medium text-brand'
									: 'border-white/15 bg-white/3 text-slate-300',
							)}>
							{item}
						</Badge>
					</li>
				))}
			</ul>
		</div>
	)
}
