'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
	ArrowLeft,
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
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { StatusPill } from '../projects-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SiteProfile } from '@/lib/builder/site-profile'
import { ProjectProfile } from './project-profile'
import { PublishDialog, type DnsRecord } from './publish-dialog'
import type { ProjectImage } from './site-image-field'

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
	profile,
	images,
}: {
	project: Project
	appHost: string
	appProtocol: string
	can: { edit: boolean; publish: boolean; delete: boolean }
	profile: SiteProfile
	images: ProjectImage[]
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
	const [busy, setBusy] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState<string | null>(null)
	const [dialog, setDialog] = useState<
		'regenerate' | 'unpublish' | 'delete' | null
	>(null)
	const [publishing, setPublishing] = useState(false)

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

	/** Each dialog action returns an error to show in the dialog, or null once done. */
	const unpublish = async (): Promise<string | null> => {
		const response = await fetch(`/api/sites/${project.id}/settings`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: 'draft' }),
		})
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}))
			return payload.error ?? 'Could not unpublish that project.'
		}
		const { site } = await response.json()
		absorb(site)
		setDialog(null)
		router.refresh()
		return null
	}

	const regenerate = async (): Promise<string | null> => {
		const response = await fetch(`/api/sites/${project.id}/settings`, {
			method: 'POST',
		})
		if (!response.ok) return 'Could not make a new link.'
		const { site } = await response.json()
		setToken(site.previewToken)
		setDialog(null)
		router.refresh()
		return null
	}

	const remove = async (): Promise<string | null> => {
		const response = await fetch(`/api/sites/${project.id}`, {
			method: 'DELETE',
		})
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}))
			return payload.error ?? 'Could not delete that project.'
		}
		router.push('/account/projects')
		router.refresh()
		return null
	}

	return (
		<div className='space-y-10'>
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div className='min-w-0'>
					<Button asChild variant='link' className='h-auto p-0 text-muted-foreground'>
						<Link href='/account/projects'>
							<ArrowLeft /> Projects
						</Link>
					</Button>
					<h1 className='mt-2 truncate font-display text-3xl font-semibold text-white'>
						{project.name}
					</h1>
					<div className='mt-3 flex items-center gap-3'>
						<StatusPill status={status} />
						<span className='text-xs text-muted-foreground'>
							{project.pages} {project.pages === 1 ? 'page' : 'pages'} ·{' '}
							{project.images} {project.images === 1 ? 'image' : 'images'}
						</span>
					</div>
				</div>

				{can.edit && (
					<Button asChild className='shrink-0'>
						<Link href={`/builder/sites/${project.id}/pages`}>
							<PencilRuler /> Edit site
						</Link>
					</Button>
				)}
			</div>

			<Tabs defaultValue='general'>
				<TabsList>
					<TabsTrigger value='general'>General</TabsTrigger>
					<TabsTrigger value='brand'>Brand</TabsTrigger>
					<TabsTrigger value='business'>Business</TabsTrigger>
					<TabsTrigger value='seo'>SEO &amp; Sharing</TabsTrigger>
				</TabsList>

				<TabsContent value='general' className='space-y-6 pt-6'>
					<div className='grid items-start gap-6 lg:grid-cols-2'>
						<Card>
							<CardHeader>
								<CardTitle>Project name</CardTitle>
								<CardDescription>
									How this project is named on your account and in the builder. It
									does not change the site's address.
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-3'>
								<div className='flex items-center gap-2'>
									<Input
										aria-label='Project name'
										value={name}
										disabled={!can.edit}
										onChange={(event) => setName(event.target.value)}
									/>
									{can.edit && (
										<Button
											onClick={() => patch({ name }, 'name')}
											disabled={busy !== null || name === project.name}
											className='shrink-0'>
											{busy === 'name' && <Loader2 className='animate-spin' />}
											Save name
										</Button>
									)}
								</div>
								{saved === 'name' && <FormAlert tone='success'>Saved.</FormAlert>}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Link2 className='size-4 text-muted-foreground' /> Share a preview
								</CardTitle>
								<CardDescription>
									Works whether or not the project is live, and needs no account. Send
									it to anyone you want an opinion from.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<CopyField
									value={previewUrl}
									href={previewPath}
									onRegenerate={can.edit ? () => setDialog('regenerate') : undefined}
									disabled={busy !== null}
								/>
							</CardContent>
						</Card>
					</div>

					{error && <FormAlert>{error}</FormAlert>}

					{can.publish && (
						<Card>
							<CardHeader>
								<CardTitle className='flex items-center gap-2'>
									<Globe className='size-4 text-muted-foreground' />
									{status === 'live' ? 'Live' : 'Not live yet'}
								</CardTitle>
								{status === 'live' && (
									<CardDescription>
										Reachable at{' '}
										<Button asChild variant='link' className='h-auto p-0'>
											<a href={liveUrl} target='_blank' rel='noreferrer'>
												{new URL(liveUrl).host}
												<ExternalLink />
											</a>
										</Button>
									</CardDescription>
								)}
								<CardAction className='flex flex-wrap gap-2'>
									{status === 'live' ? (
										<>
											<Button variant='outline' onClick={() => setPublishing(true)}>
												Change domain
											</Button>
											<Button variant='outline' onClick={() => setDialog('unpublish')}>
												Unpublish
											</Button>
										</>
									) : (
										<Button onClick={() => setPublishing(true)}>Set live</Button>
									)}
								</CardAction>
							</CardHeader>
						</Card>
					)}

					{can.delete && (
						<Card className='max-w-xl border-destructive/40'>
							<CardHeader>
								<CardTitle>Delete this project</CardTitle>
								<CardDescription>
									Its pages and images go with it. This cannot be undone.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button
									variant='destructive'
									onClick={() => setDialog('delete')}
									disabled={busy !== null}>
									<Trash2 /> Delete project
								</Button>
							</CardContent>
						</Card>
					)}
				</TabsContent>

				<ProjectProfile
					siteId={project.id}
					projectName={project.name}
					address={new URL(liveUrl).host}
					initial={profile}
					initialImages={images}
					canEdit={can.edit}
				/>
			</Tabs>

			<ConfirmDeleteDialog
				open={dialog === 'regenerate'}
				onOpenChange={(open) => !open && setDialog(null)}
				title='Make a new preview link?'
				description='The current link stops working immediately. Anyone you already sent it to will lose access.'
				actionLabel='Make new link'
				icon={<RefreshCw />}
				onConfirm={regenerate}
			/>

			<PublishDialog
				open={publishing}
				onOpenChange={setPublishing}
				appHost={appHost}
				state={{
					id: project.id,
					status,
					subdomain,
					domain,
					verified,
					records,
					misconfigured,
					checkedAt,
				}}
				onSite={(site) => {
					absorb(site as Project)
					router.refresh()
				}}
			/>

			<ConfirmDeleteDialog
				open={dialog === 'unpublish'}
				onOpenChange={(open) => !open && setDialog(null)}
				title='Unpublish this project?'
				description='It goes offline for everyone. Your pages are kept, and the project can be set live again at any time.'
				actionLabel='Unpublish'
				icon={<Globe />}
				onConfirm={unpublish}
			/>

			<ConfirmDeleteDialog
				open={dialog === 'delete'}
				onOpenChange={(open) => !open && setDialog(null)}
				title='Delete this project?'
				description={`"${project.name}" and everything in it (its pages and images) will be deleted. This cannot be undone.`}
				confirmText={project.name}
				actionLabel='Delete project'
				onConfirm={remove}
			/>
		</div>
	)
}

