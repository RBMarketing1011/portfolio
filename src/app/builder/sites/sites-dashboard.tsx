'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
	Copy,
	Loader2,
	LayoutTemplate,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SITE_KEY } from '@/lib/builder/drivers'
import { ClaimLocalSite } from './claim-local-site'

type Row = { id: string; name: string; pages: number; updatedAt: string }

export function SitesDashboard() {
	const router = useRouter()
	const [sites, setSites] = useState<Row[] | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const refresh = async () => {
		const response = await fetch('/api/sites', { cache: 'no-store' })
		if (!response.ok) {
			setError('Could not load your sites.')
			setSites([])
			return
		}
		const body = await response.json()
		setSites(body.sites)
	}

	useEffect(() => {
		void refresh()
	}, [])

	const create = async () => {
		setBusy(true)
		setError(null)
		const response = await fetch('/api/sites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'Untitled site',
				site: { version: 1, pages: [] },
			}),
		})
		setBusy(false)
		if (!response.ok) {
			setError('Could not create that site.')
			return
		}
		const { site } = await response.json()
		router.push(`/builder/sites/${site.id}/pages`)
	}

	const remove = async (id: string, name: string) => {
		if (
			!confirm(`Delete "${name}" and everything in it? This cannot be undone.`)
		)
			return
		await fetch(`/api/sites/${id}`, { method: 'DELETE' })
		void refresh()
	}

	const rename = async (id: string, current: string) => {
		const name = prompt('Rename this site', current)?.trim()
		if (!name || name === current) return
		// The name is the only field changing, so the current rev has to come first.
		const read = await fetch(`/api/sites/${id}`, { cache: 'no-store' })
		if (!read.ok) return setError('Could not rename that site.')
		const { site } = await read.json()
		const response = await fetch(`/api/sites/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, rev: site.rev }),
		})
		if (!response.ok) setError('Could not rename that site.')
		void refresh()
	}

	const duplicate = async (id: string, name: string) => {
		setBusy(true)
		setError(null)
		const read = await fetch(`/api/sites/${id}`, { cache: 'no-store' })
		if (!read.ok) {
			setBusy(false)
			return setError('Could not copy that site.')
		}
		const { site } = await read.json()
		// Images stay with the original; the copy points at the same blobs.
		const response = await fetch('/api/sites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: `${name} copy`,
				site: site.site,
				look: site.look,
			}),
		})
		setBusy(false)
		if (!response.ok) return setError('Could not copy that site.')
		void refresh()
	}

	if (sites === null)
		return (
			<div className='flex items-center gap-2 py-20 text-sm text-slate-500'>
				<Loader2 className='size-4 animate-spin' /> Loading your sites…
			</div>
		)

	return (
		<div className='py-12'>
			<div className='flex flex-wrap items-end justify-between gap-4'>
				<div>
					<h1 className='font-display text-3xl font-semibold text-white'>
						My sites
					</h1>
					<p className='mt-2 leading-7 text-slate-400'>
						Everything you have built, saved to your account.
					</p>
				</div>
				<Button
					onClick={create}
					disabled={busy}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					{busy ? <Loader2 className='animate-spin' /> : <Plus />} New site
				</Button>
			</div>

			<ClaimLocalSite storageKey={SITE_KEY} onImported={refresh} />

			{error && <p className='mt-6 text-sm text-destructive'>{error}</p>}

			{sites.length === 0 ? (
				<div className='mt-12 rounded-xl border border-dashed border-white/15 py-16 text-center'>
					<LayoutTemplate className='mx-auto size-8 text-slate-600' />
					<p className='mt-4 font-medium text-white'>No sites yet</p>
					<p className='mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500'>
						Create one, or keep working on the site in this browser and import
						it here.
					</p>
				</div>
			) : (
				<ul className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
					{sites.map((item) => (
						<li
							key={item.id}
							className='group relative rounded-xl border border-white/10 bg-white/3 p-5 transition-colors hover:border-brand/40'>
							<Link href={`/builder/sites/${item.id}/pages`} className='block'>
								<p className='font-display text-lg font-semibold text-white'>
									{item.name}
								</p>
								<p className='mt-1 text-xs text-slate-500'>
									{item.pages} {item.pages === 1 ? 'page' : 'pages'} · edited{' '}
									{new Date(item.updatedAt).toLocaleDateString()}
								</p>
							</Link>
							<div className='absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
								<button
									type='button'
									onClick={() => rename(item.id, item.name)}
									aria-label={`Rename ${item.name}`}
									className='flex size-7 items-center justify-center rounded-md text-slate-500 hover:text-white'>
									<Pencil className='size-3.5' />
								</button>
								<button
									type='button'
									onClick={() => duplicate(item.id, item.name)}
									aria-label={`Duplicate ${item.name}`}
									className='flex size-7 items-center justify-center rounded-md text-slate-500 hover:text-white'>
									<Copy className='size-3.5' />
								</button>
								<button
									type='button'
									onClick={() => remove(item.id, item.name)}
									aria-label={`Delete ${item.name}`}
									className='flex size-7 items-center justify-center rounded-md text-slate-600 hover:text-destructive'>
									<Trash2 className='size-3.5' />
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
