'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { AlertCircle, ArrowRight, Check, Mail } from 'lucide-react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Section, SectionHeading } from './primitives'

export function FaqAccordion({
	eyebrow = 'Eyebrow',
	title = 'This is the FAQ heading',
	description = 'This is the FAQ description. It sets up the questions below.',
	faqs = [
		{
			question: 'This is the first question?',
			answer:
				'This is the answer. Two or three sentences is the right length. Anything longer means the question is really a page of its own.',
		},
		{
			question: 'This is the second question?',
			answer:
				'Answers open one at a time by default, so the list stays short and scannable as the reader works down it.',
		},
		{
			question: 'This is the third question?',
			answer:
				'Six to eight questions is the practical limit before an FAQ starts feeling like a dumping ground.',
		},
		{
			question: 'This is the fourth question?',
			answer:
				'Order questions by how often they actually get asked, not by how easy they are to answer.',
		},
	],
	layout = 'split',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	faqs?: { question: string; answer: string }[]
	/** Where the heading sits and how each question is framed. */
	layout?: 'split' | 'stacked' | 'boxed'
}) {
	const boxed = layout === 'boxed'

	const accordion = (
		<Accordion
			type='single'
			collapsible
			className={cn('w-full', boxed && 'space-y-4')}>
			{faqs.map((faq) => (
				<AccordionItem
					key={faq.question}
					value={faq.question}
					className={cn(
						boxed
							? 'rounded-xl border border-white/12 bg-white/3 px-6'
							: 'border-white/10',
					)}>
					<AccordionTrigger className='py-5 text-left text-base font-medium text-white hover:no-underline'>
						{faq.question}
					</AccordionTrigger>
					<AccordionContent className='pb-5 pr-8 text-base leading-8 text-slate-400'>
						{faq.answer}
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	)

	if (layout === 'split') {
		return (
			<Section>
				<div className='grid gap-12 lg:grid-cols-[1fr_1.4fr]'>
					<SectionHeading
						eyebrow={eyebrow}
						title={title}
						description={description}
					/>
					{accordion}
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
				align='center'
			/>
			<div className='mx-auto mt-12 max-w-3xl'>{accordion}</div>
		</Section>
	)
}

export function ContactSplit({
	eyebrow = 'Eyebrow',
	title = 'This is the contact heading',
	description = 'This is the contact description. It explains what happens after the form is sent.',
	steps = [
		{
			title: '1. This is the first step',
			body: 'This is what happens immediately after someone gets in touch.',
		},
		{
			title: '2. This is the second step',
			body: 'Setting expectations here removes the hesitation before submitting.',
		},
		{
			title: '3. This is the third step',
			body: 'Three steps is enough. More reads like a process document.',
		},
	],
	email = 'hello@example.com',
	form,
	layout = 'split',
}: {
	eyebrow?: string
	title?: string
	description?: string
	steps?: { title: string; body: string }[]
	email?: string
	form?: React.ReactNode
	/** Where the form sits relative to the copy. */
	layout?: 'split' | 'reversed' | 'stacked'
}) {
	const stacked = layout === 'stacked'

	const formCard = (
		<GlassCard
			className={cn(
				'rounded-2xl p-8 sm:p-10',
				layout === 'reversed' && 'lg:order-first',
				stacked && 'mx-auto w-full max-w-2xl',
			)}>
			{form ?? (
				<div className='flex h-full min-h-80 items-center justify-center text-center text-sm text-slate-500'>
					Form slot: drop the contact form component in here
				</div>
			)}
		</GlassCard>
	)

	const mailLink = (
		<a
			href={`mailto:${email}`}
			className='mt-12 inline-flex items-center gap-3 text-slate-300 transition-colors hover:text-white'>
			<Mail className='size-5 text-brand' />
			{email}
		</a>
	)

	return (
		<section className='hero-grid border-b border-white/10 px-6 pb-20 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
			<div
				className={cn(
					'mx-auto max-w-6xl gap-14',
					stacked ? 'space-y-14' : 'grid lg:grid-cols-2',
				)}>
				<div
					className={cn(stacked ? 'text-center' : 'text-center sm:text-left')}>
					<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
					<h1 className='mt-6 font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl'>
						{title}
					</h1>
					<p
						className={cn(
							'mt-6 max-w-xl text-lg leading-8 text-slate-300',
							stacked ? 'mx-auto' : 'mx-auto sm:mx-0',
						)}>
						{description}
					</p>
					<div
						className={cn(
							'mt-12',
							stacked ? 'grid gap-8 text-left sm:grid-cols-3' : 'space-y-8',
						)}>
						{steps.map((step) => (
							<div
								key={step.title}
								className={cn(
									'flex gap-4',
									stacked
										? 'flex-col items-start'
										: 'flex-col items-center sm:flex-row sm:items-start',
								)}>
								<span className='mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
									<Check className='size-4 text-brand' />
								</span>
								<div>
									<p className='font-semibold text-white'>{step.title}</p>
									<p className='mt-1 leading-7 text-slate-400'>{step.body}</p>
								</div>
							</div>
						))}
					</div>
					{mailLink}
				</div>

				{formCard}
			</div>
		</section>
	)
}

export function PricingTiers({
	eyebrow = 'Eyebrow',
	title = 'This is the engagement tiers heading',
	description = 'This is the tiers description. Each column is one shape of engagement, not a fixed price list.',
	tiers = [
		{
			name: 'First Tier',
			price: 'Starting Point',
			blurb: 'This is who the first tier is for and when it makes sense.',
			features: [
				'This is an included item',
				'Four or five per tier reads best',
				'Keep the lists parallel across tiers',
				'Differences should be obvious at a glance',
			],
			cta: 'Get Started',
			href: '/contact',
		},
		{
			name: 'Second Tier',
			price: 'Most Common',
			blurb: 'The middle tier is highlighted because most people land here.',
			features: [
				'Everything in the first tier',
				'Plus the things that define this tier',
				'The highlighted column gets the accent card',
				'And the solid button instead of the outline',
				'One extra line is fine on the featured tier',
			],
			cta: 'Book A Call',
			href: '/contact',
			featured: true,
		},
		{
			name: 'Third Tier',
			price: 'Ongoing',
			blurb: 'The last tier covers the longer or larger version of the work.',
			features: [
				'Everything in the second tier',
				'Plus whatever scales it up',
				'Three tiers is the practical maximum',
				'Two works fine if the choice is simple',
			],
			cta: 'Talk To Us',
			href: '/contact',
		},
	],
	design = 'cards',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	tiers?: {
		name: string
		price: string
		blurb: string
		features: string[]
		cta: string
		href: string
		featured?: boolean
	}[]
	/** How each column is framed. */
	design?: 'cards' | 'divided' | 'banded'
}) {
	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
				align='center'
			/>
			<div
				className={cn(
					'mt-14',
					design === 'cards' && 'grid items-center gap-5 lg:grid-cols-3',
					design === 'divided' &&
						'grid gap-px overflow-hidden rounded-xl border border-white/12 bg-white/12 lg:grid-cols-3',
					design === 'banded' && 'grid gap-8 lg:grid-cols-3',
				)}>
				{tiers.map((tier) => {
					const body = (
						<>
							{tier.featured && design !== 'banded' && (
								<Badge className='mb-5 uppercase tracking-widest'>
									Recommended
								</Badge>
							)}
							<h3 className='font-display text-xl font-semibold text-white'>
								{tier.name}
							</h3>
							<p className='mt-2 font-display text-3xl font-semibold text-brand'>
								{tier.price}
							</p>
							<p className='mt-4 leading-7 text-slate-400'>{tier.blurb}</p>
							<ul className='mt-7 flex-1 space-y-3'>
								{tier.features.map((feature) => (
									<li key={feature} className='flex gap-3 text-slate-300'>
										<Check className='mt-1 size-4 shrink-0 text-brand' />
										<span className='leading-7'>{feature}</span>
									</li>
								))}
							</ul>
							<Button
								asChild
								size='lg'
								variant={tier.featured ? 'default' : 'outline'}
								className={
									tier.featured
										? 'mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'
										: 'mt-8 border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'
								}>
								<Link href={tier.href}>{tier.cta}</Link>
							</Button>
						</>
					)

					if (design === 'divided') {
						return (
							<div
								key={tier.name}
								className={cn(
									'flex flex-col bg-ink p-8',
									tier.featured && 'bg-brand/8',
								)}>
								{body}
							</div>
						)
					}

					if (design === 'banded') {
						return (
							<div
								key={tier.name}
								className={cn(
									'flex flex-col rounded-xl border border-white/12 p-8',
									tier.featured && 'border-t-4 border-t-brand',
								)}>
								{body}
							</div>
						)
					}

					return (
						<GlassCard
							key={tier.name}
							variant={tier.featured ? 'accent' : 'default'}
							className='flex flex-col p-8'>
							{body}
						</GlassCard>
					)
				})}
			</div>
		</Section>
	)
}

export function LeadCapture({
	title = 'This is the inline lead capture heading',
	description = 'This is the supporting line. One field, one button, no page change.',
	placeholder = 'you@company.com',
	cta = 'Subscribe',
	design = 'card',
}: {
	title?: string
	description?: string
	placeholder?: string
	cta?: string
	/** How the capture block is framed. */
	design?: 'card' | 'banner' | 'ruled'
}) {
	const [submitted, setSubmitted] = useState(false)
	const [email, setEmail] = useState('')
	const [error, setError] = useState<string | null>(null)
	const errorId = useId()

	const submit = (event: React.FormEvent) => {
		event.preventDefault()
		const value = email.trim()
		if (!value) {
			setError('Enter your email address so we know where to send it.')
			return
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
			setError('That does not look like a valid email address.')
			return
		}
		setError(null)
		setSubmitted(true)
	}

	return (
		<Section>
			<Frame design={design}>
				<div
					className={cn(
						'grid items-center gap-8',
						design === 'banner'
							? 'mx-auto max-w-2xl text-center'
							: 'lg:grid-cols-[1.3fr_1fr]',
					)}>
					<div>
						<h2 className='font-display text-2xl font-semibold text-white'>
							{title}
						</h2>
						<p className='mt-3 leading-7 text-slate-300'>{description}</p>
					</div>
					{submitted ? (
						<p
							className={cn(
								'flex items-center gap-3 font-medium text-brand',
								design === 'banner' && 'justify-center',
							)}>
							<Check className='size-5' /> Thanks, you are on the list.
						</p>
					) : (
						/* noValidate so the browser's own bubble never fires over ours. */
						<form noValidate onSubmit={submit} className='relative'>
							<div className='flex flex-col gap-3 sm:flex-row'>
								<Input
									type='email'
									value={email}
									onChange={(event) => {
										setEmail(event.target.value)
										if (error) setError(null)
									}}
									placeholder={placeholder}
									aria-label='Email address'
									aria-invalid={Boolean(error)}
									aria-describedby={error ? errorId : undefined}
									className={cn(
										'border-white/15 bg-ink/60 text-white placeholder:text-slate-500',
										error &&
											'border-destructive focus-visible:ring-destructive/40',
									)}
								/>
								{error && (
									/* In flow between field and button on mobile; absolute below the
									   row from sm up, where the button sits beside the field. */
									<p
										id={errorId}
										role='alert'
										className='flex items-center gap-2 text-sm text-destructive sm:absolute sm:inset-x-0 sm:top-full sm:mt-2'>
										<AlertCircle className='size-4 shrink-0' />
										{error}
									</p>
								)}
								<Button
									type='submit'
									className='shrink-0 bg-brand font-bold text-ink hover:bg-brand-strong'>
									{cta} <ArrowRight />
								</Button>
							</div>
						</form>
					)}
				</div>
			</Frame>
		</Section>
	)
}

// Wrapper only: the capture form inside it is identical across all three designs.
function Frame({
	design,
	children,
}: {
	design: 'card' | 'banner' | 'ruled'
	children: React.ReactNode
}) {
	if (design === 'banner') {
		return <div className='rounded-2xl bg-brand/12 p-8 sm:p-12'>{children}</div>
	}
	if (design === 'ruled') {
		return <div className='border-y border-white/12 py-10'>{children}</div>
	}
	return (
		<GlassCard variant='accent' className='p-8 sm:p-10'>
			{children}
		</GlassCard>
	)
}

export function SplitCta({
	paths = [
		{
			eyebrow: 'Ready',
			title: 'This is the first path heading',
			body: 'This is for the visitor who already knows what they want and is ready to move.',
			cta: 'Book An Assessment',
			href: '/contact',
			featured: true,
		},
		{
			eyebrow: 'Exploring',
			title: 'This is the second path heading',
			body: 'This is for the visitor who is still looking around and is not ready to talk yet.',
			cta: 'See The Work',
			href: '/case-studies',
		},
	],
	design = 'cards',
}: {
	paths?: {
		eyebrow: string
		title: string
		body: string
		cta: string
		href: string
		featured?: boolean
	}[]
	/** How the two paths are separated. */
	design?: 'cards' | 'divided' | 'rows'
}) {
	const rows = design === 'rows'

	return (
		<Section className='border-t border-white/10'>
			<div
				className={cn(
					design === 'cards' && 'grid gap-5 lg:grid-cols-2',
					design === 'divided' &&
						'grid divide-white/12 overflow-hidden rounded-xl border border-white/12 lg:grid-cols-2 lg:divide-x',
					rows && 'divide-y divide-white/12 border-y border-white/12',
				)}>
				{paths.map((path) => {
					const button = (
						<Button
							asChild
							size='lg'
							variant={path.featured ? 'default' : 'outline'}
							className={cn(
								'w-fit shrink-0',
								!rows && 'mt-8',
								path.featured
									? 'bg-brand font-bold text-ink hover:bg-brand-strong'
									: 'border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white',
							)}>
							<Link href={path.href}>
								{path.cta} <ArrowRight />
							</Link>
						</Button>
					)

					if (rows) {
						return (
							<div
								key={path.title}
								className='flex flex-col gap-6 py-10 lg:flex-row lg:items-center lg:justify-between'>
								<div className='max-w-2xl'>
									<p className='eyebrow'>{path.eyebrow}</p>
									<h2 className='mt-3 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl'>
										{path.title}
									</h2>
									<p className='mt-3 leading-8 text-slate-400'>{path.body}</p>
								</div>
								{button}
							</div>
						)
					}

					const body = (
						<>
							<p className='eyebrow'>{path.eyebrow}</p>
							<h2 className='mt-4 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl'>
								{path.title}
							</h2>
							<p className='mt-4 flex-1 leading-8 text-slate-400'>
								{path.body}
							</p>
							{button}
						</>
					)

					if (design === 'divided') {
						return (
							<div
								key={path.title}
								className={cn(
									'flex flex-col p-10',
									path.featured && 'bg-brand/8',
								)}>
								{body}
							</div>
						)
					}

					return (
						<GlassCard
							key={path.title}
							variant={path.featured ? 'accent' : 'default'}
							className='flex flex-col p-10'>
							{body}
						</GlassCard>
					)
				})}
			</div>
		</Section>
	)
}
