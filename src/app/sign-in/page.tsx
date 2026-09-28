import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Section } from '@/components/sections'
import { auth } from '@/lib/auth'
import { buildMetadata } from '@/lib/seo'
import { SignInForm } from './sign-in-form'

export const metadata = buildMetadata({
	title: 'Sign In',
	description:
		'Sign in to save the websites you build and keep your images with your account.',
	path: '/sign-in',
})

export default async function SignInPage() {
	if (await auth()) redirect('/builder/sites')

	return (
		<Section>
			<div className='mx-auto w-full max-w-sm py-16'>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Sign in
				</h1>
				<p className='mt-3 mb-8 leading-7 text-slate-400'>
					Save the sites you build and keep them on every device.
				</p>
				<Suspense>
					<SignInForm siteKey={process.env.CLOUDFLARE_SITE_KEY} />
				</Suspense>
			</div>
		</Section>
	)
}
