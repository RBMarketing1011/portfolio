'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
	displaySlug,
	MENU_LIMITS,
	MENU_STYLE_LABELS,
	MENU_STYLES,
	type MenuItem,
	type MenuLink,
	type MenuPromo,
	type MenuStyle,
	type Page,
} from '@/lib/builder/page-schema'
import { IconPicker } from './icon-picker'
import { MediaPicker } from './media-picker'

const newId = () => Math.random().toString(36).slice(2, 10)

const blankLink = (): MenuLink => ({
	id: newId(),
	label: '',
	href: '',
	description: '',
})

const blankItem = (): MenuItem => ({
	id: newId(),
	label: '',
	href: '',
	links: [],
	style: 'mega',
	promo: null,
})

const blankPromo = (): MenuPromo => ({
	eyebrow: '',
	title: '',
	body: '',
	ctaLabel: '',
	href: '',
})

/** Moves one entry a step up or down, leaving the list alone at either end. */
function shift<T>(list: T[], index: number, by: -1 | 1): T[] {
	const target = index + by
	if (target < 0 || target >= list.length) return list
	const next = [...list]
	;[next[index], next[target]] = [next[target], next[index]]
	return next
}

/**
 * Where a link goes: one of this site's pages, or any address. A page is stored as
 * its slug, so renaming or reordering pages never breaks a menu link.
 */
