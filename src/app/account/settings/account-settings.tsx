'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
	const [busy, setBusy] = useState<'name' | 'delete' | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState(false)
	const [confirmation, setConfirmation] = useState('')

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

	const remove = async () => {
		setBusy('delete')
		setError(null)
		const response = await fetch('/api/account/settings', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ confirm: confirmation }),
		})
		setBusy(null)
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			setError(body.error ?? 'That account could not be deleted.')
			return
		}
		router.push('/account')
		router.refresh()
	}

	return (
		<div className='max-w-xl space-y-10'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Account settings
				</h1>
				<p className='mt-2 leading-7 text-slate-400'>
					Settings for this account and everything in it. Your own name, email
					and password live on your{' '}
					<a
						href='/account/profile'
						className='text-brand hover:text-brand-strong'>
						profile
					</a>
					.
				</p>
			</div>

			{error && <p className='text-sm text-destructive'>{error}</p>}

			<section className='rounded-xl border border-white/10 bg-white/3 p-6'>
				<dl className='grid grid-cols-2 gap-4 text-sm sm:grid-cols-4'>
					<div>
						<dt className='text-xs uppercase tracking-widest text-slate-500'>
							Projects
						</dt>
						<dd className='mt-1 text-white'>{projects}</dd>
					</div>
					<div>
						<dt className='text-xs uppercase tracking-widest text-slate-500'>
							People
						</dt>
						<dd className='mt-1 text-white'>{people}</dd>
					</div>
					<div>
						<dt className='text-xs uppercase tracking-widest text-slate-500'>
							Your role
						</dt>
						<dd className='mt-1 text-white'>{roleName}</dd>
					</div>
					<div>
						<dt className='text-xs uppercase tracking-widest text-slate-500'>
							Created
						</dt>
						<dd className='mt-1 text-white'>
							{new Date(createdAt).toLocaleDateString()}
						</dd>
					</div>
				</dl>
			</section>

			<section>
				<h2 className='font-display text-lg font-semibold text-white'>Name</h2>
				<p className='mt-1 text-sm leading-6 text-slate-400'>
					What this account is called in the switcher and on invitations.
				</p>
				{canManage ? (
					<form onSubmit={rename} className='mt-4 space-y-3'>
						<div className='space-y-2'>
							<Label htmlFor='account-name'>Account name</Label>
							<Input
								id='account-name'
								value={value}
								onChange={(event) => setValue(event.target.value)}
							/>
						</div>
						<div className='flex items-center gap-3'>
							<Button
								type='submit'
								disabled={busy !== null}
								className='bg-brand font-bold text-ink hover:bg-brand-strong'>
								{busy === 'name' && <Loader2 className='animate-spin' />} Save
							</Button>
							{saved && <span className='text-sm text-slate-500'>Saved</span>}
						</div>
					</form>
				) : (
					<p className='mt-4 text-sm text-white'>{name}</p>
				)}
			</section>

			{isOwner && (
				<section className='rounded-xl border border-destructive/30 p-6'>
					<h2 className='font-display text-lg font-semibold text-white'>
						Delete this account
					</h2>
					<p className='mt-1 text-sm leading-6 text-slate-400'>
						Every project, page, image and invitation goes with it, for everyone
						on it. This cannot be undone.
					</p>
					<div className='mt-4 space-y-3'>
						<div className='space-y-2'>
							<Label htmlFor='confirm-delete'>
								Type <span className='text-white'>{name}</span> to confirm
							</Label>
							<Input
								id='confirm-delete'
								value={confirmation}
								onChange={(event) => setConfirmation(event.target.value)}
							/>
						</div>
						<Button
							variant='outline'
							onClick={remove}
							disabled={busy !== null || confirmation !== name}
							className='border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10'>
							{busy === 'delete' ? (
								<Loader2 className='animate-spin' />
							) : (
								<Trash2 />
							)}
							Delete account
						</Button>
					</div>
				</section>
			)}
		</div>
	)
}