function CopyField({
	value,
	href,
	onRegenerate,
	disabled,
}: {
	value: string
	href: string
	/** Shown only when the person may replace the link. */
	onRegenerate?: () => void
	disabled?: boolean
}) {
	const [copied, setCopied] = useState(false)

	return (
		<div className='flex items-center gap-2'>
			<Input
				readOnly
				aria-label='Preview link'
				value={value}
				onFocus={(event) => event.currentTarget.select()}
				className='font-mono text-xs'
			/>
			<Button
				type='button'
				variant='secondary'
				onClick={async () => {
					await navigator.clipboard.writeText(value)
					setCopied(true)
					setTimeout(() => setCopied(false), 2000)
				}}>
				{copied ? <Check /> : <Copy />}
				{copied ? 'Copied' : 'Copy'}
			</Button>
			<Button asChild variant='secondary' size='icon' aria-label='Open the preview'>
				<a href={href} target='_blank' rel='noreferrer'>
					<ExternalLink />
				</a>
			</Button>
			{onRegenerate && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type='button'
							variant='secondary'
							size='icon'
							aria-label='Make a new link and kill the old one'
							onClick={onRegenerate}
							disabled={disabled}>
							<RefreshCw />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Make a new link and kill the old one</TooltipContent>
				</Tooltip>
			)}
		</div>
	)
}
