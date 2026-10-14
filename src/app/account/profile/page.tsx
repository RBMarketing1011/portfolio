import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ProfileView } from './profile-view'

export const metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/account/profile')

	return (
		<ProfileView
			email={session.user.email ?? ''}
			name={session.user.name ?? ''}
			description='You, not the account. These follow you into every account you belong to.'
		/>
	)
}
