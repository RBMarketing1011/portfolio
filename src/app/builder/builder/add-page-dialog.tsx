'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, Home, Loader2, Search, Sparkles } from 'lucide-react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useBuilder } from '@/lib/builder/builder-context'
import { HOME_SLUG, slugify, type Template } from '@/lib/builder/page-schema'
import type { Block } from '@/lib/builder/types'
import { useBuilderAi, writeWithAi } from './builder-ai'
import {
	TEMPLATE_CATEGORIES,
	TEMPLATE_CATEGORY_LABELS,
} from '@/lib/builder/template-categories'
import {
	ALL_TEMPLATES as ALL,
	blankMatches,
	countInCategory,
	groupTemplates,
	searchTemplates,
	templateTabs,
} from '@/lib/builder/template-search'
import { TemplateThumbnail } from './template-thumbnail'

export function AddPageDialog({
	open,
	onOpenChange,
	templates,
	isHome = false,
	usesCustomMenu = false,
	onCreate,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	templates: Template[]
	/** The first page a site gets is the home page and owns `/`. */
	isHome?: boolean
	/** A built header menu decides the navigation, so the header checkbox is hidden. */
	usesCustomMenu?: boolean
	/** `blocks` are the template's sections, rewritten by the AI when that was asked for. */
	onCreate: (input: {
		name: string
		slug: string
		blocks: Block[]
		inHeader: boolean
	}) => void
}) {
	const store = useBuilder()
	const aiEnabled = useBuilderAi(store.siteId, store.remote)
	const [name, setName] = useState('')
	const [slug, setSlug] = useState('')
	const [slugTouched, setSlugTouched] = useState(false)
	const [inHeader, setInHeader] = useState(true)
	const [templateSlug, setTemplateSlug] = useState<string | null>(null)
	const [query, setQuery] = useState('')
	const [tab, setTab] = useState(ALL)
	const [aiText, setAiText] = useState(true)
	const [aiImages, setAiImages] = useState(true)
	const [aiNotes, setAiNotes] = useState('')
	const [writing, setWriting] = useState(false)
	const [aiError, setAiError] = useState<string | null>(null)
	const abort = useRef<AbortController | null>(null)

	// The dialog stays mounted, so everything resets each time it opens.
	useEffect(() => {
		if (!open) {
			abort.current?.abort()
			return
		}
		setName(isHome ? 'Home' : '')
		setSlug('')
		setSlugTouched(false)
		setInHeader(true)
		setTemplateSlug(null)
		setQuery('')
		setTab(ALL)
		setAiNotes('')
		setWriting(false)
		setAiError(null)
	}, [open, isHome])

	// The slug tracks the name until the user edits it, then it stops.
	useEffect(() => {
		if (!slugTouched) setSlug(name ? slugify(name) : '')
	}, [name, slugTouched])

	const matches = useMemo(() => searchTemplates(templates, query), [templates, query])
	const countIn = (id: string) => countInCategory(matches, id)
	const tabs = useMemo(() => templateTabs(templates), [templates])
	const groups = useMemo(() => groupTemplates(matches, tab), [matches, tab])

	const showBlank = blankMatches(query)
	const selected = templates.find((t) => t.slug === templateSlug) ?? null
	const activeCategory = TEMPLATE_CATEGORIES.find((category) => category.id === tab)

	// The name and slug are the person's to choose; a template never fills them in.
	const choose = (template: Template | null) => {
		setTemplateSlug(template?.slug ?? null)
		setAiError(null)
	}
	const ready = name.trim() !== '' && (isHome || slug.trim() !== '') && !writing
	// A blank page has nothing to write into, so AI is only offered with a template.
	const offerAi = aiEnabled && selected !== null
	const useAi = offerAi && (aiText || aiImages)

	const create = (blocks: Block[]) => {
		onCreate({
			name: name.trim(),
			slug: isHome ? HOME_SLUG : slug.trim(),
			blocks,
			inHeader,
		})
		onOpenChange(false)
	}

	const submit = async (withAi = useAi) => {
		if (!ready) return
		if (!selected || !withAi) return create(selected?.blocks ?? [])

		const controller = new AbortController()
		abort.current = controller
		setWriting(true)
		setAiError(null)
		try {
			const blocks = await writeWithAi(
				store.siteId,
				{
					page: { name: name.trim(), slug: isHome ? HOME_SLUG : slug.trim() },
					blocks: selected.blocks,
					instructions: aiNotes.trim() || undefined,
					scope: 'page',
					options: { text: aiText, replaceImages: aiImages, fillImages: aiImages },
				},
				controller.signal,
			)
			if (!controller.signal.aborted) create(blocks)
		} catch (error) {
			if (controller.signal.aborted) return
			setAiError(error instanceof Error ? error.message : 'The AI could not write this page.')
		} finally {
			if (abort.current === controller) abort.current = null
			setWriting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* `h-[88vh]` is load-bearing: max-height alone leaves the height indefinite,
			    so the inner scrollers' heights never resolve. */}
			<DialogContent className='flex h-[88vh] max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl xl:max-w-7xl'>
				<DialogHeader className='shrink-0 border-b border-white/10 px-6 py-5'>
					<DialogTitle>
						{isHome ? 'Add your home page' : 'Add a page'}
					</DialogTitle>
					<DialogDescription>
						{isHome
							? 'Your first page is the home page. It lives at / and every other page comes after it.'
							: 'Start from a blank page, or from a ready-made page you can edit section by section.'}
					</DialogDescription>
				</DialogHeader>

				<div
					className={cn(
						'grid shrink-0 gap-4 border-b border-white/10 px-6 py-4',
						usesCustomMenu ? 'sm:grid-cols-2' : 'sm:grid-cols-[1fr_1fr_auto]',
					)}>
					<div className='space-y-2'>
						<Label htmlFor='page-name'>Page name</Label>
						<Input
							id='page-name'
							autoFocus
							value={name}
							placeholder='About Us'
							onChange={(event) => setName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter') submit()
							}}
						/>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='page-slug'>Slug</Label>
						{isHome ? (
							<div
								id='page-slug'
								className='flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/4 px-3 text-sm'>
								<Home className='size-3.5 shrink-0 text-brand' />
								<span className='font-medium text-white'>{HOME_SLUG}</span>
								<span className='truncate text-xs text-slate-500'>
									Home page
								</span>
							</div>
						) : (
							<div className='flex items-center gap-1.5'>
								<span className='text-sm text-slate-500'>/</span>
								<Input
									id='page-slug'
									value={slug}
									placeholder='about-us'
									onChange={(event) => {
										setSlugTouched(true)
										setSlug(event.target.value)
									}}
									onKeyDown={(event) => {
										if (event.key === 'Enter') submit()
									}}
								/>
							</div>
						)}
					</div>
					{!usesCustomMenu && (
						<div className='space-y-2'>
							<Label htmlFor='page-in-header'>Navigation</Label>
							<label
								htmlFor='page-in-header'
								className='flex h-9 cursor-pointer items-center gap-2.5 rounded-md border border-white/10 bg-white/4 px-3 text-sm text-slate-300'>
								<input
									id='page-in-header'
									type='checkbox'
									checked={inHeader}
									onChange={(event) => setInHeader(event.target.checked)}
									className='size-4 accent-brand'
								/>
								Add to header
							</label>
						</div>
					)}
				</div>

				<Tabs
					orientation='vertical'
					value={tab}
					onValueChange={setTab}
					className='grid min-h-0 flex-1 grid-cols-[11rem_19rem_1fr] gap-0'>
					{/* ---- categories ---------------------------------------------- */}
					<TabsList
						variant='line'
						aria-label='Template categories'
						className='h-auto! min-h-0 w-full items-stretch justify-start gap-0.5 overflow-y-auto rounded-none border-r border-white/10 bg-transparent p-2'>
						{tabs.map((entry) => {
							const count = countIn(entry.id)
							return (
								<TabsTrigger
									key={entry.id}
									value={entry.id}
									className={cn(
										'h-auto! flex-none justify-between gap-2 rounded-md px-3 py-2 text-left after:hidden hover:bg-white/5 data-[state=active]:bg-white/10!',
										count === 0 && 'opacity-40',
									)}>
									<span className='truncate'>{entry.label}</span>
									<span className='text-xs tabular-nums text-slate-500'>
										{count}
									</span>
								</TabsTrigger>
							)
						})}
					</TabsList>

					{/* ---- the list ------------------------------------------------- */}
					<div className='flex min-h-0 min-w-0 flex-col border-r border-white/10'>
						<div className='shrink-0 border-b border-white/10 p-3'>
							<div className='relative'>
								<Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-500' />
								<Input
									value={query}
									placeholder='Search page templates'
									aria-label='Search page templates'
									onChange={(event) => setQuery(event.target.value)}
									className='pl-8'
								/>
							</div>
							{activeCategory && !query && (
								<p className='mt-2 px-0.5 text-xs leading-5 text-slate-500'>
									{activeCategory.description}
								</p>
							)}
						</div>

						<div className='min-h-0 flex-1 space-y-5 overflow-y-auto p-3'>
							{showBlank && (
								<TemplateRow
									selected={templateSlug === null}
									onSelect={() => choose(null)}
									title='Blank page'
									detail='No sections. Build it from the section library.'
									icon={<FilePlus2 className='size-4 shrink-0 text-brand' />}
								/>
							)}

							{groups.map((group) => (
								<div key={group.id}>
									{(tab === ALL || query) && (
										<p className='px-2 pb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500'>
											{group.label}
										</p>
									)}
									<ul className='space-y-1'>
										{group.items.map((template) => (
											<li key={template.slug}>
												<TemplateRow
													selected={templateSlug === template.slug}
													onSelect={() => choose(template)}
													onConfirm={() => void submit()}
													title={template.name}
													detail={template.description}
													meta={`${template.blocks.length} sections`}
												/>
											</li>
										))}
									</ul>
								</div>
							))}

							{groups.length === 0 && (
								<p className='px-2 py-8 text-center text-sm text-slate-500'>
									No templates match that search.
								</p>
							)}
						</div>
					</div>

					{/* ---- preview -------------------------------------------------- */}
					<div className='flex min-h-0 min-w-0 flex-col'>
						<div className='shrink-0 border-b border-white/10 px-6 py-3'>
							<p className='text-sm font-medium text-white'>
								{selected ? selected.name : 'Blank page'}
							</p>
							<p className='mt-0.5 text-xs text-slate-500'>
								{selected
									? `${TEMPLATE_CATEGORY_LABELS[selected.category] ?? 'Template'} · ${selected.blocks.length} sections, all editable`
									: 'An empty canvas. Add sections once the page exists.'}
							</p>
						</div>
						<div className='min-h-0 flex-1 overflow-hidden bg-black/30'>
							{selected ? (
								<TemplateThumbnail key={selected.slug} blocks={selected.blocks} />
							) : (
								<div className='flex h-full items-center justify-center px-6 text-center text-sm text-slate-500'>
									Pick a template on the left to preview it here.
								</div>
							)}
						</div>
					</div>
				</Tabs>

				{offerAi && (
					<div className='shrink-0 space-y-3 border-t border-white/10 px-6 py-4'>
						<div className='flex flex-wrap items-center gap-x-6 gap-y-3'>
							<p className='flex items-center gap-2 text-sm font-medium text-white'>
								<Sparkles className='size-4 text-brand' /> Write it with AI
							</p>
							<div className='flex items-center gap-2'>
								<Checkbox
									id='ai-text'
									checked={aiText}
									disabled={writing}
									onCheckedChange={(value) => setAiText(value === true)}
								/>
								<Label htmlFor='ai-text' className='font-normal'>
									Write the text from my business details
								</Label>
							</div>
							<div className='flex items-center gap-2'>
								<Checkbox
									id='ai-images'
									checked={aiImages}
									disabled={writing}
									onCheckedChange={(value) => setAiImages(value === true)}
								/>
								<Label htmlFor='ai-images' className='font-normal'>
									Choose images from my media
								</Label>
							</div>
						</div>
						{useAi && (
							<Input
								value={aiNotes}
								disabled={writing}
								maxLength={2000}
								placeholder='Anything the AI should know about this page? (optional) e.g. "Focus on emergency repairs in Austin"'
								aria-label='Notes for the AI'
								onChange={(event) => setAiNotes(event.target.value)}
							/>
						)}
						{aiError && (
							<FormAlert>
								{aiError}{' '}
								<Button
									variant='link'
									className='h-auto p-0 text-inherit underline'
									onClick={() => void submit(false)}>
									Create it without AI
								</Button>
							</FormAlert>
						)}
					</div>
				)}

				<DialogFooter className='shrink-0 border-t border-white/10 px-6 py-4'>
					<Button
						variant='outline'
						onClick={() => onOpenChange(false)}
						className='border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
						Cancel
					</Button>
					<Button
						onClick={() => void submit()}
						disabled={!ready}
						title={ready || writing ? undefined : 'Enter a page name and slug first'}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						{writing ? (
							<>
								<Loader2 className='animate-spin' /> Writing your page…
							</>
						) : useAi ? (
							<>
								<Sparkles /> Create page with AI
							</>
						) : selected ? (
							'Create page from template'
						) : (
							'Create blank page'
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function TemplateRow({
	selected,
	onSelect,
	onConfirm,
	title,
	detail,
	meta,
	icon,
}: {
	selected: boolean
	onSelect: () => void
	/** Double-click creates the page straight away. */
	onConfirm?: () => void
	title: string
	detail: string
	meta?: string
	icon?: React.ReactNode
}) {
	return (
		<button
			type='button'
			onClick={onSelect}
			onDoubleClick={onConfirm}
			aria-pressed={selected}
			className={cn(
				'flex w-full gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
				selected
					? 'border-brand/50 bg-brand/10'
					: 'border-transparent hover:border-white/10 hover:bg-white/4',
			)}>
			{icon}
			<span className='min-w-0 flex-1'>
				<span className='flex items-baseline justify-between gap-2'>
					<span
						className={cn(
							'truncate text-sm font-medium',
							selected ? 'text-white' : 'text-slate-200',
						)}>
						{title}
					</span>
					{meta && (
						<span className='shrink-0 text-[11px] text-slate-500'>{meta}</span>
					)}
				</span>
				<span className='mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500'>
					{detail}
				</span>
			</span>
		</button>
	)
}
