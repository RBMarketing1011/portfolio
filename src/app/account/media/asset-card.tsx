'use client'

import Image from 'next/image'
import { memo, useRef, useState } from 'react'
import { Check, Film, ImageOff, Layers, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DRAG_MIME, type Density } from '@/app/account/media/contracts'
import {
	formatBytes,
	formatDimensions,
	taggingLabel,
} from '@/app/account/media/format'
import type { MediaAssetDTO } from '@/lib/media/types'

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported so the proof can drive them without a DOM)          */
/* -------------------------------------------------------------------------- */

/** Marks the checkbox so a drag that began on it can be recognised and refused. */
const CHECKBOX_ATTR = 'data-card-checkbox'

export type ClickIntent = 'open' | 'toggle' | 'range'

/**
 * What a click on the card body means. A keyboard activation (`detail` 0) always
 * opens: Enter opens and Space is handled in the key handlers, so a Shift held
 * while pressing Enter must not turn into a range select.
 */
export function cardClickIntent(event: {
	shiftKey: boolean
	ctrlKey: boolean
	metaKey: boolean
	detail: number
}): ClickIntent {
	if (event.detail === 0) return 'open'
	if (event.shiftKey) return 'range'
	if (event.ctrlKey || event.metaKey) return 'toggle'
	return 'open'
}

/** Dragging a selected card drags the whole selection; dragging any other card drags just it. */
export function dragIdsFor(id: string, selectedIds: ReadonlySet<string>) {
	return selectedIds.has(id) ? [...selectedIds] : [id]
}

type DragOrigin = { closest?: (selector: string) => unknown } | null | undefined

/**
 * `dragstart` fires on the draggable card, never on the child the pointer went down on,
 * so the card remembers where the press began and this refuses a drag that started on
 * the checkbox (a slightly shaky click on it must not pick the card up).
 */
export function beginAssetDrag(options: {
	id: string
	selectedIds: ReadonlySet<string>
	origin: DragOrigin
	dataTransfer: {
		setData(type: string, data: string): void
		effectAllowed: string
	} | null
	preventDefault(): void
}): string[] | null {
	const { id, selectedIds, origin, dataTransfer, preventDefault } = options
	const fromCheckbox =
		!!origin &&
		typeof origin.closest === 'function' &&
		!!origin.closest(`[${CHECKBOX_ATTR}]`)
	if (fromCheckbox || !dataTransfer) {
		preventDefault()
		return null
	}
	const ids = dragIdsFor(id, selectedIds)
	dataTransfer.setData(DRAG_MIME, JSON.stringify(ids))
	dataTransfer.effectAllowed = 'move'
	return ids
}

/** A blur placeholder is only passed on when it really is an image data URL. */
export const isBlurDataUrl = (value: unknown): value is string =>
	typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)

/** next/image throws on an empty or malformed src, which would take the whole grid down. */
export const isUsableSrc = (value: unknown): value is string =>
	typeof value === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(value)

export const cardSizes: Record<Density, string> = {
	compact:
		'(min-width: 1536px) 12vw, (min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw',
	comfortable:
		'(min-width: 1536px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw',
	large: '(min-width: 1024px) 30vw, (min-width: 768px) 33vw, 50vw',
}

export function cardDisplayName(asset: Pick<MediaAssetDTO, 'name' | 'filename'>) {
	const name = typeof asset.name === 'string' ? asset.name.trim() : ''
	if (name) return name
	const filename = typeof asset.filename === 'string' ? asset.filename.trim() : ''
	return filename || 'Untitled image'
}

const hasSize = (asset: Pick<MediaAssetDTO, 'width' | 'height'>) =>
	Number.isFinite(asset.width) &&
	Number.isFinite(asset.height) &&
	asset.width > 0 &&
	asset.height > 0

