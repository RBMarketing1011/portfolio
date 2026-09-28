import { redirect } from 'next/navigation'
import { Section } from '@/components/sections'
import { auth } from '@/lib/auth'
import { PasswordForm } from './password-form'

export const metadata = {
	title: 'Account',
	robots: { index: false, follow: false },
}

export default async function AccountPage() {
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/account')

	return (
		<Section>
			<div className='py-16'>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Account
				</h1>
				<p className='mt-3 leading-7 text-slate-400'>
					Signed in as <span className='text-white'>{session.user.email}</span>
				</p>
				<PasswordForm />
			</div>
		</Section>
	)
}
