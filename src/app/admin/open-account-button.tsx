'use client'

import { useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** The only way an admin gets into an account: views it as its owner sees it,
 *  until they go back to admin or close the browser. */
export function OpenAccountButton({
	workspaceId,
	to = '/account',
	label = 'View account',
}: {
	workspaceId: string
	to?: string
	label?: string
}) {
	const [busy, setBusy] = useState(false)

	const open = async () => {
		setBusy(true)
		const response = await fetch('/api/account/workspace', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ workspaceId }),
		})
		if (!response.ok) {
			setBusy(false)
			return
		}
		// A full page load, not a client navigation: the router may hold an earlier
		// "/account sends admins to /admin" answer and would replay it.
		window.location.assign(to)
	}

	return (
		<Button
			size='sm'
			variant='outline'
			disabled={busy}
			onClick={open}>
			{busy ? <Loader2 className='animate-spin' /> : <Eye />} {label}
		</Button>
	)
}
