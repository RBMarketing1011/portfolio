'use client'

import { useEffect, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { siteSchema } from '@/lib/builder/page-schema'
import { LOOK_KEY } from '@/lib/builder/drivers'
import { isDataUrl, MEDIA_KEY, type MediaItem } from '@/lib/builder/media-store'

/**
 * Offers the site already built in this browser. Nothing is cleared until the
 * server has confirmed the import, so a failure never loses the work.
 */
export function ClaimLocalSite({
	storageKey,
	onImported,
}: {
	storageKey: string
	onImported: () => void | Promise<void>
}) {
	const [pages, setPages] = useState(0)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [dismissed, setDismissed] = useState(false)

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(storageKey)
			if (!raw) return
			const parsed = siteSchema.safeParse(JSON.parse(raw))
			if (parsed.success) setPages(parsed.data.pages.length)
		} catch {
			// An unreadable local site simply has nothing to offer.
		}
	}, [storageKey])

	if (pages === 0 || dismissed) return null

	const claim = async () => {
		setBusy(true)
		setError(null)
		try {
			const raw = window.localStorage.getItem(storageKey)
			const parsed = siteSchema.safeParse(JSON.parse(raw ?? '{}'))
			if (!parsed.success) throw new Error('unreadable')

			let look: unknown = undefined
			try {
				const rawLook = window.localStorage.getItem(LOOK_KEY)
				if (rawLook) look = JSON.parse(rawLook)
			} catch {
				// A broken look is not worth failing the import over.
			}

			const created = await fetch('/api/sites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Imported site',
					site: parsed.data,
					look,
				}),
			})
			if (!created.ok) throw new Error('create failed')
			const { site } = await created.json()

			// The images live in this browser as data URLs, so they have to be
			// re-uploaded before the local copy can be thrown away.
			const library: MediaItem[] = JSON.parse(
				window.localStorage.getItem(MEDIA_KEY) ?? '[]',
			)
			const { upload } = await import('@vercel/blob/client')
			const remap = new Map<string, string>()

			for (const item of library) {
				if (!isDataUrl(item.src)) continue
				const blob = await (await fetch(item.src)).blob()
				const put = await upload(`sites/${site.id}/${item.name}.webp`, blob, {
					access: 'public',
					handleUploadUrl: `/api/sites/${site.id}/media/upload`,
					contentType: 'image/webp',
				})
				const registered = await fetch(`/api/sites/${site.id}/media`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: item.name,
						url: put.url,
						pathname: put.pathname,
						bytes: blob.size,
						contentType: 'image/webp',
					}),
				})
				if (registered.ok) {
					const { media } = await registered.json()
					remap.set(item.id, media.id)
				}
			}

			// Block refs point at the old local ids, so rewrite them to the new ones.
			if (remap.size) {
				const text = JSON.stringify(parsed.data).replace(
					/media:([a-z0-9_]+)/g,
					(match, id) => (remap.has(id) ? `media:${remap.get(id)}` : match),
				)
				await fetch(`/api/sites/${site.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ site: JSON.parse(text), rev: site.rev }),
				})
			}

			window.localStorage.removeItem(storageKey)
			window.localStorage.removeItem(LOOK_KEY)
			window.localStorage.removeItem(MEDIA_KEY)
			setPages(0)
			await onImported()
		} catch {
			setError('That import did not finish. Your local copy is untouched.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className='mt-8 rounded-xl border border-brand/30 bg-brand/8 p-5'>
			<div className='flex flex-wrap items-center justify-between gap-4'>
				<div>
					<p className='font-medium text-white'>
						You have a site built in this browser
					</p>
					<p className='mt-1 text-sm text-slate-400'>
						{pages} {pages === 1 ? 'page' : 'pages'}, plus any images. Import
						it to keep it on your account. Nothing is deleted until the import
						succeeds.
					</p>
					{error && <p className='mt-2 text-sm text-destructive'>{error}</p>}
				</div>
				<div className='flex items-center gap-2'>
					<Button
						onClick={claim}
						disabled={busy}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						{busy ? <Loader2 className='animate-spin' /> : <Upload />} Import
					</Button>
					<button
						type='button'
						onClick={() => setDismissed(true)}
						aria-label='Dismiss'
						className='flex size-8 items-center justify-center rounded-md text-slate-500 hover:text-white'>
						<X className='size-4' />
					</button>
				</div>
			</div>
		</div>
	)
}
