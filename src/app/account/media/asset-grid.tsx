'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AssetCard } from '@/app/account/media/asset-card'
import type { AssetGridProps, Density } from '@/app/account/media/contracts'
import type { MediaAssetDTO } from '@/lib/media/types'

/* Whole class names, so Tailwind sees them. 2 across on a phone at every density. */
export const GRID_COLUMNS: Record<Density, string> = {
	compact: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8',
	comfortable: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5',
	large: 'grid-cols-2 md:grid-cols-3',
}

const SKELETON_COUNT: Record<Density, number> = {
	compact: 16,
	comfortable: 10,
	large: 6,
}

/** One card per id: a repeated id would be a React key collision and two cards for one image. */
export function dedupeAssets(assets: MediaAssetDTO[]) {
	const seen = new Set<string>()
	const out: MediaAssetDTO[] = []
	for (const asset of assets) {
		if (!asset || typeof asset.id !== 'string' || seen.has(asset.id)) continue
		seen.add(asset.id)
		out.push(asset)
	}
	return out
}

function SkeletonCards({ density }: { density: Density }) {
	return (
		<ul
			aria-busy='true'
			aria-label='Loading images'
			className={cn('grid list-none gap-3 p-0', GRID_COLUMNS[density])}>
			{Array.from({ length: SKELETON_COUNT[density] }, (_, index) => (
				<li
					key={index}
					data-slot='asset-card-skeleton'
					aria-hidden='true'
					className='overflow-hidden rounded-xl border border-white/10 bg-white/3'>
					<Skeleton className='aspect-square w-full rounded-none bg-white/5' />
					<div className='space-y-1.5 p-2.5'>
						<Skeleton className='h-4 w-3/4 bg-white/5' />
						<Skeleton className='h-3 w-1/2 bg-white/5' />
					</div>
				</li>
			))}
		</ul>
	)
}

export function AssetGrid(props: AssetGridProps) {
	const {
		assets,
		density,
		selectedIds,
		selecting,
		activeId,
		loading,
		loadingMore,
		hasMore,
		error,
		canDrag,
		showFolderPath,
		showMatch,
		empty,
		onRetry,
	} = props

	// Cards get stable callbacks that read the latest props, so a selection change
	// re-renders only the cards whose own state changed (the grid can hold hundreds).
	const latest = useRef(props)
	useEffect(() => {
		latest.current = props
	})
	const handleOpen = useCallback((id: string) => latest.current.onOpen(id), [])
	const handleToggle = useCallback(
		(id: string, opts: { range: boolean }) =>
			latest.current.onToggleSelect(id, opts),
		[],
	)
	const getSelectedIds = useCallback(() => latest.current.selectedIds, [])

	const unique = useMemo(() => dedupeAssets(assets), [assets])
	// An empty string is still an error: only null (or absent) means none.
	const hasError = error !== null && error !== undefined
	const hasAssets = unique.length > 0

	/* Auto-load is an enhancement; the visible Load more button is the real control. */
	const sentinelRef = useRef<HTMLDivElement>(null)
	const requestedAt = useRef<string | null>(null)
	const wantsMore = hasMore && !loading && !loadingMore && !hasError && hasAssets
	const position = hasAssets
		? `${unique[0].id}:${unique[unique.length - 1].id}:${unique.length}`
		: ''

	useEffect(() => {
		// A new first page starts over; without this a same-sized new result would be
		// mistaken for a page already requested.
		if (loading) requestedAt.current = null
	}, [loading])

	useEffect(() => {
		const node = sentinelRef.current
		if (!wantsMore || !node || typeof IntersectionObserver === 'undefined') return
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return
				// Once per loaded position: an observer can report the same sighting many times,
				// and a page that adds nothing must not turn into a request loop.
				if (requestedAt.current === position) return
				const now = latest.current
				if (!now.hasMore || now.loading || now.loadingMore || now.error != null)
					return
				requestedAt.current = position
				now.onLoadMore()
			},
			{ rootMargin: '600px 0px' },
		)
		observer.observe(node)
		return () => observer.disconnect()
	}, [wantsMore, position])

	if (loading) return <SkeletonCards density={density} />

	if (!hasAssets) {
		if (hasError) {
			return (
				<div
					data-slot='grid-error'
					className='flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center'>
					<TriangleAlert className='size-6 text-destructive' />
					<p className='text-sm font-medium text-white'>
						Could not load your images.
					</p>
					{error ? <p className='text-sm text-slate-400'>{error}</p> : null}
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={onRetry}
						className='border-white/10 bg-white/3 text-white hover:bg-white/8'>
						Retry
					</Button>
				</div>
			)
		}
		return <>{empty}</>
	}

	const showCheckbox = selecting || selectedIds.size > 0

	return (
		<div>
			<ul
				aria-label='Images'
				className={cn('grid list-none gap-3 p-0', GRID_COLUMNS[density])}>
				{unique.map((asset) => (
					<AssetCard
						key={asset.id}
						asset={asset}
						density={density}
						selected={selectedIds.has(asset.id)}
						active={activeId === asset.id}
						showCheckbox={showCheckbox}
						canDrag={canDrag}
						showFolderPath={showFolderPath}
						showMatch={showMatch}
						getSelectedIds={getSelectedIds}
						onOpen={handleOpen}
						onToggleSelect={handleToggle}
					/>
				))}
			</ul>

			{wantsMore ? (
				<div ref={sentinelRef} aria-hidden='true' className='h-px w-full' />
			) : null}

			{hasError ? (
				<div
					data-slot='grid-load-error'
					className='mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-slate-400'>
					<span>Could not load more.</span>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={onRetry}
						className='border-white/10 bg-white/3 text-white hover:bg-white/8'>
						Retry
					</Button>
					{error ? (
						<span className='basis-full text-center text-xs text-slate-500'>
							{error}
						</span>
					) : null}
				</div>
			) : hasMore ? (
				<div className='mt-6 flex justify-center'>
					<Button
						type='button'
						variant='outline'
						data-slot='load-more'
						// aria-disabled keeps focus on the button while a page is in flight.
						aria-disabled={loadingMore}
						onClick={() => {
							if (loadingMore) return
							requestedAt.current = position
							props.onLoadMore()
						}}
						className='border-white/10 bg-white/3 text-white hover:bg-white/8 aria-disabled:cursor-default aria-disabled:opacity-60'>
						{loadingMore ? <Loader2 className='animate-spin' /> : null}
						Load more
					</Button>
				</div>
			) : null}
		</div>
	)
}
