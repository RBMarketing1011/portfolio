'use client'

import { Check, Minus, Workflow, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
		points: string[]
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
							{row.points.map((point) => (
								<li key={point} className='flex gap-3 text-slate-300'>
									<Check className='mt-1 size-4 shrink-0 text-brand' />
									<span className='leading-7'>{point}</span>
								</li>
							))}
						</ul>
					)

					if (layout === 'stacked') {
						return (
							<div key={row.title} className='border-t border-white/10 pt-10'>
								<div className='flex h-64 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-sm text-slate-500 sm:h-80'>
									Media slot for this row
								</div>
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
						<div
							className={
								layout === 'alternating' && index % 2 === 1 ? 'lg:order-2' : ''
							}>
							{heading}
							<p className='mt-5 leading-8 text-slate-400'>{row.description}</p>
							<div className='mt-7'>{points}</div>
						</div>
					)

					if (layout === 'cards') {
						return (
							<GlassCard
								key={row.title}
								variant='accent'
								className={cn(
									'grid items-center gap-10 p-8 lg:grid-cols-2 lg:p-10',
									accentEdges[index % accentEdges.length],
								)}>
								{copy}
								<div className='flex aspect-video items-center justify-center rounded-lg border border-white/10 bg-white/3 text-sm text-slate-500'>
									Media slot for this row
								</div>
							</GlassCard>
						)
					}

					return (
						<div
							key={row.title}
							className='grid items-center gap-12 lg:grid-cols-2'>
							{copy}
							<GlassCard
								className={cn(
									'aspect-video w-full',
									index % 2 === 1 && 'lg:order-1',
								)}>
								<div className='flex h-full items-center justify-center px-6 text-center text-sm text-slate-500'>
									Media slot for this row
								</div>
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
				'The number is decorative and greyed back',
				'Titles stay short and active',
				'Summaries carry the actual explanation',
			],
		},
	],
	layout = 'cards',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	steps?: {
		number: string
		title: string
		summary: string
		detail: string[]
	}[]
	/** How the numbered steps are drawn. */
	layout?: 'cards' | 'timeline' | 'columns'
}) {
	const detailList = (items: string[]) => (
		<ul className='space-y-3'>
			{items.map((item) => (
				<li key={item} className='flex gap-3 text-slate-300'>
					<Check className='mt-1 size-4 shrink-0 text-brand' />
					<span className='leading-7'>{item}</span>
				</li>
			))}
		</ul>
	)

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>

			{layout === 'timeline' && (
				<ol className='mt-12 border-l border-white/10 pl-8 sm:pl-12'>
					{steps.map((step) => (
						<li
							key={step.number}
							className='relative pb-12 last:pb-0 sm:grid sm:grid-cols-[1fr_1fr] sm:gap-10'>
							<span
								aria-hidden
								className='absolute -left-8 flex size-11 items-center justify-center rounded-full border border-brand/40 bg-ink font-display text-sm font-semibold text-brand sm:-left-12 sm:size-12'>
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
					{steps.map((step) => (
						<li key={step.number} className='border-t-2 border-brand/40 pt-6'>
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
							key={step.number}
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
			wide: true,
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
			wide: true,
		},
		{
			title: 'This is a wide tile',
			blurb:
				'Three wide and three standard tiles fill three rows of a three column grid exactly.',
			wide: true,
		},
		{
			title: 'This is the closing tile',
			blurb: 'The last tile closes the final row with no gap left over.',
		},
	],
	tileStyle = 'accent',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	tiles?: { title: string; blurb: string; wide?: boolean; icon?: LucideIcon }[]
	/** How each tile is drawn. Spans stay the same across all three. */
	tileStyle?: 'accent' | 'divided' | 'numbered'
}) {
	if (tileStyle === 'divided') {
		return (
			<Section>
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
				<div className='mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3'>
					{tiles.map((tile, index) => {
						const Icon = tile.icon ?? Workflow
						return (
							<div
								key={index}
								className={cn('bg-ink p-7', tile.wide && 'lg:col-span-2')}>
								<div className='flex items-center gap-3'>
									<Icon className='size-5 shrink-0 text-brand' />
									<h3 className='font-display text-lg font-semibold text-white'>
										{tile.title}
									</h3>
								</div>
								<p className='mt-3 leading-7 text-slate-400'>{tile.blurb}</p>
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
				<div className='mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
					{tiles.map((tile, index) => (
						<div
							key={index}
							className={cn(
								'rounded-xl border border-white/12 p-7',
								tile.wide && 'lg:col-span-2',
							)}>
							<span className='font-display text-sm font-semibold tracking-[0.2em] text-brand'>
								{String(index + 1).padStart(2, '0')}
							</span>
							<h3 className='mt-4 font-display text-lg font-semibold text-white'>
								{tile.title}
							</h3>
							<p className='mt-3 leading-7 text-slate-400'>{tile.blurb}</p>
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
			<div className='mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
				{tiles.map((tile, index) => {
					const Icon = tile.icon ?? Workflow
					return (
						<GlassCard
							key={index}
							variant='accent'
							className={cn(
								'p-7',
								accentEdges[index % accentEdges.length],
								tile.wide && 'lg:col-span-2',
							)}>
							<span className='flex size-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
								<Icon className='size-5 text-brand' />
							</span>
							<h3 className='mt-5 font-display text-lg font-semibold text-white'>
								{tile.title}
							</h3>
							<p className='mt-3 leading-7 text-slate-400'>{tile.blurb}</p>
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
			id: 'one',
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
			id: 'two',
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
			id: 'three',
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
		id: string
		label: string
		title: string
		body: string
		points: string[]
	}[]
	/** Where the tab list sits and how the active tab is marked. */
	tabStyle?: 'pills' | 'underline' | 'side'
}) {
	const side = tabStyle === 'side'

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<Tabs
				defaultValue={items[0]?.id}
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
					{items.map((item) => (
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
				{items.map((item) => (
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
									{item.points.map((point) => (
										<li key={point} className='flex gap-3 text-slate-300'>
											<Check className='mt-1 size-4 shrink-0 text-brand' />
											<span className='leading-7'>{point}</span>
										</li>
									))}
								</ul>
							</div>
							<div className='flex aspect-video items-center justify-center rounded-lg border border-white/10 bg-white/3 px-6 text-center text-sm text-slate-500'>
								Media slot for this panel
							</div>
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
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	columns?: string[]
	rows?: { label: string; values: boolean[] }[]
	/** How the table itself is drawn. */
	tableStyle?: 'accent' | 'rules' | 'zebra'
}) {
	const mark = (value: boolean) =>
		value ? (
			<Check className='size-5 text-brand' />
		) : (
			<Minus className='size-5 text-slate-700' />
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
							key={column}
							className={cn(
								'p-5 text-sm font-semibold',
								tableStyle === 'rules' && 'uppercase tracking-[0.14em]',
								index === 0
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
						key={row.label}
						className={cn(
							tableStyle === 'accent' &&
								'border-b border-brand/10 last:border-b-0',
							tableStyle === 'rules' &&
								'border-b border-white/8 last:border-b-0',
							tableStyle === 'zebra' && rowIndex % 2 === 1 && 'bg-white/3',
						)}>
						<td className='p-5 leading-7 text-slate-300'>{row.label}</td>
						{row.values.map((value, index) => (
							<td
								key={index}
								className={cn(
									'p-5',
									index === 0 && tableStyle === 'accent' && 'bg-brand/8',
								)}>
								{mark(value)}
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
	variant = 'outline',
	className,
}: {
	label?: string
	items?: string[]
	variant?: 'outline' | 'solid' | 'inline'
	className?: string
}) {
	// No pills at all, just a dot-separated line under the label.
	if (variant === 'inline') {
		return (
			<div className={className}>
				<p className='eyebrow'>{label}</p>
				<ul className='mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300'>
					{items.map((item, index) => (
						<li key={item} className='flex items-center gap-3'>
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
		<div className={className}>
			<p className='eyebrow'>{label}</p>
			<ul className='mt-4 flex flex-wrap gap-2'>
				{items.map((item) => (
					<li key={item}>
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
