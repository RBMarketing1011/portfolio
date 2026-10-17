import { Suspense } from 'react'
import { Section } from '@/components/sections'
import { buildMetadata } from '@/lib/seo'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata = {
	...buildMetadata({
		title: 'Forgot password',
		description: 'Get an emailed link to choose a new ReynoldsBuilt password.',
		path: '/forgot-password',
	}),
	robots: { index: false, follow: false },
}

/**
 * Open to everyone, signed in or not. The emailed link proves the inbox, which
 * is exactly what someone whose password was changed behind their back has
 * left; their still-valid session must not stand between them and the form.
 */
export default function ForgotPasswordPage() {
	return (
		<Section>
			<div className='mx-auto w-full max-w-sm py-16'>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Reset your password
				</h1>
				<p className='mt-3 mb-8 leading-7 text-slate-400'>
					Enter the email you sign in with and we will send you a link to
					choose a new one.
				</p>
				<Suspense>
					<ForgotPasswordForm />
				</Suspense>
			</div>
		</Section>
	)
}
