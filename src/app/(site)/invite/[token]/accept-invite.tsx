'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, signOut } from 'next-auth/react'
import { Loader2, MailCheck, UserRoundX } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

type State =
	| { kind: 'loading' }
	| { kind: 'ready'; accountName: string; email: string; hasLogin: boolean }
	| { kind: 'error'; message: string; sentTo?: string; retryable?: boolean }

/**
 * The invitation landing page. Four people can arrive here: the invitee with
 * a login (sign in, then accept), the invitee with no login yet (create one
 * here, which also accepts), someone signed in as a different address (offer
 * to switch), and anyone holding a dead link.
 */
export function AcceptInvite({
	token,
	sessionEmail,
}: {
	token: string
	/** Lowercased email of the signed-in person, or null when signed out. */
	sessionEmail: string | null
}) {
	const router = useRouter()
	const [state, setState] = useState<State>({ kind: 'loading' })
	const [name, setName] = useState('')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let live = true
		void (async () => {
			const response = await fetch(`/api/account/invites/${token}`, {
				cache: 'no-store',
			}).catch(() => null)
			if (!live) return
			const body = await response?.json().catch(() => ({}))
			setState(
				response?.ok && body?.invite?.email
					? {
							kind: 'ready',
							accountName: body.invite.accountName,
							email: body.invite.email,
							hasLogin: Boolean(body.invite.hasLogin),
						}
					: {
							kind: 'error',
							message:
								body?.error ??
								(!response || response.status >= 500
									? 'We could not check that invitation. Try again in a moment.'
									: 'That invitation is no longer valid.'),
							// A dead link stays dead; a server hiccup is worth another go.
							retryable: !response || response.status >= 500,
						},
			)
		})()
		return () => {
			live = false
		}
	}, [token])

	const signInHref = (email: string) =>
		`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(email)}`

	const switchAccount = (email: string) =>
		signOut({ callbackUrl: signInHref(email) })

	const finish = () => {
		router.push('/account')
		router.refresh()
	}

	/** Signed in as the invitee: one click. */
	const accept = async () => {
		setBusy(true)
		setError(null)
		const response = await fetch(`/api/account/invites/${token}`, {
			method: 'POST',
		}).catch(() => null)
		setBusy(false)
		if (!response?.ok) {
			const body = await response?.json().catch(() => ({}))
			// A server hiccup keeps the button; only a refusal ends the page.
			if (!response || response.status >= 500) {
				setError(
					body?.error ??
						'Something went wrong on our side. Your invitation is still valid, so try again in a moment.',
				)
				return
			}
			setState({
				kind: 'error',
				message: body?.error ?? 'That invitation could not be accepted.',
				sentTo: body?.sentTo,
			})
			return
		}
		finish()
	}

	/** No login yet: create one and accept in the same step. */
	const createAndAccept = async (event: React.FormEvent) => {
		event.preventDefault()
		if (state.kind !== 'ready') return
		setBusy(true)
		setError(null)
		const response = await fetch(`/api/account/invites/${token}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password, name: name || null }),
		}).catch(() => null)
		if (!response?.ok) {
			setBusy(false)
			const body = await response?.json().catch(() => ({}))
			if (response?.status === 409 && body?.hasLogin) {
				setState({ ...state, hasLogin: true })
				setError(body.error)
				return
			}
			setError(
				body?.error ??
					'Something went wrong on our side. Your invitation is still valid, so try again in a moment.',
			)
			return
		}

		// The login exists and the invitation is accepted; signing in is a
		// courtesy, and the sign-in page explains itself if it does not work.
		const result = await signIn('credentials', {
			email: state.email,
			password,
			redirect: false,
		}).catch(() => null)
		setBusy(false)
		if (!result || result.error) {
			router.push(
				`/sign-in?notice=created&email=${encodeURIComponent(state.email)}${
					result?.error ? `&error=${encodeURIComponent(result.error)}` : ''
				}${result?.code ? `&code=${encodeURIComponent(result.code)}` : ''}`,
			)
			return
		}
		finish()
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
					<CardTitle>
						{state.retryable
							? 'We could not check that invitation'
							: 'This invitation cannot be used'}
					</CardTitle>
					<CardDescription>{state.message}</CardDescription>
				</CardHeader>
				<CardFooter className='justify-center gap-3'>
					{state.retryable && (
						<Button onClick={() => window.location.reload()}>Try again</Button>
					)}
					{state.sentTo ? (
						<Button onClick={() => switchAccount(state.sentTo as string)}>
							Sign out and switch
						</Button>
					) : null}
					<Button asChild variant='outline'>
						<Link href='/'>Back to the site</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	// Signed in as somebody else: accepting would hand the grant to the wrong person.
	if (sessionEmail && sessionEmail !== state.email)
		return (
			<Card className='text-center'>
				<CardHeader>
					<UserRoundX className='mx-auto size-8 text-primary' />
					<CardTitle>This invitation is for someone else</CardTitle>
					<CardDescription>
						You are signed in as{' '}
						<span className='text-foreground'>{sessionEmail}</span>, but this
						invitation to {state.accountName} was sent to{' '}
						<span className='text-foreground'>{state.email}</span>.
					</CardDescription>
				</CardHeader>
				<CardFooter className='justify-center gap-3'>
					<Button onClick={() => switchAccount(state.email)}>
						Sign out and switch
					</Button>
					<Button asChild variant='outline'>
						<Link href='/account'>Stay signed in</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	if (sessionEmail)
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
				{error && (
					<CardContent>
						<FormAlert>{error}</FormAlert>
					</CardContent>
				)}
				<CardFooter className='justify-center'>
					<Button onClick={accept} disabled={busy}>
						{busy && <Loader2 className='animate-spin' />} Accept invitation
					</Button>
				</CardFooter>
			</Card>
		)

	if (state.hasLogin)
		return (
			<Card className='text-center'>
				<CardHeader>
					<MailCheck className='mx-auto size-8 text-primary' />
					<CardTitle>Join {state.accountName}</CardTitle>
					<CardDescription>
						This invitation was sent to{' '}
						<span className='text-foreground'>{state.email}</span>. Sign in and
						you will be brought straight back here to accept it.
					</CardDescription>
				</CardHeader>
				{error && (
					<CardContent>
						<FormAlert>{error}</FormAlert>
					</CardContent>
				)}
				<CardFooter className='justify-center'>
					<Button asChild className='w-full'>
						<Link href={signInHref(state.email)}>Sign in to accept</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	return (
		<Card>
			<CardHeader className='text-center'>
				<MailCheck className='mx-auto size-8 text-primary' />
				<CardTitle>Join {state.accountName}</CardTitle>
				<CardDescription>
					Create your login for{' '}
					<span className='text-foreground'>{state.email}</span> and you are in.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={createAndAccept} className='space-y-5'>
					<div className='space-y-2'>
						<Label htmlFor='name'>Your name</Label>
						<Input
							id='name'
							autoComplete='name'
							maxLength={120}
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='password'>Password</Label>
						<PasswordInput
							id='password'
							autoComplete='new-password'
							minLength={10}
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
						<p className='text-xs text-muted-foreground'>At least 10 characters.</p>
					</div>
					{error && <FormAlert>{error}</FormAlert>}
					<Button type='submit' disabled={busy} className='w-full'>
						{busy && <Loader2 className='animate-spin' />} Create login and join
					</Button>
				</form>
			</CardContent>
		</Card>
	)
}
