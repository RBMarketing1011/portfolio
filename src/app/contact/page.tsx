import ContactForm from '@/components/contact-form'
import { ContactSplit, FaqAccordion } from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { site } from '@/lib/site'
import { faqs } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Contact',
	description:
		'Book an AI and automation assessment. Tell us what is slowing your team down and we will show you what should be built.',
	path: '/contact',
})

export default function ContactPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Contact', path: '/contact' },
				])}
			/>

			<ContactSplit
				eyebrow='Contact'
				title='Tell us what is slowing your team down.'
				description='Bring the process that costs you the most time. We will tell you honestly whether it is worth automating, rebuilding, or leaving alone.'
				email={site.email}
				steps={[
					{
						title: '1. A short conversation',
						body: 'Twenty minutes to understand your operation and whether we are a fit.',
					},
					{
						title: '2. The assessment',
						body: 'We walk your business end to end and map where time and money leak.',
					},
					{
						title: '3. A ranked roadmap',
						body: 'What to build, in what order, and what each piece is worth. Yours to keep.',
					},
				]}
				form={<ContactForm />}
			/>

			<FaqAccordion
				eyebrow='Before you write'
				title='The questions we would otherwise answer in the reply'
				description='Covering these here means the first exchange can be about your process instead.'
				faqs={faqs}
			/>
		</>
	)
}
