'use client'

import { useMemo, useRef, useState } from 'react'
import { ImageIcon, Info, Trash2, Upload, X } from 'lucide-react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useBuilder } from '@/lib/builder/builder-context'
import {
	formatBytes,
	freeStorage,
	mediaRef,
	mediaUsage,
	resolveMediaSrc,
	storageBytes,
} from '@/lib/builder/media-store'

// Uploads are inlined as data URLs, which live in localStorage, so a full-size photo
// would eat the whole budget. Downscale to something a hero can still use.
const MAX_EDGE = 1600
const MAX_UPLOAD = 12 * 1024 * 1024

async function toWebp(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file)
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
	const canvas = document.createElement('canvas')
	canvas.width = Math.round(bitmap.width * scale)
	canvas.height = Math.round(bitmap.height * scale)
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
	bitmap.close()
	// PNG screenshots re-encode far smaller as WebP with no visible loss at this size.
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/webp', 0.82),
	)
	if (!blob) throw new Error('encode failed')
	return blob
}

const blobToDataUrl = (blob: Blob) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(new Error('read failed'))
		reader.readAsDataURL(blob)
	})

/** The builder only ever offers images the user uploaded, never repo assets. */
export function MediaPicker({
	value,
	onChange,
}: {
	value: string | undefined
	onChange: (value: string | undefined) => void
}) {
	const { media, addMedia, uploadMedia, removeMedia, mediaError, remote } =
		useBuilder()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [error, setError] = useState<string | null>(null)
	const fileRef = useRef<HTMLInputElement>(null)
	const dialogFileRef = useRef<HTMLInputElement>(null)

	const shown = media.filter((item) =>
		item.name.toLowerCase().includes(query.trim().toLowerCase()),
	)
	// The stored value is a reference, so the preview has to look the image up.
	const selectedSrc = resolveMediaSrc(value) as string | undefined
	const current = media.find((item) => mediaRef(item.id) === value)

	// Re-measured whenever the library changes, since a probe is not free.
	const quota = useMemo(() => {
		if (!open || remote) return null
		const used = mediaUsage()
		const { freeBytes, atCap } = freeStorage(true)
		const average = used.count ? used.bytes / used.count : 600 * 1024
		return {
			...used,
			freeBytes,
			atCap,
			roomFor: Math.max(0, Math.floor(freeBytes / average)),
			filled: Math.min(
				100,
				Math.round((used.bytes / (used.bytes + freeBytes || 1)) * 100),
			),
		}
	}, [open, media, remote])

	const upload = async (file: File | undefined, select: boolean) => {
		if (!file) return
		if (file.size > MAX_UPLOAD) {
			setError('That image is over 12 MB. Pick a smaller one.')
			return
		}
		setError(null)
		let blob: Blob
		const name = file.name.replace(/\.[^.]+$/, '')
		try {
			blob = await toWebp(file)
		} catch {
			setError('That file could not be read as an image.')
			return
		}
		try {
			const item = remote
				? await uploadMedia(name, blob)
				: addMedia(name, await blobToDataUrl(blob))
			if (select) onChange(mediaRef(item.id))
		} catch {
			setError('That image could not be saved. Try again.')
		}
	}

	return (
		<>
			<div className='flex items-center gap-2'>
				<button
					type='button'
					onClick={() => setOpen(true)}
					className='flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/4 text-slate-500 transition-colors hover:border-brand/50'>
					{value ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img alt='' src={selectedSrc} className='size-full object-cover' />
					) : (
						<ImageIcon className='size-5' />
					)}
				</button>
				<div className='min-w-0 flex-1'>
					<Input
						readOnly
						value={value ? (current?.name ?? 'Uploaded image') : ''}
						placeholder='No image selected'
						onClick={() => setOpen(true)}
						className='cursor-pointer border-white/10 bg-white/4 text-sm'
					/>
					<div className='mt-1 flex items-center gap-3'>
						<button
							type='button'
							onClick={() => setOpen(true)}
							className='text-xs text-brand transition-colors hover:text-brand-strong'>
							Media library
						</button>
						<button
							type='button'
							onClick={() => fileRef.current?.click()}
							className='flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-white'>
							<Upload className='size-3' /> Upload
						</button>
						{value && (
							<button
								type='button'
								onClick={() => onChange(undefined)}
								className='text-xs text-slate-500 transition-colors hover:text-white'>
								Clear
							</button>
						)}
						<input
							ref={fileRef}
							type='file'
							accept='image/*'
							className='hidden'
							onChange={(event) => {
								const file = event.target.files?.[0]
								event.target.value = ''
								void upload(file, true)
							}}
						/>
					</div>
					{(error || mediaError) && (
						<p className='mt-1 text-xs text-destructive'>
							{error ?? mediaError}
						</p>
					)}
				</div>
			</div>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className='flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'>
					<DialogHeader className='shrink-0 border-b border-white/10 px-6 py-5'>
						<DialogTitle>Media library</DialogTitle>
						<DialogDescription>
							Images you have uploaded. Nothing else is available to the
							builder.
						</DialogDescription>
						<div className='mt-3 flex items-center gap-2'>
							<Input
								autoFocus
								value={query}
								placeholder='Search your uploads'
								onChange={(event) => setQuery(event.target.value)}
							/>
							<button
								type='button'
								onClick={() => dialogFileRef.current?.click()}
								className='flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-strong'>
								<Upload className='size-3.5' /> Upload
							</button>
							<input
								ref={dialogFileRef}
								type='file'
								accept='image/*'
								multiple
								className='hidden'
								onChange={async (event) => {
									const files = [...(event.target.files ?? [])]
									event.target.value = ''
									for (const file of files) await upload(file, false)
								}}
							/>
						</div>
					</DialogHeader>

					<div className='min-h-0 flex-1 overflow-y-auto'>
						<div className='px-6 py-5'>
							{remote ? (
								<div className='mb-5 rounded-lg border border-white/10 bg-white/3 px-4 py-3'>
									<p className='text-xs leading-5 text-slate-400'>
										<span className='font-medium text-white'>
											{media.length} {media.length === 1 ? 'image' : 'images'}
										</span>{' '}
										saved to this site. They are stored on our servers, so they
										follow you to any device you sign in on.
									</p>
								</div>
							) : (
								<div className='mb-5 rounded-lg border border-amber-400/25 bg-amber-400/8 px-4 py-3'>
									<p className='flex items-start gap-2 text-xs leading-5 text-amber-200/90'>
										<Info className='mt-0.5 size-3.5 shrink-0' />
										<span>
											You are not signed in, so these images are not stored on a
											server. They live in this browser only &mdash; clearing
											site data or switching devices loses them. Create an
											account to keep them for good.
										</span>
									</p>
									{quota && (
										<div className='mt-3 border-t border-amber-400/15 pt-3'>
											<div className='flex items-baseline justify-between gap-4 text-xs'>
												<span className='font-medium text-white'>
													{quota.count} {quota.count === 1 ? 'image' : 'images'}{' '}
													&middot; {formatBytes(quota.bytes)} used
												</span>
												<span className='tabular-nums text-amber-200/70'>
													room for about {quota.roomFor}
													{quota.atCap ? '+' : ''} more
												</span>
											</div>
											<div className='mt-2 h-1.5 overflow-hidden rounded-full bg-white/10'>
												<div
													className='h-full rounded-full bg-amber-400/70'
													style={{ width: `${quota.filled}%` }}
												/>
											</div>
										</div>
									)}
								</div>
							)}
							{media.length === 0 ? (
								<div className='py-14 text-center'>
									<ImageIcon className='mx-auto size-8 text-slate-600' />
									<p className='mt-4 text-sm font-medium text-white'>
										Your media library is empty
									</p>
									<p className='mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500'>
										Upload an image to use it here. Uploads stay in this browser
										until you create an account.
									</p>
								</div>
							) : (
								<div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
									{shown.map((item) => (
										<div key={item.id} className='group relative'>
											<button
												type='button'
												onClick={() => {
													onChange(mediaRef(item.id))
													setOpen(false)
												}}
												className={cn(
													'w-full overflow-hidden rounded-lg border text-left transition-colors',
													value === mediaRef(item.id)
														? 'border-brand'
														: 'border-white/10 hover:border-white/30',
												)}>
												<span className='block aspect-video bg-white/4'>
													{/* eslint-disable-next-line @next/next/no-img-element */}
													<img
														alt=''
														src={item.src}
														className='size-full object-cover'
													/>
												</span>
												<span className='block truncate px-2 py-1.5 text-xs text-slate-400'>
													{item.name}
												</span>
											</button>
											<button
												type='button'
												onClick={() => {
													if (value === mediaRef(item.id)) onChange(undefined)
													removeMedia(item.id)
												}}
												aria-label={`Delete ${item.name}`}
												className='absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md bg-ink/80 text-slate-400 opacity-0 transition-all hover:text-destructive group-hover:opacity-100'>
												<Trash2 className='size-3.5' />
											</button>
										</div>
									))}
									{shown.length === 0 && (
										<p className='col-span-full py-8 text-center text-sm text-slate-500'>
											No uploads match that search.
										</p>
									)}
								</div>
							)}
							{mediaError && (
								<p className='mt-4 text-sm text-destructive'>{mediaError}</p>
							)}
						</div>
					</div>

					{value && (
						<div className='shrink-0 border-t border-white/10 px-6 py-3'>
							<button
								type='button'
								onClick={() => {
									onChange(undefined)
									setOpen(false)
								}}
								className='flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-white'>
								<X className='size-3.5' /> Clear selection
							</button>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
