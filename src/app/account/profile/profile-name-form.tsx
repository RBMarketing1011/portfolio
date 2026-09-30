'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ProfileNameForm({ name }: { name: string }) {
	const router = useRouter()
	const [value, setValue] = useState(name)
	const [busy, setBusy] = useState(false)
	const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setNote(null)
		const response = await fetch('/api/account/profile', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: value }),
		})
		const body = await response.json().catch(() => ({}))
		setBusy(false)
		setNote({
			ok: response.ok,
			text: response.ok
				? 'Saved. It shows on the next sign-in.'
				: (body.error ?? 'That did not work.'),
		})
		router.refresh()
	}

	return (
		<form onSubmit={submit} className='mt-4 space-y-3'>
			<div className='space-y-2'>
				<Label htmlFor='profile-name'>Name</Label>
				<Input
					id='profile-name'
					value={value}
					placeholder='How your name appears to your team'
					onChange={(event) => setValue(event.target.value)}
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
			<Button
				type='submit'
				disabled={busy}
				className='bg-brand font-bold text-ink hover:bg-brand-strong'>
				{busy && <Loader2 className='animate-spin' />} Save
			</Button>
		</form>
	)
}
