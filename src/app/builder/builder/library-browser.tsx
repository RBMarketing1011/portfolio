'use client'

/**
 * Browses the account's media library from the builder: a folder (the site's content
 * folder first) and its images as a grid to pick one from. A logo or favicon picker
 * shows the folder's likely logo or icon first, on a checkerboard so a white or
 * transparent mark still shows.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { useBuilder } from '@/lib/builder/builder-context'
import { findFavicon, findLogo, thumbSrc, type LibraryFolder, type LibraryImage } from '@/lib/builder/library'

/** What the picked image is for: brand marks are shown whole, photos fill their tile. */
export type PickerPrefer = 'logo' | 'icon' | 'photo'

/** A light and a mid grey, so a dark mark and a white one both show against it. */
export const CHECKER: React.CSSProperties = {
	backgroundImage: 'repeating-conic-gradient(#a1a1aa 0 25%, #d4d4d8 0 50%)',
	backgroundSize: '14px 14px',
}

const LOGO_LIKE = /logo/i
const ICON_LIKE = /icon/i

/** "Clients/Acme (24)", indented by depth so the tree reads in a flat list. */
export function folderLabel(folder: LibraryFolder) {
	return `${'\u00a0\u00a0'.repeat(folder.depth)}${folder.name} (${folder.total})`
}

/** One tile of an image grid: the thumbnail and its name. */
export function ImageTile({
	src,
	name,
	whole,
	badge,
}: {
	src: string
	name: string
	/** Show the whole image (a logo) rather than fill the tile (a photo). */
	whole: boolean
	badge?: string
}) {
	return (
		<>
			<span className='relative block aspect-square w-full overflow-hidden rounded-t-md' style={whole ? CHECKER : undefined}>
				{/* eslint-disable-next-line @next/next/no-img-element -- an optimized rendition of the account's own image */}
				<img
					src={src}
					alt=''
					loading='lazy'
					decoding='async'
					className={cn('size-full', whole ? 'object-contain p-2' : 'object-cover')}
				/>
				{badge && (
					<Badge className='absolute left-1.5 top-1.5' variant='secondary'>
						{badge}
					</Badge>
				)}
			</span>
			<span className='block w-full truncate px-1.5 py-1 text-left text-xs font-normal'>{name}</span>
		</>
	)
}

export const tileClass =
	'flex h-auto w-full min-w-0 flex-col items-stretch gap-0 overflow-hidden p-0 data-[state=on]:ring-2 data-[state=on]:ring-brand'

