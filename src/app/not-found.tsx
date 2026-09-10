import { Grid, Notice, RelatedCard } from '@/components/sections'

export const metadata = {
	title: 'Page Not Found',
	robots: { index: false, follow: true },
}

const routes = [
	{
		title: 'What we do',
		meta: 'Services',
		description: 'The four engagements we run and when each one fits.',
		href: '/services',
	},
	{
		title: 'The work',
		meta: 'Case Studies',
		description: 'Real builds, with the problem and what shipped.',
		href: '/case-studies',
	},
	{
		title: 'Your industry',
		meta: 'Industries',
		description: 'How the work changes by the kind of business you run.',
		href: '/industries',
	},
	{
		title: 'Get in touch',
		meta: 'Contact',
		description: 'Book an assessment, or just talk the problem through.',
		href: '/contact',
	},
]

export default function NotFound() {
	return (
		<>
			<Notice
				variant='code'
				code='404'
				title='That page has moved, or never existed'
				description='Either way you are stuck here, so these are the four places people are usually trying to reach.'
				steps={[]}
				actions={[
					{ label: 'Back To Home', href: '/' },
					{ label: 'Book An Assessment', href: '/contact' },
				]}
			/>

			<Grid columns={2} className='pt-0 lg:pt-0'>
				{routes.map((route) => (
					<RelatedCard key={route.href} {...route} />
				))}
			</Grid>
		</>
	)
}
