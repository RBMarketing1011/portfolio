'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
	Check,
	ChevronsUpDown,
	LayoutGrid,
	Loader2,
	MonitorSmartphone,
	Plus,
} from 'lucide-react'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useBuilder } from '@/lib/builder/builder-context'
import { LOCAL_SITE_ID } from '@/lib/builder/site-ids'

type Row = { id: string; name: string; pages: number; updatedAt: string }

/**
 * The builder renders no site header, so without this there is no way out of an
 * open site: every other control edits the one you are already in.
 */
export function SiteSwitcher({ signedIn }: { signedIn: boolean }) {
	const router = useRouter()
	const store = useBuilder()
	const [open, setOpen] = useState(false)
	const [sites, setSites] = useState<Row[] | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const local = store.siteId === LOCAL_SITE_ID
	const label = local ? 'This browser' : store.siteName

	const openChange = async (next: boolean) => {
		setOpen(next)
		if (!next || !signedIn) return
		setError(null)
		// Refetched every time: creating, renaming, or deleting elsewhere in the
		// builder would otherwise leave this list describing sites that moved on.
		const response = await fetch('/api/sites', { cache: 'no-store' })
		if (!response.ok) {
			setSites([])
			setError('Could not load your sites.')
			return
		}
		const body = await response.json()
		setSites(body.sites as Row[])
	}

	const go = (siteId: string) => {
		setOpen(false)
		if (siteId === store.siteId) return
		router.push(`/builder/sites/${siteId}/pages`)
	}

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
		setOpen(false)
		router.push(`/builder/sites/${site.id}/pages`)
	}

	return (
		<div>
			<span className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
				Site
			</span>
			<Popover open={open} onOpenChange={openChange}>
				<PopoverTrigger asChild>
					<button
						type='button'
						role='combobox'
						aria-expanded={open}
						className='mt-1.5 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-white/12 bg-white/3 px-3 text-sm text-white transition-colors hover:bg-white/6'>
						<span className='flex min-w-0 items-center gap-2'>
							{local && (
								<MonitorSmartphone className='size-3.5 shrink-0 text-slate-500' />
							)}
							<span className='truncate'>{label}</span>
						</span>
						<ChevronsUpDown className='size-3.5 shrink-0 opacity-50' />
					</button>
				</PopoverTrigger>
				<PopoverContent className='w-(--radix-popover-trigger-width) p-0'>
					<Command>
						{signedIn && <CommandInput placeholder='Search sites…' />}
						<CommandList>
							{signedIn && sites === null ? (
								<div className='flex items-center gap-2 px-3 py-4 text-sm text-slate-500'>
									<Loader2 className='size-3.5 animate-spin' /> Loading…
								</div>
							) : (
								<>
									<CommandEmpty>No site found.</CommandEmpty>
									{signedIn && (sites?.length ?? 0) > 0 && (
										<CommandGroup heading='Your sites'>
											{sites?.map((item) => (
												<CommandItem
													key={item.id}
													// Two sites may share a name; cmdk treats equal values
													// as the same item, so the id has to be in there.
													value={`${item.name} ${item.id}`}
													onSelect={() => go(item.id)}>
													<Check
														className={cn(
															'size-3.5',
															item.id === store.siteId
																? 'text-brand opacity-100'
																: 'opacity-0',
														)}
													/>
													<span className='min-w-0 flex-1 truncate'>
														{item.name}
													</span>
													<span className='shrink-0 text-xs text-slate-500'>
														{item.pages}
													</span>
												</CommandItem>
											))}
										</CommandGroup>
									)}

									<CommandGroup
										heading={signedIn ? 'Not saved yet' : undefined}>
										<CommandItem
											value='This browser'
											onSelect={() => go(LOCAL_SITE_ID)}>
											<Check
												className={cn(
													'size-3.5',
													local ? 'text-brand opacity-100' : 'opacity-0',
												)}
											/>
											<span className='min-w-0 flex-1 truncate'>
												This browser
											</span>
										</CommandItem>
									</CommandGroup>

									<CommandSeparator />
									<CommandGroup>
										{signedIn ? (
											<>
												<CommandItem
													value='New site'
													disabled={busy}
													onSelect={create}>
													{busy ? (
														<Loader2 className='size-3.5 animate-spin' />
													) : (
														<Plus className='size-3.5' />
													)}
													New site
												</CommandItem>
												<CommandItem
													value='All projects'
													onSelect={() => {
														setOpen(false)
														router.push('/account/projects')
													}}>
													<LayoutGrid className='size-3.5' />
													All projects
												</CommandItem>
											</>
										) : (
											<CommandItem
												value='Sign in to save'
												onSelect={() => {
													setOpen(false)
													router.push('/sign-in?next=/account')
												}}>
												<LayoutGrid className='size-3.5' />
												Sign in to keep more than one
											</CommandItem>
										)}
									</CommandGroup>
								</>
							)}
						</CommandList>
					</Command>
					{error && (
						<p className='border-t border-white/10 px-3 py-2 text-xs text-destructive'>
							{error}
						</p>
					)}
				</PopoverContent>
			</Popover>
		</div>
	)
}
