'use client'

/**
 * Add and remove tags on many images at once.
 *
 * Add uses the same box as the detail panel (so the same autocomplete, and the same
 * "Use Kitchen" nudge), but stages what it collects as chips instead of sending it:
 * nothing happens until Apply, and Apply says what it will do. Remove offers the tags
 * the target images carry as checkable chips ("Kitchen, 12 of 40"), with a typed
 * fallback for a tag that is not listed (a bulk action on "all matching" only knows the
 * top 30).
 *
 * The decisions are pure (`summarizeBulk`, `parseRemoveInput`, `sanitizeExisting`) and
 * exported; `BulkTagForm` is the body, mounted only while the dialog is open so a
 * second visit never shows the first one's leftovers.
 */
import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { slugify } from '@/lib/media/text'
import { MEDIA_LIMITS } from '@/lib/media/types'
import { cn } from '@/lib/utils'
import type { BulkTagDialogProps } from './contracts'
import { formatCount, pluralize } from './format'
import {
	TAG_INPUT_CHARS_MAX,
	TAG_LABELS_PER_CALL,
	TagInput,
	cleanTagLabel,
	describeParse,
	escapeBelongsToList,
	existingOf,
	messageOf,
	parseTagInput,
	splitTagList,
	useReturnFocus,
} from './tag-editor'

/* -------------------------------------------------------------------------- */
/* Pure                                                                       */
/* -------------------------------------------------------------------------- */

export type ExistingTag = BulkTagDialogProps['existing'][number]

/** Remove offers this many tags as chips; a longer list is a typed search away. */
export const EXISTING_SHOWN_MAX = 200
/** Rows read at all, so a hostile list cannot stall the sort. */
const EXISTING_READ_MAX = 5000

/**
 * The tags the target images carry, as the page counted them. Data from another
 * component is still data: rows without a slug are dropped, a repeat keeps its first
 * entry, a count cannot exceed the number of images or be negative, the most common
 * come first (the contract says so; this makes it true) and only the first
 * `EXISTING_SHOWN_MAX` are kept.
 */
export function sanitizeExisting(
	existing: readonly ExistingTag[] | null | undefined,
	total: number,
): ExistingTag[] {
	const cap = Number.isFinite(total) && total > 0 ? Math.floor(total) : Infinity
	const seen = new Set<string>()
	const out: ExistingTag[] = []
	for (const tag of Array.isArray(existing) ? existing : []) {
		if (out.length >= EXISTING_READ_MAX) break
		if (!tag || typeof tag.slug !== 'string') continue
		const slug = tag.slug.trim()
		if (!slug || seen.has(slug)) continue
		seen.add(slug)
		const label = typeof tag.label === 'string' && tag.label.trim() ? tag.label.trim() : slug
		const n = typeof tag.count === 'number' && Number.isFinite(tag.count) ? tag.count : 0
		out.push({ slug, label, count: Math.min(cap, Math.max(0, Math.floor(n))) })
	}
	return out
		.map((tag, index) => ({ tag, index }))
		.sort((a, b) => b.tag.count - a.tag.count || a.index - b.index)
		.slice(0, EXISTING_SHOWN_MAX)
		.map(({ tag }) => tag)
}

/** `12 of 40`: how many of the target images carry it. */
export function existingCaption(tag: Pick<ExistingTag, 'count'>, total: number): string {
	const n = Math.max(0, Math.floor(tag.count))
	return Number.isFinite(total) && total > 0
		? `${formatCount(n)} of ${formatCount(Math.floor(total))}`
		: formatCount(n)
}

export type ParsedRemoveInput = {
	slugs: string[]
	/** Entries with no letter or number in them, which cannot name a tag. */
	invalid: string[]
	/** The text was longer than anything sensible and was cut. */
	truncated: boolean
	/** More tags were named than one call can remove (40); the first 40 are in `slugs`. */
	capped: boolean
}

/**
 * The typed fallback for Remove. A person types what they see ("Kitchen remodel") or
 * what they remember (`kitchen-remodel`); both become the same slug.
 */
