'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Ends an admin's visit to an account, so /account does not reopen it later. */
export function LeaveAccountButton() {
	const [busy, setBusy] = useState(false)

	const leave = async () => {
		setBusy(true)
		await fetch('/api/account/workspace', { method: 'DELETE' }).catch(() => null)
		// A full page load, so nothing of the account stays in the router's cache.
		window.location.assign('/admin/accounts')
	}

	return (
		<Button size='sm' variant='outline' disabled={busy} onClick={leave}>
			{busy && <Loader2 className='animate-spin' />} Back to admin
		</Button>
	)
}
