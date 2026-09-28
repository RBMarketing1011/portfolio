'use client'

import { useRef, useState } from 'react'
import {
	ArrowDown,
	ArrowUp,
	ChevronRight,
	Copy,
	PanelRightClose,
	PanelRightOpen,
	Plus,
	RotateCcw,
	SlidersHorizontal,
	Trash2,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { isScalarList } from '@/lib/builder/hydrate'
import { formulaName } from '@/lib/builder/ids'
import { getSchema } from '@/lib/builder/schema'
import {
	clampLightness,
	paletteTokens,
	tintHex,
	type PaletteToken,
	type ThemeSettings,
	type Tint,
} from '@/app/builder/theme-settings'
import type { Block, Field } from '@/lib/builder/types'
import { IconPicker } from './icon-picker'
import { MediaPicker } from './media-picker'
import { ProseEditor } from './prose-editor'
import { SearchSelect } from './search-select'

export function BlockInspector({
	block,
	theme,
	open,
	onOpenChange,
	onVariantChange,
	onPropChange,
	onOpenColors,
	childOps,
}: {
	block: Block | null
	theme: ThemeSettings
	open: boolean
	onOpenChange: (open: boolean) => void
	onVariantChange: (variant: string) => void
	onPropChange: (key: string, value: unknown) => void
	onOpenColors: () => void
	childOps: {
		add: (type: string) => void
		remove: (childId: string) => void
		duplicate: (childId: string) => void
		move: (from: number, to: number) => void
		setProp: (childId: string, key: string, value: unknown) => void
		setVariant: (childId: string, variant: string) => void
		setAllTypes: (type: string) => void
		setAllVariants: (variant: string) => void
	}
}) {
	const schema = block ? getSchema(block.type) : null

	if (!block || !schema) {
		return (
			<InspectorShell open={open} onOpenChange={onOpenChange}>
				<div className='flex items-start justify-between gap-2 border-b border-white/10 px-4 py-4'>
					<p className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
						Inspector
					</p>
					<CloseInspector onClick={() => onOpenChange(false)} />
				</div>
				<p className='px-4 py-6 text-sm leading-6 text-slate-500'>
					Select a section in the list or click one in the preview to edit it.
				</p>
			</InspectorShell>
		)
	}

	const props = block.props ?? {}
	const itemKeys = new Set(schema.itemFields ?? [])
	const sectionFields = schema.fields.filter((f) => !itemKeys.has(f.key))
	const itemFields = schema.fields.filter((f) => itemKeys.has(f.key))
	const hasItemsTab = Boolean(schema.container) || itemFields.length > 0

	const renderFields = (list: typeof schema.fields) =>
		list.map((field) => (
			<FieldControl
				key={field.key}
				field={field}
				value={props[field.key]}
				theme={theme}
				siblings={props}
				blockProps={props}
				onChange={(value) => onPropChange(field.key, value)}
			/>
		))

	const sectionPanel = (
		<div className='space-y-5 px-4 py-5'>
			<button
				type='button'
				onClick={onOpenColors}
				className='flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/3 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/6 hover:text-white'>
				<span className='flex items-center gap-2'>
					<SlidersHorizontal className='size-3.5' /> Colors & background
				</span>
				<span className='text-xs text-slate-500'>Theme tints</span>
			</button>

			{schema.variants && schema.variants.length > 1 && (
				<div className='space-y-2'>
					<Label htmlFor='field-variant'>Variant</Label>
					<Select
						value={block.variant ?? schema.variants[0].id}
						onValueChange={onVariantChange}>
						<SelectTrigger id='field-variant' className='w-full'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{schema.variants.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			{renderFields(sectionFields)}
			{sectionFields.length === 0 && !hasItemsTab && (
				<p className='text-sm leading-6 text-slate-500'>
					This section has no content settings of its own.
				</p>
			)}
		</div>
	)

	return (
		<InspectorShell open={open} onOpenChange={onOpenChange}>
			<div className='border-b border-white/10 px-4 py-4'>
				<div className='flex items-start justify-between gap-2'>
					<p className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
						Inspector
					</p>
					<CloseInspector onClick={() => onOpenChange(false)} />
				</div>
				<p className='mt-2 font-display font-semibold text-white'>
					{schema.label}
				</p>
				<p className='mt-1 text-xs leading-5 text-slate-500'>
					{schema.description}
				</p>
			</div>

			{hasItemsTab ? (
				<Tabs
					defaultValue='section'
					className='flex min-h-0 flex-1 flex-col gap-0'>
					<TabsList className='h-auto w-full shrink-0 gap-4 rounded-none border-b border-white/10 bg-transparent px-4 pt-2'>
						<TabsTrigger value='section' className={inspectorTabClass}>
							Section
						</TabsTrigger>
						<TabsTrigger value='items' className={inspectorTabClass}>
							Items {schema.container ? `(${block.children?.length ?? 0})` : ''}
						</TabsTrigger>
					</TabsList>
					<TabsContent value='section' className='min-h-0 flex-1'>
						<ScrollArea className='h-full'>{sectionPanel}</ScrollArea>
					</TabsContent>
					<TabsContent value='items' className='min-h-0 flex-1'>
						<ScrollArea className='h-full'>
							{schema.container ? (
								<ItemsPanel
									block={block}
									accepts={schema.container.accepts}
									theme={theme}
									ops={childOps}
								/>
							) : (
								<div className='space-y-5 px-4 py-5'>
									{renderFields(itemFields)}
								</div>
							)}
						</ScrollArea>
					</TabsContent>
				</Tabs>
			) : (
				<ScrollArea className='min-h-0 flex-1'>{sectionPanel}</ScrollArea>
			)}
		</InspectorShell>
	)
}

/**
 * Animates between the open panel and a narrow rail. The panel keeps its full width
 * while the shell narrows, so the content slides out instead of reflowing.
 */
function InspectorShell({
	open,
	onOpenChange,
	children,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	children: React.ReactNode
}) {
	return (
		<aside
			className={cn(
				'relative h-full shrink-0 overflow-hidden border-l border-white/10 transition-[width] duration-300 ease-out motion-reduce:transition-none',
				open ? 'w-80' : 'w-10',
			)}>
			<button
				type='button'
				onClick={() => onOpenChange(true)}
				aria-label='Open inspector'
				tabIndex={open ? -1 : 0}
				className={cn(
					'absolute left-1 top-3 flex size-8 items-center justify-center rounded-md text-slate-400 transition-opacity duration-200 hover:bg-white/5 hover:text-white motion-reduce:transition-none',
					open ? 'pointer-events-none opacity-0' : 'opacity-100 delay-150',
				)}>
				<PanelRightOpen className='size-4' />
			</button>

			<div
				aria-hidden={!open}
				inert={!open}
				className={cn(
					'absolute inset-y-0 right-0 flex w-80 flex-col transition-opacity duration-200 motion-reduce:transition-none',
					open ? 'opacity-100 delay-100' : 'opacity-0',
				)}>
				{children}
			</div>
		</aside>
	)
}

const inspectorTabClass =
	'flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent pb-2 text-sm font-medium text-slate-400 data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none'

/** The collection editor: the whole array of child blocks, without leaving the section. */
function ItemsPanel({
	block,
	accepts,
	theme,
	ops,
}: {
	block: Block
	accepts: string[]
	theme: ThemeSettings
	ops: {
		add: (type: string) => void
		remove: (childId: string) => void
		duplicate: (childId: string) => void
		move: (from: number, to: number) => void
		setProp: (childId: string, key: string, value: unknown) => void
		setVariant: (childId: string, variant: string) => void
		setAllTypes: (type: string) => void
		setAllVariants: (variant: string) => void
	}
}) {
	const [openId, setOpenId] = useState<string | null>(null)
	const children = block.children ?? []

	// A collection holds one kind of item, so type and variant belong to the set.
	const itemType = children[0]?.type ?? accepts[0]
	const itemSchema = getSchema(itemType)
	const itemVariant =
		children[0]?.variant ?? itemSchema?.variants?.[0]?.id ?? ''

	return (
		<div className='space-y-3 px-4 py-5'>
			<div className='space-y-3 rounded-lg border border-white/10 bg-white/3 p-3'>
				<div className='space-y-2'>
					<Label>Item type</Label>
					<Select value={itemType} onValueChange={ops.setAllTypes}>
						<SelectTrigger className='w-full'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{accepts.map((type) => (
								<SelectItem key={type} value={type}>
									{getSchema(type)?.label ?? type}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className='text-xs leading-5 text-slate-500'>
						Every item in this collection uses this type.
					</p>
				</div>

				{itemSchema?.variants && itemSchema.variants.length > 1 && (
					<div className='space-y-2'>
						<Label>Item variant</Label>
						<Select value={itemVariant} onValueChange={ops.setAllVariants}>
							<SelectTrigger className='w-full'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{itemSchema.variants.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
			</div>

			{children.length === 0 && (
				<p className='text-sm leading-6 text-slate-500'>
					No items yet. Add one below.
				</p>
			)}

			{children.map((child, index) => {
				const childSchema = getSchema(child.type)
				const open = openId === child.id
				return (
					<div
						key={child.id}
						className='rounded-lg border border-white/10 bg-white/3'>
						<div className='flex items-center gap-1 p-2'>
							<button
								type='button'
								onClick={() => setOpenId(open ? null : child.id)}
								className='flex min-w-0 flex-1 items-center gap-2 text-left'>
								<ChevronRight
									className={cn(
										'size-3.5 shrink-0 text-slate-500 transition-transform',
										open && 'rotate-90',
									)}
								/>
								<span className='min-w-0 flex-1 truncate text-sm text-white'>
									{index + 1}. {childSchema?.label ?? child.type}
								</span>
							</button>
							<IconAction
								label='Move up'
								disabled={index === 0}
								onClick={() => ops.move(index, index - 1)}>
								<ArrowUp className='size-3.5' />
							</IconAction>
							<IconAction
								label='Move down'
								disabled={index === children.length - 1}
								onClick={() => ops.move(index, index + 1)}>
								<ArrowDown className='size-3.5' />
							</IconAction>
							<IconAction
								label='Duplicate item'
								onClick={() => ops.duplicate(child.id)}>
								<Copy className='size-3.5' />
							</IconAction>
							<IconAction
								label='Delete item'
								onClick={() => ops.remove(child.id)}
								className='hover:text-destructive'>
								<Trash2 className='size-3.5' />
							</IconAction>
						</div>

						{open && childSchema && (
							<div className='space-y-4 border-t border-white/10 px-3 py-4'>
								{childSchema.fields.map((field) => (
									<FieldControl
										key={field.key}
										field={field}
										theme={theme}
										value={(child.props ?? {})[field.key]}
										siblings={child.props ?? {}}
										onChange={(value) =>
											ops.setProp(child.id, field.key, value)
										}
									/>
								))}
							</div>
						)}
					</div>
				)
			})}

			<button
				type='button'
				onClick={() => ops.add(itemType)}
				className='flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 py-2 text-xs font-medium text-slate-400 transition-colors hover:border-brand/50 hover:text-white'>
				<Plus className='size-3.5' /> Add {itemSchema?.label ?? 'item'}
			</button>
		</div>
	)
}

function IconAction({
	label,
	onClick,
	disabled,
	className,
	children,
}: {
	label: string
	onClick: () => void
	disabled?: boolean
	className?: string
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className={cn(
				'flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent',
				className,
			)}>
			{children}
		</button>
	)
}

function CloseInspector({ onClick }: { onClick: () => void }) {
	return (
		<button
			type='button'
			onClick={onClick}
			aria-label='Close inspector'
			className='-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/5 hover:text-white'>
			<PanelRightClose className='size-4' />
		</button>
	)
}

function FieldControl({
	field,
	value,
	theme,
	hideHeader = false,
	siblings,
	blockProps,
	onChange,
}: {
	field: Field
	value: unknown
	theme: ThemeSettings
	/** Scalar list rows already carry their own label and delete button. */
	hideHeader?: boolean
	/** The other props on the same block, for fields that mirror a sibling list. */
	siblings?: Record<string, unknown>
	/** The block's top-level props, which a row cannot reach through `siblings`. */
	blockProps?: Record<string, unknown>
	onChange: (value: unknown) => void
}) {
	const isSet = value !== undefined && value !== null && value !== ''
	const inputRef = useRef<HTMLInputElement>(null)

	// Formula variables are derived from the input labels, so nobody has to guess them.
	const tokens = field.tokensFrom
		? ((blockProps?.[field.tokensFrom] as unknown[]) ?? [])
				.map((row, index) =>
					formulaName((row as Record<string, unknown>)?.label, index),
				)
				.filter(Boolean)
		: []

	const insert = (token: string) => {
		const el = inputRef.current
		const text = (value as string) ?? ''
		if (!el) {
			onChange(`${text}${token}`)
			return
		}
		const start = el.selectionStart ?? text.length
		const end = el.selectionEnd ?? text.length
		const next = text.slice(0, start) + token + text.slice(end)
		onChange(next)
		// Restore the caret after React writes the new value back in.
		requestAnimationFrame(() => {
			el.focus()
			el.setSelectionRange(start + token.length, start + token.length)
		})
	}

	const header = hideHeader ? null : (
		<div className='flex items-center justify-between gap-2'>
			<Label htmlFor={`field-${field.key}`}>{field.label}</Label>
			{isSet && (
				<button
					type='button'
					onClick={() => onChange(undefined)}
					aria-label={`Reset ${field.label}`}
					className='flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-white'>
					<RotateCcw className='size-3' /> Reset
				</button>
			)}
		</div>
	)

	if (field.type === 'list') {
		return (
			<ListControl
				field={field}
				value={value}
				theme={theme}
				siblings={siblings}
				blockProps={blockProps}
				onChange={onChange}
				header={header}
			/>
		)
	}

	if (field.type === 'group') {
		const row = (value as Record<string, unknown>) ?? {}
		return (
			<div className='space-y-2'>
				{header}
				<div className='space-y-3 rounded-lg border border-white/10 bg-white/3 p-3'>
					{(field.of ?? []).map((sub) => (
						<FieldControl
							key={sub.key}
							field={sub}
							theme={theme}
							value={row[sub.key]}
							siblings={row}
							onChange={(next) => onChange({ ...row, [sub.key]: next })}
						/>
					))}
				</div>
				{field.hint && (
					<p className='text-xs leading-5 text-slate-500'>{field.hint}</p>
				)}
			</div>
		)
	}

	if (field.type === 'tint') {
		return (
			<div className='space-y-2'>
				{header}
				<TintControl
					value={(value as Tint) ?? { token: 'accent', lightness: 0 }}
					theme={theme}
					onChange={onChange}
				/>
				{field.hint && (
					<p className='text-xs leading-5 text-slate-500'>{field.hint}</p>
				)}
			</div>
		)
	}

	const control = (() => {
		switch (field.type) {
			case 'textarea':
			case 'richtext':
				return (
					<Textarea
						id={`field-${field.key}`}
						rows={field.type === 'richtext' ? 3 : 4}
						value={(value as string) ?? ''}
						placeholder='Using the section default'
						onChange={(event) => onChange(event.target.value)}
						className='border-white/10 bg-white/4 text-sm'
					/>
				)
			case 'number':
				return (
					<Input
						id={`field-${field.key}`}
						type='number'
						min={field.min}
						max={field.max}
						step={field.step}
						value={(value as number | undefined) ?? ''}
						placeholder='Default'
						onChange={(event) =>
							onChange(
								event.target.value === ''
									? undefined
									: Number(event.target.value),
							)
						}
						className='border-white/10 bg-white/4 text-sm'
					/>
				)
			case 'range': {
				const min = field.min ?? 0
				const max = field.max ?? 100
				const current =
					typeof value === 'number'
						? value
						: typeof field.defaultValue === 'number'
							? field.defaultValue
							: max
				return (
					<div className='flex items-center gap-3'>
						<input
							id={`field-${field.key}`}
							type='range'
							min={min}
							max={max}
							step={field.step ?? 1}
							value={current}
							onChange={(event) => onChange(Number(event.target.value))}
							className='h-1 min-w-0 flex-1 accent-brand'
						/>
						<span className='w-12 shrink-0 text-right text-xs tabular-nums text-slate-400'>
							{current}
							{field.unit}
						</span>
					</div>
				)
			}
			case 'prose':
				return (
					<ProseEditor
						value={value as string | undefined}
						onChange={onChange}
					/>
				)
			case 'boolean': {
				// Unset must read the component's own default, not a blanket false.
				const on =
					typeof value === 'boolean' ? value : field.defaultValue === true
				return (
					<button
						type='button'
						role='switch'
						aria-checked={on}
						onClick={() => onChange(!on)}
						className={cn(
							'flex h-6 w-11 items-center rounded-full border transition-colors',
							on
								? 'border-brand bg-brand/30 justify-end'
								: 'border-white/15 bg-white/5 justify-start',
						)}>
						<span
							className={cn(
								'mx-0.5 size-4 rounded-full transition-colors',
								on ? 'bg-brand' : 'bg-slate-500',
							)}
						/>
					</button>
				)
			}
			case 'select': {
				const options = field.options ?? []
				if (options.length > 5) {
					return (
						<SearchSelect
							id={`field-${field.key}`}
							value={value === undefined ? undefined : String(value)}
							options={options}
							placeholder='Default'
							onChange={onChange}
						/>
					)
				}
				return (
					<Select
						value={value === undefined ? undefined : String(value)}
						onValueChange={onChange}>
						<SelectTrigger className='w-full border-white/10 bg-white/4 text-sm'>
							<SelectValue placeholder='Default' />
						</SelectTrigger>
						<SelectContent>
							{options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)
			}
			case 'icon':
				return (
					<IconPicker
						id={`field-${field.key}`}
						value={value as string | undefined}
						onChange={onChange}
					/>
				)
			case 'image':
				return (
					<MediaPicker
						value={value as string | undefined}
						onChange={onChange}
					/>
				)
			default:
				return (
					<Input
						ref={inputRef}
						id={`field-${field.key}`}
						value={(value as string) ?? ''}
						placeholder='Using the section default'
						onChange={(event) => onChange(event.target.value)}
						className='border-white/10 bg-white/4 text-sm'
					/>
				)
		}
	})()

	return (
		<div className='space-y-2'>
			{header}
			{control}
			{field.tokensFrom && (
				<div className='flex flex-wrap items-center gap-1'>
					{tokens.length === 0 ? (
						<span className='text-xs text-slate-500'>
							Add an input above to get variables.
						</span>
					) : (
						<>
							{tokens.map((token) => (
								<button
									key={token}
									type='button'
									title={`Insert ${token}`}
									onClick={() => insert(token)}
									className='rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] text-brand transition-colors hover:border-brand/60 hover:bg-brand/20'>
									{token}
								</button>
							))}
							<span className='mx-1 h-3 w-px bg-white/15' />
							{['(', ')', '+', '-', '*', '/'].map((op) => (
								<button
									key={op}
									type='button'
									title={`Insert ${op}`}
									onClick={() => insert(op)}
									className='w-6 rounded border border-white/12 bg-white/5 py-0.5 font-mono text-[11px] text-slate-300 transition-colors hover:border-white/30 hover:text-white'>
									{op}
								</button>
							))}
						</>
					)}
				</div>
			)}
			{field.hint && (
				<p className='text-xs leading-5 text-slate-500'>{field.hint}</p>
			)}
		</div>
	)
}

/** A new row must match each field's shape, or the section maps over a string. */
function blankValue(field: Field | undefined): unknown {
	switch (field?.type) {
		case 'boolean':
			return false
		case 'list':
			return []
		case 'number':
		case 'range':
		case 'select':
		case 'icon':
		case 'image':
		case 'tint':
			return undefined
		default:
			return ''
	}
}

/** "Paths" -> "Path", so the add button is the singular of the list's own label. */
function singular(label: string) {
	if (/ies$/i.test(label)) return label.slice(0, -3) + 'y'
	if (/(ses|xes|ches|shes)$/i.test(label)) return label.slice(0, -2)
	if (/s$/i.test(label) && !/ss$/i.test(label)) return label.slice(0, -1)
	return label
}

function ListControl({
	field,
	value,
	theme,
	siblings,
	blockProps,
	onChange,
	header,
}: {
	field: Field
	value: unknown
	theme: ThemeSettings
	siblings?: Record<string, unknown>
	blockProps?: Record<string, unknown>
	onChange: (value: unknown) => void
	header: React.ReactNode
}) {
	const scalar = isScalarList(field)
	const stored = Array.isArray(value) ? (value as unknown[]) : []
	// A mirrored list has exactly one slot per row of the list it follows.
	const mirror = field.slotsFrom
		? ((siblings?.[field.slotsFrom] as unknown[]) ?? [])
		: null
	const slots = mirror ? mirror.length : field.fixed
	// A fixed list always shows its full set of slots, so the count cannot drift.
	const rows = slots
		? Array.from({ length: slots }, (_, i) => stored[i])
		: stored

	const slotLabel = (index: number) => {
		if (!mirror) return `${field.label} ${index + 1}`
		const row = mirror[index]
		const label =
			typeof row === 'string'
				? row
				: ((row as Record<string, unknown>)?.value as string)
		return label || `Column ${index + 1}`
	}

	const setRow = (index: number, next: unknown) => {
		const copy = [...rows]
		copy[index] = next
		onChange(copy)
	}

	const addRow = () => {
		const blank = scalar
			? blankValue(field.of?.[0])
			: Object.fromEntries((field.of ?? []).map((f) => [f.key, blankValue(f)]))
		onChange([...rows, blank])
	}

	return (
		<div className='space-y-2'>
			{header}
			<div className='space-y-2'>
				{rows.map((row, index) => (
					<div
						key={index}
						className='rounded-lg border border-white/10 bg-white/3 p-3'>
						<div className='flex items-center justify-between gap-2'>
							<span className='text-xs font-medium text-slate-400'>
								{scalar
									? slotLabel(index)
									: String(
											(row as Record<string, unknown>)?.[
												field.rowLabel ?? ''
											] || `Item ${index + 1}`,
										)}
							</span>
							{mirror ? null : field.fixed ? (
								row !== undefined &&
								row !== '' && (
									<button
										type='button'
										onClick={() => setRow(index, undefined)}
										aria-label={`Clear ${field.label} ${index + 1}`}
										className='flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-white'>
										<RotateCcw className='size-3' /> Clear
									</button>
								)
							) : (
								<button
									type='button'
									onClick={() => onChange(rows.filter((_, i) => i !== index))}
									aria-label='Remove item'
									className='flex size-6 items-center justify-center rounded text-slate-500 transition-colors hover:text-destructive'>
									<Trash2 className='size-3.5' />
								</button>
							)}
						</div>

						{scalar ? (
							// A scalar row still needs the control its type calls for, so an
							// image row gets the picker rather than a bare text box.
							<div className='mt-2'>
								<FieldControl
									field={field.of![0]}
									theme={theme}
									value={row}
									hideHeader
									onChange={(next) => setRow(index, next)}
								/>
							</div>
						) : (
							<div className='mt-3 space-y-3'>
								{(field.of ?? []).map((sub) => (
									<FieldControl
										key={sub.key}
										field={sub}
										theme={theme}
										value={(row as Record<string, unknown>)?.[sub.key]}
										siblings={row as Record<string, unknown>}
										blockProps={blockProps}
										onChange={(next) =>
											setRow(index, {
												...(row as Record<string, unknown>),
												[sub.key]: next,
											})
										}
									/>
								))}
							</div>
						)}
					</div>
				))}
			</div>
			{!field.fixed && !mirror && (
				<button
					type='button'
					onClick={addRow}
					className='flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 py-2 text-xs font-medium text-slate-400 transition-colors hover:border-brand/50 hover:text-white'>
					<Plus className='size-3.5' /> Add{' '}
					{field.addLabel ?? singular(field.label)}
				</button>
			)}
			{field.hint && (
				<p className='text-xs leading-5 text-slate-500'>{field.hint}</p>
			)}
		</div>
	)
}

/** A palette token plus a lightness offset, matching the background drawer. */
function TintControl({
	value,
	theme,
	onChange,
}: {
	value: Tint
	theme: ThemeSettings
	onChange: (value: Tint) => void
}) {
	return (
		<div className='space-y-2.5'>
			<div className='grid grid-cols-4 gap-1'>
				{paletteTokens.map((token) => {
					const active = value.token === token.id
					return (
						<button
							key={token.id}
							type='button'
							onClick={() => onChange({ ...value, token: token.id })}
							className={cn(
								'flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[10px] transition-colors',
								active
									? 'border-brand bg-brand/10 text-white'
									: 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white',
							)}>
							<span
								className='size-4 rounded-full border border-white/20'
								style={{
									background: tintHex(theme, {
										token: token.id as PaletteToken,
										lightness: value.lightness,
									}),
								}}
							/>
							{token.label}
						</button>
					)
				})}
			</div>
			<div className='flex items-center gap-2'>
				<input
					type='range'
					min={-100}
					max={100}
					step={5}
					value={value.lightness}
					aria-label='Lightness'
					onChange={(event) =>
						onChange({
							...value,
							lightness: clampLightness(Number(event.target.value)),
						})
					}
					className='h-1 min-w-0 flex-1 accent-brand'
				/>
				<span className='w-10 shrink-0 text-right text-xs tabular-nums text-slate-500'>
					{value.lightness > 0 ? `+${value.lightness}` : value.lightness}
				</span>
			</div>
			<p className='text-[11px] text-slate-500'>
				Negative is darker, positive is lighter.
			</p>
		</div>
	)
}