export function parseRemoveInput(text: string): ParsedRemoveInput {
	const source = typeof text === 'string' ? text : ''
	const truncated = source.length > TAG_INPUT_CHARS_MAX
	const slugs: string[] = []
	const invalid: string[] = []
	const seen = new Set<string>()
	let capped = false
	for (const raw of splitTagList(truncated ? source.slice(0, TAG_INPUT_CHARS_MAX) : source)) {
		const label = cleanTagLabel(raw)
		if (!label) continue
		const slug = slugify(label)
		if (!slug) {
			invalid.push(label)
			continue
		}
		if (seen.has(slug)) continue
		if (slugs.length >= MEDIA_LIMITS.maxTagsPerAsset) {
			capped = true
			break
		}
		seen.add(slug)
		slugs.push(slug)
	}
	return { slugs, invalid, truncated, capped }
}

export type BulkInput = {
	/** Labels already collected as chips. */
	staged: readonly string[]
	/** What is in the Add box right now, not yet turned into a chip. */
	typedAdd: string
	/** Slugs ticked in the Remove list. */
	checked: readonly string[]
	/** What is in the Remove box right now. */
	typedRemove: string
	count: number
}

export type BulkSummary = {
	/** Trimmed, non-empty labels, at most 20. */
	add: string[]
	/** Trimmed, non-empty slugs, at most 40. */
	remove: string[]
	/** Something has been entered: the rule for enabling Apply. */
	entered: boolean
	/** Why Apply is held back, in words. */
	problem: string | null
	canApply: boolean
}

