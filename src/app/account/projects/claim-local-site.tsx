'use client'

import { useEffect, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importLocalSite, readLocalPageCount } from '@/lib/builder/claim-local'

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
		setPages(readLocalPageCount(storageKey))
	}, [storageKey])

	if (pages === 0 || dismissed) return null

	const claim = async () => {
		setBusy(true)
		setError(null)
		try {
			await importLocalSite({ storageKey })
			setPages(0)
			await onImported()
		} catch (cause) {
			setError(
				cause instanceof Error && cause.message === 'media-incomplete'
					? 'The project came across but some images did not. Your browser copy has been kept so you can try again.'
					: 'That import did not finish. Your local copy is untouched.',
			)
			await onImported()
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
						{pages} {pages === 1 ? 'page' : 'pages'}, plus any images. Import it
						to keep it on your account. Nothing is deleted until the import
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
