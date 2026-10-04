'use client'

import {
	useCallback,
	useEffect,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from 'react'
import { Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AiStatusBannerProps } from '@/app/account/media/contracts'
import { pluralize } from '@/app/account/media/format'

export const AI_OFF_HEADLINE = 'Auto-tagging is off.'
export const AI_OFF_HOWTO =
	'Add ANTHROPIC_API_KEY to your environment to turn on AI tags. Colours, size and file-name tags still work.'

const OFF_KEY = 'rb.media.ai.off'
const SKIPPED_KEY = 'rb.media.ai.skipped'

/** A count from the network: only a positive whole number is believed. */
const safeCount = (n: unknown) =>
	typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0

export type AiNote =
	| { kind: 'blocked'; tone: 'warning'; message: string }
	| { kind: 'off'; tone: 'info' }
	| { kind: 'budget'; tone: 'warning'; resetsAt: string | null }
	| { kind: 'working'; tone: 'progress'; pending: number }
	| { kind: 'failed'; tone: 'warning'; count: number }
	| { kind: 'skipped'; tone: 'info'; count: number }

/**
 * The one thing worth saying, or nothing. The header has room for a single line, so the
 * states are ranked rather than stacked:
 *
 *  1. blocked: a bad key, billing or model stops every image, so it comes first, verbatim
 *  2. no key: nothing else about AI applies (there is no budget, queue or failure to talk
 *     about), so it is the only note; it needs untagged images to be worth saying
 *  3. daily limit reached: when it clears
 *  4. working: the progress line
 *  5. failed: with Retry
 *  6. added before a key existed: with "Tag them now"
 */
export function describeAiStatus({
	status,
	pending,
	working,
	blockedMessage,
}: Pick<
	AiStatusBannerProps,
	'status' | 'pending' | 'working' | 'blockedMessage'
>): AiNote | null {
	if (typeof blockedMessage === 'string' && blockedMessage.trim())
		return { kind: 'blocked', tone: 'warning', message: blockedMessage }
	if (status && !status.configured)
		return safeCount(status.untagged) > 0 ? { kind: 'off', tone: 'info' } : null
	if (status?.budgetExhausted)
		return {
			kind: 'budget',
			tone: 'warning',
			resetsAt: typeof status.resetsAt === 'string' ? status.resetsAt : null,
		}
	const waiting = safeCount(pending)
	if (working && waiting > 0) return { kind: 'working', tone: 'progress', pending: waiting }
	if (status) {
		const failed = safeCount(status.failed)
		if (failed > 0) return { kind: 'failed', tone: 'warning', count: failed }
		const skipped = safeCount(status.skipped)
		if (skipped > 0) return { kind: 'skipped', tone: 'info', count: skipped }
	}
	return null
}

/** Whole local calendar days from `from` to `to`, read in `timeZone`. */
function dayDifference(from: Date, to: Date, timeZone?: string) {
	const key = (date: Date) => {
		const parts = new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			timeZone,
		}).formatToParts(date)
		const read = (type: string) =>
			Number(parts.find((part) => part.type === type)?.value ?? 0)
		return Date.UTC(read('year'), read('month') - 1, read('day'))
	}
	return Math.round((key(to) - key(from)) / 86_400_000)
}

/**
 * "at 5:00 PM", "tomorrow at 9:00 AM", or null when `resetsAt` is missing or not a date.
 * A reset already in the past says nothing useful about when, so it reads "shortly".
 */
export function formatResumeTime(
	resetsAt: string | null | undefined,
	options: { now?: Date; timeZone?: string; locale?: string } = {},
) {
	const date = typeof resetsAt === 'string' ? new Date(resetsAt) : null
	if (!date || Number.isNaN(date.getTime())) return null
	const { now = new Date(), timeZone, locale } = options
	if (date.getTime() <= now.getTime()) return 'shortly'
	try {
		// A 24-hour locale writes 01:05, not 1:05; a 12-hour one writes 1:05 PM, not 01:05 PM.
		const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions()
			.hourCycle
		const time = new Intl.DateTimeFormat(locale, {
			hour: cycle === 'h23' || cycle === 'h24' ? '2-digit' : 'numeric',
			minute: '2-digit',
			timeZone,
		}).format(date)
		const days = dayDifference(now, date, timeZone)
		if (days <= 0) return `at ${time}`
		if (days === 1) return `tomorrow at ${time}`
		const day = new Intl.DateTimeFormat(locale, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone,
		}).format(date)
		return `on ${day} at ${time}`
	} catch {
		// An unknown time zone name or locale.
		return null
	}
}

