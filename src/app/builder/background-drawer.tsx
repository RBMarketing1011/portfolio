'use client'

import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useBuilder } from '@/lib/builder/builder-context'
import { deriveScheme } from '@/lib/builder/design/scheme'
import { cn } from '@/lib/utils'
import {
	defaultBackground,
	globalBackground,
	glowModes,
	glowSizes,
	isSurfaceScheme,
	patterns,
	type BackgroundSettings,
	type GlowSettings,
	type SurfaceScheme,
	type SurfaceSettings,
} from './background-settings'
import {
	type ThemeSettings,
	paletteTokens,
	tintHex,
	type Tint,
} from './theme-settings'

const fills = [
	{ id: 'global', label: 'Global' },
	{ id: 'solid', label: 'Solid' },
	{ id: 'gradient', label: 'Gradient' },
	{ id: 'transparent', label: 'Transparent' },
] as const

type Fill = (typeof fills)[number]

// The site backdrop is what every page sits on: without a fill of its own the live site
// would show the browser's white canvas, so only real fills are offered for it.
const backdropFills = fills.filter(
	(fill) => fill.id === 'solid' || fill.id === 'gradient',
)

/** What a drawer edits on a built site. */
export type SurfaceScope = 'page' | 'header' | 'footer' | 'block'

const schemes = [
	{
		id: 'base',
		label: 'Site',
		hint: 'Text and buttons use the site’s own colors.',
	},
	{
		id: 'inverse',
		label: 'Inverted',
		hint: 'The palette flips: a dark band on a light site, a light band on a dark one.',
	},
	{
		id: 'brand',
		label: 'Accent',
		hint: 'The band is filled with the accent, with text that reads on it.',
	},
] as const satisfies readonly { id: SurfaceScheme; label: string; hint: string }[]

/**
 * The same settings drawn in another scheme. A band that paints nothing would set its
 * flipped text on whatever is behind it, so it gets its scheme's own background.
 */
function withScheme(
	settings: BackgroundSettings,
	scheme: SurfaceScheme,
): BackgroundSettings {
	const next: BackgroundSettings = { ...settings }
	delete next.scheme
	if (scheme === 'base') return next
	const painted =
		next.page.fill === 'solid' || next.page.fill === 'gradient'
			? next.page
			: {
					...next.page,
					fill: 'solid' as const,
					color: { token: 'background' as const, lightness: 0 },
				}
	return { ...next, page: painted, scheme }
}

