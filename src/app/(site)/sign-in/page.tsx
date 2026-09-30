import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Section } from '@/components/sections'
import { buildMetadata } from '@/lib/seo'
import { currentMembership } from '@/lib/workspace/current'
import { SignInForm } from './sign-in-form'

export const metadata = buildMetadata({
	title: 'Sign In',
	description:
		'Sign in to save the websites you build and keep your images with your account.',
	path: '/sign-in',
})

export default async function SignInPage() {
	// Membership, not just a session: a token that outlived its account would
	// bounce here from /account and back forever.
	if (await currentMembership()) redirect('/account')

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
					<SignInForm />
				</Suspense>
			</div>
		</Section>
	)
}
