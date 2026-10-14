'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

export function WelcomeForm({ token }: { token: string }) {
	const router = useRouter()
	const [state, setState] = useState<
		| { kind: 'loading' }
		| { kind: 'ready'; email: string }
		| { kind: 'error'; message: string }
	>({ kind: 'loading' })
	const [name, setName] = useState('')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let live = true
		void (async () => {
			const response = await fetch(`/api/welcome/${token}`, {
				cache: 'no-store',
			})
			if (!live) return
			const body = await response.json().catch(() => ({}))
			setState(
				response.ok
					? { kind: 'ready', email: body.invite.email }
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
						<Link href='/sign-in'>Go to sign in</Link>
					</Button>
				</CardFooter>
			</Card>
		)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setError(null)
		const response = await fetch(`/api/welcome/${token}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password, name: name || null }),
		})
		if (!response.ok) {
			setBusy(false)
			const body = await response.json().catch(() => ({}))
			setError(body.error ?? 'Your login could not be created.')
			return
		}
		const result = await signIn('credentials', {
			email: state.email,
			password,
			redirect: false,
		})
		setBusy(false)
		if (result?.error) {
			router.push('/sign-in')
			return
		}
		router.push('/account')
		router.refresh()
	}

	return (
		<>
			<h1 className='font-display text-3xl font-semibold text-white'>
				Create your login
			</h1>
			<p className='mt-3 mb-8 leading-7 text-slate-400'>
				You were invited as <span className='text-white'>{state.email}</span>.
			</p>
			<form onSubmit={submit} className='space-y-5'>
				<div className='space-y-2'>
					<Label htmlFor='name'>Your name</Label>
					<Input
						id='name'
						autoComplete='name'
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
				<Button
					type='submit'
					disabled={busy}
					className='w-full'>
					{busy && <Loader2 className='animate-spin' />} Create login
				</Button>
			</form>
		</>
	)
}
