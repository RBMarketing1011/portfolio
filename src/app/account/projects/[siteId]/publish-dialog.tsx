'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type DnsRecord = { type: string; name: string; value: string }

/** The slice of a project this dialog reads and writes. */
export type PublishState = {
	id: string
	status: 'draft' | 'live'
	subdomain: string
	/** The domain saved on the project, if any (not what is typed in the box). */
	domain: string
	verified: boolean
	records: DnsRecord[]
	misconfigured: boolean
	checkedAt: string | null
}

type Mode = 'subdomain' | 'domain'

/**
 * Where a project answers, in one place. Used to set a project live and to change
 * where a live one answers.
 *
 * A subdomain is one request: save it, drop any custom domain, go live. A custom
 * domain has to be proven first: saving it asks Vercel for the DNS records, the
 * person adds them, and "Check status" reads the real state back. Going live on a
 * domain is only offered once that check passes, so a project is never published
 * to an address that does not resolve.
 */
export function PublishDialog({
	open,
	onOpenChange,
	state,
	appHost,
	onSite,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	state: PublishState
	appHost: string
	/** The server's updated project, so the page can absorb it. */
	onSite: (site: Record<string, any>) => void
}) {
	const isLive = state.status === 'live'
	const [mode, setMode] = useState<Mode>('subdomain')
	const [subdomain, setSubdomain] = useState(state.subdomain)
	const [domain, setDomain] = useState(state.domain)
	const [pending, setPending] = useState<string | null>(null)
	const [busy, setBusy] = useState<'save' | 'check' | 'publish' | null>(null)
	const [error, setError] = useState<string | null>(null)

	// Each opening starts from what the project has now, on the tab it is using.
	useEffect(() => {
		if (!open) return
		setMode(state.domain && state.verified ? 'domain' : 'subdomain')
		setSubdomain(state.subdomain)
		setDomain(state.domain)
		setPending(null)
		setError(null)
		setBusy(null)
		// Only on opening: edits made while it is open must not be overwritten
		// by the state those same edits produce.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])

	const send = async (
		url: string,
		method: string,
		body: Record<string, unknown> | null,
		kind: 'save' | 'check' | 'publish',
		failure: string,
	) => {
		setBusy(kind)
		setError(null)
		const response = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		})
		setBusy(null)
		const payload = await response.json().catch(() => ({}))
		if (!response.ok) {
			setError(payload.error ?? failure)
			return null
		}
		return payload as { site: Record<string, any>; pending?: string | null }
	}

	const settings = `/api/sites/${state.id}/settings`

	/** Subdomain: one request that moves the project onto it and (if needed) publishes. */
	const publishSubdomain = async () => {
		const result = await send(
			settings,
			'PATCH',
			{
				subdomain,
				// A custom domain left attached would keep answering instead of this.
				...(state.domain ? { customDomain: null } : {}),
				status: 'live',
			},
			'publish',
			'That could not be saved.',
		)
		if (!result) return
		onSite(result.site)
		onOpenChange(false)
	}

	/** Domain, step 1: register it and show the records. */
	const saveDomain = async () => {
		const result = await send(
			settings,
			'PATCH',
			{ customDomain: domain.trim() || null },
			'save',
			'That domain could not be saved.',
		)
		if (!result) return
		onSite(result.site)
		setPending(null)
	}

	/** Domain, step 2: read the real state back from Vercel. */
	const checkDomain = async () => {
		const result = await send(
			`/api/sites/${state.id}/domain`,
			'POST',
			null,
			'check',
			'Could not check that domain.',
		)
		if (!result) return
		onSite(result.site)
		setPending(result.pending ?? null)
	}

	/** Domain, step 3: publish (or, when already live, just finish). */
	const publishDomain = async () => {
		if (isLive) return onOpenChange(false)
		const result = await send(
			settings,
			'PATCH',
			{ status: 'live' },
			'publish',
			'That could not be saved.',
		)
		if (!result) return
		onSite(result.site)
		onOpenChange(false)
	}

	const typed = domain.trim().toLowerCase()
	const saved = state.domain.toLowerCase()
	const domainIsSaved = typed !== '' && typed === saved
	const ready = domainIsSaved && state.verified && !state.misconfigured
	const working = busy !== null

	return (
		<Dialog open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
			<DialogContent className='sm:max-w-xl'>
				<DialogHeader>
					<DialogTitle>{isLive ? 'Change domain' : 'Set live'}</DialogTitle>
					<DialogDescription>
						Choose where this project answers.
					</DialogDescription>
				</DialogHeader>

				<Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
					<TabsList>
						<TabsTrigger value='subdomain'>Subdomain</TabsTrigger>
						<TabsTrigger value='domain'>Custom domain</TabsTrigger>
					</TabsList>

					<TabsContent value='subdomain' className='space-y-2 pt-4'>
						<Label htmlFor='publish-subdomain'>Address</Label>
						<div className='flex items-center gap-2'>
							<Input
								id='publish-subdomain'
								value={subdomain}
								onChange={(event) => setSubdomain(event.target.value)}
							/>
							<span className='shrink-0 text-sm text-muted-foreground'>.{appHost}</span>
						</div>
						<p className='text-xs text-muted-foreground'>
							Every project gets one. Taken names get a number.
						</p>
					</TabsContent>

					<TabsContent value='domain' className='space-y-3 pt-4'>
						<Label htmlFor='publish-domain'>Your domain</Label>
						<div className='flex gap-2'>
							<Input
								id='publish-domain'
								value={domain}
								placeholder='example.com'
								onChange={(event) => setDomain(event.target.value)}
							/>
							{!domainIsSaved && (
								<Button
									type='button'
									variant='outline'
									disabled={working || typed === ''}
									onClick={saveDomain}>
									{busy === 'save' && <Loader2 className='animate-spin' />}
									Get DNS records
								</Button>
							)}
						</div>

						{typed === '' && (
							<p className='text-xs text-muted-foreground'>
								Enter a domain you own. You will get the DNS records to add at
								your registrar.
							</p>
						)}

						{domainIsSaved && state.verified && !state.misconfigured && (
							<FormAlert tone='success'>Verified. DNS points here.</FormAlert>
						)}

						{domainIsSaved && !(state.verified && !state.misconfigured) && (
							<Card className='gap-4 py-4 shadow-none'>
								<CardHeader className='px-4'>
									<CardTitle className='text-sm'>
										{pending === 'ownership'
											? 'Waiting on the ownership record below.'
											: 'Add these at your registrar, then check again.'}
									</CardTitle>
									{state.records.some((record) => record.type === 'A') && (
										<CardDescription>
											GoDaddy and most registrars will not accept a CNAME on a root
											domain. That is why this is an A record.
										</CardDescription>
									)}
								</CardHeader>
								<CardContent className='space-y-4 px-4'>
									<RecordsTable records={state.records} />
									<CheckRow
										busy={busy}
										onCheck={checkDomain}
										disabled={working}
										checkedAt={state.checkedAt}
										misconfigured={state.misconfigured}
									/>
								</CardContent>
							</Card>
						)}
					</TabsContent>
				</Tabs>

				{error && <FormAlert>{error}</FormAlert>}

				<DialogFooter>
					<Button
						type='button'
						variant='outline'
						disabled={working}
						onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					{mode === 'subdomain' ? (
						<Button
							disabled={working || subdomain.trim() === ''}
							onClick={publishSubdomain}>
							{busy === 'publish' && <Loader2 className='animate-spin' />}
							{isLive ? 'Save' : 'Set live'}
						</Button>
					) : (
						<Button
							disabled={working || !ready}
							onClick={publishDomain}>
							{busy === 'publish' && <Loader2 className='animate-spin' />}
							{isLive ? 'Done' : 'Set live'}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function RecordsTable({ records }: { records: DnsRecord[] }) {
	if (records.length === 0) return null

	return (
		<Table className='font-mono text-xs'>
			<TableHeader>
				<TableRow>
					<TableHead>Type</TableHead>
					<TableHead>Name</TableHead>
					<TableHead>Value</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{records.map((record, index) => (
					<TableRow key={`${record.type}-${index}`}>
						<TableCell>{record.type}</TableCell>
						<TableCell className='break-all whitespace-normal'>{record.name}</TableCell>
						<TableCell className='break-all whitespace-normal'>{record.value}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

function CheckRow({
	busy,
	onCheck,
	disabled,
	checkedAt,
	misconfigured,
}: {
	busy: string | null
	onCheck: () => void
	disabled: boolean
	checkedAt: string | null
	misconfigured: boolean
}) {
	return (
		<div className='flex flex-wrap items-center gap-3'>
			<Button
				type='button'
				variant='outline'
				size='sm'
				onClick={onCheck}
				disabled={disabled}>
				{busy === 'check' ? (
					<Loader2 className='animate-spin' />
				) : (
					<RefreshCw />
				)}
				Check status
			</Button>
			{checkedAt && (
				<span>
					{misconfigured ? 'Not resolving here yet' : 'DNS looks right'}
					{' · checked '}
					{new Date(checkedAt).toLocaleTimeString()}
				</span>
			)}
		</div>
	)
}
