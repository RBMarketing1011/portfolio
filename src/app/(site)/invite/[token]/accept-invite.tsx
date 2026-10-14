'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'

type State =
	| { kind: 'loading' }
	| { kind: 'ready'; accountName: string; email: string }
	| { kind: 'error'; message: string }

export function AcceptInvite({
	token,
	signedIn,
}: {
	token: string
	signedIn: boolean
}) {
	const router = useRouter()
	const [state, setState] = useState<State>({ kind: 'loading' })
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		let live = true
		void (async () => {
			const response = await fetch(`/api/account/invites/${token}`, {
				cache: 'no-store',
			})
			if (!live) return
			const body = await response.json().catch(() => ({}))
			setState(
				response.ok
					? {
							kind: 'ready',
							accountName: body.invite.accountName,
							email: body.invite.email,
						}
					: {
							kind: 'error',
							message: body.error ?? 'That invitation is no longer valid.',
						},
			)
		})()
		return () => {
			live = false
		}
	}, [token])

	const accept = async () => {
		setBusy(true)
		const response = await fetch(`/api/account/invites/${token}`, {
			method: 'POST',
		})
		setBusy(false)
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			setState({
				kind: 'error',
				message: body.error ?? 'That invitation could not be accepted.',
			})
			return
		}
		router.push('/account')
		router.refresh()
	}

	if (state.kind === 'loading')
		return (
			<p className='flex items-center gap-2 text-sm text-muted-foreground'>
				<Loader2 className='size-4 animate-spin' /> Checking that invitation…
			</p>
		)

	if (state.kind === 'error')
		return (
			<Card className='text-center'>
				<CardHeader>
					<CardTitle>This invitation cannot be used</CardTitle>
					<CardDescription>{state.message}</CardDescription>
				</CardHeader>
				<CardFooter className='justify-center'>
					<Button asChild variant='outline'>
						<Link href='/'>Back to the site</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	return (
		<Card className='text-center'>
			<CardHeader>
				<MailCheck className='mx-auto size-8 text-primary' />
				<CardTitle>Join {state.accountName}</CardTitle>
				<CardDescription>
					This invitation was sent to{' '}
					<span className='text-foreground'>{state.email}</span>.
				</CardDescription>
			</CardHeader>
			<CardFooter className='justify-center'>
				{signedIn ? (
					<Button onClick={accept} disabled={busy}>
						{busy && <Loader2 className='animate-spin' />} Accept invitation
					</Button>
				) : (
					<Button asChild className='w-full'>
						<Link href={`/sign-in?next=/invite/${token}`}>Sign in to accept</Link>
					</Button>
				)}
			</CardFooter>
		</Card>
	)
}
