'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Turnstile } from '@/components/turnstile'

export function SignInForm({ siteKey }: { siteKey?: string }) {
	const router = useRouter()
	const params = useSearchParams()
	const next = params.get('next') ?? '/builder/sites'

	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [token, setToken] = useState<string | null>(null)
	const [busy, setBusy] = useState<'password' | 'link' | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [sent, setSent] = useState(false)

	const withPassword = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy('password')
		setError(null)
		const result = await signIn('credentials', {
			email,
			password,
			redirect: false,
		})
		setBusy(null)
		if (result?.error) {
			setError('That email and password combination did not work.')
			return
		}
		router.push(next)
		router.refresh()
	}

	const withLink = async () => {
		if (!email) {
			setError('Enter your email first.')
			return
		}
		setBusy('link')
		setError(null)
		const result = await signIn('nodemailer', {
			email,
			redirect: false,
			callbackUrl: next,
		})
		setBusy(null)
		if (result?.error) {
			setError('We could not send that link. Try again shortly.')
			return
		}
		setSent(true)
	}

	if (sent)
		return (
			<div className='rounded-xl border border-white/10 bg-white/3 p-8 text-center'>
				<Mail className='mx-auto size-8 text-brand' />
				<h2 className='mt-4 font-display text-xl font-semibold text-white'>
					Check your email
				</h2>
				<p className='mt-2 text-sm leading-6 text-slate-400'>
					We sent a sign-in link to {email}. It works once and expires in
					fifteen minutes.
				</p>
			</div>
		)

	return (
		<form onSubmit={withPassword} className='space-y-5'>
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
				<Input
					id='password'
					type='password'
					autoComplete='current-password'
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
			</div>

			{siteKey && (
				<Turnstile siteKey={siteKey} action='signin' onToken={setToken} />
			)}

			{error && <p className='text-sm text-destructive'>{error}</p>}

			<Button
				type='submit'
				disabled={busy !== null}
				className='w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
				{busy === 'password' && <Loader2 className='animate-spin' />}
				Sign in
			</Button>

			<div className='flex items-center gap-3 text-xs text-slate-600'>
				<span className='h-px flex-1 bg-white/10' />
				or
				<span className='h-px flex-1 bg-white/10' />
			</div>

			<Button
				type='button'
				variant='outline'
				disabled={busy !== null}
				onClick={withLink}
				className='w-full border-white/15 bg-transparent text-white hover:bg-white/5'>
				{busy === 'link' ? <Loader2 className='animate-spin' /> : <Mail />}
				Email me a sign-in link
			</Button>

			<p className='text-center text-sm text-slate-500'>
				No account?{' '}
				<Link href='/sign-up' className='text-brand hover:text-brand-strong'>
					Create one
				</Link>
			</p>
			{/* Token is collected for parity with the other forms; Auth.js verifies
			    the credentials themselves server-side. */}
			<input type='hidden' name='token' value={token ?? ''} />
		</form>
	)
}
