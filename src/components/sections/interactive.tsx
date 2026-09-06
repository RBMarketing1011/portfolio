'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Section, SectionHeading } from './primitives'

const currency = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 0,
})

export function RoiCalculator({
	eyebrow = 'Eyebrow',
	title = 'This is the savings calculator heading',
	description = 'This is the calculator description. Adjust the inputs to see what the manual version of a process costs over a year.',
	defaultPeople = 3,
	defaultHours = 6,
	defaultRate = 35,
	automatedShare = 0.7,
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	defaultPeople?: number
	defaultHours?: number
	defaultRate?: number
	/** Share of the manual time a build is assumed to remove. */
	automatedShare?: number
}) {
	const [people, setPeople] = useState(defaultPeople)
	const [hours, setHours] = useState(defaultHours)
	const [rate, setRate] = useState(defaultRate)

	const result = useMemo(() => {
		const weeklyHours = people * hours
		const annualHours = weeklyHours * 52
		const annualCost = annualHours * rate
		const recoveredHours = annualHours * automatedShare
		const recoveredCost = recoveredHours * rate
		return {
			weeklyHours,
			annualHours,
			annualCost,
			recoveredHours,
			recoveredCost,
		}
	}, [people, hours, rate, automatedShare])

	const fields = [
		{
			id: 'roi-people',
			label: 'People doing it',
			value: people,
			set: setPeople,
			min: 1,
			max: 200,
			suffix: 'people',
		},
		{
			id: 'roi-hours',
			label: 'Hours each, per week',
			value: hours,
			set: setHours,
			min: 1,
			max: 40,
			suffix: 'hours',
		},
		{
			id: 'roi-rate',
			label: 'Loaded hourly rate',
			value: rate,
			set: setRate,
			min: 1,
			max: 500,
			suffix: 'per hour',
		},
	]

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<div className='mt-12 grid gap-5 lg:grid-cols-[1fr_1.1fr]'>
				<GlassCard className='p-8'>
					<div className='space-y-7'>
						{fields.map((field) => (
							<div key={field.id}>
								<div className='flex items-baseline justify-between'>
									<Label htmlFor={field.id} className='text-slate-300'>
										{field.label}
									</Label>
									<span className='text-sm tabular-nums text-slate-500'>
										{field.suffix}
									</span>
								</div>
								<Input
									id={field.id}
									type='number'
									inputMode='numeric'
									min={field.min}
									max={field.max}
									value={field.value}
									onChange={(event) => {
										const next = Number(event.target.value)
										field.set(
											Number.isNaN(next)
												? field.min
												: Math.min(field.max, Math.max(field.min, next)),
										)
									}}
									className='mt-2 border-white/15 bg-ink/60 text-white'
								/>
								<input
									type='range'
									aria-label={field.label}
									min={field.min}
									max={field.max}
									value={field.value}
									onChange={(event) => field.set(Number(event.target.value))}
									className='mt-3 w-full accent-brand'
								/>
							</div>
						))}
					</div>
				</GlassCard>

				<GlassCard variant='accent' className='flex flex-col p-8'>
					<Badge className='uppercase tracking-widest'>Estimate</Badge>
					<p className='mt-6 text-sm text-slate-400'>
						Time spent on this process today
					</p>
					<p className='mt-2 font-display text-3xl font-semibold text-white tabular-nums'>
						{result.annualHours.toLocaleString()} hours / year
					</p>

					<p className='mt-8 text-sm text-slate-400'>What that costs you</p>
					<p className='mt-2 font-display text-3xl font-semibold text-white tabular-nums'>
						{currency.format(result.annualCost)}
					</p>

					<div className='mt-8 border-t border-white/10 pt-8'>
						<p className='text-sm text-slate-400'>
							Recoverable at {Math.round(automatedShare * 100)}% automated
						</p>
						<p className='mt-2 font-display text-5xl font-semibold text-brand tabular-nums'>
							{currency.format(result.recoveredCost)}
						</p>
						<p className='mt-3 leading-7 text-slate-400'>
							Roughly {Math.round(result.recoveredHours).toLocaleString()} hours
							a year handed back to the people currently doing it by hand.
						</p>
					</div>

					<Button
						asChild
						size='lg'
						className='mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href='/contact'>
							Check These Numbers With Us <ArrowRight />
						</Link>
					</Button>
					<p className='mt-4 text-xs leading-5 text-slate-500'>
						This is an estimate from the inputs above, not a quote.
					</p>
				</GlassCard>
			</div>
		</Section>
	)
}

export function AnnouncementBar({
	message = 'This is the announcement message, kept to one short line.',
	linkLabel = 'Read More',
	href = '/blog',
	dismissible = true,
}: {
	message?: string
	linkLabel?: string
	href?: string
	dismissible?: boolean
}) {
	const [open, setOpen] = useState(true)
	if (!open) return null

	return (
		<div className='relative border-b border-brand/25 bg-brand/10 px-6 py-2.5 text-center sm:px-10'>
			<p className='text-sm text-slate-200'>
				{message}{' '}
				<Link
					href={href}
					className='font-semibold text-brand underline underline-offset-4 hover:text-brand-strong'>
					{linkLabel}
				</Link>
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