/** The same reset in UTC, which is what the server and the first client render can both say. */
export function formatResumeUtc(resetsAt: string | null | undefined) {
	const date = typeof resetsAt === 'string' ? new Date(resetsAt) : null
	if (!date || Number.isNaN(date.getTime())) return null
	const time = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone: 'UTC',
	}).format(date)
	return `at ${time} UTC`
}

const subscribeNever = () => () => {}

/** False on the server and during hydration, true afterwards: local time is only knowable then. */
function useIsClient() {
	return useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false,
	)
}

/** Remembered for the tab's session (not forever), and held in memory when storage is blocked. */
function useSessionDismissal(key: string) {
	const [dismissed, setDismissed] = useState(false)
	useEffect(() => {
		try {
			if (window.sessionStorage.getItem(key) === '1') setDismissed(true)
		} catch {
			// Blocked storage: the note simply returns on the next visit.
		}
	}, [key])
	const dismiss = useCallback(() => {
		setDismissed(true)
		try {
			window.sessionStorage.setItem(key, '1')
		} catch {
			// Kept in memory for this page view.
		}
	}, [key])
	return [dismissed, dismiss] as const
}

const TONES = {
	info: 'border-white/10 bg-white/3 text-slate-300',
	progress: 'border-white/10 bg-white/3 text-slate-300',
	warning: 'border-amber-400/25 bg-amber-400/8 text-amber-200/90',
} as const

const actionButton =
	'h-6 shrink-0 border border-white/15 px-2 text-xs text-white hover:bg-white/10 dark:hover:bg-white/10'

/**
 * Not a live region: the library's own region already announces tagging progress and
 * errors, and two would read the same news twice.
 */
export function AiStatusBanner({
	status,
	pending,
	working,
	blockedMessage,
	canWrite,
	onTagUntagged,
	onRetryFailed,
}: AiStatusBannerProps) {
	const isClient = useIsClient()
	const [offDismissed, dismissOff] = useSessionDismissal(OFF_KEY)
	const [skippedDismissed, dismissSkipped] = useSessionDismissal(SKIPPED_KEY)

	const note = describeAiStatus({ status, pending, working, blockedMessage })
	if (!note) return null
	if (note.kind === 'off' && offDismissed) return null
	if (note.kind === 'skipped' && skippedDismissed) return null

	const Icon =
		note.tone === 'progress' ? LoaderCircle : note.tone === 'warning' ? TriangleAlert : Info

	let body: ReactNode = null
	let action: ReactNode = null
	let dismiss: (() => void) | null = null

	switch (note.kind) {
		case 'blocked':
			body = note.message
			break
		case 'off':
			body = (
				<>
					<strong className='font-medium text-white'>{AI_OFF_HEADLINE}</strong>
					{` ${AI_OFF_HOWTO}`}
				</>
			)
			dismiss = dismissOff
			break
		case 'budget': {
			// Local time only once hydrated: the server's clock zone is not the person's.
			const when =
				(isClient ? formatResumeTime(note.resetsAt) : formatResumeUtc(note.resetsAt)) ??
				'tomorrow'
			body = `Daily AI tagging limit reached. Tagging resumes ${when}.`
			break
		}
		case 'working':
			body = `Auto-tagging in progress: ${pluralize(note.pending, 'image')} left`
			break
		case 'failed':
			body = `${pluralize(note.count, 'image')} could not be tagged`
			if (canWrite)
				action = (
					<Button
						type='button'
						variant='ghost'
						size='xs'
						aria-label='Retry tagging the failed images'
						onClick={onRetryFailed}
						className={actionButton}>
						Retry
					</Button>
				)
			break
		case 'skipped':
			body = `${pluralize(note.count, 'image')} ${note.count === 1 ? 'was' : 'were'} added before auto-tagging was on`
			if (canWrite)
				action = (
					<Button
						type='button'
						variant='ghost'
						size='xs'
						onClick={onTagUntagged}
						className={actionButton}>
						Tag them now
					</Button>
				)
			dismiss = dismissSkipped
			break
	}

	return (
		<div
			data-slot='ai-status-banner'
			data-kind={note.kind}
			data-tone={note.tone}
			className={cn(
				'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5',
				TONES[note.tone],
			)}>
			<Icon
				aria-hidden='true'
				className={cn(
					'mt-0.5 size-3.5 shrink-0',
					note.tone === 'progress' && 'animate-spin motion-reduce:animate-none',
				)}
			/>
			<p className='min-w-0 flex-1 wrap-break-word'>{body}</p>
			{action}
			{dismiss ? (
				<button
					type='button'
					aria-label='Dismiss this note'
					title='Dismiss'
					onClick={dismiss}
					className='grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-slate-400 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-[3px] focus-visible:ring-white/40 motion-reduce:transition-none'>
					<X aria-hidden='true' className='size-3.5' />
				</button>
			) : null}
		</div>
	)
}
