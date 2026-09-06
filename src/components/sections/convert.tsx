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
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	faqs?: { question: string; answer: string }[]
}) {
	return (
		<Section>
			<div className='grid gap-12 lg:grid-cols-[1fr_1.4fr]'>
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
				<Accordion type='single' collapsible className='w-full'>
					{faqs.map((faq) => (
						<AccordionItem
							key={faq.question}
							value={faq.question}
							className='border-white/10'>
							<AccordionTrigger className='py-5 text-left text-base font-medium text-white hover:no-underline'>
								{faq.question}
							</AccordionTrigger>
							<AccordionContent className='pb-5 pr-8 text-base leading-8 text-slate-400'>
								{faq.answer}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</div>
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
}: {
	eyebrow?: string
	title?: string
	description?: string
	steps?: { title: string; body: string }[]
	email?: string
	form?: React.ReactNode
}) {
	return (
		<section className='hero-grid border-b border-white/10 px-6 pb-20 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
			<div className='mx-auto grid max-w-6xl gap-14 lg:grid-cols-2'>
				<div className='text-center sm:text-left'>
					<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
					<h1 className='mt-6 font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl'>
						{title}
					</h1>
					<p className='mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-300 sm:mx-0'>
						{description}
					</p>
					<div className='mt-12 space-y-8'>
						{steps.map((step) => (
							<div
								key={step.title}
								className='flex flex-col items-center gap-4 sm:flex-row sm:items-start'>
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
					<a
						href={`mailto:${email}`}
						className='mt-12 inline-flex items-center gap-3 text-slate-300 transition-colors hover:text-white'>
						<Mail className='size-5 text-brand' />
						{email}
					</a>
				</div>

				<GlassCard className='rounded-2xl p-8 sm:p-10'>
					{form ?? (
						<div className='flex h-full min-h-80 items-center justify-center text-center text-sm text-slate-500'>
							Form slot: drop the contact form component in here
						</div>
					)}
				</GlassCard>
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
}) {
	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
				align='center'
			/>
			<div className='mt-14 grid items-center gap-5 lg:grid-cols-3'>
				{tiers.map((tier) => (
					<GlassCard
						key={tier.name}
						variant={tier.featured ? 'accent' : 'default'}
						className='flex flex-col p-8'>
						{tier.featured && (
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
					</GlassCard>
				))}
			</div>
		</Section>
	)
}

export function LeadCapture({
	title = 'This is the inline lead capture heading',
	description = 'This is the supporting line. One field, one button, no page change.',
	placeholder = 'you@company.com',
	cta = 'Subscribe',
}: {
	title?: string
	description?: string
	placeholder?: string
	cta?: string
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
			<GlassCard variant='accent' className='p-8 sm:p-10'>
				<div className='grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]'>
					<div>
						<h2 className='font-display text-2xl font-semibold text-white'>
							{title}
						</h2>
						<p className='mt-3 leading-7 text-slate-300'>{description}</p>
					</div>
					{submitted ? (
						<p className='flex items-center gap-3 font-medium text-brand'>
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
			</GlassCard>
		</Section>
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
}: {
	paths?: {
		eyebrow: string
		title: string
		body: string
		cta: string
		href: string
		featured?: boolean
	}[]
}) {
	return (
		<Section className='border-t border-white/10'>
			<div className='grid gap-5 lg:grid-cols-2'>
				{paths.map((path) => (
					<GlassCard
						key={path.title}
						variant={path.featured ? 'accent' : 'default'}
						className='flex flex-col p-10'>
						<p className='eyebrow'>{path.eyebrow}</p>
						<h2 className='mt-4 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl'>
							{path.title}
						</h2>
						<p className='mt-4 flex-1 leading-8 text-slate-400'>{path.body}</p>
						<Button
							asChild
							size='lg'
							variant={path.featured ? 'default' : 'outline'}
							className={
								path.featured
									? 'mt-8 w-fit bg-brand font-bold text-ink hover:bg-brand-strong'
									: 'mt-8 w-fit border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'
							}>
							<Link href={path.href}>
								{path.cta} <ArrowRight />
							</Link>
						</Button>
					</GlassCard>
				))}
			</div>
		</Section>
	)
}
