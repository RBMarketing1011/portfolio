'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

type State =
	| { kind: 'loading' }
	| { kind: 'ready'; email: string }
	| { kind: 'error'; message: string; retryable: boolean }

export function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter()
	const [state, setState] = useState<State>({ kind: 'loading' })
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let live = true
		void (async () => {
			const response = await fetch(`/api/auth/reset/${token}`, {
				cache: 'no-store',
			}).catch(() => null)
			if (!live) return
			const body = await response?.json().catch(() => ({}))
			setState(
				response?.ok && body?.email
					? { kind: 'ready', email: body.email }
					: {
							kind: 'error',
							message:
								body?.error ??
								(!response || response.status >= 500
									? 'We could not check that link. Try again in a moment.'
									: 'That reset link has expired or already been used.'),
							// A dead link stays dead; a server hiccup is worth another go.
							retryable: !response || response.status >= 500,
						},
			)
		})()
		return () => {
			live = false
		}
	}, [token])

	if (state.kind === 'loading')
		return (
			<p className='flex items-center gap-2 text-sm text-muted-foreground'>
				<Loader2 className='size-4 animate-spin' /> Checking that link…
			</p>
		)

	if (state.kind === 'error')
		return (
			<Card className='text-center'>
				<CardHeader>
					<CardTitle>
						{state.retryable
							? 'We could not check that link'
							: 'This link cannot be used'}
					</CardTitle>
					<CardDescription>{state.message}</CardDescription>
				</CardHeader>
				<CardFooter className='justify-center gap-3'>
					{state.retryable ? (
						<Button onClick={() => window.location.reload()}>Try again</Button>
					) : (
						<Button asChild>
							<Link href='/forgot-password'>Request a new link</Link>
						</Button>
					)}
					<Button asChild variant='outline'>
						<Link href='/sign-in'>Sign in</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	const { email } = state

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setError(null)
		try {
			const response = await fetch(`/api/auth/reset/${token}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password }),
			}).catch(() => null)
			if (!response?.ok) {
				const body = await response?.json().catch(() => ({}))
				setError(
					body?.error ??
						'Something went wrong on our side. Your link is still valid, so try again in a moment.',
				)
				return
			}

			// The password is saved whatever happens next; signing in is a
			// courtesy, and the sign-in page explains itself if it does not work.
			const result = await signIn('credentials', {
				email,
				password,
				redirect: false,
			}).catch(() => null)
			if (!result || result.error) {
				router.push(
					`/sign-in?notice=reset&email=${encodeURIComponent(email)}${
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
				Choose a new password
			</h1>
			<p className='mt-3 mb-8 leading-7 text-slate-400'>
				For <span className='text-white'>{email}</span>. You will be signed in
				as soon as it is saved.
			</p>
			<form onSubmit={submit} className='space-y-5'>
				<div className='space-y-2'>
					<Label htmlFor='password'>New password</Label>
					<PasswordInput
						id='password'
						autoComplete='new-password'
						minLength={10}
						required
						autoFocus
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
					<p className='text-xs text-muted-foreground'>At least 10 characters.</p>
				</div>
				{error && <FormAlert>{error}</FormAlert>}
				<Button type='submit' disabled={busy} className='w-full'>
					{busy && <Loader2 className='animate-spin' />} Save password and sign in
				</Button>
			</form>
		</>
	)
}
