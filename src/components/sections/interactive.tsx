'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Dot, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
	evaluateFormula,
	formatValue,
	interpolate,
} from '@/lib/builder/formula'
import { formulaName } from '@/lib/builder/ids'
import {
	ActionButton,
	Section,
	SectionHeading,
	type Action,
} from './primitives'

/** Stored JSON is only as clean as its source, so bounds are coerced before use. */
const num = (value: unknown, fallback: number) =>
	Number.isFinite(Number(value)) ? Number(value) : fallback

export function RoiCalculator({
	eyebrow = 'Eyebrow',
	title = 'This is the savings calculator heading',
	description = 'This is the calculator description. Adjust the inputs to see what the manual version of a process costs over a year.',
	badge = 'Estimate',
	inputs = [
		{
			label: 'People',
			suffix: 'people',
			value: 3,
			min: 1,
			max: 200,
		},
		{
			label: 'Hours per week',
			suffix: 'hours',
			value: 6,
			min: 1,
			max: 40,
		},
		{
			label: 'Hourly rate',
			suffix: 'per hour',
			value: 35,
			min: 1,
			max: 500,
		},
	],
	outputs = [
		{
			label: 'Time spent on this process today',
			formula: 'people * hours_per_week * 52',
			format: 'hours',
		},
		{
			label: 'What that costs you',
			formula: 'people * hours_per_week * 52 * hourly_rate',
			format: 'currency',
		},
		{
			label: 'Recoverable at 70% automated',
			formula: 'people * hours_per_week * 52 * hourly_rate * 0.7',
			format: 'currency',
			featured: true,
			note: 'Roughly {{people * hours_per_week * 52 * 0.7}} hours a year handed back to the people currently doing it by hand.',
			noteFormat: 'number',
		},
	],
	action = {
		label: 'Check These Numbers With Us',
		href: '/contact',
		icon: ArrowRight,
	},
	footnote = 'This is an estimate from the inputs above, not a quote.',
	layout = 'split',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	badge?: string
	/** Each one becomes a named value the formulas can reference by its label. */
	inputs?: {
		id?: string
		label: string
		suffix?: string
		value?: number
		min?: number
		max?: number
		step?: number
	}[]
	/** Each result is an arithmetic formula over the input names. */
	outputs?: {
		label: string
		formula?: string
		format?: 'number' | 'currency' | 'percent' | 'hours'
		decimals?: number
		featured?: boolean
		/** Supports {{ formula }} placeholders. */
		note?: string
		noteFormat?: 'number' | 'currency' | 'percent' | 'hours'
	}[]
	action?: Action
	footnote?: string
	/** Where the inputs sit relative to the result. */
	layout?: 'split' | 'stacked' | 'bare'
}) {
	// A formula refers to an input by its label, so a row with no label names nothing.
	const usable = inputs
		.map((field, index) => ({
			...field,
			name: field?.id || formulaName(field?.label, index),
		}))
		.filter((field) => Boolean(field.label?.trim()))

	// Only what the visitor has dragged is state. Everything else reads through to the
	// authored default, so editing the inputs needs no effect to resync.
	const [overrides, setOverrides] = useState<Record<string, number>>({})

	const signature = usable.map((field) => field.name).join('|')

	const vars = useMemo(() => {
		const out: Record<string, number> = {}
		for (const field of usable) {
			out[field.name] = overrides[field.name] ?? num(field.value, 0)
		}
		return out
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [signature, inputs, overrides])

	const bare = layout === 'bare'
	const stacked = layout === 'stacked'

	const inputPanel = (
		<div
			className={cn(
				stacked ? 'grid gap-7 sm:grid-cols-3' : 'space-y-7',
				bare && 'divide-y divide-white/10',
			)}>
			{usable.map((field, index) => {
				// Stored values are only as clean as the JSON, so coerce before the input sees them.
				const min = num(field.min, 0)
				const max = num(field.max, 100)
				const id = `roi-${field.name}`
				const value = vars[field.name]
				const set = (next: number) =>
					setOverrides((current) => ({
						...current,
						[field.name]: Math.min(max, Math.max(min, next)),
					}))
				return (
					<div
						key={index}
						className={cn(bare && !stacked && 'pt-7 first:pt-0')}>
						<div className='flex items-baseline justify-between'>
							<Label htmlFor={id} className='text-slate-300'>
								{field.label}
							</Label>
							{field.suffix && (
								<span className='text-sm tabular-nums text-slate-500'>
									{field.suffix}
								</span>
							)}
						</div>
						<Input
							id={id}
							type='number'
							inputMode='numeric'
							min={min}
							max={max}
							step={num(field.step, 1)}
							value={value}
							onChange={(event) => {
								const next = Number(event.target.value)
								set(Number.isNaN(next) ? min : next)
							}}
							className='mt-2 border-white/15 bg-ink/60 text-white'
						/>
						<input
							type='range'
							aria-label={field.label}
							min={min}
							max={max}
							step={num(field.step, 1)}
							value={value}
							onChange={(event) => set(Number(event.target.value))}
							className='mt-3 w-full accent-brand'
						/>
					</div>
				)
			})}
		</div>
	)

	const result = (
		<div
			className={cn(
				'flex flex-col',
				stacked && 'sm:grid sm:grid-cols-3 sm:gap-8',
			)}>
			{badge && <Badge className='uppercase tracking-widest'>{badge}</Badge>}
			{outputs.map((output, index) => {
				const computed = evaluateFormula(output.formula, vars)
				const decimals = output.decimals ?? 0
				return (
					<div
						key={index}
						className={cn(
							// A featured first row already clears the badge with its own padding.
							index === 0 ? badge && !output.featured && 'mt-6' : 'mt-8',
							output.featured && 'border-t border-white/10 pt-8',
						)}>
						<p className='text-sm text-slate-400'>{output.label}</p>
						<p
							className={cn(
								'mt-2 font-display font-semibold tabular-nums',
								output.featured ? 'text-5xl text-brand' : 'text-3xl text-white',
							)}>
							{computed === null
								? '—'
								: formatValue(computed, output.format ?? 'number', decimals)}
						</p>
						{output.note && (
							<p className='mt-3 leading-7 text-slate-400'>
								{interpolate(
									output.note,
									vars,
									output.noteFormat ?? 'number',
									decimals,
								)}
							</p>
						)}
					</div>
				)
			})}

			<div className={cn(stacked && 'sm:col-span-3')}>
				{action?.label && <ActionButton action={action} className='mt-8' />}
				{footnote && (
					<p className='mt-4 text-xs leading-5 text-slate-500'>{footnote}</p>
				)}
			</div>
		</div>
	)

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<div
				className={cn(
					'mt-12',
					layout === 'split' && 'grid gap-5 lg:grid-cols-[1fr_1.1fr]',
					stacked && 'space-y-8',
					bare && 'grid gap-14 lg:grid-cols-[1fr_1.1fr]',
				)}>
				{bare ? (
					inputPanel
				) : (
					<GlassCard className='p-8'>{inputPanel}</GlassCard>
				)}
				{bare ? (
					<div className='border-l-2 border-brand pl-8'>{result}</div>
				) : (
					<GlassCard variant='accent' className='p-8'>
						{result}
					</GlassCard>
				)}
			</div>
		</Section>
	)
}

