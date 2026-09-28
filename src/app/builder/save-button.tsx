'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Check, CloudUpload, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useBuilder } from '@/lib/builder/builder-context'
import { importLocalSite } from '@/lib/builder/claim-local'

/**
 * Saving is automatic once a site belongs to an account, so this button exists
 * for the browser-only copy: it is the one place that explains where the work
 * currently lives and offers to move it somewhere permanent.
 */
export function SaveButton({
	variant,
	signedIn,
}: {
	variant: 'toolbar' | 'sidebar'
	signedIn: boolean
}) {
	const store = useBuilder()
	const router = useRouter()
	const pathname = usePathname()
	const [open, setOpen] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const saved = store.remote
	const saving = saved && store.saveState === 'saving'
	const empty = store.pages.length === 0

	const save = async () => {
		setBusy(true)
		setError(null)
		try {
			const id = await importLocalSite()
			setOpen(false)
			router.push(`/builder/sites/${id}/pages`)
			router.refresh()
		} catch (cause) {
			setError(
				cause instanceof Error && cause.message === 'signed-out'
					? 'That session has expired. Sign in again and your work will still be here.'
					: 'That save did not finish. Nothing was lost — try again.',
			)
		} finally {
			setBusy(false)
		}
	}

	const label = saving ? 'Saving…' : saved ? 'Saved' : 'Save'
	const Icon = saving ? Loader2 : saved ? Check : Save

	return (
		<>
			<button
				type='button'
				onClick={() => {
					setError(null)
					setOpen(true)
				}}
				className={cn(
					'flex items-center gap-1.5 font-semibold transition-colors',
					variant === 'toolbar'
						? 'h-8 shrink-0 rounded-md px-2.5 text-xs'
						: 'w-full justify-center rounded-md px-3 py-2 text-sm',
					saved
						? 'bg-white/5 text-slate-300 hover:bg-white/10'
						: 'bg-brand text-ink hover:bg-brand-strong',
				)}>
				<Icon
					className={cn(
						variant === 'toolbar' ? 'size-3.5' : 'size-4',
						saving && 'animate-spin',
					)}
				/>
				{label}
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className='sm:max-w-md'>
					{saved ? (
						<>
							<DialogHeader>
								<DialogTitle>
									{saving ? 'Saving your changes' : 'Saved to your account'}
								</DialogTitle>
								<DialogDescription>
									{saving
										? 'This site is being written to your account right now.'
										: 'Every change is saved automatically, so there is nothing to press. You can pick this site back up on any device you sign in on.'}
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button variant='outline' asChild>
									<Link href='/builder/sites'>My sites</Link>
								</Button>
								<Button
									onClick={() => setOpen(false)}
									className='bg-brand font-bold text-ink hover:bg-brand-strong'>
									Keep building
								</Button>
							</DialogFooter>
						</>
					) : signedIn ? (
						<>
							<DialogHeader>
								<DialogTitle>Save this site to your account</DialogTitle>
								<DialogDescription>
									This site only exists in this browser. Saving copies it, and
									any images you added, onto your account — clear your browser
									data before then and it is gone. Nothing here is deleted until
									the save succeeds.
								</DialogDescription>
							</DialogHeader>
							{error && <p className='text-sm text-destructive'>{error}</p>}
							<DialogFooter>
								<Button
									variant='outline'
									onClick={() => setOpen(false)}
									disabled={busy}>
									Not now
								</Button>
								<Button
									onClick={save}
									disabled={busy || empty}
									className='bg-brand font-bold text-ink hover:bg-brand-strong'>
									{busy ? (
										<Loader2 className='animate-spin' />
									) : (
										<CloudUpload />
									)}
									{empty ? 'Nothing to save yet' : 'Save to my account'}
								</Button>
							</DialogFooter>
						</>
					) : (
						<>
							<DialogHeader>
								<DialogTitle>Create an account to save this</DialogTitle>
								<DialogDescription>
									Everything you have built is stored in this browser, so it is
									here when you come back — but only on this device, and only
									until you clear your browser data. An account keeps it
									permanently and picks it up anywhere you sign in.
								</DialogDescription>
							</DialogHeader>
							<p className='text-sm text-slate-400'>
								Your work stays exactly as it is while you sign up, and you will
								be offered it the moment you land back here.
							</p>
							<DialogFooter>
								<Button variant='outline' asChild>
									<Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>
										I have an account
									</Link>
								</Button>
								<Button
									asChild
									className='bg-brand font-bold text-ink hover:bg-brand-strong'>
									<Link href={`/sign-up?next=${encodeURIComponent(pathname)}`}>
										Create a free account
									</Link>
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
