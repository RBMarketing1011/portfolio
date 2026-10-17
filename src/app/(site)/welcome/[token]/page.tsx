import { Section } from '@/components/sections'
import { auth } from '@/lib/auth'
import { WelcomeForm } from './welcome-form'

export const metadata = {
	title: 'Welcome',
	robots: { index: false, follow: false },
}

export default async function WelcomePage({
	params,
}: {
	params: Promise<{ token: string }>
}) {
	const { token } = await params
	const session = await auth()

	return (
		<Section>
			<div className='mx-auto w-full max-w-sm py-16'>
				<WelcomeForm
					token={token}
					sessionEmail={
						session?.user?.id ? (session.user.email?.toLowerCase() ?? '') : null
					}
				/>
			</div>
		</Section>
	)
}
