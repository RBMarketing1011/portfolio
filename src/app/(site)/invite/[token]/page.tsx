import { Section } from '@/components/sections'
import { auth } from '@/lib/auth'
import { AcceptInvite } from './accept-invite'

export const metadata = {
	title: 'Invitation',
	robots: { index: false, follow: false },
}

export default async function InvitePage({
	params,
}: {
	params: Promise<{ token: string }>
}) {
	const { token } = await params
	const session = await auth()

	return (
		<Section>
			<div className='mx-auto w-full max-w-md py-20'>
				<AcceptInvite token={token} signedIn={Boolean(session?.user?.id)} />
			</div>
		</Section>
	)
}
