'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutTemplate, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AI_LIMITS } from '@/lib/builder/ai/contract'
import { useBuilder } from '@/lib/builder/builder-context'
import { LOCAL_SITE_ID } from '@/lib/builder/drivers'
import type { Template } from '@/lib/builder/page-schema'
import { SiteLoadError } from '../site-load-error'
import { BuilderSkeleton } from '../builder-skeleton'
import { AddPageDialog } from '../builder/add-page-dialog'
import { useAiBuild } from '../builder/ai-build-host'

const PLACEHOLDER =
	'Tell it about the business and the site you want. For example: A family-owned roofing company in Austin. We do repairs, replacements and storm damage, and help with insurance claims. Free inspections. Call (512) 555-0142.'

export function BuilderStart({
	templates,
	siteId = LOCAL_SITE_ID,
}: {
	templates: Template[]
	siteId?: string
}) {
	const router = useRouter()
	const store = useBuilder()
	const ai = useAiBuild()
	const [open, setOpen] = useState(false)
	const base = `/builder/sites/${siteId}/pages`

	// Landing on the builder with work already saved should resume it.
	useEffect(() => {
		if (!store.hydrated) return
		const target =
			store.pages.find((p) => p.id === store.pageId) ?? store.pages[0]
		if (target) router.replace(`${base}/${target.id}`)
	}, [store.hydrated, store.pages, store.pageId, router, base])

	if (store.loadError) return <SiteLoadError message={store.loadError} />

	// Pages present means the redirect above is already in flight.
	if (!store.hydrated || store.pages.length > 0) return <BuilderSkeleton />

	const draft = ai.draft
	const running =
		ai.state.phase === 'planning' || ai.state.phase === 'running' || ai.state.phase === 'landing'
	const siteDraft = { ...draft, mode: 'site' as const, placement: 'replace-site' as const, targetPageId: null }
	const build = () => {
		if (running) return ai.open()
		ai.submit(siteDraft)
	}
	const problem = ai.problem?.field === 'prompt' ? ai.problem.message : null

	return (
		<div className='flex h-screen items-center justify-center px-6'>
			<div className='w-full max-w-xl text-center'>
				<span className='mx-auto flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand'>
					<LayoutTemplate className='size-6' />
				</span>
				<h1 className='mt-6 font-display text-2xl font-semibold text-white'>
					Nothing has been built yet
				</h1>
				<p className='mt-3 leading-7 text-slate-400'>
					{ai.enabled
						? 'Tell the AI about your business, and it builds the whole site: pages, sections, copy, photos, colors and the menu.'
						: 'Start with your home page. It lives at the root of your site, and every other page comes after it.'}
				</p>

				{ai.enabled && (
					<Card className='mt-8 text-left'>
						<CardContent className='grid gap-3'>
							<Label htmlFor='ai-start-brief'>Describe your business</Label>
							<Textarea
								id='ai-start-brief'
								rows={5}
								maxLength={AI_LIMITS.promptMax}
								value={draft.prompt}
								placeholder={PLACEHOLDER}
								onChange={(event) => ai.updateDraft({ ...draft, prompt: event.target.value })}
								onKeyDown={(event) => {
									if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
										event.preventDefault()
										build()
									}
								}}
							/>
							{problem && <p className='text-sm text-destructive'>{problem}</p>}
							<div className='flex flex-wrap items-center gap-2'>
								<Button
									onClick={build}
									disabled={!running && draft.prompt.trim().length < AI_LIMITS.promptMin}
									className='bg-brand font-bold text-ink hover:bg-brand-strong'>
									<Sparkles /> {running ? 'Show the build' : 'Build my site'}
								</Button>
								<Button variant='link' onClick={() => ai.open({ mode: 'site', placement: 'replace-site' })}>
									More choices
								</Button>
							</div>
						</CardContent>
					</Card>
				)}

				<Button
					variant={ai.enabled ? 'ghost' : 'default'}
					onClick={() => setOpen(true)}
					className={
						ai.enabled ? 'mt-4' : 'mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'
					}>
					<Plus /> {ai.enabled ? 'Or start with a blank home page' : 'Add home page'}
				</Button>
			</div>

			<AddPageDialog
				usesCustomMenu={store.chrome.menu.length > 0}
				open={open}
				onOpenChange={setOpen}
				templates={templates}
				isHome
				onCreate={({ name, slug, blocks, inHeader }) => {
					const id = store.addPage(name, slug, blocks, inHeader)
					router.push(`${base}/${id}`)
				}}
			/>
		</div>
	)
}
