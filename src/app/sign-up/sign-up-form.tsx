'use client'

import { useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Turnstile, type TurnstileHandle } from '@/components/turnstile'

export function SignUpForm({ siteKey }: { siteKey?: string }) {
	const router = useRouter()
	const next = useSearchParams().get('next') ?? '/account'
	const widget = useRef<TurnstileHandle>(null)

	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirm, setConfirm] = useState('')
	const [token, setToken] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		if (password !== confirm) {
			setError('Those passwords do not match.')
			return
		}
		setBusy(true)
		setError(null)

		// The widget is invisible, so it may still be solving when they submit.
		const verification = token ?? (await widget.current?.getToken()) ?? null

		const response = await fetch('/api/auth/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password, token: verification }),
		})

		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			setError(body.error ?? 'That account could not be created.')
			widget.current?.reset()
			setBusy(false)
			return
		}

		// Straight in rather than bouncing them to a second form. If it does not
		// take, say so instead of pushing them at a page that will reject them.
		const signedIn = await signIn('credentials', {
			email,
			password,
			redirect: false,
		})
		setBusy(false)
		if (signedIn?.error) {
			router.push(`/sign-in?next=${encodeURIComponent(next)}`)
			return
		}
		router.push(next)
		router.refresh()
	}

	return (
		<form onSubmit={submit} className='space-y-5'>
			<div className='space-y-2'>
				<Label htmlFor='email'>Email</Label>
				<Input
					id='email'
					type='email'
					autoComplete='email'
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
			</div>

			<div className='space-y-2'>
				<Label htmlFor='password'>Password</Label>
				<PasswordInput
					id='password'
					autoComplete='new-password'
					required
					minLength={10}
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
				<p className='text-xs text-slate-500'>At least 10 characters.</p>
			</div>

			<div className='space-y-2'>
				<Label htmlFor='confirm'>Confirm password</Label>
				<PasswordInput
					id='confirm'
					autoComplete='new-password'
					required
					value={confirm}
					onChange={(event) => setConfirm(event.target.value)}
				/>
			</div>

			{siteKey && (
				<Turnstile
					ref={widget}
					siteKey={siteKey}
					action='register'
					onToken={setToken}
				/>
			)}

			{error && <p className='text-sm text-destructive'>{error}</p>}

			<Button
				type='submit'
				disabled={busy}
				className='w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
				{busy && <Loader2 className='animate-spin' />}
				Create account
			</Button>

			<p className='text-center text-sm text-slate-500'>
				Already have one?{' '}
				<Link href='/sign-in' className='text-brand hover:text-brand-strong'>
					Sign in
				</Link>
			</p>
		</form>
	)
}
