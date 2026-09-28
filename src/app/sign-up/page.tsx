import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Section } from '@/components/sections'
import { auth } from '@/lib/auth'
import { buildMetadata } from '@/lib/seo'
import { SignUpForm } from './sign-up-form'

export const metadata = buildMetadata({
	title: 'Create Account',
	description:
		'Create a ReynoldsBuilt account to save the websites you build and keep your images.',
	path: '/sign-up',
})

export default async function SignUpPage() {
	if (await auth()) redirect('/builder/sites')

	return (
		<Section>
			<div className='mx-auto w-full max-w-sm py-16'>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Create your account
				</h1>
				<p className='mt-3 mb-8 leading-7 text-slate-400'>
					Keep every site you build, on every device.
				</p>
				<Suspense>
					<SignUpForm siteKey={process.env.CLOUDFLARE_SITE_KEY} />
				</Suspense>
			</div>
		</Section>
	)
}