function SchemeField({
	value,
	onChange,
}: {
	value: BackgroundSettings
	onChange: (next: BackgroundSettings) => void
}) {
	const current = value.scheme ?? 'base'
	return (
		<div className='mb-6 space-y-2 border-b border-white/10 pb-6'>
			<Label className='text-xs text-slate-300'>Colors</Label>
			<ToggleGroup
				type='single'
				spacing={1}
				aria-label='Colors'
				value={current}
				onValueChange={(next) => {
					// Radix lets the pressed item be pressed off (''); there is always a scheme.
					if (isSurfaceScheme(next)) onChange(withScheme(value, next))
				}}
				className='grid w-full grid-cols-3 gap-1.5'>
				{schemes.map((scheme) => (
					<ToggleGroupItem key={scheme.id} value={scheme.id} className={choiceItem}>
						{scheme.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<p className='text-xs leading-5 text-slate-500'>
				{schemes.find((scheme) => scheme.id === current)?.hint}
			</p>
		</div>
	)
}

const tabClass =
	'relative rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 text-sm font-medium text-slate-400 data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none'

// A toggle item drawn like the drawer's other choices.
const choiceItem =
	'h-auto min-w-0 rounded-md border border-white/10 bg-white/3 px-2 py-1.5 text-xs font-medium text-slate-400 hover:border-white/25 hover:bg-white/3 hover:text-white data-[state=on]:border-brand/40 data-[state=on]:bg-brand/12 data-[state=on]:text-white'

function Choices<T extends string>({
	label,
	options,
	value,
	columns = 3,
	swatch,
	onChange,
}: {
	label: string
	options: readonly { id: T; label: string; hint?: string }[]
	value: T
	columns?: 2 | 3 | 4 | 5
	/** Returns the hex an option resolves to, so the choice shows its color. */
	swatch?: (id: T) => string | undefined
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
				{options.map((option) => {
					const color = swatch?.(option.id)
					return (
						<button
							key={option.id}
							type='button'
							title={option.hint}
							onClick={() => onChange(option.id)}
							aria-pressed={value === option.id}
							className={cn(
								'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
								value === option.id
									? 'border-brand/40 bg-brand/12 text-white'
									: 'border-white/10 bg-white/3 text-slate-400 hover:border-white/25 hover:text-white',
							)}>
							{color && (
								<span
									aria-hidden
									className='size-3 shrink-0 rounded-full border border-white/20'
									style={{ backgroundColor: color }}
								/>
							)}
							{option.label}
						</button>
					)
				})}
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
	theme,
	fillOptions = fills,
	onChange,
}: {
	idPrefix: string
	value: SurfaceSettings
	theme: ThemeSettings
	fillOptions?: readonly Fill[]
	onChange: (next: SurfaceSettings) => void
}) {
	const set = <K extends keyof SurfaceSettings>(
		key: K,
		next: SurfaceSettings[K],
	) => onChange({ ...value, [key]: next })

	return (
		<div className='space-y-5'>
			<div>
				<Choices
					label='Fill'
					options={fillOptions}
					value={value.fill}
					columns={2}
					onChange={(fill) => set('fill', fill)}
				/>
				{value.fill === 'global' && (
					<p className='mt-2 text-xs leading-5 text-slate-500'>
						Paints nothing of its own. The one page background runs behind this,
						unbroken, exactly as it does everywhere else.
					</p>
				)}
			</div>

			{value.fill !== 'global' && (
				<>
					{value.fill === 'transparent' ? (
						<p className='text-xs leading-5 text-slate-500'>
							No fill of its own, but it still carries the pattern below.
						</p>
					) : value.fill === 'solid' ? (
						<TintField
							id={`${idPrefix}-color-lightness`}
							label='Surface color'
							value={value.color}
							theme={theme}
							onChange={(color) => set('color', color)}
						/>
					) : (
						<>
							<TintField
								id={`${idPrefix}-from-lightness`}
								label='Gradient from'
								value={value.from}
								theme={theme}
								onChange={(from) => set('from', from)}
							/>
							<TintField
								id={`${idPrefix}-to-lightness`}
								label='Gradient to'
								value={value.to}
								theme={theme}
								onChange={(to) => set('to', to)}
							/>
							<AngleField
								id={`${idPrefix}-gradient-angle`}
								label='Gradient angle'
								value={value.gradientAngle}
								onChange={(angle) => set('gradientAngle', angle)}
							/>
						</>
					)}

					<div className='border-t border-white/10 pt-5'>
						<Choices
							label='Pattern'
							options={patterns}
							value={value.pattern}
							onChange={(pattern) => set('pattern', pattern)}
						/>
					</div>
					<div
						className={cn(
							'space-y-5',
							value.pattern === 'none' && 'pointer-events-none opacity-40',
						)}>
						<AngleField
							id={`${idPrefix}-pattern-angle`}
							label='Pattern angle'
							value={value.patternAngle}
							onChange={(angle) => set('patternAngle', angle)}
						/>
						<TintField
							id={`${idPrefix}-pattern-lightness`}
							label='Pattern color'
							value={value.patternColor}
							theme={theme}
							onChange={(patternColor) => set('patternColor', patternColor)}
						/>
					</div>
				</>
			)}
		</div>
	)
}

function LightnessField({
	id,
	value,
	disabled,
	onChange,
}: {
	id: string
	value: number
	disabled?: boolean
	onChange: (value: number) => void
}) {
	return (
		<div className={cn('mt-2', disabled && 'pointer-events-none opacity-40')}>
			<div className='flex items-baseline justify-between text-xs text-slate-500'>
				<Label htmlFor={id} className='text-xs text-slate-500'>
					Darker
				</Label>
				<span className='tabular-nums text-slate-400'>
					{value > 0 ? `+${value}` : value}%
				</span>
				<span>Lighter</span>
			</div>
			<input
				id={id}
				type='range'
				min={-100}
				max={100}
				step={5}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(Number(event.target.value))}
				className='mt-1 w-full accent-brand'
			/>
		</div>
	)
}

/** A palette pick plus a lightness offset, so derived colors can be tuned. */
function TintField({
	id,
	label,
	value,
	theme,
	disabled,
	onChange,
}: {
	id: string
	label: string
	value: Tint
	theme: ThemeSettings
	disabled?: boolean
	onChange: (next: Tint) => void
}) {
	return (
		<div className={cn(disabled && 'pointer-events-none opacity-40')}>
			<Choices
				label={label}
				options={paletteTokens}
				value={value.token}
				columns={2}
				swatch={(token) => tintHex(theme, { ...value, token })}
				onChange={(token) => onChange({ ...value, token })}
			/>
			<LightnessField
				id={id}
				value={value.lightness}
				onChange={(lightness) => onChange({ ...value, lightness })}
			/>
		</div>
	)
}

function GlowFields({
	idPrefix,
	label,
	value,
	theme,
	onChange,
}: {
	idPrefix: string
	label: string
	value: GlowSettings
	theme: ThemeSettings
	onChange: (next: GlowSettings) => void
}) {
	return (
		<div>
			<Choices
				label={label}
				options={glowModes}
				value={value.mode}
				columns={2}
				swatch={(id) =>
					id === 'none'
						? undefined
						: tintHex(theme, { token: id, lightness: value.lightness })
				}
				onChange={(mode) => onChange({ ...value, mode })}
			/>
			<div
				className={cn(
					value.mode === 'none' && 'pointer-events-none opacity-40',
				)}>
				<LightnessField
					id={`${idPrefix}-lightness`}
					value={value.lightness}
					onChange={(lightness) => onChange({ ...value, lightness })}
				/>
				<div className='mt-3'>
					<Choices
						label='Size'
						options={glowSizes}
						value={value.size}
						columns={5}
						onChange={(size) => onChange({ ...value, size })}
					/>
				</div>
			</div>
		</div>
	)
}

export function BackgroundDrawer({
	slug,
	settings,
	theme,
	onChange,
	open,
	onOpenChange,
	extra,
	scope,
}: {
	slug: string
	settings: BackgroundSettings
	theme: ThemeSettings
	onChange: (next: BackgroundSettings) => void
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Extra controls shown above the surface fields. */
	extra?: React.ReactNode
	/**
	 * What the settings paint on a built site. It decides what Reset returns to (the
	 * header, the footer and a block have nothing of their own by default) and whether
	 * the colors can flip (blocks and the footer). Left out, it is read from the slug
	 * when the drawer is handed the site's own theme, and the section library (a theme
	 * from its URL) keeps its tabs by slug and Reset to the library's default.
	 */
	scope?: SurfaceScope
}) {
	// Edits are staged so dragging an angle slider does not thrash the preview.
	const [draft, setDraft] = useState<BackgroundSettings>(settings)

	// The parent opens the sheet by prop, which Radix does not report, so the draft is
	// seeded here: on every open, and whenever the surface it edits changes underneath
	// it (another block, the footer after the header). Set during render, not in an
	// effect, so the previous surface's values never flash.
	const target = open
		? `${scope ?? ''}\n${slug}\n${JSON.stringify(settings)}`
		: null
	const [seeded, setSeeded] = useState<string | null>(null)
	if (target !== seeded) {
		setSeeded(target)
		if (target !== null) setDraft(settings)
	}

	// Without a scope, a drawer handed this site's own theme is editing this site, so
	// anything but the header or the footer is a block. The section library hands it a
	// theme from its URL, and keeps the library's defaults.
	const site = useBuilder()
	const chromeSlug =
		slug === 'site-header' ? 'header' : slug === 'site-footer' ? 'footer' : null
	const kind: SurfaceScope | 'library' =
		scope ?? (theme === site.look.theme ? (chromeSlug ?? 'block') : 'library')
	const isHeader =
		kind === 'header' || (kind === 'library' && chromeSlug === 'header')
	const surfaceLabel = isHeader
		? 'Header'
		: kind === 'footer' || (kind === 'library' && chromeSlug === 'footer')
			? 'Footer'
			: 'Page'
	const resetTo =
		kind === 'header' || kind === 'footer' || kind === 'block'
			? globalBackground
			: defaultBackground
	const flips = kind === 'block' || kind === 'footer'
	const fillOptions = kind === 'page' ? backdropFills : fills
	// Inside a flipped band every token resolves to the band's colors, so the swatches do too.
	const shown =
		flips && (draft.scheme === 'inverse' || draft.scheme === 'brand')
			? { ...theme, ...deriveScheme(theme, draft.scheme) }
			: theme
	const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
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
								{extra}
								<SurfaceFields
									idPrefix='page'
									value={draft.page}
									theme={theme}
									onChange={(page) => setDraft({ ...draft, page })}
								/>
							</TabsContent>

							<TabsContent value='menu' className='space-y-5'>
								<div className='flex items-center justify-between gap-4'>
									<div className='space-y-0.5'>
										<Label
											htmlFor='background-mega-menu'
											className='text-sm font-medium text-white'>
											Mega menu
										</Label>
										<p className='text-xs text-slate-500'>
											Off swaps each panel for a plain dropdown list.
										</p>
									</div>
									<Switch
										id='background-mega-menu'
										checked={draft.megaMenu}
										onCheckedChange={(megaMenu) =>
											setDraft({ ...draft, megaMenu })
										}
										className='data-[state=checked]:bg-brand data-[state=unchecked]:bg-white/15'
									/>
								</div>

								<SurfaceFields
									idPrefix='menu'
									value={draft.menu}
									theme={theme}
									onChange={(menu) => setDraft({ ...draft, menu })}
								/>

								<div className='space-y-5 border-t border-white/10 pt-5'>
									<GlowFields
										idPrefix='panel-glow'
										label='Panel glow'
										value={draft.panelGlow}
										theme={theme}
										onChange={(panelGlow) => setDraft({ ...draft, panelGlow })}
									/>
									<GlowFields
										idPrefix='feature-glow'
										label='Feature glow'
										value={draft.featureGlow}
										theme={theme}
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
						{extra}
						{flips && <SchemeField value={draft} onChange={setDraft} />}
						<SurfaceFields
							idPrefix='page'
							value={draft.page}
							theme={shown}
							fillOptions={fillOptions}
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
						onClick={() => setDraft(resetTo)}
						className='border-white/20 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white'>
						<RotateCcw /> Reset
					</Button>
					<Button
						type='button'
						onClick={() => {
							onChange(draft)
							onOpenChange(false)
						}}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Check /> Apply
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	)
}