export function LibraryBrowser({
	value,
	prefer = 'photo',
	onPick,
}: {
	/** The URL in use now, shown selected when it is in the folder. */
	value: string | null | undefined
	prefer?: PickerPrefer
	onPick: (image: LibraryImage) => void
}) {
	const { remote, library, loadLibrary, folderImages } = useBuilder()
	const selectId = useId()
	const [browse, setBrowse] = useState<string | null>(null)
	const [listing, setListing] = useState<{ folderId: string; images: LibraryImage[]; truncated: boolean } | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [refresh, setRefresh] = useState(0)
	const forceNext = useRef(false)

	useEffect(() => {
		loadLibrary()
	}, [loadLibrary])

	const folders = useMemo(() => library.folders ?? [], [library.folders])
	// Opens on the site's content folder, else the first folder that has images.
	const current =
		(browse && folders.some((folder) => folder.id === browse) ? browse : null) ??
		library.folderId ??
		folders.find((folder) => folder.total > 0)?.id ??
		folders[0]?.id ??
		null

	useEffect(() => {
		if (!current) return
		let live = true
		const force = forceNext.current
		forceNext.current = false
		setError(null)
		folderImages(current, force).then(
			(body) => {
				if (live) setListing(body)
			},
			(cause: Error) => {
				if (live) setError(cause.message)
			},
		)
		return () => {
			live = false
		}
	}, [current, folderImages, refresh])

	const { images, top } = useMemo(() => {
		const list = listing && listing.folderId === current ? listing.images : []
		if (prefer === 'photo') return { images: list, top: null }
		const best = prefer === 'logo' ? findLogo(list) : findFavicon(list)
		const fits = (image: LibraryImage) =>
			prefer === 'logo'
				? image.kind === 'logo' || LOGO_LIKE.test(image.name)
				: image.kind === 'icon' || ICON_LIKE.test(image.name)
		const rank = (image: LibraryImage) => (image === best ? 0 : fits(image) ? 1 : 2)
		return { images: [...list].sort((a, b) => rank(a) - rank(b)), top: best }
	}, [listing, current, prefer])

	if (!remote)
		return (
			<Alert>
				<AlertDescription>Sign in and save this site to use your media library.</AlertDescription>
			</Alert>
		)

	if (library.error && !library.folders)
		return (
			<Alert variant='destructive'>
				<AlertDescription className='flex flex-wrap items-center justify-between gap-3'>
					{library.error}
					<Button size='sm' variant='outline' onClick={() => loadLibrary(true)}>
						Try again
					</Button>
				</AlertDescription>
			</Alert>
		)

	if (!library.folders)
		return (
			<div className='grid grid-cols-3 gap-2 sm:grid-cols-5'>
				{Array.from({ length: 10 }, (_, index) => (
					<Skeleton key={index} className='aspect-square w-full' />
				))}
			</div>
		)

	if (folders.length === 0)
		return (
			<Alert>
				<AlertDescription className='grid gap-3'>
					<p>
						Your media library has no folders yet. Make a folder for this site in Media and upload its
						photos and logo to it.
					</p>
					<Button asChild size='sm' variant='outline' className='justify-self-start'>
						<a href='/account/media' target='_blank' rel='noreferrer'>
							<ExternalLink /> Open Media
						</a>
					</Button>
				</AlertDescription>
			</Alert>
		)

	const shown = listing && listing.folderId === current ? images : null
	const whole = prefer !== 'photo'

	return (
		<div className='grid gap-3'>
			<div className='flex flex-wrap items-end gap-2'>
				<div className='grid min-w-56 flex-1 gap-1.5'>
					<Label htmlFor={selectId}>Folder</Label>
					<Select value={current ?? ''} onValueChange={(id) => setBrowse(id)}>
						<SelectTrigger id={selectId} className='w-full'>
							<SelectValue placeholder='Choose a folder' />
						</SelectTrigger>
						<SelectContent>
							{folders.map((folder) => (
								<SelectItem key={folder.id} value={folder.id}>
									{folderLabel(folder)}
									{folder.id === library.folderId ? ' · this site' : ''}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					variant='outline'
					size='icon'
					aria-label='Reload the folder'
					onClick={() => {
						loadLibrary(true)
						forceNext.current = true
						setRefresh((count) => count + 1)
					}}>
					<RefreshCw />
				</Button>
				<Button asChild variant='ghost' size='sm'>
					<a href='/account/media' target='_blank' rel='noreferrer'>
						<ExternalLink /> Open Media
					</a>
				</Button>
			</div>

			{error ? (
				<Alert variant='destructive'>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : !shown ? (
				<div className='grid grid-cols-3 gap-2 sm:grid-cols-5'>
					{Array.from({ length: 10 }, (_, index) => (
						<Skeleton key={index} className='aspect-square w-full' />
					))}
				</div>
			) : shown.length === 0 ? (
				<p className='py-8 text-center text-sm text-muted-foreground'>
					No images in this folder yet. Upload them in Media, then reload.
				</p>
			) : (
				<>
					<ToggleGroup
						type='single'
						variant='outline'
						spacing={2}
						aria-label='Images in the folder'
						value={shown.some((image) => image.url === value) ? (value ?? '') : ''}
						onValueChange={(url) => {
							const image = shown.find((item) => item.url === url)
							if (image) onPick(image)
						}}
						className='grid w-full grid-cols-3 sm:grid-cols-5'>
						{shown.map((image) => (
							<ToggleGroupItem key={image.id} value={image.url} aria-label={image.name} className={tileClass}>
								<ImageTile
									src={thumbSrc(image.url)}
									name={image.name}
									whole={whole}
									badge={image === top ? (prefer === 'logo' ? 'Logo' : 'Icon') : undefined}
								/>
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					{listing?.truncated && (
						<p className='text-xs text-muted-foreground'>Showing the newest {shown.length} images in this folder.</p>
					)}
				</>
			)}
		</div>
	)
}
