'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Switches the admin into an account, then lands them where they asked to go. */
export function OpenAccountButton({
	workspaceId,
	to = '/account',
	label = 'Open',
}: {
	workspaceId: string
	to?: string
	label?: string
}) {
	const router = useRouter()
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
		router.push(to)
		router.refresh()
	}

	return (
		<Button
			size='sm'
			variant='outline'
			disabled={busy}
			onClick={open}
			className='border-white/15 bg-transparent'>
			{busy ? <Loader2 className='animate-spin' /> : <LogIn />} {label}
		</Button>
	)
}
