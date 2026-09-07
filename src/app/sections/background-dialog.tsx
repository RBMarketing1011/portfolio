'use client'

import { useState } from 'react'
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
	defaultBackground,
	glowModes,
	glowSizes,
	patterns,
	type BackgroundSettings,
	type GlowSettings,
	type SurfaceSettings,
} from './background-settings'

const fills = [
	{ id: 'solid', label: 'Solid' },
	{ id: 'gradient', label: 'Gradient' },
] as const

const tabClass =
	'relative rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 text-sm font-medium text-slate-400 data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none'

function Choices<T extends string>({
	label,
	options,
	value,
	columns = 3,
	onChange,
}: {
	label: string
	options: readonly { id: T; label: string; hint?: string }[]
	value: T
	columns?: 2 | 3 | 4 | 5
	onChange: (value: T) => void
}) {
	return (
		<div>
			<Label className='text-xs text-slate-300'>{label}</Label>
			<div
				className={cn(
					'mt-2 grid gap-1.5',
					columns === 2 && 'grid-cols-2',
					columns === 3 && 'grid-cols-3',
					columns === 4 && 'grid-cols-4',
					columns === 5 && 'grid-cols-5',
				)}>
				{options.map((option) => (
					<button
						key={option.id}
						type='button'
						title={option.hint}
						onClick={() => onChange(option.id)}
						aria-pressed={value === option.id}
						className={cn(
							'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
							value === option.id
								? 'border-brand/40 bg-brand/12 text-white'
								: 'border-white/10 bg-white/3 text-slate-400 hover:border-white/25 hover:text-white',
						)}>
						{option.label}
					</button>
				))}
			</div>
		</div>
	)
}

function AngleField({
	id,
	label,
	value,
	disabled,
	onChange,
}: {
	id: string
	label: string
	value: number
	disabled?: boolean
	onChange: (value: number) => void
}) {
	return (
		<div className={cn(disabled && 'pointer-events-none opacity-40')}>
			<div className='flex items-baseline justify-between'>
				<Label htmlFor={id} className='text-xs text-slate-300'>
					{label}
				</Label>
				<span className='text-xs tabular-nums text-slate-500'>
					{value}&deg;
				</span>
			</div>
			<input
				id={id}
				type='range'
				min={0}
				max={359}
				step={1}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(Number(event.target.value))}
				className='mt-2 w-full accent-brand'
			/>
		</div>
	)
}

function SurfaceFields({
	idPrefix,
	value,
	onChange,
}: {
	idPrefix: string
	value: SurfaceSettings
	onChange: (next: SurfaceSettings) => void
}) {
	const set = <K extends keyof SurfaceSettings>(
		key: K,
		next: SurfaceSettings[K],
	) => onChange({ ...value, [key]: next })

	return (
		<div className='space-y-5'>
			<Choices
				label='Pattern'
				options={patterns}
				value={value.pattern}
				onChange={(pattern) => set('pattern', pattern)}
			/>
			<AngleField
				id={`${idPrefix}-pattern-angle`}
				label='Pattern angle'
				value={value.patternAngle}
				disabled={value.pattern === 'none'}
				onChange={(angle) => set('patternAngle', angle)}
			/>
			<Choices
				label='Color'
				options={fills}
				value={value.fill}
				columns={2}
				onChange={(fill) => set('fill', fill)}
			/>
			<AngleField
				id={`${idPrefix}-gradient-angle`}
				label='Gradient angle'
				value={value.gradientAngle}
				disabled={value.fill === 'solid'}
				onChange={(angle) => set('gradientAngle', angle)}
			/>
		</div>
	)
}

function GlowFields({
	label,
	value,
	onChange,
}: {
	label: string
	value: GlowSettings
	onChange: (next: GlowSettings) => void
}) {
	return (
		<div>
			<Choices
				label={label}
				options={glowModes}
				value={value.mode}
				columns={4}
				onChange={(mode) => onChange({ ...value, mode })}
			/>
			<div
				className={cn(
					'mt-3',
					value.mode === 'none' && 'pointer-events-none opacity-40',
				)}>
				<Choices
					label='Size'
					options={glowSizes}
					value={value.size}
					columns={5}
					onChange={(size) => onChange({ ...value, size })}
				/>
			</div>
		</div>
	)
}

