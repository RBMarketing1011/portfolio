import { Section } from '@/components/sections'
import { ResetPasswordForm } from './reset-password-form'

export const metadata = {
	title: 'Choose a new password',
	robots: { index: false, follow: false },
}

export default async function ResetPasswordPage({
	params,
}: {
	params: Promise<{ token: string }>
}) {
	const { token } = await params

	return (
		<Section>
			<div className='mx-auto w-full max-w-sm py-16'>
				<ResetPasswordForm token={token} />
			</div>
		</Section>
	)
}
