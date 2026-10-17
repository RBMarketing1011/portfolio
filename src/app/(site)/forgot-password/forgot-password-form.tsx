'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, MailCheck } from 'lucide-react'
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

export function ForgotPasswordForm() {
	const params = useSearchParams()
	const [email, setEmail] = useState(params.get('email') ?? '')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [sent, setSent] = useState(false)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setError(null)
		const response = await fetch('/api/auth/request-reset', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email }),
		}).catch(() => null)
		setBusy(false)
		if (!response?.ok) {
			const body = await response?.json().catch(() => ({}))
			setError(
				body?.error ?? 'We could not send that email. Try again shortly.',
			)
			return
		}
		setSent(true)
	}

	if (sent)
		return (
			<Card className='text-center'>
				<CardHeader>
					<MailCheck className='mx-auto size-8 text-primary' />
					<CardTitle>Check your email</CardTitle>
					<CardDescription>
						If <span className='text-foreground'>{email}</span> has a login, a
						reset link is on its way. It works once and expires in thirty
						minutes.
					</CardDescription>
				</CardHeader>
				<CardFooter className='justify-center'>
					<Button asChild variant='outline'>
						<Link href={`/sign-in?email=${encodeURIComponent(email)}`}>
							Back to sign in
						</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	return (
		<form onSubmit={submit} className='space-y-5'>
			<div className='space-y-2'>
				<Label htmlFor='email'>Email</Label>
				<Input
					id='email'
					type='email'
					autoComplete='email'
					required
					autoFocus
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
			</div>

			{error && <FormAlert>{error}</FormAlert>}

			<Button type='submit' disabled={busy} className='w-full'>
				{busy && <Loader2 className='animate-spin' />}
				Email me a reset link
			</Button>

			<p className='text-center text-sm text-muted-foreground'>
				Remembered it?{' '}
				<Link
					href={`/sign-in?email=${encodeURIComponent(email)}`}
					className='text-foreground underline underline-offset-4'>
					Back to sign in
				</Link>
			</p>
		</form>
	)
}
