import { redirect } from 'next/navigation'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { auth } from '@/lib/auth'
import { PasswordForm } from '../password-form'
import { ProfileNameForm } from './profile-name-form'

export const metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/account/profile')

	return (
		<div className='max-w-xl space-y-6'>
			<div>
				<h1 className='font-display text-3xl font-semibold'>Your profile</h1>
				<p className='mt-2 text-muted-foreground'>
					You, not the account. These follow you into every account you belong to.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Sign-in email</CardTitle>
					<CardDescription>Invitations are matched against this address.</CardDescription>
				</CardHeader>
				<CardContent>
					<p className='text-sm font-medium'>{session.user.email}</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Display name</CardTitle>
				</CardHeader>
				<CardContent>
					<ProfileNameForm name={session.user.name ?? ''} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Password</CardTitle>
					<CardDescription>Set a new password for signing in.</CardDescription>
				</CardHeader>
				<CardContent>
					<PasswordForm />
				</CardContent>
			</Card>
		</div>
	)
}
