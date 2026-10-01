'use client'

import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the real editor chrome — toolbar, canvas column, inspector rail — so
 *  the layout does not jump once the store hydrates. */
export function BuilderSkeleton() {
	return (
		<div
			role='status'
			aria-label='Loading the editor'
			className='flex h-screen overflow-hidden'>
			<div className='min-w-0 flex-1'>
				<div className='flex items-center gap-1 border-b border-white/10 px-3 py-2'>
					<Skeleton className='size-7 rounded-md' />
					<Skeleton className='size-7 rounded-md' />
					<Skeleton className='ml-2 h-7 w-20 rounded-md' />
					<Skeleton className='ml-auto h-7 w-16 rounded-md' />
					<Skeleton className='h-7 w-16 rounded-md' />
				</div>

				<div className='flex h-[calc(100vh-3.25rem)] justify-center overflow-hidden p-6'>
					<div className='w-full max-w-5xl space-y-4'>
						<Skeleton className='h-14 w-full rounded-lg' />
						<Skeleton className='h-64 w-full rounded-lg' />
						<div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
							<Skeleton className='h-36 rounded-lg' />
							<Skeleton className='h-36 rounded-lg' />
							<Skeleton className='h-36 rounded-lg' />
						</div>
						<Skeleton className='h-40 w-full rounded-lg' />
					</div>
				</div>
			</div>

			<div className='hidden w-80 shrink-0 flex-col gap-4 border-l border-white/10 p-4 lg:flex'>
				<Skeleton className='h-6 w-32 rounded-md' />
				<Skeleton className='h-9 w-full rounded-md' />
				<div className='space-y-3 pt-2'>
					{Array.from({ length: 6 }, (_, index) => (
						<div key={index} className='space-y-2'>
							<Skeleton className='h-3 w-24 rounded' />
							<Skeleton className='h-9 w-full rounded-md' />
						</div>
					))}
				</div>
			</div>

			<span className='sr-only'>Loading the editor</span>
		</div>
	)
}
