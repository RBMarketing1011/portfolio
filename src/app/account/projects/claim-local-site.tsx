'use client'

import { useEffect, useState } from 'react'
import { HardDrive, Loader2, Upload, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
		<Alert>
			<HardDrive />
			<AlertTitle>You have a site built in this browser</AlertTitle>
			<AlertDescription>
				<p>
					{pages} {pages === 1 ? 'page' : 'pages'}, plus any images. Import it to
					keep it on your account. Nothing is deleted until the import succeeds.
				</p>
				{error && <p className='text-destructive'>{error}</p>}
				<div className='mt-2 flex items-center gap-2'>
					<Button size='sm' onClick={claim} disabled={busy}>
						{busy ? <Loader2 className='animate-spin' /> : <Upload />} Import
					</Button>
					<Button size='sm' variant='ghost' onClick={() => setDismissed(true)}>
						<X /> Not now
					</Button>
				</div>
			</AlertDescription>
		</Alert>
	)
}
