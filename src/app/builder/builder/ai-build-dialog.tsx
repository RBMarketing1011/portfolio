'use client'

/**
 * The "Build with AI" dialog: the shell (title, description) and the switch between
 * the compose, progress and review views. Closing it while a build runs minimizes it;
 * the build carries on.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import type { NeedsInput, ProfileField } from '@/lib/builder/ai/contract'
import { useBuilder } from '@/lib/builder/builder-context'
import { getSchema } from '@/lib/builder/schema'
import type { SiteProfile } from '@/lib/builder/site-profile'
import type { Block } from '@/lib/builder/types'
import { AiBuildCompose } from './ai-build-compose'
import type { AiBuildContextValue } from './ai-build-host'
import { AiBuildProgress } from './ai-build-progress'
import { AiBuildReview, type ReviewItem } from './ai-build-review'
import { openNeedsInput, writtenCount } from './ai-build-runner'

/** The top-level block that holds a block (needs-input items can point at a card). */
function topLevelOf(blocks: Block[], id: string): Block | null {
	const holds = (block: Block): boolean =>
		block.id === id || (block.children ?? []).some((child) => holds(child))
	return blocks.find(holds) ?? null
}

/** What the stored profile now says for a field the landing may have filled. */
function profileValue(profile: SiteProfile, field: ProfileField) {
	const [group, key] = field.split('.') as ['business' | 'seo', string]
	const value = (profile[group] as Record<string, unknown>)[key]
	return Array.isArray(value) ? value.join(', ') : String(value ?? '')
}

const same = (a: string, b: string) =>
	a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()