export function AnnouncementBar({
	message = 'This is the announcement message, kept to one short line.',
	linkLabel = 'Read More',
	href = '/blog',
	dismissible = true,
	variant = 'strip',
	align = 'center',
	speed = 30,
	badge = 'New',
}: {
	message?: string
	/** Pass null for a bar that is only a notice. */
	linkLabel?: string | null
	href?: string
	dismissible?: boolean
	variant?: 'strip' | 'badge' | 'floating' | 'ticker'
	/** Where the message sits. Ignored by the ticker, which is always moving. */
	align?: 'left' | 'center' | 'right'
	/** Seconds for one full ticker loop. Lower is faster. */
	speed?: number
	badge?: string
}) {
	const [open, setOpen] = useState(true)
	if (!open) return null

	const link = linkLabel && (
		<Link
			href={href}
			className='font-semibold text-brand underline underline-offset-4 hover:text-brand-strong'>
			{linkLabel}
		</Link>
	)

	const dismiss = dismissible && (
		<button
			type='button'
			onClick={() => setOpen(false)}
			aria-label='Dismiss announcement'
			className='shrink-0 text-slate-400 transition-colors hover:text-white'>
			<X className='size-4' />
		</button>
	)

	const alignText = cn(
		align === 'center' && 'text-center',
		align === 'right' && 'text-right',
	)

	// One line repeated back to back, sliding forever across the top of the page.
	if (variant === 'ticker') {
		const run = (
			<div aria-hidden className='flex shrink-0 items-center'>
				{Array.from({ length: 8 }, (_, index) => (
					<span
						key={index}
						className='flex items-center gap-3 whitespace-nowrap pr-12 text-sm text-slate-200'>
						{message}
						{linkLabel && link}
						<Dot className='size-4 shrink-0 text-brand' />
					</span>
				))}
			</div>
		)

		return (
			<div className='relative overflow-hidden border-b border-brand/25 bg-brand/10 py-2.5'>
				<p className='sr-only'>
					{message} {linkLabel}
				</p>
				<div
					className='flex w-max animate-ticker hover:paused motion-reduce:animate-none'
					style={{ animationDuration: `${speed}s` }}>
					{run}
					{run}
				</div>
				{dismissible && (
					<button
						type='button'
						onClick={() => setOpen(false)}
						aria-label='Dismiss announcement'
						className='absolute right-4 top-1/2 -translate-y-1/2 bg-brand/10 text-slate-400 transition-colors hover:text-white'>
						<X className='size-4' />
					</button>
				)}
			</div>
		)
	}

	// Detached pill over the page rather than an edge-to-edge band.
	if (variant === 'floating') {
		return (
			<div
				className={cn(
					'pointer-events-none sticky top-4 z-50 flex px-4',
					align === 'left'
						? 'justify-start'
						: align === 'right'
							? 'justify-end'
							: 'justify-center',
				)}>
				<GlassCard
					variant='accent'
					className='pointer-events-auto flex items-center gap-4 rounded-full py-2.5 pl-5 pr-3'>
					<p className='text-sm text-slate-200'>
						{message} {link}
					</p>
					{dismiss}
				</GlassCard>
			</div>
		)
	}

	// Left aligned with a badge, for a dated or categorised notice.
	if (variant === 'badge') {
		return (
			<div className='flex items-center gap-3 border-b border-white/10 bg-panel px-6 py-3 sm:px-10'>
				<Badge className='shrink-0 uppercase tracking-widest'>{badge}</Badge>
				<p className={cn('flex-1 text-sm text-slate-300', alignText)}>
					{message} {link}
				</p>
				{dismiss}
			</div>
		)
	}

	return (
		<div
			className={cn(
				'relative border-b border-brand/25 bg-brand/10 px-6 py-2.5 sm:px-10',
				alignText,
				dismissible && align === 'right' && 'pr-12',
			)}>
			<p className='text-sm text-slate-200'>
				{message}
				{linkLabel && <> {link}</>}
			</p>
			{dismissible && (
				<button
					type='button'
					onClick={() => setOpen(false)}
					aria-label='Dismiss announcement'
					className='absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white'>
					<X className='size-4' />
				</button>
			)}
		</div>
	)
}
