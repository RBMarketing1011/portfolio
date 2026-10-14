import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { PasswordForm } from '../password-form'
import { ProfileNameForm } from './profile-name-form'

/**
 * The signed-in person's own details. Shared by `/account/profile` and
 * `/admin/profile`: an admin has no account of their own to hang it under.
 */
export function ProfileView({
	email,
	name,
	description,
}: {
	email: string
	name: string
	description: string
}) {
	return (
		<div className='max-w-xl space-y-6'>
			<div>
				<h1 className='font-display text-3xl font-semibold'>Your profile</h1>
				<p className='mt-2 text-muted-foreground'>{description}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Sign-in email</CardTitle>
					<CardDescription>Invitations are matched against this address.</CardDescription>
				</CardHeader>
				<CardContent>
					<p className='text-sm font-medium'>{email}</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Display name</CardTitle>
				</CardHeader>
				<CardContent>
					<ProfileNameForm name={name} />
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
