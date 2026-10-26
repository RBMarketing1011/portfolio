'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Loader2, Mail } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PasswordInput } from '@/components/ui/password-input'
import { safeNext } from '@/lib/auth/safe-next'
import { credentialsErrorMessage } from '@/lib/auth/sign-in-errors'

/**
 * What Auth.js sends people back here with after an emailed link goes wrong,
 * and what the welcome and reset pages pass along when their automatic sign-in
 * did not work. Anything else is a server-side fault, worded as one.
 */
const ERRORS: Record<string, string> = {
	Verification:
		'That sign-in link has expired or was already used. Request a fresh one below.',
	AccessDenied:
		'That link is not valid for a login here. If you were invited, use the link in your invitation email.',
}

/** Why the previous page sent them here, and what to say about it. */
const NOTICES: Record<string, string> = {
	created: 'Your login is ready. Sign in with the password you just chose.',
	reset: 'Your password is saved. Sign in with it below.',
	'signed-out': 'You are signed out.',
}

export function SignInForm() {
	const router = useRouter()
	const params = useSearchParams()
	const next = safeNext(params.get('next'), '/sign-in/landing')
	const notice = NOTICES[params.get('notice') ?? ''] ?? null
	const authError = params.get('error')

	const emailField = useRef<HTMLInputElement>(null)
	const [email, setEmail] = useState(params.get('email') ?? '')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState<'password' | 'link' | null>(null)
	const [error, setError] = useState<string | null>(
		authError
			? (ERRORS[authError] ??
				credentialsErrorMessage({ error: authError, code: params.get('code') }))
			: null,
	)
	const [sent, setSent] = useState(false)

	const withPassword = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy('password')
		setError(null)
		try {
			const result = await signIn('credentials', {
				email,
				password,
				redirect: false,
			})
			if (!result || result.error) {
				setError(credentialsErrorMessage(result ?? {}))
				return
			}
			router.push(next)
			router.refresh()
		} catch {
			setError(credentialsErrorMessage({}))
		} finally {
			setBusy(null)
		}
	}

	const withLink = async () => {
		// Not a submit, so the field's own validation has to be asked for.
		if (!email || emailField.current?.reportValidity() === false) {
			setError('Enter your email first.')
			return
		}
		setBusy('link')
		setError(null)
		try {
			const result = await signIn('nodemailer', {
				email,
				redirect: false,
				callbackUrl: next,
			})
			// The server answers the same way whether or not the address has a
			// login (the email is simply not sent when it does not), so the only
			// errors left are real ones. AccessDenied here means the address asked
			// for too many links; the neutral card still fits.
			if (result?.error && result.error !== 'AccessDenied') {
				setError('We could not send that link right now. Try again shortly.')
				return
			}
			setSent(true)
		} catch {
			setError('We could not send that link right now. Try again shortly.')
		} finally {
			setBusy(null)
		}
	}

	if (sent)
		return (
			<Card className='text-center'>
				<CardHeader>
					<Mail className='mx-auto size-8 text-primary' />
					<CardTitle>Check your email</CardTitle>
					<CardDescription>
						If <span className='text-foreground'>{email}</span> has a login, a
						sign-in link is on its way. It works once and expires in fifteen
						minutes.
					</CardDescription>
				</CardHeader>
				<CardContent className='text-sm text-muted-foreground'>
					Nothing there? Check your spam folder, or{' '}
					<Button
						type='button'
						variant='link'
						className='h-auto p-0 text-sm'
						onClick={() => setSent(false)}>
						send another link
					</Button>
					.
				</CardContent>
			</Card>
		)

	return (
		<form onSubmit={withPassword} className='space-y-5'>
			{notice && <FormAlert tone='success'>{notice}</FormAlert>}

			<div className='space-y-2'>
				<Label htmlFor='email'>Email</Label>
				<Input
					ref={emailField}
					id='email'
					type='email'
					autoComplete='email'
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
			</div>

			<div className='space-y-2'>
				<div className='flex items-center justify-between gap-3'>
					<Label htmlFor='password'>Password</Label>
					<Button
						asChild
						variant='link'
						className='h-auto p-0 text-xs text-muted-foreground'>
						<Link
							href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}>
							Forgot password?
						</Link>
					</Button>
				</div>
				<PasswordInput
					id='password'
					autoComplete='current-password'
					required
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
			</div>

			{error && <FormAlert>{error}</FormAlert>}

			<Button type='submit' disabled={busy !== null} className='w-full'>
				{busy === 'password' && <Loader2 className='animate-spin' />}
				Sign in
			</Button>

			<div className='flex items-center gap-3 text-xs text-muted-foreground'>
				<Separator className='flex-1' />
				or
				<Separator className='flex-1' />
			</div>

			<Button
				type='button'
				variant='outline'
				disabled={busy !== null}
				onClick={withLink}
				className='w-full'>
				{busy === 'link' ? <Loader2 className='animate-spin' /> : <Mail />}
				Email me a sign-in link
			</Button>

			<p className='text-center text-sm text-muted-foreground'>
				Access is by invitation. Ask your administrator for one.
			</p>
		</form>
	)
}
