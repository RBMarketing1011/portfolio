'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
					<Link href='/sign-in'>Go to sign in</Link>
				</Button>
			</div>
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
					<p className='text-xs text-slate-500'>At least 10 characters.</p>
				</div>
				{error && <p className='text-sm text-destructive'>{error}</p>}
				<Button
					type='submit'
					disabled={busy}
					className='w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
					{busy && <Loader2 className='animate-spin' />} Create login
				</Button>
			</form>
		</>
	)
}
