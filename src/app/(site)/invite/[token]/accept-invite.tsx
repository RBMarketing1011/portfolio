'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
			<p className='flex items-center gap-2 text-sm text-slate-500'>
				<Loader2 className='size-4 animate-spin' /> Checking that invitation…
			</p>
		)

	if (state.kind === 'error')
		return (
			<div className='rounded-xl border border-white/10 bg-white/3 p-8 text-center'>
				<h1 className='font-display text-xl font-semibold text-white'>
					This invitation cannot be used
				</h1>
				<p className='mt-2 text-sm leading-6 text-slate-400'>{state.message}</p>
				<Button asChild variant='outline' className='mt-6 border-white/15'>
					<Link href='/'>Back to the site</Link>
				</Button>
			</div>
		)

	return (
		<div className='rounded-xl border border-white/10 bg-white/3 p-8 text-center'>
			<MailCheck className='mx-auto size-8 text-brand' />
			<h1 className='mt-4 font-display text-xl font-semibold text-white'>
				Join {state.accountName}
			</h1>
			<p className='mt-2 text-sm leading-6 text-slate-400'>
				This invitation was sent to{' '}
				<span className='text-white'>{state.email}</span>.
			</p>

			{signedIn ? (
				<Button
					onClick={accept}
					disabled={busy}
					className='mt-6 bg-brand font-bold text-ink hover:bg-brand-strong'>
					{busy && <Loader2 className='animate-spin' />} Accept invitation
				</Button>
			) : (
				<div className='mt-6 space-y-3'>
					<Button
						asChild
						className='w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href={`/sign-in?next=/invite/${token}`}>
							Sign in to accept
						</Link>
					</Button>
					<Button asChild variant='outline' className='w-full border-white/15'>
						<Link href={`/sign-up?next=/invite/${token}`}>
							Create an account
						</Link>
					</Button>
				</div>
			)}
		</div>
	)
}
