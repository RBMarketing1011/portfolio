import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { PasswordForm } from '../password-form'
import { ProfileNameForm } from './profile-name-form'

export const metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/account/profile')

	return (
		<div className='max-w-xl space-y-10'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Your profile
				</h1>
				<p className='mt-2 leading-7 text-slate-400'>
					You, not the account. These follow you into every account you belong
					to.
				</p>
			</div>

			<section className='rounded-xl border border-white/10 bg-white/3 p-6'>
				<h2 className='font-display text-lg font-semibold text-white'>
					Sign-in email
				</h2>
				<p className='mt-2 text-sm text-white'>{session.user.email}</p>
				<p className='mt-1 text-xs text-slate-500'>
					Invitations are matched against this address.
				</p>
			</section>

			<section>
				<h2 className='font-display text-lg font-semibold text-white'>
					Display name
				</h2>
				<ProfileNameForm name={session.user.name ?? ''} />
			</section>

			<section>
				<h2 className='font-display text-lg font-semibold text-white'>
					Password
				</h2>
				<PasswordForm />
			</section>
		</div>
	)
}
