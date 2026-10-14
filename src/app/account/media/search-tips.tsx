'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MEDIA_LIMITS } from '@/lib/media/types'

export type SearchTip = { example: string; note: string }
export type SearchTipGroup = { title: string; tips: SearchTip[] }

/**
 * The language on one screen. Every example is a complete, valid query on its own
 * (the proof parses each one), so clicking it always leaves the box in a good state.
 */
export const SEARCH_TIPS: readonly SearchTipGroup[] = [
	{
		title: 'Words',
		tips: [
			{ example: 'kitchen remodel', note: 'Every word must match' },
			{ example: '"before and after"', note: 'An exact phrase' },
			{ example: 'kitchen OR bathroom', note: 'Either word (OR in capitals)' },
			{ example: '(kitchen OR bath) blue', note: 'Group with parentheses' },
			{ example: '-people', note: 'Leave out anything that matches' },
		],
	},
	{
		title: 'Tags and text',
		tips: [
			{ example: 'tag:kitchen', note: 'Has this tag (or #kitchen)' },
			{ example: 'tag:kit*', note: 'A tag that starts with kit' },
			{ example: 'tag:kitchen,bath', note: 'Either tag' },
			{ example: 'name:hero', note: 'Only in the name' },
			{ example: 'caption:van', note: 'Only in the caption' },
			{ example: 'text:"grand opening"', note: 'Words read inside the image' },
		],
	},
	{
		title: 'Where',
		tips: [
			{
				example: 'folder:Clients/Acme',
				note: 'That folder and everything in it',
			},
			{ example: 'folder:none', note: 'Images that are not in a folder' },
		],
	},
	{
		title: 'What it is',
		tips: [
			{ example: 'type:png,jpg', note: 'File type' },
			{ example: 'color:blue', note: 'Dominant color' },
			{ example: 'orientation:landscape', note: 'Or portrait, square, panorama' },
			{ example: 'kind:logo', note: 'Or photo, icon, screenshot, diagram' },
		],
	},
	{
		title: 'Status',
		tips: [
			{ example: 'is:unreviewed', note: 'Auto tags nobody has kept yet' },
			{ example: 'is:untagged', note: 'No tags at all' },
			{ example: 'is:dark', note: 'Or light, vivid, muted, animated' },
		],
	},
	{
		title: 'Size and date',
		tips: [
			{ example: 'width:>1200', note: 'Wider than 1200 px' },
			{ example: 'height:<=600', note: 'At most 600 px tall' },
			{ example: 'width:800..1600', note: 'Between two sizes' },
			{ example: 'size:>2mb', note: 'Bigger than 2 MB' },
			{ example: 'added:7d', note: 'Added in the last 7 days' },
			{
				example: 'added:2026-01-01..2026-03-31',
				note: 'Added between two dates',
			},
		],
	},
	{
		title: 'Order',
		tips: [
			{ example: 'sort:newest', note: 'Or oldest, name, largest, relevance' },
		],
	},
]

/**
 * The box text with `example` added. A space goes between them unless the text
 * already ends in one, so a second click never glues two clauses into one word.
 * Null when the result would be longer than a search can be: the server cuts at
 * `queryMax`, and cutting an example in half leaves a clause that means something else.
 */
export function appendExample(value: string, example: string): string | null {
	const joined =
		value === '' || /\s$/.test(value) ? value + example : `${value} ${example}`
	return joined.length > MEDIA_LIMITS.queryMax ? null : joined
}

export function SearchTips({
	id,
	onPick,
	className,
}: {
	id?: string
	/** The example the person clicked. The search bar adds it to the box and focuses it. */
	onPick(example: string): void
	className?: string
}) {
	return (
		<section
			id={id}
			aria-label='Search tips'
			data-slot='search-tips'
			className={className}>
			<Card className='gap-0 border-white/10 bg-white/3 p-4 shadow-none'>
				<div className='grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3'>
					{SEARCH_TIPS.map((group) => (
						<div key={group.title} className='min-w-0'>
							<h3 className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
								{group.title}
							</h3>
							<ul className='mt-2 space-y-1.5'>
								{group.tips.map((tip) => (
									<li
										key={tip.example}
										className='flex flex-wrap items-center gap-x-2 gap-y-1'>
										<Button
											type='button'
											variant='outline'
											size='xs'
											aria-label={`Add ${tip.example} to your search`}
											onClick={() => onPick(tip.example)}
											className='h-auto max-w-full shrink cursor-pointer justify-start break-all whitespace-normal border-white/10 bg-white/5 px-2 py-0.5 text-left font-mono font-normal text-brand shadow-none transition-colors hover:border-brand/30 hover:bg-brand/10 hover:text-brand motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:hover:bg-brand/10'>
											{tip.example}
										</Button>
										<span className='text-xs text-slate-400'>{tip.note}</span>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<Separator className='mt-4 bg-white/10' />
				<p className='pt-3 text-xs leading-5 text-slate-400'>
					Click an example to add it to your search. Operators are not case
					sensitive, but OR and NOT must be capitals.
				</p>
			</Card>
		</section>
	)
}
