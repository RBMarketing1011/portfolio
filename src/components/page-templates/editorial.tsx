import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import {
	AuthorBio,
	Breadcrumbs,
	Callout,
	ContactSplit,
	FaqAccordion,
	Figure,
	Grid,
	LeadCapture,
	ProseBlock,
	RelatedCard,
	Section,
	TableOfContents,
	sampleRelated,
} from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function RelatedCards() {
	return sampleRelated.map((item, index) => (
		<RelatedCard key={index} {...item} />
	))
}

export function BlogPostTemplate() {
	return (
		<>
			<section className='hero-grid border-b border-white/10 px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-3xl'>
					<Breadcrumbs
						items={[
							{ label: 'Home', href: '/' },
							{ label: 'Blog', href: '/blog' },
							{ label: 'This Is The Article Title' },
						]}
					/>
					<Badge className='mt-8 uppercase tracking-widest'>Category</Badge>
					<h1 className='mt-6 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl'>
						This is the article title, which can run to two lines
					</h1>
					<p className='mt-6 text-lg leading-8 text-slate-300'>
						This is the article standfirst. One paragraph that tells the reader
						what they will get out of the piece before they commit to it.
					</p>
					<div className='mt-8 flex items-center gap-3 text-sm text-slate-500'>
						<span>Author Name</span>
						<span>·</span>
						<time dateTime='2026-01-01'>1 January 2026</time>
						<span>·</span>
						<span>6 min read</span>
					</div>
				</div>
			</section>

			<Section>
				<div className='mx-auto grid max-w-6xl gap-14 lg:grid-cols-[16rem_1fr]'>
					<TableOfContents
						items={[
							{ id: 'section-one', label: 'This is the first heading' },
							{ id: 'section-two', label: 'This is the second heading' },
							{ id: 'section-three', label: 'This is the third heading' },
						]}
					/>
					<div className='min-w-0'>
						<ProseBlock>
							<p>
								This is the opening paragraph of the article. It sets up the
								problem before any of the headings below start answering it.
							</p>
							<h2 id='section-one'>This is the first heading</h2>
							<p>
								This is the body under the first heading. Headings carry ids so
								the table of contents on the left can track position while
								scrolling.
							</p>
						</ProseBlock>
						<Figure />
						<ProseBlock>
							<h2 id='section-two'>This is the second heading</h2>
							<p>
								This is the body under the second heading. Prose blocks can be
								split around figures and callouts as many times as an article
								needs.
							</p>
						</ProseBlock>
						<Callout />
						<ProseBlock>
							<h2 id='section-three'>This is the third heading</h2>
							<p>
								This is the closing section of the article, followed by the
								author block underneath.
							</p>
						</ProseBlock>
						<AuthorBio className='mt-14' />
					</div>
				</div>
			</Section>

			<LeadCapture title='This is the mid-article lead capture' />
			<Grid title='Keep Reading' className='border-t border-white/10'>
				<RelatedCards />
			</Grid>
		</>
	)
}

export function LegalTemplate() {
	return (
		<>
			<section className='hero-grid border-b border-white/10 px-6 pb-14 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-3xl'>
					<Breadcrumbs
						items={[
							{ label: 'Home', href: '/' },
							{ label: 'This Is The Policy Name' },
						]}
					/>
					<h1 className='mt-8 font-display text-4xl font-semibold leading-tight text-white sm:text-5xl'>
						This is the legal page heading
					</h1>
					<p className='mt-5 text-slate-400'>Last updated 1 January 2026</p>
				</div>
			</section>

			<Section>
				<div className='mx-auto max-w-3xl'>
					<ProseBlock />
				</div>
			</Section>
		</>
	)
}

export function ContactTemplate() {
	return (
		<>
			<ContactSplit
				eyebrow='Contact Template'
				title='This is the contact page heading'
			/>
			<FaqAccordion
				eyebrow='Before You Ask'
				title='This is the FAQ under the contact form'
			/>
		</>
	)
}

export function NotFoundTemplate() {
	return (
		<section className='hero-grid flex min-h-screen items-center px-6 py-32 sm:px-10 lg:px-16'>
			<div className='mx-auto w-full max-w-3xl text-center'>
				<p className='font-display text-7xl font-semibold text-brand/40 sm:text-8xl'>
					404
				</p>
				<h1 className='mt-8 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl'>
					This is the not found heading
				</h1>
				<p className='mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-300'>
					This is the not found description. It says the page is gone and points
					the visitor somewhere useful instead of leaving them stuck.
				</p>
				<div className='mt-10 flex flex-wrap justify-center gap-4'>
					<Button
						asChild
						size='lg'
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href='/'>
							Back To Home <ArrowRight />
						</Link>
					</Button>
					<Button
						asChild
						size='lg'
						variant='outline'
						className='border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
						<Link href='/contact'>Get In Touch</Link>
					</Button>
				</div>
			</div>
		</section>
	)
}

export function ThankYouTemplate() {
	return (
		<>
			<section className='hero-grid border-b border-white/10 px-6 pb-20 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-3xl text-center'>
					<span className='mx-auto flex size-16 items-center justify-center rounded-full border border-brand/30 bg-brand/10'>
						<Check className='size-7 text-brand' />
					</span>
					<h1 className='mt-8 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl'>
						This is the thank you heading
					</h1>
					<p className='mt-6 text-lg leading-8 text-slate-300'>
						This is the confirmation message. It repeats what was just submitted
						and says exactly what happens next, so nobody is left wondering.
					</p>
					<dl className='mt-14 grid gap-8 text-left sm:grid-cols-3'>
						{[
							{
								value: 'Step One',
								label: 'This is what happens immediately',
							},
							{
								value: 'Step Two',
								label: 'This is the follow up and when to expect it',
							},
							{
								value: 'Step Three',
								label: 'This is what the visitor should do meanwhile',
							},
						].map((item) => (
							<div key={item.value}>
								<dt className='font-display text-xl font-semibold text-brand'>
									{item.value}
								</dt>
								<dd className='mt-2 leading-7 text-slate-400'>{item.label}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<Grid title='While You Wait' className='border-t border-white/10'>
				<RelatedCards />
			</Grid>
		</>
	)
}
