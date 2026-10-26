'use client'

/**
 * The progress view: planning, the plan card, a row per page, and what happens when a
 * build stops short (section 13.6, 13.7). State in, callbacks out, so it renders on its
 * own (the proof renders it outside the dialog for every state).
 */
import { Check, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { googleFontHref } from '@/app/builder/google-fonts'
import type { BuildMode, BuildView, Issue } from '@/lib/builder/ai/contract'
import {
	FOOTER_VARIANT_LABELS,
	HEADER_VARIANT_LABELS,
} from '@/lib/builder/page-schema'
import {
	elapsed,
	errorCopy,
	progressValue,
	writtenCount,
	type RunnerState,
	type RunPage,
} from './ai-build-runner'

export type ProgressState = Extract<
	RunnerState,
	{ phase: 'planning' | 'running' | 'ready' | 'landing' | 'stopped' }
>

export type ProgressProps = {
	state: ProgressState
	prompt: string
	mode: BuildMode
	/** The clock the elapsed times are read against. */
	now: number
	saveProfile: boolean
	units?: { limit: number; resetsAt: string }
	onSaveProfile: (value: boolean) => void
	onRetry: (key: string) => void
	onStop: () => void
	onMinimize: () => void
	onApply: () => void
	onDiscard: () => void
	onContinue: () => void
	onStartAgain: () => void
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const address = (slug: string) => (slug === '/' ? '/' : `/${slug}`)

function PlanCard({
	build,
	saveProfile,
	onSaveProfile,
}: {
	build: BuildView
	saveProfile: boolean
	onSaveProfile: (value: boolean) => void
}) {
	const design = build.design
	const chrome = build.chrome
	const sections = build.pages.reduce((sum, page) => sum + page.sections.length, 0)
	const fontHref = design ? googleFontHref([design.fonts.heading, design.fonts.body]) : null
	const notes = [...build.issues.filter((i) => i.level === 'info'), ...build.issues.filter((i) => i.level === 'warn')]
	return (
		<Card className='gap-4 py-5'>
			<CardHeader className='px-5'>
				<CardTitle>The plan</CardTitle>
			</CardHeader>
			<CardContent className='grid gap-4 px-5 text-sm'>
				{design ? (
					<div className='grid gap-3 sm:grid-cols-2'>
						<div className='flex items-center gap-3'>
							<span className='flex overflow-hidden rounded-md border' aria-hidden>
								{[design.palette.colors.background, design.palette.colors.accent, design.palette.colors.heading, design.palette.colors.body].map(
									(color, index) => (
										<span key={index} className='size-6' style={{ background: color }} />
									),
								)}
							</span>
							<span>
								<span className='font-medium text-white'>{design.palette.name}</span>
								<span className='block text-xs text-muted-foreground'>
									{capitalize(design.polarity)} · {capitalize(design.personality)}
								</span>
							</span>
						</div>
						<div>
							{fontHref && <link rel='stylesheet' href={fontHref} />}
							<span className='block text-base text-white' style={{ fontFamily: `'${design.fonts.heading}', sans-serif` }}>
								{design.fonts.heading}
							</span>
							<span className='block text-xs text-muted-foreground' style={{ fontFamily: `'${design.fonts.body}', sans-serif` }}>
								with {design.fonts.body}
							</span>
						</div>
					</div>
				) : (
					<p className='text-muted-foreground'>Your current colors, fonts and shapes stay as they are.</p>
				)}

				{chrome && (
					<div className='grid gap-2'>
						<div className='flex flex-wrap items-center gap-1.5'>
							{chrome.kept ? (
								<Badge variant='outline'>Your header and footer</Badge>
							) : (
								<>
									<Badge variant='outline'>{HEADER_VARIANT_LABELS[chrome.header]}</Badge>
									<Badge variant='outline'>{FOOTER_VARIANT_LABELS[chrome.footer]}</Badge>
								</>
							)}
						</div>
						{chrome.menu.length > 0 && (
							<div className='flex flex-wrap items-center gap-1.5'>
								<span className='text-xs text-muted-foreground'>Menu:</span>
								{chrome.menu.map((item, index) => (
									<Badge key={index} variant='secondary'>
										{item.label}
										{item.kind === 'mega' && <span className='text-brand'>Mega</span>}
									</Badge>
								))}
							</div>
						)}
					</div>
				)}

				<p className='text-muted-foreground'>
					{build.pages.length} {build.pages.length === 1 ? 'page' : 'pages'} · {sections}{' '}
					{sections === 1 ? 'section' : 'sections'} · {build.photosUsed} of your photos
				</p>

				{build.facts.length > 0 && (
					<div className='grid gap-1.5'>
						<p className='text-xs font-medium text-white'>Facts it will use:</p>
						<div className='flex flex-wrap gap-1.5'>
							{build.facts.map((fact, index) => (
								<Badge key={index} variant='secondary' className='max-w-full whitespace-normal'>
									{fact.label}: {fact.value}
								</Badge>
							))}
						</div>
					</div>
				)}

				{build.profileFill.length > 0 && (
					<div className='grid gap-2'>
						<p className='text-xs font-medium text-white'>
							Will be saved to your business details: {build.profileFill.map((fill) => fill.label).join(', ')}
						</p>
						<div className='flex items-center gap-2'>
							<Checkbox
								id='ai-save-profile'
								checked={saveProfile}
								onCheckedChange={(value) => onSaveProfile(value === true)}
							/>
							<Label htmlFor='ai-save-profile' className='font-normal'>
								Save these to my business details
							</Label>
						</div>
					</div>
				)}

				{notes.length > 0 && <NoteList notes={notes} />}
			</CardContent>
		</Card>
	)
}

function NoteList({ notes }: { notes: Issue[] }) {
	const messages = [...new Set(notes.map((note) => note.message))]
	return (
		<ul className='grid list-disc gap-1 pl-5 text-muted-foreground'>
			{messages.map((message) => (
				<li key={message}>{message}</li>
			))}
		</ul>
	)
}

function StatusCell({
	page,
	now,
	units,
	onRetry,
}: {
	page: RunPage
	now: number
	units?: ProgressProps['units']
	onRetry: (key: string) => void
}) {
	if (page.status === 'written')
		return (
			<Badge>
				<Check /> Done
			</Badge>
		)
	if (page.status === 'pending') return <Badge variant='secondary'>Queued</Badge>
	if (page.status === 'cancelled') return <Badge variant='secondary'>Stopped</Badge>
	if (page.status === 'writing') {
		const waiting = page.retryAt && page.error
		return (
			<div className='grid justify-items-start gap-1'>
				<Badge variant='outline'>
					<Loader2 className='animate-spin' /> Writing
					{page.startedAt !== null && <span className='tabular-nums text-muted-foreground'>{elapsed(now - page.startedAt)}</span>}
				</Badge>
				{waiting && page.error && (
					<span className='text-xs text-muted-foreground'>
						{errorCopy(page.error, { stage: 'page', automatic: true, units })}
					</span>
				)}
			</div>
		)
	}
	const message = page.error ? errorCopy(page.error, { stage: 'page', units }) : null
	return (
		<div className='flex flex-wrap items-center gap-2'>
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge variant='destructive' tabIndex={0}>
						Failed
					</Badge>
				</TooltipTrigger>
				<TooltipContent>{message ?? 'This page could not be written.'}</TooltipContent>
			</Tooltip>
			{page.canRetry && (
				<Button size='sm' variant='outline' onClick={() => onRetry(page.key)}>
					{page.retryCostsUnit ? 'Retry (uses 1 AI write)' : 'Retry'}
				</Button>
			)}
		</div>
	)
}

/** The Alert for a build that stopped short, with what can be done about it. */
function Outcome({ state, units, onRetry, onApply, onDiscard, onContinue, onStartAgain }: ProgressProps & { state: ProgressState }) {
	if (state.phase !== 'ready' && state.phase !== 'stopped') return null
	const { build, pages } = state
	const done = writtenCount(pages)
	const total = pages.length
	const home = pages[0]
	const newSite = build.placement === 'replace-site'
	const homeMissing = newSite && home?.status !== 'written'
	const finished = `Use the ${done} finished ${done === 1 ? 'page' : 'pages'}`

	if (state.landFailed)
		return (
			<Alert variant='destructive'>
				<AlertDescription className='grid gap-3'>
					<p>This build could not be added to your site.</p>
					<Button size='sm' onClick={onApply}>
						Try again
					</Button>
				</AlertDescription>
			</Alert>
		)

	if (state.error && state.error.code === 'home-failed')
		return (
			<Alert variant='destructive'>
				<AlertDescription className='grid gap-3'>
					<p>The home page could not be written. Start the build again.</p>
					<Button size='sm' onClick={onStartAgain}>
						Start again
					</Button>
				</AlertDescription>
			</Alert>
		)

	const landError = state.error ? errorCopy(state.error, { stage: 'land', units }) : null

	if (state.phase === 'stopped')
		return (
			<Alert>
				<AlertDescription className='grid gap-3'>
					<p>
						Building stopped. {done} of {total} pages were finished.
					</p>
					{landError && <p className='text-destructive'>{landError}</p>}
					<div className='flex flex-wrap gap-2'>
						{done > 0 && !homeMissing && (
							<Button size='sm' onClick={onApply}>
								{finished}
							</Button>
						)}
						<Button size='sm' variant='outline' onClick={onDiscard}>
							Discard
						</Button>
					</div>
				</AlertDescription>
			</Alert>
		)

	if (state.interrupted)
		return (
			<Alert>
				<AlertDescription className='grid gap-3'>
					<p>
						This build was interrupted. {done} of {total} pages are done.
					</p>
					{landError && <p className='text-destructive'>{landError}</p>}
					<div className='flex flex-wrap gap-2'>
						{done < total && (
							<Button size='sm' onClick={onContinue}>
								Continue building
							</Button>
						)}
						{done > 0 && !homeMissing && (
							<Button size='sm' variant={done < total ? 'outline' : 'default'} onClick={onApply}>
								{finished}
							</Button>
						)}
						<Button size='sm' variant='outline' onClick={onDiscard}>
							Discard
						</Button>
					</div>
				</AlertDescription>
			</Alert>
		)

	const failed = pages.filter((page) => page.status === 'failed')
	if (newSite && home?.status === 'failed' && !home.canRetry)
		return (
			<Alert variant='destructive'>
				<AlertDescription className='grid gap-3'>
					<p>The home page could not be written. Start the build again.</p>
					<Button size='sm' onClick={onStartAgain}>
						Start again
					</Button>
				</AlertDescription>
			</Alert>
		)

	if (failed.length > 0) {
		const first = failed[0]
		const reason = first.error ? errorCopy(first.error, { stage: 'page', units }) : null
		const others = failed.length > 1 ? ` (and ${failed.length - 1} more)` : ''
		return (
			<Alert variant={done > 0 ? 'default' : 'destructive'}>
				<AlertDescription className='grid gap-3'>
					<p>
						{done} of {total} pages are ready. {first.name}
						{others} could not be written{reason ? `: ${reason}` : '.'}
					</p>
					{landError && <p className='text-destructive'>{landError}</p>}
					<div className='flex flex-wrap gap-2'>
						{first.canRetry && (
							<Button size='sm' onClick={() => onRetry(first.key)}>
								Retry {first.name}
							</Button>
						)}
						{done > 0 && !homeMissing && (
							<Button size='sm' variant='outline' onClick={onApply}>
								Apply without it
							</Button>
						)}
						{done === 0 && (
							<Button size='sm' variant='outline' onClick={onStartAgain}>
								Start again
							</Button>
						)}
					</div>
				</AlertDescription>
			</Alert>
		)
	}

	// Every page is written but nothing has landed (it finished while minimized).
	return (
		<Alert>
			<AlertDescription className='grid gap-3'>
				<p>{landError ?? `Your ${build.mode === 'page' ? 'page is' : 'site is'} ready.`}</p>
				<Button size='sm' onClick={onApply}>
					Apply
				</Button>
			</AlertDescription>
		</Alert>
	)
}

/** What the live region says: the plan, then each page, then all of them. */
function announcement(state: ProgressState) {
	if (state.phase === 'planning') return ''
	const written = state.pages.filter((page) => page.status === 'written')
	if (written.length === state.pages.length) return 'All pages written'
	if (written.length > 0) return `${written[written.length - 1].name} written`
	return 'Plan ready'
}

export function AiBuildProgress(props: ProgressProps) {
	const { state, prompt, mode, now, saveProfile, units, onSaveProfile, onRetry, onStop, onMinimize } = props
	const planning = state.phase === 'planning'
	const pages = planning ? [] : state.pages
	const done = writtenCount(pages)
	const what = mode === 'page' ? 'page' : 'site'
	const value = progressValue(state)
	const active = state.phase === 'planning' || state.phase === 'running'

	return (
		<>
			<ScrollArea className='min-h-0 flex-1 px-6'>
				<div className='grid gap-5 pb-4'>
					{prompt && (
						<p className='line-clamp-2 border-l-2 border-white/15 pl-3 text-sm italic text-muted-foreground'>
							“{prompt}”
						</p>
					)}

					<div className='grid gap-2'>
						<Progress value={value} aria-valuenow={value} aria-label={`Building your ${what}`} />
						{planning && <Skeleton className='h-1 w-full' />}
						<p className='sr-only' aria-live='polite'>
							{announcement(state)}
						</p>
					</div>

					{planning ? (
						<div className='grid gap-4'>
							<div className='flex items-start gap-3'>
								<Loader2 className='mt-0.5 size-4 animate-spin text-brand' />
								<div className='grid gap-1'>
									<p className='text-sm font-medium text-white'>
										Planning your {what}{' '}
										<span className='tabular-nums text-muted-foreground'>{elapsed(now - state.startedAt)}</span>
									</p>
									<p className='text-sm text-muted-foreground'>
										Choosing pages, sections, colors and the menu. This usually takes one to two minutes.
									</p>
									{state.retrying && (
										<p className='text-sm text-muted-foreground'>
											That took too long. Trying again with a lighter pass.
										</p>
									)}
								</div>
							</div>
							<div className='grid gap-2'>
								{[0, 1, 2, 3, 4].map((row) => (
									<Skeleton key={row} className='h-9 w-full' />
								))}
							</div>
						</div>
					) : (
						<>
							<PlanCard build={state.build} saveProfile={saveProfile} onSaveProfile={onSaveProfile} />
							<Outcome {...props} state={state} />
							{state.phase === 'landing' && (
								<p className='flex items-center gap-2 text-sm text-muted-foreground'>
									<Loader2 className='size-4 animate-spin' /> Adding the pages to your site…
								</p>
							)}
							<TooltipProvider>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Page</TableHead>
											<TableHead>Address</TableHead>
											<TableHead>Sections</TableHead>
											<TableHead>Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{pages.map((page) => (
											<TableRow key={page.key}>
												<TableCell className='font-medium text-white'>{page.name}</TableCell>
												<TableCell className='text-muted-foreground'>{address(page.slug)}</TableCell>
												<TableCell className='tabular-nums'>
													{page.outlined ? page.sections.length : 'Planning…'}
												</TableCell>
												<TableCell>
													<StatusCell page={page} now={now} units={units} onRetry={onRetry} />
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</TooltipProvider>
						</>
					)}
				</div>
			</ScrollArea>
			<DialogFooter className='items-center border-t p-6 pt-4'>
				{!planning && (
					<p className='mr-auto text-sm text-muted-foreground'>
						{done} of {pages.length} pages written.
					</p>
				)}
				<Button variant='ghost' onClick={onMinimize}>
					Keep working
				</Button>
				{active && (
					<Button variant='outline' onClick={onStop}>
						Stop
					</Button>
				)}
			</DialogFooter>
		</>
	)
}
