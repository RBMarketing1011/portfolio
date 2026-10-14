'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CircleDot, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { FormAlert } from '@/components/form-alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
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
					<p className='mt-2 text-muted-foreground'>
						Every site on this account.
					</p>
				</div>
				{canCreate && (
					<Button onClick={openCreate}>
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
				<Card className='border-dashed text-center'>
					<CardHeader>
						<CardTitle>No projects yet</CardTitle>
						<CardDescription>
							A project holds one website: its pages, images, and settings.
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<Card className='py-0'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Project</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Pages</TableHead>
								<TableHead>Last edited</TableHead>
								<TableHead className='w-12'>
									<span className='sr-only'>Actions</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<Button asChild variant='link' className='h-auto p-0 font-medium'>
											<Link href={`/account/projects/${row.id}`}>{row.name}</Link>
										</Button>
										<div className='text-xs text-muted-foreground'>{row.address}</div>
									</TableCell>
									<TableCell>
										<StatusPill status={row.status} />
									</TableCell>
									<TableCell className='text-muted-foreground'>{row.pages}</TableCell>
									<TableCell className='text-muted-foreground'>
										{new Date(row.updatedAt).toLocaleDateString()}
									</TableCell>
									<TableCell className='text-right'>
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
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Card>
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
						{error && <FormAlert>{error}</FormAlert>}
						<DialogFooter>
							<Button
								type='button'
								variant='outline'
								disabled={busy}
								onClick={() => setCreating(false)}>
								Cancel
							</Button>
							<Button type='submit' disabled={busy || !name.trim()}>
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
	return status === 'live' ? (
		<Badge>
			<CircleDot /> Live
		</Badge>
	) : (
		<Badge variant='secondary'>Draft</Badge>
	)
}
