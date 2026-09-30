'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
	Check,
	Copy,
	ExternalLink,
	Globe,
	Link2,
	Loader2,
	PencilRuler,
	RefreshCw,
	Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusPill } from '../projects-table'

export type DnsRecord = { type: string; name: string; value: string }

export type Project = {
	id: string
	name: string
	subdomain: string
	customDomain: string | null
	customDomainVerified: boolean
	customDomainRecords: DnsRecord[]
	customDomainMisconfigured: boolean
	customDomainCheckedAt: string | null
	previewToken: string
	status: 'draft' | 'live'
	publishedAt: string | null
	pages: number
	images: number
	updatedAt: string
	createdAt: string
}

export function ProjectSettings({
	project,
	appHost,
	appProtocol,
	can,
}: {
	project: Project
	appHost: string
	appProtocol: string
	can: { edit: boolean; publish: boolean; delete: boolean }
}) {
	const router = useRouter()
	const [name, setName] = useState(project.name)
	const [subdomain, setSubdomain] = useState(project.subdomain)
	const [domain, setDomain] = useState(project.customDomain ?? '')
	const [token, setToken] = useState(project.previewToken)
	const [status, setStatus] = useState(project.status)
	const [verified, setVerified] = useState(project.customDomainVerified)
	const [records, setRecords] = useState(project.customDomainRecords)
	const [misconfigured, setMisconfigured] = useState(
		project.customDomainMisconfigured,
	)
	const [checkedAt, setCheckedAt] = useState(project.customDomainCheckedAt)
	const [pending, setPending] = useState<string | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState<string | null>(null)

	const [origin, setOrigin] = useState('')

	// Resolved after mount: rendering `window.location.origin` during SSR gives
	// the server a different href than the client and breaks hydration.
	useEffect(() => setOrigin(window.location.origin), [])

	const previewPath = `/p/${token}`
	const previewUrl = `${origin}${previewPath}`
	const liveUrl =
		domain && verified
			? `https://${domain}`
			: `${appProtocol}://${subdomain}.${appHost}`

	const patch = async (body: Record<string, unknown>, kind: string) => {
		setBusy(kind)
		setError(null)
		setSaved(null)
		const response = await fetch(`/api/sites/${project.id}/settings`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
		setBusy(null)
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}))
			setError(payload.error ?? 'That change could not be saved.')
			return null
		}
		const { site } = await response.json()
		absorb(site)
		setSaved(kind)
		router.refresh()
		return site
	}

	function absorb(site: Project) {
		setSubdomain(site.subdomain)
		setDomain(site.customDomain ?? '')
		setVerified(site.customDomainVerified)
		setRecords(site.customDomainRecords ?? [])
		setMisconfigured(site.customDomainMisconfigured)
		setCheckedAt(site.customDomainCheckedAt)
		setStatus(site.status)
	}

	const checkDomain = async () => {
		setBusy('check')
		setError(null)
		const response = await fetch(`/api/sites/${project.id}/domain`, {
			method: 'POST',
		})
		setBusy(null)
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}))
			setError(payload.error ?? 'Could not check that domain.')
			return
		}
		const payload = await response.json()
		absorb(payload.site)
		setPending(payload.pending)
		router.refresh()
	}

	const regenerate = async () => {
		if (
			!confirm(
				'Anyone you already sent the old link to will lose access. Continue?',
			)
		)
			return
		setBusy('token')
		const response = await fetch(`/api/sites/${project.id}/settings`, {
			method: 'POST',
		})
		setBusy(null)
		if (!response.ok) return setError('Could not make a new link.')
		const { site } = await response.json()
		setToken(site.previewToken)
		router.refresh()
	}

	const remove = async () => {
		if (
			!confirm(
				`Delete "${project.name}" and everything in it? This cannot be undone.`,
			)
		)
			return
		setBusy('delete')
		const response = await fetch(`/api/sites/${project.id}`, {
			method: 'DELETE',
		})
		setBusy(null)
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}))
			setError(payload.error ?? 'Could not delete that project.')
			return
		}
		router.push('/account/projects')
		router.refresh()
	}

	return (
		<div className='space-y-10'>
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div className='min-w-0'>
					<Link
						href='/account/projects'
						className='text-sm text-slate-500 hover:text-white'>
						← Projects
					</Link>
					<h1 className='mt-2 truncate font-display text-3xl font-semibold text-white'>
						{project.name}
					</h1>
					<div className='mt-3 flex items-center gap-3'>
						<StatusPill status={status} />
						<span className='text-xs text-slate-500'>
							{project.pages} {project.pages === 1 ? 'page' : 'pages'} ·{' '}
							{project.images} {project.images === 1 ? 'image' : 'images'}
						</span>
					</div>
				</div>

				{can.edit && (
					<Button
						asChild
						className='shrink-0 bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href={`/builder/sites/${project.id}/pages`}>
							<PencilRuler /> Edit site
						</Link>
					</Button>
				)}
			</div>

			{error && <p className='text-sm text-destructive'>{error}</p>}

			<section className='rounded-xl border border-white/10 bg-white/3 p-6'>
				<h2 className='flex items-center gap-2 font-display text-lg font-semibold text-white'>
					<Link2 className='size-4 text-slate-500' /> Share a preview
				</h2>
				<p className='mt-1 text-sm leading-6 text-slate-400'>
					Works whether or not the project is live, and needs no account. Send
					it to anyone you want an opinion from.
				</p>
				<CopyField value={previewUrl} href={previewPath} />
				{can.edit && (
					<button
						type='button'
						onClick={regenerate}
						disabled={busy !== null}
						className='mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-white'>
						{busy === 'token' ? (
							<Loader2 className='size-3 animate-spin' />
						) : (
							<RefreshCw className='size-3' />
						)}
						Make a new link and kill the old one
					</button>
				)}
			</section>

			{can.publish && (
				<section className='space-y-6 rounded-xl border border-white/10 bg-white/3 p-6'>
					<div className='flex flex-wrap items-center justify-between gap-4'>
						<div>
							<h2 className='flex items-center gap-2 font-display text-lg font-semibold text-white'>
								<Globe className='size-4 text-slate-500' />
								{status === 'live' ? 'Live' : 'Not live yet'}
							</h2>
							<p className='mt-1 text-sm leading-6 text-slate-400'>
								{status === 'live' ? (
									<>
										Reachable at{' '}
										<a
											href={liveUrl}
											target='_blank'
											rel='noreferrer'
											className='text-brand hover:text-brand-strong'>
											{liveUrl.replace(/^https?:\/\//, '')}
											<ExternalLink className='ml-1 inline size-3' />
										</a>
									</>
								) : (
									'Only people on this account can see it while it is a draft.'
								)}
							</p>
						</div>
						<Button
							onClick={() =>
								patch(
									{ status: status === 'live' ? 'draft' : 'live' },
									'status',
								)
							}
							disabled={busy !== null}
							className={
								status === 'live'
									? 'border border-white/15 bg-transparent text-white hover:bg-white/5'
									: 'bg-brand font-bold text-ink hover:bg-brand-strong'
							}>
							{busy === 'status' && <Loader2 className='animate-spin' />}
							{status === 'live' ? 'Take offline' : 'Set live'}
						</Button>
					</div>

					<div className='space-y-2 border-t border-white/10 pt-5'>
						<Label htmlFor='project-subdomain'>Address</Label>
						<div className='flex items-stretch'>
							<Input
								id='project-subdomain'
								value={subdomain}
								onChange={(event) => setSubdomain(event.target.value)}
								className='rounded-r-none'
							/>
							<span className='flex items-center rounded-r-md border border-l-0 border-white/12 bg-white/5 px-3 text-sm text-slate-400'>
								.{appHost}
							</span>
						</div>
						<p className='text-xs text-slate-500'>
							Every project gets one. Taken names get a number.
						</p>
						<div className='flex items-center gap-3 pt-1'>
							<Button
								onClick={() => patch({ subdomain }, 'subdomain')}
								disabled={busy !== null || subdomain === project.subdomain}
								className='bg-brand font-bold text-ink hover:bg-brand-strong'>
								{busy === 'subdomain' && <Loader2 className='animate-spin' />}
								Save address
							</Button>
							{saved === 'subdomain' && (
								<span className='text-sm text-slate-500'>Saved</span>
							)}
						</div>
					</div>

					<div className='space-y-2 border-t border-white/10 pt-5'>
						<Label htmlFor='project-domain'>Your own domain</Label>
						<Input
							id='project-domain'
							value={domain}
							placeholder='example.com'
							onChange={(event) => setDomain(event.target.value)}
						/>
						{domain ? (
							verified ? (
								<p className='flex items-center gap-1.5 text-xs text-brand'>
									<Check className='size-3' /> Verified and serving this
									project.
								</p>
							) : (
								<div className='space-y-3 rounded-lg border border-white/10 bg-ink/40 p-3 text-xs leading-6 text-slate-400'>
									<p className='text-white'>
										{domain !== (project.customDomain ?? '')
											? 'Save the domain to get its DNS records.'
											: pending === 'ownership'
												? 'Waiting on the ownership record below.'
												: 'Add these at your registrar, then check again.'}
									</p>

									{records.length > 0 && (
										<div className='overflow-x-auto'>
											<table className='w-full min-w-[22rem] border-collapse font-mono'>
												<thead>
													<tr className='text-[10px] uppercase tracking-widest text-slate-500'>
														<th className='py-1 pr-3 text-left font-semibold'>
															Type
														</th>
														<th className='py-1 pr-3 text-left font-semibold'>
															Name
														</th>
														<th className='py-1 text-left font-semibold'>
															Value
														</th>
													</tr>
												</thead>
												<tbody>
													{records.map((record, index) => (
														<tr
															key={`${record.type}-${index}`}
															className='border-t border-white/5 text-slate-300'>
															<td className='py-1.5 pr-3'>{record.type}</td>
															<td className='py-1.5 pr-3 break-all'>
																{record.name}
															</td>
															<td className='py-1.5 break-all'>
																{record.value}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}

									{records.some((record) => record.type === 'A') && (
										<p>
											GoDaddy and most registrars will not accept a CNAME on a
											root domain. That is why this is an A record.
										</p>
									)}

									<div className='flex flex-wrap items-center gap-3'>
										<Button
											type='button'
											variant='outline'
											onClick={checkDomain}
											disabled={
												busy !== null || domain !== (project.customDomain ?? '')
											}
											className='h-8 border-white/15 bg-transparent text-white hover:bg-white/5'>
											{busy === 'check' ? (
												<Loader2 className='animate-spin' />
											) : (
												<RefreshCw />
											)}
											Check status
										</Button>
										{checkedAt && (
											<span>
												{misconfigured
													? 'Not resolving here yet'
													: 'DNS looks right'}
												{' · checked '}
												{new Date(checkedAt).toLocaleTimeString()}
											</span>
										)}
									</div>

									<p>
										Until it verifies, the project keeps answering on its{' '}
										{appHost} address.
									</p>
								</div>
							)
						) : (
							<p className='text-xs text-slate-500'>
								Optional. Leave blank to stay on the {appHost} address.
							</p>
						)}
						<div className='flex items-center gap-3 pt-1'>
							<Button
								onClick={() =>
									patch({ customDomain: domain.trim() || null }, 'domain')
								}
								disabled={
									busy !== null ||
									domain.trim() === (project.customDomain ?? '')
								}
								className='bg-brand font-bold text-ink hover:bg-brand-strong'>
								{busy === 'domain' && <Loader2 className='animate-spin' />}
								Save domain
							</Button>
							{saved === 'domain' && (
								<span className='text-sm text-slate-500'>Saved</span>
							)}
						</div>
					</div>
				</section>
			)}

			<section className='max-w-xl space-y-3'>
				<h2 className='font-display text-lg font-semibold text-white'>
					Project name
				</h2>
				<Input
					aria-label='Project name'
					value={name}
					disabled={!can.edit}
					onChange={(event) => setName(event.target.value)}
				/>
				{can.edit && (
					<div className='flex items-center gap-3'>
						<Button
							onClick={() => patch({ name }, 'name')}
							disabled={busy !== null || name === project.name}
							className='bg-brand font-bold text-ink hover:bg-brand-strong'>
							{busy === 'name' && <Loader2 className='animate-spin' />}
							Save name
						</Button>
						{saved === 'name' && (
							<span className='text-sm text-slate-500'>Saved</span>
						)}
					</div>
				)}
			</section>

			{can.delete && (
				<section className='max-w-xl rounded-xl border border-destructive/30 p-6'>
					<h2 className='font-display text-lg font-semibold text-white'>
						Delete this project
					</h2>
					<p className='mt-1 text-sm leading-6 text-slate-400'>
						Its pages and images go with it. This cannot be undone.
					</p>
					<Button
						variant='outline'
						onClick={remove}
						disabled={busy !== null}
						className='mt-4 border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10'>
						{busy === 'delete' ? (
							<Loader2 className='animate-spin' />
						) : (
							<Trash2 />
						)}
						Delete project
					</Button>
				</section>
			)}
		</div>
	)
}

function CopyField({ value, href }: { value: string; href: string }) {
	const [copied, setCopied] = useState(false)

	return (
		<div className='mt-4 flex items-stretch gap-2'>
			<input
				readOnly
				value={value}
				onFocus={(event) => event.currentTarget.select()}
				className='min-w-0 flex-1 rounded-md border border-white/12 bg-ink/40 px-3 py-2 font-mono text-xs text-slate-300'
			/>
			<button
				type='button'
				onClick={async () => {
					await navigator.clipboard.writeText(value)
					setCopied(true)
					setTimeout(() => setCopied(false), 2000)
				}}
				className='flex shrink-0 items-center gap-1.5 rounded-md bg-white/5 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10'>
				{copied ? (
					<Check className='size-3.5' />
				) : (
					<Copy className='size-3.5' />
				)}
				{copied ? 'Copied' : 'Copy'}
			</button>
			<a
				href={href}
				target='_blank'
				rel='noreferrer'
				aria-label='Open the preview'
				className='flex shrink-0 items-center rounded-md bg-white/5 px-3 text-slate-200 transition-colors hover:bg-white/10'>
				<ExternalLink className='size-3.5' />
			</a>
		</div>
	)
}
