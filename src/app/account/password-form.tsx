'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PasswordForm() {
	const [current, setCurrent] = useState('')
	const [next, setNext] = useState('')
	const [busy, setBusy] = useState(false)
	const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setNote(null)
		const response = await fetch('/api/account/password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ current, next }),
		})
		const body = await response.json().catch(() => ({}))
		setBusy(false)
		setNote({
			ok: response.ok,
			text: response.ok
				? 'Password updated.'
				: (body.error ?? 'That did not work.'),
		})
		if (response.ok) {
			setCurrent('')
			setNext('')
		}
	}

	return (
		<form onSubmit={submit} className='mt-8 max-w-sm space-y-5'>
			<div className='space-y-2'>
				<Label htmlFor='current'>Current password</Label>
				<Input
					id='current'
					type='password'
					autoComplete='current-password'
					value={current}
					onChange={(event) => setCurrent(event.target.value)}
					placeholder='Leave blank if you have never set one'
				/>
			</div>
			<div className='space-y-2'>
				<Label htmlFor='next'>New password</Label>
				<Input
					id='next'
					type='password'
					autoComplete='new-password'
					required
					minLength={10}
					value={next}
					onChange={(event) => setNext(event.target.value)}
				/>
			</div>
			{note && (
				<p
					className={
						note.ok ? 'text-sm text-brand' : 'text-sm text-destructive'
					}>
					{note.text}
				</p>
			)}
			<div className='flex items-center gap-3'>
				<Button
					type='submit'
					disabled={busy}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					{busy && <Loader2 className='animate-spin' />}
					Update password
				</Button>
				<Button
					type='button'
					variant='outline'
					onClick={() => signOut({ callbackUrl: '/' })}
					className='border-white/15 bg-transparent text-white hover:bg-white/5'>
					Sign out
				</Button>
			</div>
		</form>
	)
}