export function AiBuildDialog({ ai }: { ai: AiBuildContextValue }) {
	const store = useBuilder()
	const router = useRouter()
	const { state, draft, runner } = ai
	const [now, setNow] = useState(() => Date.now())
	const [saveProfile, setSaveProfile] = useState(true)

	const view =
		state.phase === 'idle' || state.phase === 'failed'
			? 'compose'
			: state.phase === 'landed'
				? 'review'
				: 'progress'

	// The elapsed clocks tick only while something runs and the dialog shows them.
	const ticking = ai.dialogOpen && (state.phase === 'planning' || state.phase === 'running')
	useEffect(() => {
		if (!ticking) return
		setNow(Date.now())
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [ticking])

	// Every build starts with "Save these to my business details" checked.
	useEffect(() => {
		if (state.phase === 'planning') setSaveProfile(true)
	}, [state.phase])

	const pages = useMemo(
		() => store.pages.map((page) => ({ id: page.id, name: page.name, sections: page.blocks.length })),
		[store.pages],
	)
	const media = useMemo(
		() =>
			[...store.media]
				.sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0))
				.map((item) => ({ id: item.id, name: item.name, src: item.src })),
		[store.media],
	)

	const mode = 'build' in state ? state.build.mode : draft.mode
	const what = mode === 'page' ? 'page' : 'site'

	const review = useMemo(() => {
		if (state.phase !== 'landed') return null
		const open = openNeedsInput(state.landing.needsInput, store.site)
		const items: ReviewItem[] = open.map((item) => {
			const page = store.pages.find((p) => p.id === item.pageId)
			const block = page ? topLevelOf(page.blocks, item.blockId) : null
			return {
				item,
				page: page?.name ?? 'Page',
				section: (block && getSchema(block.type)?.label) ?? 'Section',
			}
		})
		const filled = state.build.profileFill
			.filter((fill) => same(profileValue(state.profile, fill.field), fill.value))
			.map((fill) => ({ label: fill.label, value: fill.value }))
		return { items, filled }
	}, [state, store.site, store.pages])

	let title = 'Build with AI'
	let description = 'Describe the business. The AI plans the pages, writes them and designs the site.'
	if (view === 'compose') {
		const target = draft.placement === 'replace-page' ? store.pages.find((page) => page.id === draft.targetPageId) : null
		if (target) {
			title = `Rebuild "${target.name}" with AI`
			description = 'The page keeps its name and address. Its sections are written again.'
		} else if (draft.mode === 'page') {
			description = 'Describe the page. The AI writes it and adds it to your site.'
		}
	} else if (view === 'progress') {
		title = `Building your ${what}`
		description =
			state.phase === 'planning'
				? 'Choosing pages, sections, colors and the menu.'
				: state.phase === 'stopped'
					? 'Building stopped.'
					: state.phase === 'ready' && 'pages' in state && writtenCount(state.pages) === state.pages.length
						? `Your ${what} is ready to add.`
						: 'Writing the pages. You can keep working while it runs.'
	} else if (review) {
		title = 'Built with AI'
		const count = review.items.length
		description =
			count > 0 ? `${count} ${count === 1 ? 'thing needs' : 'things need'} your input.` : 'Nothing left to fill in.'
	}

	const showMe = (item: NeedsInput) => {
		const page = store.pages.find((p) => p.id === item.pageId)
		if (!page) return
		const top = topLevelOf(page.blocks, item.blockId)?.id ?? item.blockId
		ai.minimize()
		router.push(`/builder/sites/${store.siteId}/pages/${page.id}`)
		store.setSelectedId(top)
		store.setInspectorOpen(true)
		store.showBlock(top)
	}

	const failed = state.phase === 'failed' ? state : null
	const problem =
		ai.problem ??
		(failed?.error.code === 'bad-request' && failed.error.field
			? { field: failed.error.field, message: failed.error.message }
			: null)

	return (
		<Dialog
			open={ai.dialogOpen}
			onOpenChange={(open) => {
				if (!open) ai.minimize()
			}}>
			{/* A grid, not a flex column: Radix's ScrollArea viewport is height:100%, which a
			    flex item under a max-height never resolves (the body would run over the
			    footer); a grid track clamped by the max-height does. */}
			<DialogContent
				className='grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-2xl'
				onCloseAutoFocus={(event) => {
					const back = ai.returnFocus.current
					if (back && back.isConnected) {
						event.preventDefault()
						back.focus()
					}
				}}>
				<DialogHeader className='p-6 pb-4'>
					<DialogTitle className='flex items-center gap-2'>
						<Sparkles className='size-4 text-brand' /> {title}
					</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				{view === 'compose' && (
					<AiBuildCompose
						draft={draft}
						onDraft={ai.updateDraft}
						pages={pages}
						theme={store.look.theme}
						media={media}
						uploading={ai.uploading}
						onUpload={ai.upload}
						capability={ai.capability}
						problem={problem}
						error={failed && failed.error.code !== 'bad-request' ? failed.error : null}
						refunded={Boolean(failed?.units && failed.units.refunded >= failed.units.reserved)}
						onSubmit={() => ai.submit()}
						onCancel={ai.minimize}
						onResume={(buildId) => void runner.resume(buildId)}
						onRestart={(buildId) => void runner.restart(buildId)}
					/>
				)}

				{view === 'progress' && state.phase !== 'idle' && state.phase !== 'failed' && state.phase !== 'landed' && (
					<AiBuildProgress
						state={state}
						prompt={runner.brief}
						mode={mode}
						now={now}
						saveProfile={saveProfile}
						units={ai.capability?.units}
						onSaveProfile={(value) => {
							setSaveProfile(value)
							runner.setSaveProfile(value)
						}}
						onRetry={runner.retry}
						onStop={() => void runner.stop()}
						onMinimize={ai.minimize}
						onApply={() => void ai.apply()}
						onDiscard={() => void runner.discard()}
						onContinue={runner.continueBuild}
						onStartAgain={() => void runner.startAgain()}
					/>
				)}

				{state.phase === 'landed' && review && (
					<AiBuildReview
						state={state}
						needsInput={review.items}
						canUndo={state.mark >= 0 && store.historyMark() === state.mark}
						filled={review.filled}
						siteId={store.siteId}
						onUndo={() => {
							if (state.mark >= 0 && store.historyMark() === state.mark) store.undo()
						}}
						onShowMe={showMe}
						onDone={ai.done}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}
