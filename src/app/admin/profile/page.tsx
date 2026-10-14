import { auth } from '@/lib/auth'
import { ProfileView } from '@/app/account/profile/profile-view'

export const metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

// The admin layout has already checked the role, so a session is certain here.
export default async function AdminProfilePage() {
	const session = await auth()

	return (
		<ProfileView
			email={session?.user?.email ?? ''}
			name={session?.user?.name ?? ''}
			description='Your own sign-in details. They stay the same whichever account you open.'
		/>
	)
}
