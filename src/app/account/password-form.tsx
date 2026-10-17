'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn, signOut } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'

export function PasswordForm() {
	const router = useRouter()
	const [current, setCurrent] = useState('')
	const [next, setNext] = useState('')
	const [busy, setBusy] = useState(false)
	const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setNote(null)
		try {
			const response = await fetch('/api/account/password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ current, next }),
			}).catch(() => null)
			const body = await response?.json().catch(() => ({}))
			if (!response?.ok) {
				setNote({
					ok: false,
					text: body?.error ?? 'That did not work. Try again in a moment.',
				})
				return
			}

			// The change signs every session out, this one included; signing in
			// again with the new password keeps this browser going.
			const again =
				typeof body?.email === 'string'
					? await signIn('credentials', {
							email: body.email,
							password: next,
							redirect: false,
						}).catch(() => null)
					: null
			if (!again || again.error) {
				router.push(
					`/sign-in?notice=reset${
						typeof body?.email === 'string'
							? `&email=${encodeURIComponent(body.email)}`
							: ''
					}`,
				)
				return
			}

			setNote({
				ok: true,
				text: body?.notified
					? 'Password updated. A confirmation is on its way to your inbox.'
					: 'Password updated.',
			})
			setCurrent('')
			setNext('')
			router.refresh()
		} finally {
			setBusy(false)
		}
	}

	return (
		<form onSubmit={submit} className='space-y-5'>
			<div className='space-y-2'>
				<div className='flex items-center justify-between gap-3'>
					<Label htmlFor='current'>Current password</Label>
					<Button
						asChild
						variant='link'
						className='h-auto p-0 text-xs text-muted-foreground'>
						<Link href='/forgot-password'>Forgot it?</Link>
					</Button>
				</div>
				<PasswordInput
					id='current'
					autoComplete='current-password'
					value={current}
					onChange={(event) => setCurrent(event.target.value)}
				/>
			</div>
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
				<p className='text-xs text-muted-foreground'>
					At least 10 characters. Changing it signs out every other device.
				</p>
			</div>
			{note && (
				<FormAlert tone={note.ok ? 'success' : 'error'}>{note.text}</FormAlert>
			)}
			<div className='flex items-center gap-3'>
				<Button type='submit' disabled={busy}>
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
