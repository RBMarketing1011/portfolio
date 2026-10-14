'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Loader2, Mail } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PasswordInput } from '@/components/ui/password-input'

const MESSAGES: Record<string, string> = {
	too_many_attempts:
		'Too many sign-in attempts. Wait fifteen minutes, or use the email link below.',
}

export function SignInForm() {
	const router = useRouter()
	const params = useSearchParams()
	const next = params.get('next') ?? '/account'

	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
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
			setError(
				MESSAGES[result.code ?? ''] ??
					'That email and password combination did not work.',
			)
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
			<Card className='text-center'>
				<CardHeader>
					<Mail className='mx-auto size-8 text-primary' />
					<CardTitle>Check your email</CardTitle>
					<CardDescription>
						We sent a sign-in link to {email}. It works once and expires in fifteen
						minutes.
					</CardDescription>
				</CardHeader>
			</Card>
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
				<PasswordInput
					id='password'
					autoComplete='current-password'
					value={password}
					onChange={(event) => setPassword(event.target.value)}
				/>
			</div>

			{error && <FormAlert>{error}</FormAlert>}

			<Button
				type='submit'
				disabled={busy !== null}
				className='w-full'>
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