const clip = (text: string, max = 40) => {
	const chars = Array.from(text)
	return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

/**
 * What Apply would send. Typed text counts as entered even before Enter (a person who
 * types "kitchen" and clicks Apply means it), but text that cannot be a tag blocks Apply
 * rather than being silently dropped, and a tag in both lists is refused: add-then-remove
 * would net to "removed and never to be tagged again".
 */
export function summarizeBulk(input: BulkInput): BulkSummary {
	const staged = [...input.staged]
	const room = Math.max(0, TAG_LABELS_PER_CALL - staged.length)
	const typed = parseTagInput(input.typedAdd, {
		existing: existingOf(staged.map((label) => ({ slug: slugify(label), source: 'manual' as const }))),
		room,
		perCall: TAG_LABELS_PER_CALL,
	})
	const add = [...staged, ...typed.labels].slice(0, TAG_LABELS_PER_CALL)

	const typedRemove = parseRemoveInput(input.typedRemove)
	const removeAll = [...new Set([...input.checked, ...typedRemove.slugs])]
	const remove = removeAll.slice(0, MEDIA_LIMITS.maxTagsPerAsset)

	let problem: string | null = null
	const notice = describeParse(typed, 'batch')
	if (notice?.tone === 'error') problem = notice.text
	else if (typedRemove.invalid.length > 0)
		problem = `"${clip(typedRemove.invalid[0])}" needs at least one letter or number to name a tag.`
	else if (typedRemove.truncated) problem = 'The list of tags to remove is too long.'
	else if (typedRemove.capped || removeAll.length > MEDIA_LIMITS.maxTagsPerAsset)
		problem = `You can remove up to ${MEDIA_LIMITS.maxTagsPerAsset} tags at a time.`
	else {
		const removing = new Set(remove)
		const both = add.find((label) => removing.has(slugify(label)))
		if (both !== undefined)
			problem = `"${clip(both)}" is in both Add and Remove. Keep it in only one.`
	}
	if (problem === null && !(input.count >= 1)) problem = 'There are no images to change.'

	const entered = add.length > 0 || remove.length > 0
	return { add, remove, entered, problem, canApply: entered && problem === null }
}

/** "Applies to 37 images": the count line under the title. */
export function applyCountLine(count: number): string {
	const n = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
	return `Applies to ${pluralize(n, 'image')}`
}

/** "Add 2 tags and remove 1 tag on 37 images." */
export function describeBulk(summary: Pick<BulkSummary, 'add' | 'remove'>, count: number) {
	const parts: string[] = []
	if (summary.add.length > 0) parts.push(`add ${pluralize(summary.add.length, 'tag')}`)
	if (summary.remove.length > 0)
		parts.push(`remove ${pluralize(summary.remove.length, 'tag')}`)
	if (parts.length === 0) return ''
	const text = parts.join(' and ')
	return `${text.charAt(0).toUpperCase()}${text.slice(1)} on ${pluralize(count, 'image')}.`
}

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

const chipButton =
	'cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none'

export type BulkTagFormProps = Pick<
	BulkTagDialogProps,
	'count' | 'existing' | 'fetchSuggestions' | 'onSubmit'
> & {
	onClose(): void
	/** Shared with the dialog so Esc and the overlay can refuse to close mid-request. */
	busy: { current: boolean }
}

export function BulkTagForm({
	count,
	existing,
	fetchSuggestions,
	onSubmit,
	onClose,
	busy,
}: BulkTagFormProps) {
	const baseId = useId()
	const addId = `${baseId}-add`
	const removeId = `${baseId}-remove`
	const removeTitleId = `${baseId}-remove-title`
	const [staged, setStaged] = useState<string[]>([])
	const [typedAdd, setTypedAdd] = useState('')
	const [checked, setChecked] = useState<string[]>([])
	const [typedRemove, setTypedRemove] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const tags = useMemo(() => sanitizeExisting(existing, count), [existing, count])
	const stagedMap = useMemo(
		() => existingOf(staged.map((label) => ({ slug: slugify(label), source: 'manual' as const }))),
		[staged],
	)
	const summary = summarizeBulk({ staged, typedAdd, checked, typedRemove, count })

	const stage = (labels: string[]) =>
		setStaged((current) => {
			const seen = new Set(current.map((label) => slugify(label)))
			const next = [...current]
			for (const label of labels) {
				const slug = slugify(label)
				if (!slug || seen.has(slug) || next.length >= TAG_LABELS_PER_CALL) continue
				seen.add(slug)
				next.push(label)
			}
			return next
		})

	const toggle = (slug: string) => {
		setError(null)
		setChecked((current) =>
			current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
		)
	}

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		if (busy.current || !summary.canApply) return
		busy.current = true
		setPending(true)
		setError(null)
		try {
			await onSubmit({ add: summary.add, remove: summary.remove })
			busy.current = false
			onClose()
		} catch (caught) {
			setError(messageOf(caught, 'Could not apply those changes. Try again.'))
		} finally {
			busy.current = false
			setPending(false)
		}
	}

	const line = describeBulk(summary, count)

	return (
		<form onSubmit={submit} noValidate aria-busy={pending || undefined} className='space-y-5'>
			<section className='space-y-2'>
				<Label htmlFor={addId}>Add tags</Label>
				<TagInput
					id={addId}
					label={null}
					existing={stagedMap}
					room={Math.max(0, TAG_LABELS_PER_CALL - staged.length)}
					roomKind='batch'
					placeholder='kitchen, remodel, before'
					disabled={pending}
					fetchSuggestions={fetchSuggestions}
					onCommit={stage}
					onDraftChange={(text) => {
						setTypedAdd(text)
						setError(null)
					}}
				/>
				<p className='text-xs text-slate-500'>
					Separate tags with commas. Up to {TAG_LABELS_PER_CALL} at a time.
				</p>
				{staged.length > 0 && (
					<ul aria-label='Tags to add' className='flex flex-wrap gap-1.5'>
						{staged.map((label) => (
							<li
								key={slugify(label)}
								data-slot='staged-tag'
								className='inline-flex min-h-7 max-w-full items-center rounded-full border border-brand/30 bg-brand/10 text-xs text-brand'>
								<span dir='auto' className='min-w-0 truncate py-1 pr-1 pl-2.5'>
									{label}
								</span>
								<button
									type='button'
									disabled={pending}
									aria-label={`Do not add ${label}`}
									onClick={() =>
										setStaged((current) =>
											current.filter((item) => slugify(item) !== slugify(label)),
										)
									}
									className={cn(
										chipButton,
										'mr-0.5 grid size-6 shrink-0 place-items-center rounded-full hover:bg-white/15',
									)}>
									<X aria-hidden className='size-3' />
								</button>
							</li>
						))}
					</ul>
				)}
			</section>

			<section aria-labelledby={removeTitleId} className='space-y-2'>
				<h3 id={removeTitleId} className='text-sm leading-none font-medium'>
					Remove tags
				</h3>
				{tags.length > 0 ? (
					<ul
						aria-label='Tags on these images'
						className='flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1'>
						{tags.map((tag) => {
							const on = checked.includes(tag.slug)
							return (
								<li key={tag.slug}>
									<label
										className={cn(
											'inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors motion-reduce:transition-none',
											'has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
											'has-disabled:cursor-not-allowed has-disabled:opacity-60',
											on
												? 'border-destructive/50 bg-destructive/10 text-white'
												: 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/8',
										)}>
										<input
											type='checkbox'
											className='peer sr-only'
											checked={on}
											disabled={pending}
											onChange={() => toggle(tag.slug)}
										/>
										{on && <Check aria-hidden className='size-3 shrink-0 text-destructive' />}
										<span dir='auto' className='min-w-0 truncate'>
											{tag.label}
										</span>
										<span className='sr-only'>, </span>
										<span className='shrink-0 text-slate-400 tabular-nums'>
											{existingCaption(tag, count)}
										</span>
									</label>
								</li>
							)
						})}
					</ul>
				) : (
					<p className='text-xs text-slate-500'>
						No tags to list for these images. Type one below to remove it.
					</p>
				)}
				<div className='space-y-1.5'>
					<Label htmlFor={removeId} className='text-xs text-slate-400'>
						Or type tags to remove
					</Label>
					<Input
						id={removeId}
						type='text'
						value={typedRemove}
						disabled={pending}
						autoComplete='off'
						autoCorrect='off'
						spellCheck={false}
						placeholder='old-logo, draft'
						onChange={(event) => {
							setTypedRemove(event.target.value)
							setError(null)
						}}
						onKeyDown={(event) => {
							// Enter here is not "Apply": a tap too many must not change forty images.
							if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault()
						}}
						className='h-9 border-white/10 bg-white/3 text-white placeholder:text-slate-500 focus-visible:border-brand/60 focus-visible:ring-brand/20'
					/>
				</div>
			</section>

			<div aria-live='polite' className='min-h-5 space-y-1 text-sm'>
				{line && summary.problem === null && <p className='text-slate-300'>{line}</p>}
				{summary.problem && <p className='text-destructive'>{summary.problem}</p>}
			</div>
			{error && (
				<p role='alert' className='text-sm text-destructive'>
					{error}
				</p>
			)}

			<DialogFooter>
				<Button type='button' variant='outline' disabled={pending} onClick={onClose}>
					Cancel
				</Button>
				<Button
					type='submit'
					disabled={!summary.canApply || pending}
					aria-busy={pending || undefined}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					{pending && <Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' />}
					Apply
				</Button>
			</DialogFooter>
		</form>
	)
}

export function BulkTagDialog({
	open,
	onOpenChange,
	count,
	existing,
	fetchSuggestions,
	onSubmit,
}: BulkTagDialogProps) {
	const busy = useRef(false)
	const returnFocus = useReturnFocus(open)
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// A request in flight cannot be abandoned by Esc or a click outside.
				if (!next && busy.current) return
				onOpenChange(next)
			}}>
			<DialogContent
				className='sm:max-w-lg motion-reduce:animate-none! motion-reduce:duration-0!'
				onCloseAutoFocus={returnFocus}
				onEscapeKeyDown={(event) => {
					// The open suggestion list takes the first Esc.
					if (escapeBelongsToList(event.target)) event.preventDefault()
				}}>
				<DialogHeader>
					<DialogTitle>Tag images</DialogTitle>
					<DialogDescription>{applyCountLine(count)}</DialogDescription>
				</DialogHeader>
				<BulkTagForm
					count={count}
					existing={existing}
					fetchSuggestions={fetchSuggestions}
					onSubmit={onSubmit}
					busy={busy}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	)
}