export function cardAriaLabel(asset: MediaAssetDTO) {
	const parts = [cardDisplayName(asset)]
	if (hasSize(asset)) parts.push(formatDimensions(asset))
	if (asset.animated) parts.push('animated')
	if (asset.hasAlpha) parts.push('transparent')
	const status = asset.tagging?.status
	if (status === 'pending' || status === 'running') parts.push('tagging')
	return parts.join(', ')
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export type AssetCardProps = {
	asset: MediaAssetDTO
	density: Density
	selected: boolean
	active: boolean
	/** The checkbox is always visible (selecting, or something is selected). */
	showCheckbox: boolean
	canDrag: boolean
	showFolderPath: boolean
	showMatch: boolean
	/** Read at dragstart, so the card does not re-render on every selection change. */
	getSelectedIds: () => ReadonlySet<string>
	onOpen(id: string): void
	onToggleSelect(id: string, opts: { range: boolean }): void
}

export const AssetCard = memo(function AssetCard({
	asset,
	density,
	selected,
	active,
	showCheckbox,
	canDrag,
	showFolderPath,
	showMatch,
	getSelectedIds,
	onOpen,
	onToggleSelect,
}: AssetCardProps) {
	const [failed, setFailed] = useState(false)
	const origin = useRef<EventTarget | null>(null)

	const name = cardDisplayName(asset)
	const tagging = asset.tagging?.status
	const isTagging = tagging === 'pending' || tagging === 'running'
	const tags = Array.isArray(asset.tags) ? asset.tags : []
	const showImage = isUsableSrc(asset.url) && !failed
	const gif = asset.format === 'gif' || asset.contentType === 'image/gif'
	const matchFields =
		showMatch && asset.match && Array.isArray(asset.match.fields)
			? asset.match.fields.filter(
					(field) => typeof field === 'string' && field.trim(),
				)
			: []

	const meta = [
		hasSize(asset) ? formatDimensions(asset) : null,
		formatBytes(asset.bytes),
	]
		.filter(Boolean)
		.join(' · ')

	const tagLine =
		tags.length === 0
			? 'No tags'
			: `${tags
					.slice(0, 2)
					.map((tag) => tag.label)
					.join(', ')}${tags.length > 2 ? ` +${tags.length - 2}` : ''}`

	return (
		<li
			data-slot='asset-card'
			data-selected={selected ? 'true' : 'false'}
			data-active={active ? 'true' : 'false'}
			draggable={canDrag ? true : undefined}
			onMouseDown={canDrag ? (event) => (origin.current = event.target) : undefined}
			onDragStart={
				canDrag
					? (event) =>
							beginAssetDrag({
								id: asset.id,
								selectedIds: getSelectedIds(),
								origin: origin.current as DragOrigin,
								dataTransfer: event.dataTransfer,
								preventDefault: () => event.preventDefault(),
							})
					: undefined
			}
			className={cn(
				'group/card relative min-w-0 rounded-xl select-none',
				selected && 'ring-2 ring-brand',
			)}>
			<div
				className={cn(
					'flex h-full flex-col overflow-hidden rounded-xl border transition-colors',
					active
						? 'border-brand/50 bg-white/8'
						: 'border-white/10 bg-white/3 hover:bg-white/5',
				)}>
				<button
					type='button'
					aria-label={cardAriaLabel(asset)}
					aria-current={active ? 'true' : undefined}
					onClick={(event) => {
						const intent = cardClickIntent(event)
						if (intent === 'open') onOpen(asset.id)
						else onToggleSelect(asset.id, { range: intent === 'range' })
					}}
					onKeyDown={(event) => {
						if (event.key !== ' ' && event.key !== 'Spacebar') return
						// Space toggles; the browser's own Space-to-click would open it.
						event.preventDefault()
						if (event.repeat) return
						onToggleSelect(asset.id, { range: event.shiftKey })
					}}
					onKeyUp={(event) => {
						// Firefox fires the click on keyup, so it has to be cancelled there too.
						if (event.key === ' ' || event.key === 'Spacebar')
							event.preventDefault()
					}}
					className='flex w-full flex-1 cursor-pointer flex-col text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white'>
					<span className='relative block aspect-square w-full bg-white/5'>
						{showImage ? (
							<Image
								src={asset.url}
								alt=''
								fill
								sizes={cardSizes[density]}
								draggable={false}
								unoptimized={gif}
								{...(isBlurDataUrl(asset.blur)
									? { placeholder: 'blur' as const, blurDataURL: asset.blur }
									: {})}
								onError={() => setFailed(true)}
								className='object-cover'
							/>
						) : (
							<span className='absolute inset-0 flex items-center justify-center text-slate-500'>
								<ImageOff className='size-6' />
							</span>
						)}
						{isTagging ? (
							<>
								<span
									aria-hidden='true'
									className='pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent motion-safe:animate-pulse'
								/>
								<span
									data-slot='tagging-badge'
									className='absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-slate-100'>
									<Sparkles className='size-3 text-brand' />
									{taggingLabel(tagging)}
								</span>
							</>
						) : null}
						{asset.animated || asset.hasAlpha ? (
							<span className='absolute top-1.5 right-1.5 inline-flex items-center gap-1'>
								{asset.animated ? (
									<span
										data-slot='animated-icon'
										title='Animated'
										className='grid size-5 place-items-center rounded bg-black/65 text-slate-100'>
										<Film className='size-3' />
									</span>
								) : null}
								{asset.hasAlpha ? (
									<span
										data-slot='transparent-icon'
										title='Has transparency'
										className='grid size-5 place-items-center rounded bg-black/65 text-slate-100'>
										<Layers className='size-3' />
									</span>
								) : null}
							</span>
						) : null}
					</span>
					<span className='block min-w-0 space-y-0.5 p-2.5'>
						<span
							title={name}
							className='block truncate text-sm font-medium text-white'>
							{name}
						</span>
						<span className='block truncate text-xs text-slate-400'>{meta}</span>
						{density !== 'compact' ? (
							<span
								data-slot='tag-line'
								className='block truncate text-xs text-slate-500'>
								{tagLine}
							</span>
						) : null}
						{showFolderPath ? (
							<span
								data-slot='folder-path'
								title={asset.folderPath || 'Unfiled'}
								className='block truncate text-xs text-slate-500'>
								{asset.folderPath || 'Unfiled'}
							</span>
						) : null}
						{matchFields.length > 0 ? (
							<span
								data-slot='match-line'
								className='block truncate text-xs text-brand'>
								Matched: {matchFields.join(', ')}
							</span>
						) : null}
					</span>
				</button>
				<button
					type='button'
					role='checkbox'
					aria-checked={selected}
					aria-label={`Select ${name}`}
					// Space on the card already toggles, so the checkbox is not another stop per card.
					tabIndex={-1}
					draggable={false}
					{...{ [CHECKBOX_ATTR]: '' }}
					onClick={(event) =>
						onToggleSelect(asset.id, { range: event.shiftKey })
					}
					className={cn(
						'absolute top-0.5 left-0.5 z-10 grid size-9 cursor-pointer place-items-center',
						showCheckbox || selected
							? 'opacity-100'
							: 'opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
					)}>
					<span
						className={cn(
							'grid size-5 place-items-center rounded border-2 transition-colors',
							selected
								? 'border-brand bg-brand text-white'
								: 'border-white/80 bg-black/50 text-transparent',
						)}>
						<Check className='size-3.5' strokeWidth={3} />
					</span>
				</button>
			</div>
		</li>
	)
})
