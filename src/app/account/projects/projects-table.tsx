'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SITE_KEY } from '@/lib/builder/site-ids'
import { ClaimLocalSite } from './claim-local-site'

export type ProjectRow = {
	id: string
	name: string
	address: string
	status: 'draft' | 'live'
	pages: number
	updatedAt: string
}

export function ProjectsTable({
	initial,
	canCreate,
	canDelete = false,
}: {
	initial: ProjectRow[]
	canCreate: boolean
	canDelete?: boolean
}) {
	const router = useRouter()
	const [rows, setRows] = useState(initial)
	const [creating, setCreating] = useState(false)
	const [name, setName] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [deleting, setDeleting] = useState<ProjectRow | null>(null)

	useEffect(() => setRows(initial), [initial])

	const openCreate = () => {
		setName('')
		setError(null)
		setCreating(true)
	}

	// Nothing is built until this is submitted, so cancelling costs nothing.
	const create = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setError(null)
		const response = await fetch('/api/sites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: name.trim(),
				site: { version: 1, pages: [] },
			}),
		})
		if (!response.ok) {
			setBusy(false)
			const body = await response.json().catch(() => ({}))
			setError(body.error ?? 'Could not create that project.')
			return
		}
		const { site } = await response.json()
		router.push(`/account/projects/${site.id}`)
	}

	/** Returns an error to show in the dialog, or null once the project is gone. */
	const remove = async (): Promise<string | null> => {
		if (!deleting) return null
		const response = await fetch(`/api/sites/${deleting.id}`, {
			method: 'DELETE',
		})
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			return body.error ?? 'Could not delete that project.'
		}
		setRows((current) => current.filter((row) => row.id !== deleting.id))
		setDeleting(null)
		router.refresh()
		return null
	}

	return (
		<div className='space-y-6'>
			<div className='flex flex-wrap items-end justify-between gap-4'>
				<div>
					<h1 className='font-display text-3xl font-semibold text-white'>
						Projects
					</h1>
					<p className='mt-2 leading-7 text-slate-400'>
						Every site on this account.
					</p>
				</div>
				{canCreate && (
					<Button
						onClick={openCreate}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Plus /> New project
					</Button>
				)}
			</div>

			{canCreate && (
				<ClaimLocalSite
					storageKey={SITE_KEY}
					onImported={() => router.refresh()}
				/>
			)}

			{rows.length === 0 ? (
				<div className='rounded-xl border border-dashed border-white/15 py-16 text-center'>
					<p className='font-medium text-white'>No projects yet</p>
					<p className='mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500'>
						A project holds one website: its pages, images, and settings.
					</p>
				</div>
			) : (
				<div className='-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0'>
					<table className='w-full min-w-[40rem] border-collapse text-sm'>
						<thead>
							<tr className='border-b border-white/10 text-left text-xs font-semibold uppercase tracking-widest text-slate-500'>
								<th className='py-3 pr-4 font-semibold'>Project</th>
								<th className='py-3 pr-4 font-semibold'>Status</th>
								<th className='py-3 pr-4 font-semibold'>Pages</th>
								<th className='py-3 pr-4 font-semibold'>Last edited</th>
								<th className='py-3 font-semibold'>
									<span className='sr-only'>Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr
									key={row.id}
									className='border-b border-white/5 transition-colors hover:bg-white/3'>
									<td className='py-3 pr-4'>
										<Link
											href={`/account/projects/${row.id}`}
											className='font-medium text-white hover:text-brand'>
											{row.name}
										</Link>
										<span className='block text-xs text-slate-500'>
											{row.address}
										</span>
									</td>
									<td className='py-3 pr-4'>
										<StatusPill status={row.status} />
									</td>
									<td className='py-3 pr-4 text-slate-400'>{row.pages}</td>
									<td className='py-3 pr-4 text-slate-400'>
										{new Date(row.updatedAt).toLocaleDateString()}
									</td>
									<td className='py-3 text-right'>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant='ghost'
													size='icon'
													aria-label={`Actions for ${row.name}`}>
													<MoreHorizontal />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align='end'>
												<DropdownMenuItem asChild>
													<Link href={`/builder/sites/${row.id}/pages`}>
														<Pencil /> Edit site
													</Link>
												</DropdownMenuItem>
												{canDelete && (
													<DropdownMenuItem
														variant='destructive'
														onSelect={() => setDeleting(row)}>
														<Trash2 /> Delete site
													</DropdownMenuItem>
												)}
											</DropdownMenuContent>
										</DropdownMenu>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<Dialog open={creating} onOpenChange={(open) => !busy && setCreating(open)}>
				<DialogContent>
					<form onSubmit={create} className='space-y-4'>
						<DialogHeader>
							<DialogTitle>New project</DialogTitle>
							<DialogDescription>
								A project holds one website: its pages, images, and settings.
							</DialogDescription>
						</DialogHeader>
						<div className='space-y-2'>
							<Label htmlFor='project-name'>Project name</Label>
							<Input
								id='project-name'
								autoFocus
								required
								maxLength={120}
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>
						{error && <p className='text-sm text-destructive'>{error}</p>}
						<DialogFooter>
							<Button
								type='button'
								variant='outline'
								disabled={busy}
								onClick={() => setCreating(false)}>
								Cancel
							</Button>
							<Button
								type='submit'
								disabled={busy || !name.trim()}
								className='bg-brand font-bold text-ink hover:bg-brand-strong'>
								{busy && <Loader2 className='animate-spin' />} Create project
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<ConfirmDeleteDialog
				open={deleting !== null}
				onOpenChange={(open) => !open && setDeleting(null)}
				title={`Delete "${deleting?.name ?? ''}"?`}
				description='Its pages, images and settings are deleted for everyone on this account. This cannot be undone.'
				actionLabel='Delete site'
				onConfirm={remove}
			/>
		</div>
	)
}

export function StatusPill({ status }: { status: 'draft' | 'live' }) {
	return (
		<span
			className={
				status === 'live'
					? 'inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand'
					: 'inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-slate-400'
			}>
			<span
				aria-hidden
				className={`size-1.5 rounded-full ${status === 'live' ? 'bg-brand' : 'bg-slate-500'}`}
			/>
			{status === 'live' ? 'Live' : 'Draft'}
		</span>
	)
}
