'use client'

/**
 * The review view after a build lands (section 13.8): what was built, what the AI
 * adjusted, the placeholders the owner still has to fill (each with "Show me"), and the
 * business details it filled in. State in, callbacks out.
 */
import Link from 'next/link'
import { ChevronDown, Undo2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { NeedsInput } from '@/lib/builder/ai/contract'
import { landedCopy, type LandedState } from './ai-build-runner'

export type ReviewItem = { item: NeedsInput; page: string; section: string }

export type ReviewProps = {
	state: LandedState
	/** The placeholders still on the site, with the names to show them by. */
	needsInput: ReviewItem[]
	/** The landing is still the newest step, so Undo here undoes exactly it. */
	canUndo: boolean
	/** Business details the landing filled in. */
	filled: { label: string; value: string }[]
	siteId: string
	onUndo: () => void
	onShowMe: (item: NeedsInput) => void
	onDone: () => void
}

function Heading({ children }: { children: React.ReactNode }) {
	return <h3 className='text-sm font-semibold text-white'>{children}</h3>
}

export function AiBuildReview({ state, needsInput, canUndo, filled, siteId, onUndo, onShowMe, onDone }: ReviewProps) {
	const copy = landedCopy(state, needsInput.length)
	const issues = [
		...state.build.issues,
		...state.build.pages.flatMap((page) => page.issues),
	]
	const adjusted = [
		...new Set([
			...issues.filter((issue) => issue.level === 'info').map((issue) => issue.message),
			...issues.filter((issue) => issue.level === 'warn').map((issue) => issue.message),
			...state.summary.notes,
			...state.landing.skipped.map((page) => `${page.name} was not added: ${page.reason}`),
		]),
	].filter(Boolean)

	const byPage = new Map<string, ReviewItem[]>()
	for (const entry of needsInput) {
		const list = byPage.get(entry.item.pageId) ?? []
		list.push(entry)
		byPage.set(entry.item.pageId, list)
	}

	return (
		<>
			<ScrollArea className='min-h-0 flex-1 px-6'>
				<div className='grid gap-5 pb-4'>
					<Alert>
						<AlertTitle>{copy.title}</AlertTitle>
						<AlertDescription className='grid gap-3'>
							<p>{copy.description}</p>
							{canUndo ? (
								<Button size='sm' variant='outline' onClick={onUndo}>
									<Undo2 /> Undo
								</Button>
							) : (
								<p>Use Undo in the toolbar to step back.</p>
							)}
						</AlertDescription>
					</Alert>

					{adjusted.length > 0 && (
						<section className='grid gap-2'>
							<Heading>Adjusted for you</Heading>
							<ul className='grid list-disc gap-1 pl-5 text-sm text-muted-foreground'>
								{adjusted.map((message) => (
									<li key={message}>{message}</li>
								))}
							</ul>
						</section>
					)}

					<Separator />

					<section className='grid gap-2'>
						<Heading>Needs your input</Heading>
						{needsInput.length === 0 ? (
							<p className='text-sm text-muted-foreground'>Nothing left to fill in.</p>
						) : (
							[...byPage.values()].map((entries) => (
								<Collapsible key={entries[0].item.pageId} defaultOpen>
									<CollapsibleTrigger asChild>
										<Button variant='ghost' size='sm' className='w-full justify-between px-2'>
											<span>{entries[0].page}</span>
											<span className='flex items-center gap-2'>
												<Badge variant='secondary'>{entries.length}</Badge>
												<ChevronDown />
											</span>
										</Button>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<ul className='grid gap-1 py-1 pl-2'>
											{entries.map((entry) => (
												<li
													key={`${entry.item.blockId}:${entry.item.path}:${entry.item.text}`}
													className='flex items-center justify-between gap-3 text-sm'>
													<span className='min-w-0 text-muted-foreground'>
														<span className='font-medium text-white'>{entry.item.text}</span> · {entry.page} ›{' '}
														{entry.section}
													</span>
													<Button variant='link' size='sm' onClick={() => onShowMe(entry.item)}>
														Show me
													</Button>
												</li>
											))}
										</ul>
									</CollapsibleContent>
								</Collapsible>
							))
						)}
					</section>

					{filled.length > 0 && (
						<>
							<Separator />
							<section className='grid gap-2'>
								<Heading>Filled in your business details</Heading>
								<ul className='grid gap-1 text-sm text-muted-foreground'>
									{filled.map((field) => (
										<li key={field.label}>
											<span className='text-white'>{field.label}:</span> {field.value}
										</li>
									))}
								</ul>
								<Button variant='link' size='sm' className='justify-self-start px-0' asChild>
									<Link href={`/account/projects/${siteId}`} target='_blank' rel='noreferrer'>
										Open the business details
									</Link>
								</Button>
							</section>
						</>
					)}
				</div>
			</ScrollArea>
			<DialogFooter className='border-t p-6 pt-4'>
				<Button onClick={onDone}>Done</Button>
			</DialogFooter>
		</>
	)
}
