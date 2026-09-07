'use client'

import { useRef, useState } from 'react'
import { ImageIcon, Trash2, Upload, X } from 'lucide-react'
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

// Uploads are inlined as data URLs, which live in localStorage, so a full-size photo
// would eat the whole budget. Downscale to something a hero can still use.
const MAX_EDGE = 1600
const MAX_UPLOAD = 12 * 1024 * 1024

async function toDataUrl(file: File) {
	const bitmap = await createImageBitmap(file)
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
	const canvas = document.createElement('canvas')
	canvas.width = Math.round(bitmap.width * scale)
	canvas.height = Math.round(bitmap.height * scale)
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
	bitmap.close()
	// PNG screenshots re-encode far smaller as WebP with no visible loss at this size.
	return canvas.toDataURL('image/webp', 0.82)
}

/** The builder only ever offers images the user uploaded, never repo assets. */
export function MediaPicker({
	value,
	onChange,
}: {
	value: string | undefined
	onChange: (value: string | undefined) => void
}) {
	const { media, addMedia, removeMedia, mediaError } = useBuilder()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [error, setError] = useState<string | null>(null)
	const fileRef = useRef<HTMLInputElement>(null)
	const dialogFileRef = useRef<HTMLInputElement>(null)

	const shown = media.filter((item) =>
		item.name.toLowerCase().includes(query.trim().toLowerCase()),
	)
	const current = media.find((item) => item.src === value)

	const upload = async (file: File | undefined, select: boolean) => {
		if (!file) return
		if (file.size > MAX_UPLOAD) {
			setError('That image is over 12 MB. Pick a smaller one.')
			return
		}
		setError(null)
		try {
			const src = await toDataUrl(file)
			addMedia(file.name.replace(/\.[^.]+$/, ''), src)
			if (select) onChange(src)
		} catch {
			setError('That file could not be read as an image.')
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
						<img alt='' src={value} className='size-full object-cover' />
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
							Images you have uploaded. Nothing else is available to the builder.
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
													onChange(item.src)
													setOpen(false)
												}}
												className={cn(
													'w-full overflow-hidden rounded-lg border text-left transition-colors',
													value === item.src
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
													if (value === item.src) onChange(undefined)
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
