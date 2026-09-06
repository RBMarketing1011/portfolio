import { Mail, MessageSquare, Search, Hammer } from 'lucide-react'
import ContactForm from '@/components/contact-form'
import { Section } from '@/components/sections'
import { GlassCard } from '@/components/ui/glass-card'
import { Separator } from '@/components/ui/separator'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = buildMetadata({
	title: 'Contact',
	description:
		'Book an AI and automation assessment. Tell us what is slowing your team down and we will show you what should be built.',
	path: '/contact',
})

const steps = [
	{
		icon: MessageSquare,
		title: 'A short conversation',
		body: 'Twenty minutes to understand your operation and whether we are a fit.',
	},
	{
		icon: Search,
		title: 'The assessment',
		body: 'We walk your business end to end and map where time and money leak.',
	},
	{
		icon: Hammer,
		title: 'A ranked roadmap',
		body: 'What to build, in what order, and what each piece is worth. Yours to keep.',
	},
]

export default function ContactPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Contact', path: '/contact' },
				])}
			/>

			<section className='hero-grid border-b border-white/10 px-6 pb-20 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.1fr]'>
					<div>
						<p className='eyebrow'>Contact</p>
						<h1 className='mt-5 font-display text-4xl font-semibold leading-tight text-white sm:text-5xl'>
							Tell us what is slowing your team down.
						</h1>
						<p className='mt-6 max-w-md text-lg leading-8 text-slate-300'>
							Bring the process that costs you the most time. We will tell you
							honestly whether it is worth automating, rebuilding, or leaving
							alone.
						</p>

						<div className='mt-10 space-y-6'>
							{steps.map((step, index) => (
								<div key={step.title} className='flex gap-4'>
									<span className='flex size-10 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
										<step.icon className='size-5 text-brand' />
									</span>
									<div>
										<p className='font-medium text-white'>
											{index + 1}. {step.title}
										</p>
										<p className='mt-1 leading-7 text-slate-400'>{step.body}</p>
									</div>
								</div>
							))}
						</div>

						<Separator className='my-8 bg-white/10' />

						<a
							href={`mailto:${site.email}`}
							className='inline-flex items-center gap-3 text-slate-300 hover:text-white'>
							<Mail className='size-5 text-brand' />
							{site.email}
						</a>
					</div>

					<GlassCard className='rounded-2xl p-8 sm:p-10'>
						<h2 className='font-display text-2xl font-semibold text-white'>
							Book an assessment
						</h2>
						<p className='mt-2 leading-7 text-slate-400'>
							No obligation, no sales script.
						</p>
						<div className='mt-8'>
							<ContactForm />
						</div>
					</GlassCard>
				</div>
			</section>

			<Section>
				<p className='text-center text-slate-500'>
					Prefer email? Reach us directly at{' '}
					<a
						href={`mailto:${site.email}`}
						className='font-medium text-brand hover:text-brand-strong'>
						{site.email}
					</a>
				</p>
			</Section>
		</>
	)
}
