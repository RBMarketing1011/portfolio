'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
}: {
	initial: ProjectRow[]
	canCreate: boolean
}) {
	const router = useRouter()
	const [rows, setRows] = useState(initial)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => setRows(initial), [initial])

	const create = async () => {
		setBusy(true)
		setError(null)
		const response = await fetch('/api/sites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'Untitled project',
				site: { version: 1, pages: [] },
			}),
		})
		setBusy(false)
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			setError(body.error ?? 'Could not create that project.')
			return
		}
		const { site } = await response.json()
		router.push(`/account/projects/${site.id}`)
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
						onClick={create}
						disabled={busy}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						{busy ? <Loader2 className='animate-spin' /> : <Plus />} New project
					</Button>
				)}
			</div>

			{error && <p className='text-sm text-destructive'>{error}</p>}

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
										<Link
											href={`/builder/sites/${row.id}/pages`}
											className='rounded-md bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10'>
											Edit site
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
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
