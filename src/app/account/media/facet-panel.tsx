'use client'

/**
 * The "Filters" part of the left rail: Tags, Colors and Folders with counts for the current
 * result set, then Type, Orientation and Kind as plain toggles (a count over a result that
 * already filtered on a single-valued field would hide its siblings). A value is "on" when
 * its `field:value` pair is in `activeValues`; clicking reports the clause and that state.
 */
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronRight, Folder } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { NEUTRAL_COLORS, swatchFor } from '@/lib/media/colors'
import {
	MEDIA_FORMATS,
	MEDIA_KINDS,
	MEDIA_ORIENTATIONS,
	type QueryChip,
} from '@/lib/media/types'
import { cn } from '@/lib/utils'
import type { FacetPanelProps } from './contracts'
import { clauseFor, formatCount, pluralize } from './format'

/**
 * `max` is the most a group ever draws (the server already sends the top 30 tags and 20
 * folders; a hostile or buggy reply must not draw thousands). `shown` is how many a
 * collapsed list shows before "Show more".
 */
export const FACET_LIMITS = {
	tags: { max: 30, shown: 12 },
	colors: { max: 24, shown: 24 },
	folders: { max: 20, shown: 6 },
} as const

const LABEL_MAX = 60
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const clip = (text: string, max: number) => {
	const chars = Array.from(text)
	return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

export type FacetItem = {
	/** What goes after the operator: a tag slug, a color name, a folder id. */
	value: string
	label: string
	/** Null when the reply carried no usable count: the number is left off, never guessed. */
	count: number | null
	hex?: string
}

/** `tag:kitchen`: the exact pair `activeValues` holds for a facet, unquoted. */
export const facetPair = (field: string, value: string) => `${field}:${value}`

/**
 * A group from the network, made safe to draw: only rows that have a value, repeats
 * dropped, labels bounded, counts that are not counts left off, at most `max` rows.
 * Colors keep a swatch only when it is a real hex (or the curated one for that name).
 */
export function cleanFacetItems(
	raw: unknown,
	max: number,
	colors = false,
): FacetItem[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	const out: FacetItem[] = []
	for (const entry of raw) {
		if (out.length >= max) break
		if (!entry || typeof entry !== 'object') continue
		const { value, label, count, hex } = entry as Record<string, unknown>
		if (typeof value !== 'string' || value.trim() === '' || seen.has(value))
			continue
		seen.add(value)
		const text =
			typeof label === 'string' && label.trim() !== '' ? label.trim() : value
		const item: FacetItem = {
			value,
			label: clip(text, LABEL_MAX),
			count:
				typeof count === 'number' && Number.isFinite(count) && count >= 0
					? Math.floor(count)
					: null,
		}
		if (colors) {
			const swatch = typeof hex === 'string' && HEX.test(hex) ? hex : swatchFor(value)
			if (swatch) item.hex = swatch
		}
		out.push(item)
	}
	return out
}

/** Chromatic colors first, then the neutrals (gray, black, white), each group in the order it arrived. */
export function orderColors<T extends { value: string }>(
	items: readonly T[],
): T[] {
	return [
		...items.filter((item) => !NEUTRAL_COLORS.has(item.value)),
		...items.filter((item) => NEUTRAL_COLORS.has(item.value)),
	]
}

/**
 * What a collapsed list draws: the first `shown`, plus anything switched on, so a
 * pressed value can never hide behind "Show more". Expanded (or short) lists draw all.
 */
export function visibleItems<T extends { value: string }>(
	items: readonly T[],
	shown: number,
	expanded: boolean,
	isActive: (item: T) => boolean,
): T[] {
	if (expanded || items.length <= shown) return [...items]
	return items.filter((item, index) => index < shown || isActive(item))
}

/** `Clients/Acme/Kitchens` -> parent `Clients/Acme/`, leaf `Kitchens`: the leaf is what a person looks for. */
export function splitPath(path: string) {
	const cut = path.lastIndexOf('/')
	const leaf = path.slice(cut + 1)
	return cut < 0 || leaf === ''
		? { parent: '', leaf: path }
		: { parent: path.slice(0, cut + 1), leaf }
}

export type CleanFacets = {
	tags: FacetItem[]
	colors: FacetItem[]
	folders: FacetItem[]
}

export function normalizeFacets(facets: unknown): CleanFacets {
	const source =
		facets && typeof facets === 'object' ? (facets as Record<string, unknown>) : {}
	return {
		tags: cleanFacetItems(source.tags, FACET_LIMITS.tags.max),
		colors: orderColors(cleanFacetItems(source.colors, FACET_LIMITS.colors.max, true)),
		folders: cleanFacetItems(source.folders, FACET_LIMITS.folders.max),
	}
}

type StaticFacet = {
	field: 'type' | 'orientation' | 'kind'
	title: string
	values: readonly string[]
	label(value: string): string
	defaultOpen: boolean
}

const titleCase = (value: string) =>
	value.charAt(0).toUpperCase() + value.slice(1)

/**
 * Format, orientation and kind are single-valued: a count over a result set that already
 * filtered on one would hide its siblings, so they are plain toggles, always all there.
 */
export const STATIC_FACETS: readonly StaticFacet[] = [
	{
		field: 'type',
		title: 'Type',
		values: MEDIA_FORMATS,
		label: (value) => value.toUpperCase(),
		defaultOpen: true,
	},
	{
		field: 'orientation',
		title: 'Orientation',
		values: MEDIA_ORIENTATIONS,
		label: titleCase,
		defaultOpen: false,
	},
	{
		field: 'kind',
		title: 'Kind',
		values: MEDIA_KINDS,
		label: titleCase,
		defaultOpen: false,
	},
]

/**
 * What `activeValues` should hold for a query: `field:value` for every value of every
 * positive filter chip (`type:png,jpg` gives `type:png` and `type:jpg`). A negated chip
 * is not "on", it is the opposite, so it presses nothing.
 */
export function activeValuesFromChips(
	chips: readonly Pick<QueryChip, 'kind' | 'field' | 'values' | 'negated'>[] | null | undefined,
): Set<string> {
	const active = new Set<string>()
	for (const chip of Array.isArray(chips) ? chips : []) {
		if (!chip || chip.kind !== 'filter' || chip.negated || !chip.field) continue
		for (const value of Array.isArray(chip.values) ? chip.values : [])
			if (typeof value === 'string' && value !== '')
				active.add(facetPair(chip.field, value))
	}
	return active
}

type ActiveSet = ReadonlySet<string> | null | undefined

export function isActivePair(active: ActiveSet, pair: string) {
	return !!active && typeof active.has === 'function' && active.has(pair)
}

/** How many switched-on values a group holds, whether or not they are among the rows drawn. */
export function countActive(active: ActiveSet, field: string) {
	if (!active || typeof active.forEach !== 'function') return 0
	const prefix = `${field}:`
	let count = 0
	active.forEach((pair) => {
		if (typeof pair === 'string' && pair.startsWith(prefix)) count++
	})
	return count
}

function Swatch({ hex }: { hex?: string }) {
	return (
		<span
			aria-hidden
			className={cn(
				'size-3 shrink-0 rounded-full',
				// A color with no usable hex still gets a marker, so the row lines up.
				hex ? 'ring-1 ring-white/30' : 'border border-dashed border-white/40',
			)}
			style={hex ? { backgroundColor: hex } : undefined}
		/>
	)
}

type ChipItem = {
	value: string
	label: string
	count?: number | null
	/** Present for colors (`''` is a color with no usable hex). */
	swatch?: string
}

function ToggleChip({
	value,
	label,
	count,
	active,
	swatch,
}: ChipItem & { active: boolean }) {
	const hasCount = typeof count === 'number'
	return (
		<ToggleGroupItem
			value={value}
			aria-label={hasCount ? `${label}, ${pluralize(count, 'image')}` : label}
			title={label.length > 24 ? label : undefined}
			className={cn(
				'h-auto min-h-7 max-w-full shrink cursor-pointer gap-1.5 rounded-full border px-2.5 py-1 text-xs font-normal transition-colors motion-reduce:transition-none data-[state=on]:bg-brand/15 data-[state=on]:text-white',
				active
					? 'border-brand/50 bg-brand/15 text-white hover:bg-brand/15 hover:text-white'
					: 'border-white/10 bg-white/3 text-slate-300 hover:border-white/20 hover:bg-white/8 hover:text-white',
			)}>
			{swatch !== undefined && <Swatch hex={swatch || undefined} />}
			<span className='min-w-0 truncate'>{label}</span>
			{hasCount && (
				<>
					{/* Flex items draw no space between them; the text needs one to read as words. */}
					{' '}
					<span
						aria-hidden
						className={cn(
							'shrink-0 tabular-nums',
							active ? 'text-white/70' : 'text-slate-400',
						)}>
						{formatCount(count)}
					</span>
				</>
			)}
			{active && <Check aria-hidden strokeWidth={3} className='size-3 shrink-0' />}
		</ToggleGroupItem>
	)
}

/**
 * One group's values as independent filters (`type='multiple'`): each value is its own
 * pressed state. Radix hands back the whole new set; the value that changed is the click.
 */
function ToggleChips({
	id,
	label,
	items,
	isActive,
	onToggle,
}: {
	id?: string
	label: string
	items: readonly ChipItem[]
	isActive(value: string): boolean
	onToggle(value: string): void
}) {
	const pressed = items.filter((item) => isActive(item.value)).map((item) => item.value)
	return (
		<ToggleGroup
			type='multiple'
			id={id}
			aria-label={label}
			spacing={1.5}
			value={pressed}
			onValueChange={(next) => {
				const changed =
					next.find((value) => !pressed.includes(value)) ??
					pressed.find((value) => !next.includes(value))
				if (changed !== undefined) onToggle(changed)
			}}
			className='w-full flex-wrap'>
			{items.map((item) => (
				<ToggleChip key={item.value} {...item} active={isActive(item.value)} />
			))}
		</ToggleGroup>
	)
}

function FacetSection({
	slot,
	title,
	activeCount,
	defaultOpen,
	action,
	children,
}: {
	slot: string
	title: string
	activeCount: number
	defaultOpen: boolean
	/** A control that belongs to the header but is not the toggle (a button cannot hold a button). */
	action?: ReactNode
	children: ReactNode
}) {
	const bodyId = useId()
	// Until the person chooses, a group with something switched on is open, so it can be seen and undone.
	const [choice, setChoice] = useState<boolean | null>(null)
	const open = choice ?? (defaultOpen || activeCount > 0)
	return (
		<div data-slot='facet-section' data-facet={slot}>
			<div className='flex items-center gap-1'>
				<h3 className='min-w-0 flex-1'>
					<Button
						type='button'
						variant='ghost'
						aria-expanded={open}
						aria-controls={bodyId}
						onClick={() => setChoice(!open)}
						className='h-auto min-h-8 w-full cursor-pointer justify-start gap-1.5 px-1 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-transparent hover:text-white motion-reduce:transition-none'>
						<ChevronRight
							aria-hidden
							className={cn(
								'size-3.5 shrink-0 text-slate-500 transition-transform motion-reduce:transition-none',
								open && 'rotate-90',
							)}
						/>
						<span>{title}</span>
						{activeCount > 0 && (
							<>
								<Badge
									aria-hidden
									variant='secondary'
									className='rounded-full border-transparent bg-brand/15 px-1.5 py-0 text-xs font-medium tabular-nums text-brand'>
									{activeCount}
								</Badge>
								<span className='sr-only'>{`${activeCount} selected`}</span>
							</>
						)}
					</Button>
				</h3>
				{action}
			</div>
			<div id={bodyId} role='group' aria-label={title} hidden={!open} className='pb-3 pt-1'>
				{children}
			</div>
		</div>
	)
}

function ShowMore({
	expanded,
	noun,
	controls,
	onToggle,
}: {
	expanded: boolean
	noun: string
	controls: string
	onToggle(): void
}) {
	const text = expanded ? 'Show less' : 'Show more'
	return (
		<Button
			type='button'
			variant='link'
			aria-expanded={expanded}
			aria-controls={controls}
			aria-label={`${text} ${noun}`}
			onClick={onToggle}
			className='mt-1.5 h-auto min-h-7 cursor-pointer px-1.5 py-0 text-xs font-normal text-brand underline-offset-2'>
			{text}
		</Button>
	)
}

/** A list that shows its first few rows and a "Show more" for the rest. */
function ExpandableList<T extends FacetItem>({
	items,
	shown,
	noun,
	isActive,
	renderList,
}: {
	items: readonly T[]
	shown: number
	noun: string
	isActive(item: T): boolean
	/** Draws the visible rows; `id` goes on the list so "Show more" can point at it. */
	renderList(id: string, visible: T[]): ReactNode
}) {
	const id = useId()
	const [expanded, setExpanded] = useState(false)
	const visible = visibleItems(items, shown, expanded, isActive)
	return (
		<>
			{renderList(id, visible)}
			{(expanded || visible.length < items.length) && (
				<ShowMore
					expanded={expanded}
					noun={noun}
					controls={id}
					onToggle={() => setExpanded((current) => !current)}
				/>
			)}
		</>
	)
}

function FolderRow({
	item,
	onSelect,
}: {
	item: FacetItem
	onSelect(folderId: string): void
}) {
	const { parent, leaf } = splitPath(item.label)
	const count = item.count
	return (
		<li>
			<Button
				type='button'
				variant='ghost'
				aria-label={
					count === null ? item.label : `${item.label}, ${pluralize(count, 'image')}`
				}
				title={item.label}
				onClick={() => onSelect(item.value)}
				className='h-auto min-h-8 w-full cursor-pointer justify-start gap-2 px-1.5 py-1 text-left text-sm font-normal text-slate-300 transition-colors hover:bg-white/5 hover:text-white motion-reduce:transition-none'>
				<Folder aria-hidden className='size-4 shrink-0 text-slate-500' />
				<span className='flex min-w-0 flex-1 items-baseline'>
					{parent && (
						<span className='min-w-0 truncate text-slate-400'>{parent}</span>
					)}
					<span className='max-w-full shrink-0 truncate'>{leaf}</span>
				</span>
				{count !== null && (
					<>
						{' '}
						<span
							aria-hidden
							className='shrink-0 text-xs tabular-nums text-slate-400'>
							{formatCount(count)}
						</span>
					</>
				)}
			</Button>
		</li>
	)
}

function SkeletonSection({
	slot,
	title,
	widths,
	rows,
}: {
	slot: string
	title: string
	widths: readonly string[]
	rows?: boolean
}) {
	return (
		<div data-slot='facet-section' data-facet={slot} data-loading=''>
			<h3 className='flex min-h-8 items-center px-1 text-sm font-medium text-slate-200'>
				<span className='mr-1.5 size-3.5 shrink-0' />
				{title}
				<span className='sr-only'>, loading</span>
			</h3>
			<div
				data-slot='facet-skeleton'
				aria-hidden
				className={cn('pb-3 pt-1', rows ? 'space-y-1.5' : 'flex flex-wrap gap-1.5')}>
				{widths.map((width, index) => (
					<Skeleton
						key={index}
						className={cn(
							'bg-white/8 motion-reduce:animate-none',
							rows ? 'h-6 rounded-md' : 'h-7 rounded-full',
							width,
						)}
					/>
				))}
			</div>
		</div>
	)
}

const TAG_SKELETON = ['w-16', 'w-24', 'w-14', 'w-20', 'w-28', 'w-16', 'w-20', 'w-12']
const COLOR_SKELETON = ['w-20', 'w-16', 'w-24', 'w-16', 'w-20', 'w-14']
const FOLDER_SKELETON = ['w-full', 'w-5/6', 'w-2/3', 'w-3/4']

export function FacetPanel({
	facets,
	loading,
	activeValues,
	onToggle,
	onSelectFolder,
	onManageTags,
}: FacetPanelProps) {
	const headingId = useId()
	const data = useMemo(() => normalizeFacets(facets), [facets])

	/** The state is read when the click lands, so a rapid second click sees the first one's result. */
	const toggle = (field: string) => (value: string) =>
		onToggle(clauseFor(field, value), isActivePair(activeValues, facetPair(field, value)))
	const isOn = (field: string) => (value: string) =>
		isActivePair(activeValues, facetPair(field, value))
	const pressed = (field: string) => (item: { value: string }) =>
		isOn(field)(item.value)

	return (
		<section
			aria-labelledby={headingId}
			aria-busy={loading || undefined}
			data-slot='facet-panel'
			className='space-y-1'>
			<h2
				id={headingId}
				className='px-1 pb-1 text-xs font-semibold uppercase tracking-widest text-slate-500'>
				Filters
			</h2>

			{loading ? (
				<>
					<SkeletonSection slot='tags' title='Tags' widths={TAG_SKELETON} />
					<SkeletonSection slot='colors' title='Colors' widths={COLOR_SKELETON} />
					<SkeletonSection slot='folders' title='Folders' widths={FOLDER_SKELETON} rows />
				</>
			) : (
				<>
					{data.tags.length > 0 && (
						<FacetSection
							slot='tags'
							title='Tags'
							activeCount={countActive(activeValues, 'tag')}
							defaultOpen
							action={
								onManageTags && (
									<Button
										type='button'
										variant='link'
										onClick={onManageTags}
										className='h-auto shrink-0 cursor-pointer px-1.5 py-1 text-xs font-normal text-brand underline-offset-2'>
										Manage tags
									</Button>
								)
							}>
							<ExpandableList
								items={data.tags}
								shown={FACET_LIMITS.tags.shown}
								noun='tags'
								isActive={pressed('tag')}
								renderList={(id, visible) => (
									<ToggleChips
										id={id}
										label='Tags'
										items={visible.map(({ value, label, count }) => ({
											value,
											label,
											count,
										}))}
										isActive={isOn('tag')}
										onToggle={toggle('tag')}
									/>
								)}
							/>
						</FacetSection>
					)}

					{data.colors.length > 0 && (
						<FacetSection
							slot='colors'
							title='Colors'
							activeCount={countActive(activeValues, 'color')}
							defaultOpen>
							<ExpandableList
								items={data.colors}
								shown={FACET_LIMITS.colors.shown}
								noun='colors'
								isActive={pressed('color')}
								renderList={(id, visible) => (
									<ToggleChips
										id={id}
										label='Colors'
										items={visible.map(({ value, label, count, hex }) => ({
											value,
											label,
											count,
											swatch: hex ?? '',
										}))}
										isActive={isOn('color')}
										onToggle={toggle('color')}
									/>
								)}
							/>
						</FacetSection>
					)}

					{data.folders.length > 0 && (
						<FacetSection slot='folders' title='Folders' activeCount={0} defaultOpen>
							<ExpandableList
								items={data.folders}
								shown={FACET_LIMITS.folders.shown}
								noun='folders'
								isActive={() => false}
								renderList={(id, visible) => (
									<ul id={id} className='space-y-0.5'>
										{visible.map((item) => (
											<FolderRow key={item.value} item={item} onSelect={onSelectFolder} />
										))}
									</ul>
								)}
							/>
						</FacetSection>
					)}
				</>
			)}

			{STATIC_FACETS.map((group) => (
				<FacetSection
					key={group.field}
					slot={group.field}
					title={group.title}
					activeCount={countActive(activeValues, group.field)}
					defaultOpen={group.defaultOpen}>
					<ToggleChips
						label={group.title}
						items={group.values.map((value) => ({ value, label: group.label(value) }))}
						isActive={isOn(group.field)}
						onToggle={toggle(group.field)}
					/>
				</FacetSection>
			))}
		</section>
	)
}
