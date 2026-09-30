'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
	Check,
	ChevronsUpDown,
	Copy,
	Eye,
	EyeOff,
	GripVertical,
	MoreVertical,
	Plus,
	Settings2,
	SlidersHorizontal,
	Trash2,
} from 'lucide-react'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BackgroundDrawer } from './background-drawer'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useBuilder } from '@/lib/builder/builder-context'
import { getSchema } from '@/lib/builder/schema'
import {
	displaySlug,
	FOOTER_VARIANT_LABELS,
	FOOTER_VARIANTS,
	HEADER_VARIANT_LABELS,
	HEADER_VARIANTS,
	type Chrome,
	type Template,
} from '@/lib/builder/page-schema'
import type { Block } from '@/lib/builder/types'
import { globalBackground } from './background-settings'
import { SaveButton } from './save-button'
import { SiteSwitcher } from './site-switcher'
import { AddPageDialog } from './builder/add-page-dialog'
import { SectionPicker } from './builder/section-picker'
import { ChromeSettingsDrawer } from './builder/chrome-settings-drawer'

export function PagesNav({
	templates,
	signedIn = false,
}: {
	templates: Template[]
	signedIn?: boolean
}) {
	const router = useRouter()
	const store = useBuilder()
	const [addOpen, setAddOpen] = useState(false)
	const [pickerOpen, setPickerOpen] = useState(false)
	const [pageOpen, setPageOpen] = useState(false)
	const [settings, setSettings] = useState<'header' | 'footer' | null>(null)
	const [blockSettings, setBlockSettings] = useState<string | null>(null)
	const [dragIndex, setDragIndex] = useState<number | null>(null)
	const [overIndex, setOverIndex] = useState<number | null>(null)

	const pagesBase = `/builder/sites/${store.siteId}/pages`

	const page = store.pages.find((p) => p.id === store.pageId) ?? null

	// The canvas lives in an iframe, so scrolling has to be asked for by message.
	// Deferred so the selection re-render lands first and cannot interrupt the scroll.
	const scrollToBlock = (id: string) => {
		requestAnimationFrame(() =>
			document
				.querySelector('iframe')
				?.contentWindow?.postMessage(
					{ kind: 'builder:scroll-to', id },
					window.location.origin,
				),
		)
	}

	return (
		<div className='flex min-h-0 flex-1 flex-col'>
			<div className='space-y-3 px-4'>
				<SiteSwitcher signedIn={signedIn} />

				<Field label='Header'>
					<div className='flex items-center gap-1.5'>
						<Select
							value={store.chrome.header}
							onValueChange={(header) =>
								store.setChrome({ header: header as Chrome['header'] })
							}>
							<SelectTrigger className='min-w-0 flex-1'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{HEADER_VARIANTS.map((id) => (
									<SelectItem key={id} value={id}>
										{HEADER_VARIANT_LABELS[id]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldButton
							label='Header settings'
							onClick={() => setSettings('header')}>
							<Settings2 className='size-4' />
						</FieldButton>
					</div>
				</Field>

				<Field label='Footer'>
					<div className='flex items-center gap-1.5'>
						<Select
							value={store.chrome.footer}
							onValueChange={(footer) =>
								store.setChrome({ footer: footer as Chrome['footer'] })
							}>
							<SelectTrigger className='min-w-0 flex-1'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FOOTER_VARIANTS.map((id) => (
									<SelectItem key={id} value={id}>
										{FOOTER_VARIANT_LABELS[id]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldButton
							label='Footer settings'
							onClick={() => setSettings('footer')}>
							<Settings2 className='size-4' />
						</FieldButton>
					</div>
				</Field>

				<Field label='Page'>
					<div className='flex items-center gap-1.5'>
						<Popover open={pageOpen} onOpenChange={setPageOpen}>
							<PopoverTrigger asChild>
								<button
									type='button'
									role='combobox'
									aria-expanded={pageOpen}
									className='flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-white/12 bg-white/3 px-3 text-sm text-white transition-colors hover:bg-white/6'>
									<span className='truncate'>
										{page?.name ?? 'Select a page'}
									</span>
									<ChevronsUpDown className='size-3.5 shrink-0 opacity-50' />
								</button>
							</PopoverTrigger>
							<PopoverContent className='w-(--radix-popover-trigger-width) p-0'>
								<Command>
									<CommandInput placeholder='Search pages…' />
									<CommandList>
										<CommandEmpty>No page found.</CommandEmpty>
										<CommandGroup>
											{store.pages.map((item) => (
												<CommandItem
													key={item.id}
													value={`${item.name} ${item.slug}`}
													onSelect={() => {
														setPageOpen(false)
														router.push(`${pagesBase}/${item.id}`)
													}}>
													<Check
														className={cn(
															'size-3.5',
															item.id === store.pageId
																? 'opacity-100 text-brand'
																: 'opacity-0',
														)}
													/>
													<span className='min-w-0 flex-1 truncate'>
														{item.name}
													</span>
													<span className='shrink-0 text-xs text-slate-500'>
														{displaySlug(item.slug)}
													</span>
												</CommandItem>
											))}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
						<FieldButton label='Add page' onClick={() => setAddOpen(true)}>
							<Plus className='size-4' />
						</FieldButton>
					</div>
				</Field>
			</div>

			{page && (
				<>
					<div className='mt-6 flex items-center gap-1 border-y border-white/10 px-4 py-2'>
						<p className='min-w-0 flex-1 text-xs font-semibold uppercase tracking-widest text-slate-500'>
							Layers
						</p>
						<IconButton
							label={
								page.inHeader
									? `Remove ${page.name} from the header`
									: `Add ${page.name} to the header`
							}
							onClick={() =>
								store.renamePage(page.id, { inHeader: !page.inHeader })
							}
							className={page.inHeader ? 'text-brand' : 'text-slate-500'}>
							{page.inHeader ? (
								<Eye className='size-3.5' />
							) : (
								<EyeOff className='size-3.5' />
							)}
						</IconButton>
						<IconButton
							label={`Delete ${page.name}`}
							onClick={() => {
								store.removePage(page.id)
								router.push(pagesBase)
							}}
							className='text-slate-500 hover:text-destructive'>
							<Trash2 className='size-3.5' />
						</IconButton>
						<button
							type='button'
							onClick={() => setPickerOpen(true)}
							className='ml-1 flex shrink-0 items-center gap-1 rounded-md bg-brand/15 px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/25'>
							<Plus className='size-3.5' /> Add
						</button>
					</div>

					<ScrollArea className='min-h-0 flex-1'>
						<div className='px-2 py-2'>
							{page.blocks.length === 0 ? (
								<p className='px-2 py-4 text-sm leading-6 text-slate-500'>
									This page is empty. Add a section to get going.
								</p>
							) : (
								<ul className='space-y-1'>
									{page.blocks.map((block, index) => (
										<BlockRow
											key={block.id}
											block={block}
											active={block.id === store.selectedId}
											dragging={dragIndex === index}
											dropTarget={overIndex === index && dragIndex !== index}
											onSelect={() => {
												store.setSelectedId(block.id)
												scrollToBlock(block.id)
											}}
											onSettings={() => {
												store.setSelectedId(block.id)
												store.setInspectorOpen(true)
											}}
											onDuplicate={() => store.duplicateSection(block.id)}
											onRemove={() => store.removeSection(block.id)}
											onDragStart={() => setDragIndex(index)}
											onDragOver={() => setOverIndex(index)}
											onDrop={() => {
												if (dragIndex !== null)
													store.moveSection(dragIndex, index)
												setDragIndex(null)
												setOverIndex(null)
											}}
											onDragEnd={() => {
												setDragIndex(null)
												setOverIndex(null)
											}}
										/>
									))}
								</ul>
							)}
						</div>
					</ScrollArea>
				</>
			)}

			{/* Outside the scroller on purpose: the layer list has to run underneath it. */}
			<div className='mt-auto shrink-0 border-t border-white/10 p-3'>
				<SaveButton variant='sidebar' signedIn={signedIn} />
			</div>

			<AddPageDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				templates={templates}
				isHome={store.pages.length === 0}
				onCreate={({ name, slug, templateSlug, inHeader }) => {
					const template = templates.find((t) => t.slug === templateSlug)
					const id = store.addPage(name, slug, template?.blocks ?? [], inHeader)
					router.push(`${pagesBase}/${id}`)
				}}
			/>

			<SectionPicker
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				onPick={(type) => store.addSection(type, store.selectedId)}
			/>

			<ChromeSettingsDrawer
				scope={settings ?? 'header'}
				open={settings !== null}
				onOpenChange={(next) => !next && setSettings(null)}
				chrome={store.chrome}
				pages={store.pages}
				theme={store.look.theme}
				background={
					settings === 'footer' ? store.look.footer : store.look.header
				}
				onChrome={store.setChrome}
				onBackground={(next) =>
					store.setLook(
						settings === 'footer' ? { footer: next } : { header: next },
					)
				}
			/>

			<BackgroundDrawer
				slug={
					page?.blocks.find((b) => b.id === blockSettings)?.type ?? 'section'
				}
				open={blockSettings !== null}
				onOpenChange={(next) => !next && setBlockSettings(null)}
				settings={store.look.blocks[blockSettings ?? ''] ?? globalBackground}
				theme={store.look.theme}
				onChange={(next) =>
					blockSettings && store.setBlockLook(blockSettings, next)
				}
			/>
		</div>
	)
}

function FieldButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			aria-label={label}
			className='flex size-9 shrink-0 items-center justify-center rounded-md border border-white/12 bg-white/3 text-slate-400 transition-colors hover:bg-white/6 hover:text-white'>
			{children}
		</button>
	)
}

function Field({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div>
			<span className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
				{label}
			</span>
			<div className='mt-1.5'>{children}</div>
		</div>
	)
}

function IconButton({
	label,
	onClick,
	className,
	children,
}: {
	label: string
	onClick: () => void
	className?: string
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			aria-label={label}
			className={cn(
				'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/5',
				className,
			)}>
			{children}
		</button>
	)
}

function BlockRow({
	block,
	active,
	dragging,
	dropTarget,
	onSelect,
	onSettings,
	onDuplicate,
	onRemove,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
}: {
	block: Block
	active: boolean
	dragging: boolean
	dropTarget: boolean
	onSelect: () => void
	onSettings: () => void
	onDuplicate: () => void
	onRemove: () => void
	onDragStart: () => void
	onDragOver: () => void
	onDrop: () => void
	onDragEnd: () => void
}) {
	const schema = getSchema(block.type)
	const variantLabel = schema?.variants?.find(
		(v) => v.id === block.variant,
	)?.label

	return (
		<li
			draggable
			onDragStart={onDragStart}
			onDragOver={(event) => {
				event.preventDefault()
				onDragOver()
			}}
			onDrop={(event) => {
				event.preventDefault()
				onDrop()
			}}
			onDragEnd={onDragEnd}
			className={cn(
				'group flex items-center gap-1 rounded-md pr-1 transition-colors',
				active ? 'bg-brand/15' : 'hover:bg-white/5',
				dragging && 'opacity-40',
				dropTarget && 'ring-1 ring-brand/60',
			)}>
			<span className='flex size-7 shrink-0 cursor-grab items-center justify-center text-slate-600 active:cursor-grabbing'>
				<GripVertical className='size-3.5' />
			</span>
			<button
				type='button'
				onClick={onSelect}
				className='flex min-w-0 flex-1 flex-col py-1.5 text-left'>
				<span
					className={cn(
						'truncate text-sm font-medium',
						active ? 'text-white' : 'text-slate-300',
					)}>
					{schema?.label ?? block.type}
				</span>
				{(variantLabel || block.children?.length) && (
					<span className='truncate text-xs text-slate-500'>
						{[
							variantLabel,
							block.children?.length && `${block.children.length} items`,
						]
							.filter(Boolean)
							.join(' · ')}
					</span>
				)}
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type='button'
						aria-label={`${schema?.label ?? block.type} actions`}
						className='flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 transition-all hover:bg-white/5 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100'>
						<MoreVertical className='size-3.5' />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align='end' className='w-40'>
					<DropdownMenuItem onSelect={onDuplicate}>
						<Copy className='size-3.5' /> Duplicate
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={onSettings}>
						<SlidersHorizontal className='size-3.5' /> Settings
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={onRemove}
						className='text-destructive focus:text-destructive'>
						<Trash2 className='size-3.5' /> Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</li>
	)
}
