'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import Link from 'next/link'
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

export function AccountSettings({
	name,
	canManage,
	isOwner,
	projects,
	people,
	roleName,
	createdAt,
}: {
	name: string
	canManage: boolean
	isOwner: boolean
	projects: number
	people: number
	roleName: string
	createdAt: string
}) {
	const router = useRouter()
	const [value, setValue] = useState(name)
	const [busy, setBusy] = useState<'name' | null>(null)
	const [deleting, setDeleting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState(false)

	const rename = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy('name')
		setError(null)
		setSaved(false)
		const response = await fetch('/api/account/settings', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: value }),
		})
		setBusy(null)
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			setError(body.error ?? 'That name could not be saved.')
			return
		}
		setSaved(true)
		router.refresh()
	}

	/** Returns an error to show in the dialog, or null once the account is gone. */
	const remove = async (): Promise<string | null> => {
		const response = await fetch('/api/account/settings', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ confirm: name }),
		})
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			return body.error ?? 'That account could not be deleted.'
		}
		setDeleting(false)
		router.push('/account')
		router.refresh()
		return null
	}

	return (
		<div className='max-w-xl space-y-6'>
			<div>
				<h1 className='font-display text-3xl font-semibold'>Account settings</h1>
				<p className='mt-2 text-muted-foreground'>
					Settings for this account and everything in it. Your own name, email and
					password live on your{' '}
					<Link href='/account/profile' className='text-primary underline-offset-4 hover:underline'>
						profile
					</Link>
					.
				</p>
			</div>

			{error && <FormAlert>{error}</FormAlert>}

			<Card>
				<CardContent>
					<dl className='grid grid-cols-2 gap-4 text-sm sm:grid-cols-4'>
					<div>
						<dt className='text-xs uppercase tracking-widest text-muted-foreground'>Projects</dt>
						<dd className='mt-1 font-medium'>{projects}</dd>
					</div>
					<div>
						<dt className='text-xs uppercase tracking-widest text-muted-foreground'>People</dt>
						<dd className='mt-1 font-medium'>{people}</dd>
					</div>
					<div>
						<dt className='text-xs uppercase tracking-widest text-muted-foreground'>Your role</dt>
						<dd className='mt-1 font-medium'>{roleName}</dd>
					</div>
					<div>
						<dt className='text-xs uppercase tracking-widest text-muted-foreground'>Created</dt>
						<dd className='mt-1 font-medium'>{new Date(createdAt).toLocaleDateString()}</dd>
					</div>
					</dl>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Name</CardTitle>
					<CardDescription>
						What this account is called in the switcher and on invitations.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{canManage ? (
						<form onSubmit={rename} className='space-y-3'>
							<div className='space-y-2'>
								<Label htmlFor='account-name'>Account name</Label>
								<Input
									id='account-name'
									value={value}
									onChange={(event) => setValue(event.target.value)}
								/>
							</div>
							<Button type='submit' disabled={busy !== null}>
								{busy === 'name' && <Loader2 className='animate-spin' />} Save
							</Button>
							{saved && <FormAlert tone='success'>Saved.</FormAlert>}
						</form>
					) : (
						<p className='text-sm'>{name}</p>
					)}
				</CardContent>
			</Card>

			{isOwner && (
				<Card className='border-destructive/40'>
					<CardHeader>
						<CardTitle>Delete this account</CardTitle>
						<CardDescription>
							Every project, page, image and invitation goes with it, for everyone on
							it. This cannot be undone.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button variant='destructive' onClick={() => setDeleting(true)}>
							<Trash2 /> Delete account
						</Button>
					</CardContent>
					<ConfirmDeleteDialog
						open={deleting}
						onOpenChange={setDeleting}
						title='Delete this account?'
						description='Every project, page, image and invitation goes with it, for everyone on it. This cannot be undone.'
						confirmText={name}
						actionLabel='Delete account'
						onConfirm={remove}
					/>
				</Card>
			)}
		</div>
	)
}