export function BackgroundDialog({
	slug,
	settings,
	onChange,
}: {
	slug: string
	settings: BackgroundSettings
	onChange: (next: BackgroundSettings) => void
}) {
	const [open, setOpen] = useState(false)
	// Edits are staged so dragging an angle slider does not thrash the preview.
	const [draft, setDraft] = useState<BackgroundSettings>(settings)

	const isHeader = slug === 'site-header'
	const surfaceLabel = isHeader
		? 'Header'
		: slug === 'site-footer'
			? 'Footer'
			: 'Page'
	const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (next) setDraft(settings)
				setOpen(next)
			}}>
			<SheetTrigger asChild>
				<button
					type='button'
					title='Section background'
					className='flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
					<SlidersHorizontal className='size-4' />
					<span className='sr-only'>Section background</span>
				</button>
			</SheetTrigger>

			<SheetContent
				side='right'
				className='flex w-full flex-col gap-0 border-white/10 bg-panel p-0 sm:max-w-md'>
				<SheetHeader className='shrink-0 gap-2 border-b border-white/10 px-6 py-5'>
					<SheetTitle className='text-white'>Background</SheetTitle>
					<SheetDescription className='text-slate-400'>
						Colors are mixed from the accent and background set in Theme.
					</SheetDescription>
				</SheetHeader>

				{isHeader ? (
					<Tabs
						defaultValue='surface'
						className='flex min-h-0 flex-1 flex-col gap-0'>
						<TabsList className='h-auto shrink-0 justify-start gap-6 rounded-none border-b border-white/10 bg-transparent px-6 pt-1'>
							<TabsTrigger value='surface' className={tabClass}>
								{surfaceLabel}
							</TabsTrigger>
							<TabsTrigger value='menu' className={tabClass}>
								Mega menu
							</TabsTrigger>
						</TabsList>

						{/* Radix ScrollArea sizes its viewport with height:100%, which collapses
						    to auto inside a flex item, so a plain overflow box is used here. */}
						<div className='min-h-0 flex-1 overflow-y-auto px-6 py-5'>
							<TabsContent value='surface'>
								<SurfaceFields
									idPrefix='page'
									value={draft.page}
									onChange={(page) => setDraft({ ...draft, page })}
								/>
							</TabsContent>

							<TabsContent value='menu' className='space-y-5'>
								<div className='flex items-center justify-between gap-4'>
									<div>
										<p className='text-sm font-medium text-white'>Mega menu</p>
										<p className='mt-0.5 text-xs text-slate-500'>
											Off swaps each panel for a plain dropdown list.
										</p>
									</div>
									<button
										type='button'
										role='switch'
										aria-checked={draft.megaMenu}
										onClick={() =>
											setDraft({ ...draft, megaMenu: !draft.megaMenu })
										}
										className={cn(
											'relative h-5 w-9 shrink-0 rounded-full transition-colors',
											draft.megaMenu ? 'bg-brand' : 'bg-white/15',
										)}>
										<span
											className={cn(
												'absolute top-0.5 size-4 rounded-full bg-white transition-[left]',
												draft.megaMenu ? 'left-4.5' : 'left-0.5',
											)}
										/>
										<span className='sr-only'>Toggle mega menu</span>
									</button>
								</div>

								<SurfaceFields
									idPrefix='menu'
									value={draft.menu}
									onChange={(menu) => setDraft({ ...draft, menu })}
								/>

								<div className='space-y-5 border-t border-white/10 pt-5'>
									<GlowFields
										label='Panel glow'
										value={draft.panelGlow}
										onChange={(panelGlow) => setDraft({ ...draft, panelGlow })}
									/>
									<GlowFields
										label='Feature glow'
										value={draft.featureGlow}
										onChange={(featureGlow) =>
											setDraft({ ...draft, featureGlow })
										}
									/>
								</div>
							</TabsContent>
						</div>
					</Tabs>
				) : (
					<div className='min-h-0 flex-1 overflow-y-auto px-6 py-5'>
						<SurfaceFields
							idPrefix='page'
							value={draft.page}
							onChange={(page) => setDraft({ ...draft, page })}
						/>
					</div>
				)}

				<div className='flex shrink-0 items-center gap-2 border-t border-white/10 px-6 py-4'>
					{dirty && (
						<p className='mr-auto text-xs text-slate-500'>Unapplied changes</p>
					)}
					<SheetClose asChild>
						<Button
							type='button'
							variant='ghost'
							className={cn(
								'text-slate-400 hover:bg-white/5 hover:text-white',
								!dirty && 'mr-auto',
							)}>
							Cancel
						</Button>
					</SheetClose>
					<Button
						type='button'
						variant='outline'
						onClick={() => setDraft(defaultBackground)}
						className='border-white/20 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white'>
						<RotateCcw /> Reset
					</Button>
					<Button
						type='button'
						onClick={() => {
							onChange(draft)
							setOpen(false)
						}}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Check /> Apply
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	)
}
