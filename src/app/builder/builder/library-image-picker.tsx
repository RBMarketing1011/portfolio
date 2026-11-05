'use client'

/**
 * Picks one image: from the account's media library (the site's content folder first),
 * from the images uploaded to this site, or a new upload. The Theme dialog picks the logo
 * and favicon with it, and the AI dialog the logo. Resolves to the image's URL.
 */
import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useBuilder } from '@/lib/builder/builder-context'
import { ImageTile, LibraryBrowser, tileClass, type PickerPrefer } from './library-browser'
import { MAX_UPLOAD, toWebpWithSize } from './media-picker'

export type PickedImage = { url: string; name: string; width?: number; height?: number }

export function LibraryImagePicker({
	open,
	onOpenChange,
	title,
	description,
	value,
	prefer = 'photo',
	onPick,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description: string
	/** The URL in use now, shown selected. */
	value: string | null
	/** Puts the folder's likely logo or icon first and shows marks whole. */
	prefer?: PickerPrefer
	onPick: (image: PickedImage) => void
}) {
	const store = useBuilder()
	const [tab, setTab] = useState('library')
	const [uploading, setUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const fileRef = useRef<HTMLInputElement>(null)
	const uploads = [...store.media].sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0))

	const pick = (image: PickedImage) => {
		onPick(image)
		onOpenChange(false)
	}

	const upload = async (file: File | undefined) => {
		if (!file) return
		if (file.size > MAX_UPLOAD) return setError('That image is over 12 MB. Pick a smaller one.')
		setUploading(true)
		setError(null)
		try {
			const { blob, width, height } = await toWebpWithSize(file)
			const item = await store.uploadMedia(file.name.replace(/\.[^.]+$/, '') || 'image', blob, { width, height })
			pick({ url: item.src, name: item.name, width, height })
		} catch {
			setError('That image could not be uploaded. Use a JPG, PNG or WebP under 12 MB.')
		} finally {
			setUploading(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setError(null)
				onOpenChange(next)
			}}>
			<DialogContent className='flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<Tabs value={tab} onValueChange={setTab} className='min-h-0 flex-1'>
					<div className='flex flex-wrap items-center justify-between gap-3'>
						<TabsList>
							<TabsTrigger value='library'>Media library</TabsTrigger>
							<TabsTrigger value='site'>This site&apos;s uploads</TabsTrigger>
						</TabsList>
						<Button variant='outline' size='sm' disabled={uploading || !store.remote} onClick={() => fileRef.current?.click()}>
							{uploading ? <Loader2 className='animate-spin' /> : <Upload />} Upload
						</Button>
						<Input
							ref={fileRef}
							type='file'
							accept='image/png,image/jpeg,image/webp,image/avif'
							className='hidden'
							tabIndex={-1}
							aria-hidden
							onChange={(event) => {
								const file = event.target.files?.[0]
								event.target.value = ''
								void upload(file)
							}}
						/>
					</div>
					{error && (
						<Alert variant='destructive'>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					<TabsContent value='library' className='min-h-0 overflow-y-auto pr-1'>
						<LibraryBrowser
							value={value}
							prefer={prefer}
							onPick={(image) => pick({ url: image.url, name: image.name, width: image.width, height: image.height })}
						/>
					</TabsContent>
					<TabsContent value='site' className='min-h-0 overflow-y-auto pr-1'>
						{uploads.length === 0 ? (
							<p className='py-8 text-center text-sm text-muted-foreground'>
								Nothing uploaded to this site yet. Upload an image, or pick one from the media library.
							</p>
						) : (
							<ToggleGroup
								type='single'
								variant='outline'
								spacing={2}
								aria-label="This site's uploads"
								value={uploads.some((item) => item.src === value) ? (value ?? '') : ''}
								onValueChange={(url) => {
									const item = uploads.find((entry) => entry.src === url)
									if (item) pick({ url: item.src, name: item.name })
								}}
								className='grid w-full grid-cols-3 sm:grid-cols-5'>
								{uploads.map((item) => (
									<ToggleGroupItem key={item.id} value={item.src} aria-label={item.name} className={tileClass}>
										<ImageTile src={item.src} name={item.name} whole={prefer !== 'photo'} />
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						)}
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}
