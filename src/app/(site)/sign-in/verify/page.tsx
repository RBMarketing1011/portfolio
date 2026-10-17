import Link from 'next/link'
import { ArrowRight, MailOpen } from 'lucide-react'
import { Section } from '@/components/sections'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { site } from '@/lib/site'

export const metadata = {
	title: 'Continue to sign in',
	robots: { index: false, follow: false },
}

/**
 * The page a sign-in link lands on. Mail security gateways (Safe Links,
 * Mimecast, Proofpoint, Gmail's prefetch) open every link in an email the
 * moment it arrives; the real Auth.js callback consumes the one-time token on
 * its first GET, so a link straight to it is often dead by the time the person
 * clicks. Nothing on this page has a side effect: the token is only redeemed
 * when they press the button, which scanners do not do.
 */
export default async function VerifyLinkPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
	const params = await searchParams
	const first = (value: string | string[] | undefined) =>
		Array.isArray(value) ? value[0] : value
	const token = first(params.token)
	const email = first(params.email)
	const callbackUrl = first(params.callbackUrl)

	if (!token || !email)
		return (
			<Section>
				<div className='mx-auto w-full max-w-md py-20'>
					<Card className='text-center'>
						<CardHeader>
							<CardTitle>This link is incomplete</CardTitle>
							<CardDescription>
								Open the sign-in email again and use the button in it, or
								request a new link.
							</CardDescription>
						</CardHeader>
						<CardFooter className='justify-center'>
							<Button asChild variant='outline'>
								<Link href='/sign-in'>Back to sign in</Link>
							</Button>
						</CardFooter>
					</Card>
				</div>
			</Section>
		)

	const href = `/api/auth/callback/nodemailer?${new URLSearchParams({
		token,
		email,
		...(callbackUrl ? { callbackUrl } : {}),
	})}`

	return (
		<Section>
			<div className='mx-auto w-full max-w-md py-20'>
				<Card className='text-center'>
					<CardHeader>
						<MailOpen className='mx-auto size-8 text-primary' />
						<CardTitle>Continue to {site.name}</CardTitle>
						<CardDescription>
							You are signing in as{' '}
							<span className='text-foreground'>{email}</span>. Press continue
							to finish; the link works once.
						</CardDescription>
					</CardHeader>
					<CardFooter className='justify-center'>
						{/* A plain anchor on purpose: a framework Link would prefetch the
						    callback and spend the token before anyone clicked. */}
						<Button asChild size='lg'>
							<a href={href} rel='nofollow'>
								Continue <ArrowRight />
							</a>
						</Button>
					</CardFooter>
				</Card>
			</div>
		</Section>
	)
}
