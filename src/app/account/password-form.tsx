'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

export function PasswordForm() {
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
			body: JSON.stringify({ next }),
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
			setNext('')
		}
	}

	return (
		<form onSubmit={submit} className='space-y-5'>
			<div className='space-y-2'>
				<Label htmlFor='next'>New password</Label>
				<PasswordInput
					id='next'
					autoComplete='new-password'
					required
					minLength={10}
					value={next}
					onChange={(event) => setNext(event.target.value)}
				/>
			</div>
			{note && (
				<FormAlert tone={note.ok ? 'success' : 'error'}>{note.text}</FormAlert>
			)}
			<div className='flex items-center gap-3'>
				<Button
					type='submit'
					disabled={busy}>
					{busy && <Loader2 className='animate-spin' />}
					Update password
				</Button>
				<Button
					type='button'
					variant='outline'
					onClick={() => signOut({ callbackUrl: '/' })}>
					Sign out
				</Button>
			</div>
		</form>
	)
}
