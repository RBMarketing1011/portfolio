'use client'

import { useRef, useState } from 'react'
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type ProjectImage = { id: string; name: string; url: string }

// What the project's upload route accepts (see api/sites/[siteId]/media/upload).
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif']
const MAX_BYTES = 12 * 1024 * 1024

/**
 * One image setting: upload a new file to the project, or reuse one it already has.
 * Uploads go browser to Blob storage, then are registered on the project, exactly as
 * the builder's own uploads are, so they show up in its image library too.
 */
export function SiteImageField({
	siteId,
	id,
	label,
	hint,
	value,
	images,
	disabled,
	preview = 'wide',
	onChange,
	onUploaded,
}: {
	siteId: string
	id: string
	label: string
	hint: string
	value: string | null
	images: ProjectImage[]
	disabled?: boolean
	/** How the current image is framed: a wide strip, a square tile, or a 1.91:1 card. */
	preview?: 'wide' | 'square' | 'card'
	onChange: (url: string | null) => void
	onUploaded: (image: ProjectImage) => void
}) {
	const fileRef = useRef<HTMLInputElement>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [open, setOpen] = useState(false)

	const upload = async (file: File | undefined) => {
		if (!file) return
		if (!ACCEPT.includes(file.type))
			return setError('Use a PNG, JPG, WebP or AVIF image.')
		if (file.size > MAX_BYTES) return setError('That image is over 12 MB.')
		setBusy(true)
		setError(null)
		try {
			const { upload: put } = await import('@vercel/blob/client')
			const blob = await put(`sites/${siteId}/${file.name}`, file, {
				access: 'public',
				handleUploadUrl: `/api/sites/${siteId}/media/upload`,
				contentType: file.type,
			})
			const response = await fetch(`/api/sites/${siteId}/media`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: file.name.replace(/\.[^.]+$/, ''),
					url: blob.url,
					pathname: blob.pathname,
					bytes: file.size,
					contentType: file.type,
				}),
			})
			if (!response.ok) throw new Error('register')
			const { media } = (await response.json()) as { media: ProjectImage }
			onUploaded(media)
			onChange(media.url)
		} catch {
			setError('That image could not be uploaded. Try again.')
		} finally {
			setBusy(false)
			if (fileRef.current) fileRef.current.value = ''
		}
	}

	return (
		<div className='space-y-2'>
			<Label htmlFor={id}>{label}</Label>
			<div className='flex flex-wrap items-start gap-4'>
				<Card
					className={cn(
						'shrink-0 items-center justify-center gap-0 overflow-hidden p-0',
						preview === 'square' && 'size-20',
						preview === 'wide' && 'h-20 w-48',
						preview === 'card' && 'aspect-[1.91/1] w-56',
					)}>
					{value ? (
						// eslint-disable-next-line @next/next/no-img-element -- the project's own upload
						<img src={value} alt='' className='size-full object-contain' />
					) : (
						<ImageIcon className='size-5 text-muted-foreground' />
					)}
				</Card>

				<div className='min-w-0 flex-1 space-y-2'>
					<p className='text-xs text-muted-foreground'>{hint}</p>
					<div className='flex flex-wrap gap-2'>
						<input
							ref={fileRef}
							id={id}
							type='file'
							accept={ACCEPT.join(',')}
							className='hidden'
							onChange={(event) => upload(event.target.files?.[0])}
						/>
						<Button
							type='button'
							variant='outline'
							size='sm'
							disabled={disabled || busy}
							onClick={() => fileRef.current?.click()}>
							{busy ? <Loader2 className='animate-spin' /> : <Upload />}
							Upload
						</Button>

						{images.length > 0 && (
							<Popover open={open} onOpenChange={setOpen}>
								<PopoverTrigger asChild>
									<Button
										type='button'
										variant='outline'
										size='sm'
										disabled={disabled || busy}>
										<ImageIcon /> Choose existing
									</Button>
								</PopoverTrigger>
								<PopoverContent align='start' className='w-80 p-2'>
									<p className='px-1 pb-2 text-xs text-muted-foreground'>
										Images already in this project
									</p>
									<ToggleGroup
										type='single'
										variant='outline'
										spacing={2}
										aria-label='Images already in this project'
										value={value ?? ''}
										onValueChange={(url) => {
											if (!url) return
											onChange(url)
											setOpen(false)
										}}
										className='grid max-h-64 w-full grid-cols-4 overflow-y-auto'>
										{images.map((image) => (
											<ToggleGroupItem
												key={image.id}
												value={image.url}
												aria-label={`Use ${image.name}`}
												className='aspect-square h-auto w-full overflow-hidden p-0 data-[state=on]:border-primary'>
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img src={image.url} alt='' className='size-full object-cover' />
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</PopoverContent>
							</Popover>
						)}

						{value && (
							<Button
								type='button'
								variant='ghost'
								size='sm'
								disabled={disabled || busy}
								onClick={() => onChange(null)}>
								<Trash2 /> Remove
							</Button>
						)}
					</div>
					{error && <FormAlert>{error}</FormAlert>}
				</div>
			</div>
		</div>
	)
}
