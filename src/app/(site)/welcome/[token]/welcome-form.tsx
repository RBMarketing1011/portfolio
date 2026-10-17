'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, signOut } from 'next-auth/react'
import { Loader2, UserCheck, UserRoundX } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import {
	Card,
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
	| { kind: 'ready'; email: string; accountName: string | null }
	| { kind: 'has-login'; email: string }
	| { kind: 'error'; message: string; retryable: boolean }

export function WelcomeForm({
	token,
	sessionEmail,
}: {
	token: string
	/** Lowercased email of whoever is signed in, or null when nobody is. */
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
			const response = await fetch(`/api/welcome/${token}`, {
				cache: 'no-store',
			}).catch(() => null)
			if (!live) return
			const body = await response?.json().catch(() => ({}))
			if (response?.ok && body?.invite?.email)
				setState({
					kind: 'ready',
					email: body.invite.email,
					accountName: body.invite.accountName ?? null,
				})
			else if (response?.status === 409 && body?.email)
				setState({ kind: 'has-login', email: body.email })
			else
				setState({
					kind: 'error',
					message:
						body?.error ??
						'We could not check that invitation. Try again in a moment.',
					// A dead link stays dead; a server hiccup is worth another go.
					retryable: !response || response.status >= 500,
				})
		})()
		return () => {
			live = false
		}
	}, [token])

	if (state.kind === 'loading')
		return (
			<p className='flex items-center gap-2 text-sm text-muted-foreground'>
				<Loader2 className='size-4 animate-spin' /> Checking that invitation…
			</p>
		)

	if (state.kind === 'has-login')
		return (
			<Card className='text-center'>
				<CardHeader>
					<UserCheck className='mx-auto size-8 text-primary' />
					<CardTitle>You already have a login</CardTitle>
					<CardDescription>
						<span className='text-foreground'>{state.email}</span> already has
						a ReynoldsBuilt login. Sign in with your password, or reset it if
						you have forgotten it.
					</CardDescription>
				</CardHeader>
				<CardFooter className='justify-center gap-3'>
					<Button asChild>
						<Link href={`/sign-in?email=${encodeURIComponent(state.email)}`}>
							Sign in
						</Link>
					</Button>
					<Button asChild variant='outline'>
						<Link
							href={`/forgot-password?email=${encodeURIComponent(state.email)}`}>
							Reset password
						</Link>
					</Button>
				</CardFooter>
			</Card>
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
					<Button asChild variant='outline'>
						<Link href='/sign-in'>Go to sign in</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	const { email } = state

	// Somebody else is signed in on this browser (the admin testing the link,
	// a shared machine). Finishing the form would sign them in as the invitee.
	if (sessionEmail && sessionEmail !== email)
		return (
			<Card className='text-center'>
				<CardHeader>
					<UserRoundX className='mx-auto size-8 text-primary' />
					<CardTitle>You are signed in as someone else</CardTitle>
					<CardDescription>
						This browser is signed in as{' '}
						<span className='text-foreground'>{sessionEmail}</span>, but this
						invitation is for <span className='text-foreground'>{email}</span>.
						Sign out to create their login.
					</CardDescription>
				</CardHeader>
				<CardFooter className='justify-center gap-3'>
					<Button
						onClick={() => signOut({ callbackUrl: `/welcome/${token}` })}>
						Sign out and continue
					</Button>
					<Button asChild variant='outline'>
						<Link href='/account'>Stay signed in</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setError(null)
		try {
			const response = await fetch(`/api/welcome/${token}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password, name: name || null }),
			}).catch(() => null)
			if (!response?.ok) {
				const body = await response?.json().catch(() => ({}))
				if (response?.status === 409 && body?.email) {
					setState({ kind: 'has-login', email: body.email })
					return
				}
				setError(
					body?.error ??
						'Something went wrong on our side. Your invitation is still valid, so try again in a moment.',
				)
				return
			}

			// The login exists from here on. Signing in is a courtesy: if it does
			// not work, the sign-in page explains why and takes the password they
			// chose.
			const result = await signIn('credentials', {
				email,
				password,
				redirect: false,
			}).catch(() => null)
			if (!result || result.error) {
				router.push(
					`/sign-in?notice=created&email=${encodeURIComponent(email)}${
						result?.error ? `&error=${encodeURIComponent(result.error)}` : ''
					}${result?.code ? `&code=${encodeURIComponent(result.code)}` : ''}`,
				)
				return
			}
			router.push('/account')
			router.refresh()
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			<h1 className='font-display text-3xl font-semibold text-white'>
				Create your login
			</h1>
			<p className='mt-3 mb-8 leading-7 text-slate-400'>
				You were invited as <span className='text-white'>{email}</span>
				{state.accountName ? (
					<>
						{' '}
						to work on <span className='text-white'>{state.accountName}</span>
					</>
				) : null}
				.
			</p>
			<form onSubmit={submit} className='space-y-5'>
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
					{busy && <Loader2 className='animate-spin' />} Create login
				</Button>
			</form>
		</>
	)
}