function LinkTarget({
	id,
	value,
	pages,
	onChange,
}: {
	id: string
	value: string
	pages: Page[]
	onChange: (value: string) => void
}) {
	const isPage = pages.some((page) => page.slug === value)
	const mode = value === '' ? '__none' : isPage ? value : '__url'

	return (
		<div className='space-y-2'>
			<Select
				value={mode}
				onValueChange={(next) =>
					onChange(next === '__none' ? '' : next === '__url' ? 'https://' : next)
				}>
				<SelectTrigger id={id} className='w-full'>
					<SelectValue placeholder='Pick a page' />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value='__none'>No link</SelectItem>
					{pages.map((page) => (
						<SelectItem key={page.id} value={page.slug}>
							{page.name}
							<span className='ml-2 text-xs text-slate-500'>
								{displaySlug(page.slug)}
							</span>
						</SelectItem>
					))}
					<SelectItem value='__url'>Another address…</SelectItem>
				</SelectContent>
			</Select>
			{mode === '__url' && (
				<Input
					aria-label='Address'
					value={value}
					placeholder='https://example.com'
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
		</div>
	)
}

function Field({
	label,
	htmlFor,
	children,
}: {
	label: string
	htmlFor?: string
	children: React.ReactNode
}) {
	return (
		<div className='space-y-2'>
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
		</div>
	)
}

/**
 * Builds the header menu: top-level entries that are either a link or a menu, and
 * for a menu its links (with an optional line and icon each) and a featured card.
 * Works on a copy and only writes it back on Save, so Cancel throws everything away.
 */
export function MenuEditorDialog({
	open,
	onOpenChange,
	menu,
	pages,
	onSave,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	menu: MenuItem[]
	pages: Page[]
	onSave: (menu: MenuItem[]) => void
}) {
	const [draft, setDraft] = useState<MenuItem[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	// Which untouched items were switched to "Menu" before getting any links.
	const [menuMode, setMenuMode] = useState<Set<string>>(new Set())

	useEffect(() => {
		if (!open) return
		const copy = JSON.parse(JSON.stringify(menu)) as MenuItem[]
		setDraft(copy)
		setSelectedId(copy[0]?.id ?? null)
		setMenuMode(new Set())
		// Only when it opens: edits in progress must not be reset by the parent.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])

	const selected = draft.find((item) => item.id === selectedId) ?? null

	const update = (id: string, patch: Partial<MenuItem>) =>
		setDraft((current) =>
			current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
		)

	const addItem = () => {
		const item = blankItem()
		setDraft((current) => [...current, item])
		setSelectedId(item.id)
	}

	const seedFromPages = () => {
		const items: MenuItem[] = pages
			.filter((page) => page.inHeader)
			.slice(0, MENU_LIMITS.items)
			.map((page) => ({ ...blankItem(), label: page.name, href: page.slug }))
		setDraft(items)
		setSelectedId(items[0]?.id ?? null)
	}

	const removeItem = (id: string) => {
		const index = draft.findIndex((item) => item.id === id)
		const next = draft.filter((item) => item.id !== id)
		setDraft(next)
		if (selectedId === id) setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null)
	}

	const isMenu = (item: MenuItem) =>
		item.links.length > 0 || menuMode.has(item.id)

	const itemKind = (item: MenuItem) => (isMenu(item) ? 'Menu' : 'Link')

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-4xl'>
				<DialogHeader className='border-b border-white/10 p-6'>
					<DialogTitle>Header menu</DialogTitle>
					<DialogDescription>
						Each entry is a link or opens a menu. Until you save a menu here,
						the header shows the pages set to appear in it.
					</DialogDescription>
				</DialogHeader>

				<div className='grid min-h-0 flex-1 md:grid-cols-[17rem_1fr]'>
					{/* ---- the top-level entries ---------------------------------- */}
					<div className='flex min-h-0 flex-col border-b border-white/10 md:border-r md:border-b-0'>
						<div className='min-h-0 flex-1 space-y-1 overflow-y-auto p-3'>
							{draft.length === 0 && (
								<div className='space-y-3 px-2 py-4 text-sm text-slate-400'>
									<p>No menu yet.</p>
									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={seedFromPages}
										className='border-white/15 bg-transparent'>
										<ListPlus /> Start from my pages
									</Button>
								</div>
							)}
							{draft.map((item, index) => (
								<div
									key={item.id}
									className={cn(
										'group flex items-center gap-1 rounded-md pr-1',
										item.id === selectedId ? 'bg-white/8' : 'hover:bg-white/4',
									)}>
									<button
										type='button'
										onClick={() => setSelectedId(item.id)}
										className='flex min-w-0 flex-1 flex-col px-3 py-2 text-left'>
										<span
											className={cn(
												'truncate text-sm font-medium',
												item.label ? 'text-white' : 'text-slate-500',
											)}>
											{item.label || 'Untitled'}
										</span>
										<span className='text-xs text-slate-500'>
											{itemKind(item)}
											{item.links.length > 0 && ` · ${item.links.length} links`}
										</span>
									</button>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										className='size-7'
										aria-label={`Move ${item.label || 'item'} up`}
										disabled={index === 0}
										onClick={() => setDraft((c) => shift(c, index, -1))}>
										<ArrowUp />
									</Button>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										className='size-7'
										aria-label={`Move ${item.label || 'item'} down`}
										disabled={index === draft.length - 1}
										onClick={() => setDraft((c) => shift(c, index, 1))}>
										<ArrowDown />
									</Button>
								</div>
							))}
						</div>
						<div className='border-t border-white/10 p-3'>
							<Button
								type='button'
								variant='outline'
								size='sm'
								disabled={draft.length >= MENU_LIMITS.items}
								onClick={addItem}
								className='w-full border-white/15 bg-transparent'>
								<Plus /> Add item
							</Button>
						</div>
					</div>

					{/* ---- the selected entry ------------------------------------- */}
					<div className='min-h-0 space-y-6 overflow-y-auto p-6'>
						{!selected ? (
							<p className='text-sm text-slate-500'>
								Add an item, or pick one on the left to edit it.
							</p>
						) : (
							<ItemEditor
								key={selected.id}
								item={selected}
								pages={pages}
								menuMode={isMenu(selected)}
								onMenuMode={(on) =>
									setMenuMode((current) => {
										const next = new Set(current)
										if (on) next.add(selected.id)
										else next.delete(selected.id)
										return next
									})
								}
								onChange={(patch) => update(selected.id, patch)}
								onDelete={() => removeItem(selected.id)}
							/>
						)}
					</div>
				</div>

				<DialogFooter className='border-t border-white/10 p-4 sm:justify-between'>
					<Button
						type='button'
						variant='ghost'
						onClick={() => {
							onSave([])
							onOpenChange(false)
						}}>
						Use my pages instead
					</Button>
					<div className='flex gap-2'>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							type='button'
							onClick={() => {
								onSave(draft)
								onOpenChange(false)
							}}
							className='bg-brand font-bold text-ink hover:bg-brand-strong'>
							Save menu
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function ItemEditor({
	item,
	pages,
	menuMode,
	onMenuMode,
	onChange,
	onDelete,
}: {
	item: MenuItem
	pages: Page[]
	menuMode: boolean
	onMenuMode: (on: boolean) => void
	onChange: (patch: Partial<MenuItem>) => void
	onDelete: () => void
}) {
	const setLink = (id: string, patch: Partial<MenuLink>) =>
		onChange({
			links: item.links.map((link) =>
				link.id === id ? { ...link, ...patch } : link,
			),
		})

	return (
		<>
			<div className='flex items-start gap-3'>
				<div className='min-w-0 flex-1'>
					<Field label='Label' htmlFor={`menu-label-${item.id}`}>
						<Input
							id={`menu-label-${item.id}`}
							value={item.label}
							maxLength={80}
							placeholder='Services'
							onChange={(event) => onChange({ label: event.target.value })}
						/>
					</Field>
				</div>
				<Button
					type='button'
					variant='ghost'
					size='icon'
					className='mt-6 text-destructive hover:text-destructive'
					aria-label='Delete this item'
					onClick={onDelete}>
					<Trash2 />
				</Button>
			</div>

			<div className='space-y-2'>
				<Label>What it does</Label>
				<Tabs
					value={menuMode ? 'menu' : 'link'}
					onValueChange={(value) => onMenuMode(value === 'menu')}>
					<TabsList>
						{/* Links that are still in the menu would be lost, so remove them first. */}
						<TabsTrigger value='link' disabled={item.links.length > 0}>
							Goes to a page
						</TabsTrigger>
						<TabsTrigger value='menu'>Opens a menu</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			{!menuMode ? (
				<Field label='Goes to' htmlFor={`menu-href-${item.id}`}>
					<LinkTarget
						id={`menu-href-${item.id}`}
						value={item.href}
						pages={pages}
						onChange={(href) => onChange({ href })}
					/>
				</Field>
			) : (
				<>
					<Field label='Style' htmlFor={`menu-style-${item.id}`}>
						<Select
							value={item.style}
							onValueChange={(style) => onChange({ style: style as MenuStyle })}>
							<SelectTrigger id={`menu-style-${item.id}`} className='w-full'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MENU_STYLES.map((style) => (
									<SelectItem key={style} value={style}>
										{MENU_STYLE_LABELS[style]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className='text-xs text-slate-500'>
							{item.style === 'mega'
								? 'A wide panel with columns of links, each with an icon and a line of text, and an optional featured card.'
								: 'A plain list of links under the label.'}
						</p>
					</Field>

					<div className='space-y-3'>
						<div className='flex items-center justify-between'>
							<Label>Links</Label>
							<Button
								type='button'
								variant='outline'
								size='sm'
								disabled={item.links.length >= MENU_LIMITS.links}
								onClick={() => onChange({ links: [...item.links, blankLink()] })}
								className='border-white/15 bg-transparent'>
								<Plus /> Add link
							</Button>
						</div>

						{item.links.length === 0 && (
							<p className='rounded-lg border border-dashed border-white/15 p-4 text-sm text-slate-500'>
								Nothing here yet. Until it has a link, this entry shows as a
								plain link.
							</p>
						)}

						{item.links.map((link, index) => (
							<div
								key={link.id}
								className='space-y-3 rounded-lg border border-white/10 bg-white/3 p-4'>
								<div className='flex items-center justify-between gap-2'>
									<span className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
										Link {index + 1}
									</span>
									<div className='flex'>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='size-7'
											aria-label='Move link up'
											disabled={index === 0}
											onClick={() =>
												onChange({ links: shift(item.links, index, -1) })
											}>
											<ArrowUp />
										</Button>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='size-7'
											aria-label='Move link down'
											disabled={index === item.links.length - 1}
											onClick={() =>
												onChange({ links: shift(item.links, index, 1) })
											}>
											<ArrowDown />
										</Button>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='size-7 text-destructive hover:text-destructive'
											aria-label='Delete link'
											onClick={() =>
												onChange({
													links: item.links.filter((l) => l.id !== link.id),
												})
											}>
											<Trash2 />
										</Button>
									</div>
								</div>

								<div className='grid gap-3 sm:grid-cols-2'>
									<Field label='Title' htmlFor={`link-label-${link.id}`}>
										<Input
											id={`link-label-${link.id}`}
											value={link.label}
											maxLength={80}
											onChange={(event) =>
												setLink(link.id, { label: event.target.value })
											}
										/>
									</Field>
									<Field label='Goes to' htmlFor={`link-href-${link.id}`}>
										<LinkTarget
											id={`link-href-${link.id}`}
											value={link.href}
											pages={pages}
											onChange={(href) => setLink(link.id, { href })}
										/>
									</Field>
								</div>

								{item.style === 'mega' && (
									<div className='grid gap-3 sm:grid-cols-[1fr_12rem]'>
										<Field
											label='Line under the title'
											htmlFor={`link-desc-${link.id}`}>
											<Input
												id={`link-desc-${link.id}`}
												value={link.description}
												maxLength={160}
												onChange={(event) =>
													setLink(link.id, { description: event.target.value })
												}
											/>
										</Field>
										<Field label='Icon' htmlFor={`link-icon-${link.id}`}>
											<IconPicker
												id={`link-icon-${link.id}`}
												value={link.icon}
												onChange={(icon) => setLink(link.id, { icon })}
											/>
										</Field>
									</div>
								)}
							</div>
						))}
					</div>

					{item.style === 'mega' && (
						<PromoEditor
							promo={item.promo}
							pages={pages}
							onChange={(promo) => onChange({ promo })}
						/>
					)}
				</>
			)}
		</>
	)
}

function PromoEditor({
	promo,
	pages,
	onChange,
}: {
	promo: MenuPromo | null
	pages: Page[]
	onChange: (promo: MenuPromo | null) => void
}) {
	if (!promo)
		return (
			<div className='space-y-2'>
				<Label>Featured card</Label>
				<p className='text-xs text-slate-500'>
					A highlighted card on the right of the panel, for one thing you want
					seen first.
				</p>
				<Button
					type='button'
					variant='outline'
					size='sm'
					onClick={() => onChange(blankPromo())}
					className='border-white/15 bg-transparent'>
					<Plus /> Add a featured card
				</Button>
			</div>
		)

	const set = (patch: Partial<MenuPromo>) => onChange({ ...promo, ...patch })

	return (
		<div className='space-y-3 rounded-lg border border-white/10 bg-white/3 p-4'>
			<div className='flex items-center justify-between'>
				<Label>Featured card</Label>
				<Button
					type='button'
					variant='ghost'
					size='sm'
					className='text-destructive hover:text-destructive'
					onClick={() => onChange(null)}>
					<Trash2 /> Remove
				</Button>
			</div>
			<div className='grid gap-3 sm:grid-cols-2'>
				<Field label='Small heading' htmlFor='promo-eyebrow'>
					<Input
						id='promo-eyebrow'
						value={promo.eyebrow}
						maxLength={40}
						placeholder='Start here'
						onChange={(event) => set({ eyebrow: event.target.value })}
					/>
				</Field>
				<Field label='Title' htmlFor='promo-title'>
					<Input
						id='promo-title'
						value={promo.title}
						maxLength={100}
						onChange={(event) => set({ title: event.target.value })}
					/>
				</Field>
			</div>
			<Field label='Text' htmlFor='promo-body'>
				<Textarea
					id='promo-body'
					rows={3}
					value={promo.body}
					maxLength={240}
					onChange={(event) => set({ body: event.target.value })}
				/>
			</Field>
			<div className='grid gap-3 sm:grid-cols-2'>
				<Field label='Button text' htmlFor='promo-cta'>
					<Input
						id='promo-cta'
						value={promo.ctaLabel}
						maxLength={40}
						placeholder='Learn more'
						onChange={(event) => set({ ctaLabel: event.target.value })}
					/>
				</Field>
				<Field label='Goes to' htmlFor='promo-href'>
					<LinkTarget
						id='promo-href'
						value={promo.href}
						pages={pages}
						onChange={(href) => set({ href })}
					/>
				</Field>
			</div>
			<Field label='Image (optional)'>
				<MediaPicker value={promo.image} onChange={(image) => set({ image })} />
			</Field>
		</div>
	)
}
