'use client'

/**
 * The compose view (section 13.4, 13.5): what to build, the brief, and the optional
 * business details, photos, reviews and design choices. Every choice defaults to "AI
 * decides". State in, callbacks out: the host owns the draft.
 */
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Sparkles, Trash2, X } from 'lucide-react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FontCombobox } from '@/app/builder/font-combobox'
import type { ThemeSettings } from '@/app/builder/theme-settings'
import {
	AI_LIMITS,
	type ApiError,
	type BuildPins,
	type CapabilityResponse,
	type OwnerReview,
	type PinFonts,
	type PinPalette,
} from '@/lib/builder/ai/contract'
import { FONT_PAIRS } from '@/lib/builder/design/fonts'
import { PALETTES, paletteById } from '@/lib/builder/design/palettes'
import { polarityOf } from '@/lib/builder/design/scheme'
import { FOOTER_VARIANT_LABELS, HEADER_VARIANT_LABELS } from '@/lib/builder/page-schema'
import { BUSINESS_TYPES, type BusinessType } from '@/lib/builder/site-profile'
import {
	errorCopy,
	localTime,
	unitsFor,
	type ComposeDraft,
	type DraftProblem,
} from './ai-build-runner'

// ---------------------------------------------------------------- copy

const PLACEHOLDER_SITE =
	'Tell it about the business and the site you want. For example: A family-owned roofing company in Austin. We do repairs, replacements and storm damage, and help with insurance claims. Free inspections. Call (512) 555-0142.'
const PLACEHOLDER_REPLACE =
	'What should the new site be like? It already knows your pages and business details.'
const PLACEHOLDER_ADD =
	'Which pages should it add? It already knows your pages and business details.'
const PLACEHOLDER_PAGE =
	'What is this page for? For example: A page for our emergency roof repair service, same-day in Austin.'
const PLACEHOLDER_REBUILD = 'What should this page do better?'

const EXAMPLES = [
	{
		label: 'Roofing company in Austin',
		brief:
			'Family-owned roofing company in Austin since 2004. Repairs, full replacements, storm damage and insurance claims. Free inspections. Call (512) 555-0142.',
	},
	{
		label: 'Calm dental clinic',
		brief:
			'A calm, modern dental clinic for nervous patients. Cleanings, whitening, Invisalign and emergency visits, with evening appointments. We take most insurance plans.',
	},
	{
		label: 'Neighborhood café',
		brief:
			'A neighborhood café with coffee roasted in house, fresh pastries every morning and a quiet room to work in. Open 7 to 4 every day, with seats outside.',
	},
]

export type ComposePage = { id: string; name: string; sections: number }

/** The placeholder and the primary button's label for what is being composed. */
export function composeCopy(draft: ComposeDraft, pages: ComposePage[]) {
	if (draft.mode === 'site') {
		if (pages.length === 0) return { placeholder: PLACEHOLDER_SITE, primary: 'Build my site' }
		if (draft.placement === 'replace-site') return { placeholder: PLACEHOLDER_REPLACE, primary: 'Rebuild my site' }
		return { placeholder: PLACEHOLDER_ADD, primary: 'Add pages' }
	}
	if (draft.placement === 'replace-page') {
		const target = pages.find((page) => page.id === draft.targetPageId)
		return {
			placeholder: PLACEHOLDER_REBUILD,
			primary: target && target.sections > 0 ? 'Rebuild this page' : 'Build this page',
		}
	}
	return { placeholder: PLACEHOLDER_PAGE, primary: 'Build this page' }
}

// ---------------------------------------------------------------- reviews

const QUOTES = /^["“”‘’']+|["“”‘’']+$/g

/**
 * Pasted reviews: blocks separated by blank lines; a last line that starts with -, –, —
 * or ~ is the attribution, split at its first comma into name and role.
 */
export function parseReviews(text: string): OwnerReview[] {
	return text
		.split(/\n\s*\n/)
		.map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
		.filter((lines) => lines.length > 0)
		.map((lines) => {
			const last = lines[lines.length - 1]
			const attributed = lines.length > 1 && /^[-–—~]/.test(last)
			const quote = (attributed ? lines.slice(0, -1) : lines).join(' ').replace(QUOTES, '').trim()
			const attribution = attributed ? last.replace(/^[-–—~]+\s*/, '') : ''
			const comma = attribution.indexOf(',')
			return {
				quote,
				name: (comma === -1 ? attribution : attribution.slice(0, comma)).trim(),
				role: comma === -1 ? '' : attribution.slice(comma + 1).trim(),
				source: '',
			}
		})
		.filter((review) => review.quote.length > 0)
}

// ---------------------------------------------------------------- props

export type ComposeProps = {
	draft: ComposeDraft
	onDraft: (next: ComposeDraft) => void
	/** The site's pages, in order. */
	pages: ComposePage[]
	theme: ThemeSettings
	/** Project images, newest first. */
	media: { id: string; name: string; src: string }[]
	uploading: number
	onUpload: (files: File[]) => void
	capability: CapabilityResponse | null
	/** A field the person has to fix, from the checks here or the server's. */
	problem: DraftProblem | null
	/** The plan failed; the draft is kept. */
	error: ApiError | null
	/** Whether the failed plan cost nothing (all of it was refunded). */
	refunded: boolean
	onSubmit: () => void
	onCancel: () => void
	onResume: (buildId: string) => void
	onRestart: (buildId: string) => void
	/** Opens one accordion section (the proof renders each one). */
	initialSection?: string
}

const SHOWN_PHOTOS = 40

/** Which accordion section a problem field lives in. */
const sectionOf = (field: string) =>
	field.startsWith('business')
		? 'business'
		: field.startsWith('reviews')
			? 'reviews'
			: field.startsWith('photo')
				? 'photos'
				: field.startsWith('pins')
					? 'design'
					: ''

const fieldId = (field: string) => `ai-${field.replace(/[^a-zA-Z0-9]+/g, '-')}`

function FieldError({ problem, field }: { problem: DraftProblem | null; field: string }) {
	if (!problem || !(problem.field === field || problem.field.startsWith(`${field}.`))) return null
	return <p className='text-sm text-destructive'>{problem.message}</p>
}

function Helper({ children }: { children: React.ReactNode }) {
	return <p className='text-xs leading-5 text-muted-foreground'>{children}</p>
}

const HEX = /^#?[0-9a-fA-F]{6}$/
const asHex = (value: string) => (value.startsWith('#') ? value : `#${value}`)

function Swatch({ value }: { value: string }) {
	return (
		<span
			aria-hidden
			className='size-6 shrink-0 rounded-md border'
			style={{ background: HEX.test(value) ? asHex(value) : 'transparent' }}
		/>
	)
}

// ---------------------------------------------------------------- design choices

/** What each pin reads as in the Design choices summary. */
function pinLabels(pins: BuildPins, show: { look: boolean; chrome: boolean; pages: boolean }) {
	const labels: string[] = []
	if (show.pages && pins.pages.kind === 'count') labels.push(`About ${pins.pages.count} pages`)
	if (show.pages && pins.pages.kind === 'list' && pins.pages.names.length) labels.push(pins.pages.names.join(', '))
	if (show.look) {
		const palette = pins.palette
		if (palette.kind === 'ai' && palette.polarity !== 'any') labels.push(palette.polarity === 'light' ? 'Light colors' : 'Dark colors')
		if (palette.kind === 'keep') labels.push('Current colors')
		if (palette.kind === 'curated') labels.push(paletteById(palette.id)?.name ?? 'A palette')
		if (palette.kind === 'brand') labels.push('Brand color')
		if (palette.kind === 'custom') labels.push('Exact colors')
		const fonts = pins.fonts
		if (fonts.kind === 'keep') labels.push('Current fonts')
		if (fonts.kind === 'pair') {
			const pair = FONT_PAIRS.find((item) => item.id === fonts.id)
			if (pair) labels.push(`${pair.heading} + ${pair.body}`)
		}
		if (fonts.kind === 'custom') labels.push(`${fonts.heading} + ${fonts.body}`)
		if (pins.shape !== 'ai') labels.push(pins.shape.charAt(0).toUpperCase() + pins.shape.slice(1))
		if (pins.header !== 'ai') labels.push(HEADER_VARIANT_LABELS[pins.header])
		if (pins.footer !== 'ai') labels.push(FOOTER_VARIANT_LABELS[pins.footer])
	}
	if (show.chrome) {
		if (pins.menu === 'mega') labels.push('Mega menu')
		if (pins.menu === 'dropdown') labels.push('Dropdowns')
		if (pins.menu === 'links') labels.push('Simple links')
		if (pins.ctaLabel.trim()) labels.push(`“${pins.ctaLabel.trim()}”`)
	}
	return labels
}

function DesignChoices({
	draft,
	setPins,
	theme,
	hasPages,
	show,
	problem,
}: {
	draft: ComposeDraft
	setPins: (patch: Partial<BuildPins>) => void
	theme: ThemeSettings
	hasPages: boolean
	show: { look: boolean; chrome: boolean }
	problem: DraftProblem | null
}) {
	const pins = draft.pins
	const [pageText, setPageText] = useState('')
	const [colorError, setColorError] = useState<string | null>(null)
	const themeColors = { background: theme.background, accent: theme.accent, heading: theme.heading, body: theme.body }

	const setPalette = (palette: PinPalette) => setPins({ palette })
	const setFonts = (fonts: PinFonts) => setPins({ fonts })
	const names = pins.pages.kind === 'list' ? pins.pages.names : []

	const addPageName = () => {
		const name = pageText.trim().slice(0, AI_LIMITS.pageNameMax)
		if (!name || names.length >= AI_LIMITS.pagesMax) return
		if (names.some((existing) => existing.toLowerCase() === name.toLowerCase())) return setPageText('')
		setPins({ pages: { kind: 'list', names: [...names, name] } })
		setPageText('')
	}

	const checkColors = () => {
		const palette = pins.palette
		const values =
			palette.kind === 'brand'
				? [palette.accent]
				: palette.kind === 'custom'
					? [palette.background, palette.accent, palette.heading, palette.body]
					: []
		setColorError(values.some((value) => !HEX.test(value)) ? 'Colors must be six-digit hex values like #1e3a8a.' : null)
	}

	const fontValue =
		pins.fonts.kind === 'pair' ? `pair:${pins.fonts.id}` : pins.fonts.kind

	return (
		<div className='grid gap-6'>
			{draft.mode === 'page' ? (
				<div className='grid gap-2'>
					<Label htmlFor={fieldId('pins.pages')}>Page name (optional)</Label>
					<Input
						id={fieldId('pins.pages')}
						maxLength={AI_LIMITS.pageNameMax}
						value={names[0] ?? ''}
						placeholder='Emergency roof repair'
						onChange={(event) =>
							setPins({
								pages: event.target.value.trim()
									? { kind: 'list', names: [event.target.value] }
									: { kind: 'ai' },
							})
						}
					/>
					<Helper>Leave it empty and the AI names the page.</Helper>
					<FieldError problem={problem} field='pins.pages' />
				</div>
			) : (
				<div className='grid gap-2'>
					<Label>Pages</Label>
					<RadioGroup
						value={pins.pages.kind}
						onValueChange={(kind) =>
							setPins({
								pages:
									kind === 'count'
										? { kind: 'count', count: pins.pages.kind === 'count' ? pins.pages.count : 5 }
										: kind === 'list'
											? { kind: 'list', names }
											: { kind: 'ai' },
							})
						}>
						<div className='flex items-center gap-2'>
							<RadioGroupItem id='ai-pages-ai' value='ai' />
							<Label htmlFor='ai-pages-ai' className='font-normal'>
								Let the AI decide
							</Label>
						</div>
						<div className='flex items-center gap-2'>
							<RadioGroupItem id='ai-pages-count' value='count' />
							<Label htmlFor='ai-pages-count' className='font-normal'>
								About
							</Label>
							<Select
								value={String(pins.pages.kind === 'count' ? pins.pages.count : 5)}
								onValueChange={(count) => setPins({ pages: { kind: 'count', count: Number(count) } })}>
								<SelectTrigger size='sm' aria-label='Number of pages' className='w-20'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Array.from({ length: AI_LIMITS.pagesMax }, (_, index) => (
										<SelectItem key={index} value={String(index + 1)}>
											{index + 1}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<span className='text-sm'>pages</span>
						</div>
						<div className='flex items-center gap-2'>
							<RadioGroupItem id='ai-pages-list' value='list' />
							<Label htmlFor='ai-pages-list' className='font-normal'>
								Exactly these pages
							</Label>
						</div>
					</RadioGroup>
					{pins.pages.kind === 'list' && (
						<div className='grid gap-2 pl-6'>
							<Input
								id={fieldId('pins.pages')}
								value={pageText}
								maxLength={AI_LIMITS.pageNameMax}
								placeholder={names.length ? 'Add another page' : 'Home'}
								onChange={(event) => setPageText(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter') {
										event.preventDefault()
										addPageName()
									}
								}}
							/>
							<div className='flex flex-wrap gap-1.5'>
								{names.map((name, index) => (
									<Badge key={name} variant='secondary' className='gap-1 pr-0.5'>
										{name}
										{index === 0 && <span className='text-muted-foreground'>(home)</span>}
										<Button
											variant='ghost'
											size='icon-xs'
											aria-label={`Remove ${name}`}
											onClick={() =>
												setPins({ pages: { kind: 'list', names: names.filter((item) => item !== name) } })
											}>
											<X />
										</Button>
									</Badge>
								))}
							</div>
							<Helper>Press Enter after each name. The first one is the home page. Up to 12.</Helper>
						</div>
					)}
					<FieldError problem={problem} field='pins.pages' />
				</div>
			)}

			{show.look && (
				<>
					<div className='grid gap-2'>
						<Label>Colors</Label>
						<RadioGroup
							value={pins.palette.kind}
							onValueChange={(kind) => {
								setColorError(null)
								if (kind === 'ai') setPalette({ kind: 'ai', polarity: 'any' })
								else if (kind === 'keep') setPalette({ kind: 'keep' })
								else if (kind === 'curated') setPalette({ kind: 'curated', id: PALETTES[0].id })
								else if (kind === 'brand')
									setPalette({ kind: 'brand', accent: theme.accent, polarity: polarityOf(themeColors) })
								else setPalette({ kind: 'custom', ...themeColors })
							}}>
							<div className='flex flex-wrap items-center gap-2'>
								<RadioGroupItem id='ai-palette-ai' value='ai' />
								<Label htmlFor='ai-palette-ai' className='font-normal'>
									AI decides
								</Label>
								{pins.palette.kind === 'ai' && (
									<ToggleGroup
										type='single'
										variant='outline'
										size='sm'
										value={pins.palette.polarity}
										onValueChange={(polarity) =>
											polarity && setPalette({ kind: 'ai', polarity: polarity as 'any' | 'light' | 'dark' })
										}>
										<ToggleGroupItem value='any'>Either</ToggleGroupItem>
										<ToggleGroupItem value='light'>Light</ToggleGroupItem>
										<ToggleGroupItem value='dark'>Dark</ToggleGroupItem>
									</ToggleGroup>
								)}
							</div>
							{hasPages && (
								<div className='flex items-center gap-2'>
									<RadioGroupItem id='ai-palette-keep' value='keep' />
									<Label htmlFor='ai-palette-keep' className='font-normal'>
										Keep my current colors
									</Label>
								</div>
							)}
							<div className='flex items-center gap-2'>
								<RadioGroupItem id='ai-palette-curated' value='curated' />
								<Label htmlFor='ai-palette-curated' className='font-normal'>
									A palette
								</Label>
							</div>
							<div className='flex items-center gap-2'>
								<RadioGroupItem id='ai-palette-brand' value='brand' />
								<Label htmlFor='ai-palette-brand' className='font-normal'>
									My brand color
								</Label>
							</div>
							<div className='flex items-center gap-2'>
								<RadioGroupItem id='ai-palette-custom' value='custom' />
								<Label htmlFor='ai-palette-custom' className='font-normal'>
									Exact colors
								</Label>
							</div>
						</RadioGroup>

						{pins.palette.kind === 'curated' && (
							<ToggleGroup
								type='single'
								spacing={2}
								value={pins.palette.id}
								onValueChange={(id) => {
									const palette = id ? paletteById(id) : null
									if (palette) setPalette({ kind: 'curated', id: palette.id })
								}}
								className='grid w-full grid-cols-2 sm:grid-cols-3'>
								{PALETTES.map((palette) => (
									<ToggleGroupItem
										key={palette.id}
										value={palette.id}
										aria-label={palette.name}
										className='h-auto w-full justify-start gap-2 border py-2 data-[state=on]:border-brand'>
										<span className='flex overflow-hidden rounded-sm' aria-hidden>
											{[palette.colors.background, palette.colors.accent, palette.colors.heading, palette.colors.body].map((color, index) => (
												<span key={index} className='size-4' style={{ background: color }} />
											))}
										</span>
										<span className='truncate text-xs'>{palette.name}</span>
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						)}

						{pins.palette.kind === 'brand' && (
							<div className='flex flex-wrap items-center gap-2'>
								<Swatch value={pins.palette.accent} />
								<Input
									id={fieldId('pins.palette')}
									aria-label='Brand color'
									className='w-32'
									maxLength={7}
									value={pins.palette.accent}
									onChange={(event) =>
										pins.palette.kind === 'brand' &&
										setPalette({ ...pins.palette, accent: event.target.value.trim() })
									}
									onBlur={checkColors}
								/>
								<ToggleGroup
									type='single'
									variant='outline'
									size='sm'
									value={pins.palette.polarity}
									onValueChange={(polarity) =>
										polarity &&
										pins.palette.kind === 'brand' &&
										setPalette({ ...pins.palette, polarity: polarity as 'light' | 'dark' })
									}>
									<ToggleGroupItem value='light'>Light</ToggleGroupItem>
									<ToggleGroupItem value='dark'>Dark</ToggleGroupItem>
								</ToggleGroup>
							</div>
						)}

						{pins.palette.kind === 'custom' && (
							<div className='grid gap-2 sm:grid-cols-2'>
								{(['background', 'accent', 'heading', 'body'] as const).map((role) => (
									<div key={role} className='flex items-center gap-2'>
										<Swatch value={pins.palette.kind === 'custom' ? pins.palette[role] : ''} />
										<Input
											id={role === 'background' ? fieldId('pins.palette') : undefined}
											aria-label={`${role.charAt(0).toUpperCase() + role.slice(1)} color`}
											maxLength={7}
											value={pins.palette.kind === 'custom' ? pins.palette[role] : ''}
											onChange={(event) =>
												pins.palette.kind === 'custom' &&
												setPalette({ ...pins.palette, [role]: event.target.value.trim() })
											}
											onBlur={checkColors}
										/>
										<span className='w-20 text-xs text-muted-foreground'>
											{role.charAt(0).toUpperCase() + role.slice(1)}
										</span>
									</div>
								))}
							</div>
						)}
						{colorError ? (
							<p className='text-sm text-destructive'>{colorError}</p>
						) : (
							<FieldError problem={problem} field='pins.palette' />
						)}
						<Helper>Colors are checked for contrast and adjusted only as far as readability needs.</Helper>
					</div>

					<div className='grid gap-2'>
						<Label htmlFor={fieldId('pins.fonts')}>Fonts</Label>
						<Select
							value={fontValue}
							onValueChange={(value) => {
								if (value === 'ai') setFonts({ kind: 'ai' })
								else if (value === 'keep') setFonts({ kind: 'keep' })
								else if (value === 'custom')
									setFonts({ kind: 'custom', heading: theme.headingFont, body: theme.bodyFont })
								else {
									const pair = FONT_PAIRS.find((item) => `pair:${item.id}` === value)
									if (pair) setFonts({ kind: 'pair', id: pair.id })
								}
							}}>
							<SelectTrigger id={fieldId('pins.fonts')} className='w-full'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='ai'>AI decides</SelectItem>
								{hasPages && <SelectItem value='keep'>Keep my current fonts</SelectItem>}
								{(['Sans', 'Serif'] as const).map((category) => (
									<SelectGroup key={category}>
										<SelectLabel>{category}</SelectLabel>
										{FONT_PAIRS.filter((pair) => pair.category === category).map((pair) => (
											<SelectItem key={pair.id} value={`pair:${pair.id}`}>
												{pair.heading} + {pair.body}
											</SelectItem>
										))}
									</SelectGroup>
								))}
								<SelectItem value='custom'>My own fonts</SelectItem>
							</SelectContent>
						</Select>
						{pins.fonts.kind === 'custom' && (
							<div className='grid gap-3 sm:grid-cols-2'>
								<FontCombobox
									label='Heading font'
									value={pins.fonts.heading}
									onChange={(heading) => pins.fonts.kind === 'custom' && setFonts({ ...pins.fonts, heading })}
								/>
								<FontCombobox
									label='Body font'
									value={pins.fonts.body}
									onChange={(body) => pins.fonts.kind === 'custom' && setFonts({ ...pins.fonts, body })}
								/>
							</div>
						)}
						<FieldError problem={problem} field='pins.fonts' />
						<Helper>Heading and body fonts that read well together.</Helper>
					</div>

					<div className='grid gap-2'>
						<Label>Corner shape</Label>
						<ToggleGroup
							type='single'
							variant='outline'
							size='sm'
							value={pins.shape}
							onValueChange={(shape) => shape && setPins({ shape: shape as BuildPins['shape'] })}>
							<ToggleGroupItem value='ai'>AI decides</ToggleGroupItem>
							<ToggleGroupItem value='sharp'>Sharp</ToggleGroupItem>
							<ToggleGroupItem value='soft'>Soft</ToggleGroupItem>
							<ToggleGroupItem value='round'>Round</ToggleGroupItem>
						</ToggleGroup>
						<Helper>How rounded buttons, cards and images are.</Helper>
					</div>

					<div className='grid gap-4 sm:grid-cols-2'>
						<div className='grid gap-2'>
							<Label htmlFor='ai-pin-header'>Header</Label>
							<Select value={pins.header} onValueChange={(header) => setPins({ header: header as BuildPins['header'] })}>
								<SelectTrigger id='ai-pin-header' className='w-full'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='ai'>AI decides</SelectItem>
									{(['bar', 'floating', 'stacked', 'none'] as const).map((variant) => (
										<SelectItem key={variant} value={variant}>
											{HEADER_VARIANT_LABELS[variant]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Helper>The bar across the top of every page.</Helper>
						</div>
						<div className='grid gap-2'>
							<Label htmlFor='ai-pin-footer'>Footer</Label>
							<Select value={pins.footer} onValueChange={(footer) => setPins({ footer: footer as BuildPins['footer'] })}>
								<SelectTrigger id='ai-pin-footer' className='w-full'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='ai'>AI decides</SelectItem>
									{(['columns', 'centered', 'split', 'none'] as const).map((variant) => (
										<SelectItem key={variant} value={variant}>
											{FOOTER_VARIANT_LABELS[variant]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Helper>The links and details at the bottom.</Helper>
						</div>
					</div>
				</>
			)}

			{show.chrome && (
				<>
					<div className='grid gap-2'>
						<Label>Menu style</Label>
						<ToggleGroup
							type='single'
							variant='outline'
							size='sm'
							value={pins.menu}
							onValueChange={(menu) => menu && setPins({ menu: menu as BuildPins['menu'] })}>
							<ToggleGroupItem value='ai'>AI decides</ToggleGroupItem>
							<ToggleGroupItem value='mega'>Mega menu</ToggleGroupItem>
							<ToggleGroupItem value='dropdown'>Dropdowns</ToggleGroupItem>
							<ToggleGroupItem value='links'>Simple links</ToggleGroupItem>
						</ToggleGroup>
						<Helper>How the header menu groups the pages.</Helper>
					</div>
					<div className='grid gap-2'>
						<Label htmlFor={fieldId('pins.ctaLabel')}>Header button text</Label>
						<Input
							id={fieldId('pins.ctaLabel')}
							maxLength={AI_LIMITS.ctaLabelMax}
							value={pins.ctaLabel}
							placeholder='Get a free inspection'
							onChange={(event) => setPins({ ctaLabel: event.target.value })}
						/>
						<FieldError problem={problem} field='pins.ctaLabel' />
						<Helper>Leave it empty and the AI writes it.</Helper>
					</div>
				</>
			)}
		</div>
	)
}

// ---------------------------------------------------------------- the view

export function AiBuildCompose(props: ComposeProps) {
	const {
		draft,
		onDraft,
		pages,
		theme,
		media,
		uploading,
		onUpload,
		capability,
		problem,
		error,
		refunded,
		onSubmit,
		onCancel,
		onResume,
		onRestart,
		initialSection = '',
	} = props
	const [section, setSection] = useState(initialSection)
	const [confirming, setConfirming] = useState(false)
	const [areaText, setAreaText] = useState('')
	const [pasted, setPasted] = useState('')
	const fileRef = useRef<HTMLInputElement>(null)

	const hasPages = pages.length > 0
	const target = pages.find((page) => page.id === draft.targetPageId) ?? null
	const copy = composeCopy(draft, pages)
	const primary = error ? 'Try again' : copy.primary
	const units = unitsFor(draft)
	const remaining = capability ? Math.max(0, capability.units.limit - capability.units.used) : null
	const overBudget = remaining !== null && units > remaining
	const briefShort = draft.prompt.trim().length < AI_LIMITS.promptMin
	const disabled = briefShort || uploading > 0 || overBudget
	const pins = draft.pins
	const appendSite = draft.mode === 'site' && draft.placement === 'append'
	const show = {
		look: draft.mode === 'site' && (draft.placement === 'replace-site' || (appendSite && !pins.keepDesign)),
		chrome: draft.mode === 'site' && (draft.placement === 'replace-site' || (appendSite && pins.updateMenu)),
	}
	const labels = pinLabels(pins, { ...show, pages: true })

	// A field the server or the checks rejected opens its section and takes the focus.
	useEffect(() => {
		if (!problem) return
		const where = sectionOf(problem.field)
		if (where) setSection(where)
		const timer = setTimeout(() => document.getElementById(fieldId(problem.field))?.focus(), 50)
		return () => clearTimeout(timer)
	}, [problem])

	const set = (patch: Partial<ComposeDraft>) => onDraft({ ...draft, ...patch })
	const setPins = (patch: Partial<BuildPins>) => onDraft({ ...draft, pins: { ...draft.pins, ...patch } })
	const setBusiness = (patch: Partial<ComposeDraft['business']>) =>
		onDraft({ ...draft, business: { ...draft.business, ...patch } })

	const submit = () => {
		if (disabled) return
		if (draft.mode === 'site' && draft.placement === 'replace-site' && hasPages) return setConfirming(true)
		onSubmit()
	}

	const addAreas = () => {
		const added = areaText
			.split(',')
			.map((area) => area.trim().slice(0, 80))
			.filter(Boolean)
		if (added.length === 0) return
		const areas = [...draft.business.areas]
		for (const area of added)
			if (areas.length < 30 && !areas.some((item) => item.toLowerCase() === area.toLowerCase())) areas.push(area)
		setBusiness({ areas })
		setAreaText('')
	}

	const addReviews = () => {
		const parsed = parseReviews(pasted)
		if (parsed.length === 0) return
		set({ reviews: [...draft.reviews, ...parsed].slice(0, AI_LIMITS.reviewsMax) })
		setPasted('')
	}

	const setReview = (index: number, patch: Partial<OwnerReview>) =>
		set({ reviews: draft.reviews.map((review, i) => (i === index ? { ...review, ...patch } : review)) })

	const business = draft.business
	const typeLabel = BUSINESS_TYPES.find((type) => type.value === business.type)?.label
	const place = [business.city, business.region].filter(Boolean).join(', ')
	const businessSummary =
		[business.name, typeLabel, place].filter(Boolean).join(' · ') ||
		'Not set yet. The AI reads them from your description.'

	const shown = media.slice(0, SHOWN_PHOTOS)
	const shownIds = new Set(shown.map((item) => item.id))
	const selected = draft.photoIds.filter((id) => shownIds.has(id))
	const photoSummary =
		draft.photoIds.length === 0 && !draft.useLibrary
			? 'No photos. The site will be typographic.'
			: `${draft.photoIds.length} chosen${draft.useLibrary ? ' · uses your library' : ''}`

	const designSummary = labels.length === 0 ? 'AI decides everything' : `${labels.length} set: ${labels.join(', ')}`

	const errorText = error ? errorCopy(error, { stage: 'plan', units: capability?.units }) : null
	const resetsAt = capability ? localTime(capability.units.resetsAt) : ''

	return (
		<>
			<ScrollArea className='min-h-0 flex-1 px-6'>
				<div className='grid gap-6 pb-4'>
					<ToggleGroup
						type='single'
						variant='outline'
						value={draft.mode}
						onValueChange={(mode) => {
							if (mode !== 'site' && mode !== 'page') return
							set({
								mode,
								placement: hasPages ? 'append' : 'replace-site',
								targetPageId: null,
								pins: { ...pins, pages: { kind: 'ai' } },
							})
						}}>
						<ToggleGroupItem value='site'>Whole site</ToggleGroupItem>
						<ToggleGroupItem value='page'>One page</ToggleGroupItem>
					</ToggleGroup>

					{draft.mode === 'site' && hasPages && (
						<div className='grid gap-3'>
							<Label>What happens to your pages</Label>
							<RadioGroup
								value={draft.placement === 'replace-site' ? 'replace-site' : 'append'}
								onValueChange={(placement) => set({ placement: placement as 'append' | 'replace-site', targetPageId: null })}>
								<div className='flex items-start gap-2'>
									<RadioGroupItem id='ai-place-append' value='append' className='mt-0.5' />
									<div className='grid gap-1'>
										<Label htmlFor='ai-place-append' className='font-normal'>
											Keep my pages and add new ones
										</Label>
										<Helper>
											Keeps your {pages.length} {pages.length === 1 ? 'page' : 'pages'} and adds new ones to the menu.
										</Helper>
									</div>
								</div>
								<div className='flex items-center gap-2'>
									<RadioGroupItem id='ai-place-replace' value='replace-site' />
									<Label htmlFor='ai-place-replace' className='font-normal'>
										Replace my site
									</Label>
								</div>
							</RadioGroup>
							{draft.placement === 'append' && (
								<div className='grid gap-2 pl-6'>
									<div className='flex items-center gap-2'>
										<Switch
											id='ai-keep-design'
											checked={pins.keepDesign}
											onCheckedChange={(keepDesign) => setPins({ keepDesign })}
										/>
										<Label htmlFor='ai-keep-design' className='font-normal'>
											Keep my current design
										</Label>
									</div>
									<div className='flex items-center gap-2'>
										<Switch
											id='ai-update-menu'
											checked={pins.updateMenu}
											onCheckedChange={(updateMenu) => setPins({ updateMenu })}
										/>
										<Label htmlFor='ai-update-menu' className='font-normal'>
											Update the header menu
										</Label>
									</div>
								</div>
							)}
						</div>
					)}

					{draft.mode === 'page' && hasPages && (
						<div className='grid gap-3'>
							<Label>Which page</Label>
							<RadioGroup
								value={draft.placement === 'replace-page' ? 'replace-page' : 'append'}
								onValueChange={(placement) =>
									set(
										placement === 'replace-page'
											? { placement: 'replace-page', targetPageId: draft.targetPageId ?? pages[0]?.id ?? null }
											: { placement: 'append', targetPageId: null },
									)
								}>
								<div className='flex items-center gap-2'>
									<RadioGroupItem id='ai-target-new' value='append' />
									<Label htmlFor='ai-target-new' className='font-normal'>
										New page
									</Label>
								</div>
								<div className='flex items-center gap-2'>
									<RadioGroupItem id='ai-target-rebuild' value='replace-page' />
									<Label htmlFor='ai-target-rebuild' className='font-normal'>
										Rebuild a page
									</Label>
								</div>
							</RadioGroup>
							{draft.placement === 'replace-page' && (
								<div className='grid gap-2 pl-6'>
									<Select value={draft.targetPageId ?? ''} onValueChange={(targetPageId) => set({ targetPageId })}>
										<SelectTrigger id={fieldId('targetPageId')} aria-label='Page to rebuild' className='w-full'>
											<SelectValue placeholder='Choose a page' />
										</SelectTrigger>
										<SelectContent>
											{pages.map((page) => (
												<SelectItem key={page.id} value={page.id}>
													{page.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError problem={problem} field='targetPageId' />
								</div>
							)}
						</div>
					)}

					<div className='grid gap-2'>
						<Label htmlFor={fieldId('prompt')}>Describe it</Label>
						<Textarea
							id={fieldId('prompt')}
							autoFocus
							rows={5}
							maxLength={AI_LIMITS.promptMax}
							value={draft.prompt}
							placeholder={copy.placeholder}
							onChange={(event) => set({ prompt: event.target.value })}
							onKeyDown={(event) => {
								if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
									event.preventDefault()
									submit()
								}
							}}
						/>
						<div className='flex items-start justify-between gap-3'>
							<Helper>Real facts help: services, areas, years in business, licences. The AI never makes them up.</Helper>
							{draft.prompt.length > 3500 && (
								<span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
									{draft.prompt.length.toLocaleString('en-US')} / 4,000
								</span>
							)}
						</div>
						<FieldError problem={problem} field='prompt' />
						{draft.prompt.trim() === '' && (
							<div className='flex flex-wrap gap-2'>
								{EXAMPLES.map((example) => (
									<Button key={example.label} variant='outline' size='sm' onClick={() => set({ prompt: example.brief })}>
										{example.label}
									</Button>
								))}
							</div>
						)}
					</div>

					<Accordion type='single' collapsible value={section} onValueChange={setSection}>
						<AccordionItem value='business'>
							<AccordionTrigger>
								<span className='grid gap-0.5'>
									<span>Business details</span>
									<span className='text-xs font-normal text-muted-foreground'>{businessSummary}</span>
								</span>
							</AccordionTrigger>
							<AccordionContent className='grid gap-4'>
								<div className='grid gap-4 sm:grid-cols-2'>
									<div className='grid gap-2'>
										<Label htmlFor={fieldId('business.name')}>Business name</Label>
										<Input
											id={fieldId('business.name')}
											maxLength={120}
											value={business.name}
											onChange={(event) => setBusiness({ name: event.target.value })}
										/>
										<FieldError problem={problem} field='business.name' />
									</div>
									<div className='grid gap-2'>
										<Label htmlFor={fieldId('business.type')}>Type</Label>
										<Select
											value={business.type || 'none'}
											onValueChange={(type) => setBusiness({ type: type === 'none' ? '' : (type as BusinessType) })}>
											<SelectTrigger id={fieldId('business.type')} className='w-full'>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value='none'>Not set</SelectItem>
												{BUSINESS_TYPES.map((type) => (
													<SelectItem key={type.value} value={type.value}>
														{type.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className='grid gap-2'>
										<Label htmlFor={fieldId('business.phone')}>Phone</Label>
										<Input
											id={fieldId('business.phone')}
											type='tel'
											maxLength={40}
											value={business.phone}
											onChange={(event) => setBusiness({ phone: event.target.value })}
										/>
										<FieldError problem={problem} field='business.phone' />
									</div>
									<div className='grid gap-2'>
										<Label htmlFor={fieldId('business.email')}>Email</Label>
										<Input
											id={fieldId('business.email')}
											type='email'
											maxLength={254}
											value={business.email}
											onChange={(event) => setBusiness({ email: event.target.value })}
										/>
										<FieldError problem={problem} field='business.email' />
									</div>
									<div className='grid gap-2'>
										<Label htmlFor={fieldId('business.city')}>City</Label>
										<Input
											id={fieldId('business.city')}
											maxLength={80}
											value={business.city}
											onChange={(event) => setBusiness({ city: event.target.value })}
										/>
									</div>
									<div className='grid gap-2'>
										<Label htmlFor={fieldId('business.region')}>State or region</Label>
										<Input
											id={fieldId('business.region')}
											maxLength={80}
											value={business.region}
											onChange={(event) => setBusiness({ region: event.target.value })}
										/>
									</div>
								</div>
								<div className='grid gap-2'>
									<Label htmlFor={fieldId('business.areas')}>Areas served</Label>
									<Input
										id={fieldId('business.areas')}
										value={areaText}
										placeholder='Austin, Round Rock, Cedar Park'
										onChange={(event) => setAreaText(event.target.value)}
										onBlur={addAreas}
										onKeyDown={(event) => {
											if (event.key === 'Enter') {
												event.preventDefault()
												addAreas()
											}
										}}
									/>
									{business.areas.length > 0 && (
										<div className='flex flex-wrap gap-1.5'>
											{business.areas.map((area) => (
												<Badge key={area} variant='secondary' className='gap-1 pr-0.5'>
													{area}
													<Button
														variant='ghost'
														size='icon-xs'
														aria-label={`Remove ${area}`}
														onClick={() => setBusiness({ areas: business.areas.filter((item) => item !== area) })}>
														<X />
													</Button>
												</Badge>
											))}
										</div>
									)}
									<FieldError problem={problem} field='business.areas' />
								</div>
								<Helper>Used on the site. Empty fields in your business details are filled in when the build is applied.</Helper>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value='photos'>
							<AccordionTrigger>
								<span className='flex w-full items-start justify-between gap-3'>
									<span className='grid gap-0.5'>
										<span>Photos</span>
										<span className='text-xs font-normal text-muted-foreground'>{photoSummary}</span>
									</span>
									{draft.photoIds.length > 0 && <Badge variant='secondary'>{draft.photoIds.length}</Badge>}
								</span>
							</AccordionTrigger>
							<AccordionContent className='grid gap-4'>
								<p className='text-sm text-muted-foreground'>
									Add photos of your work, team, place or products. The AI looks at each one and puts it where it fits. It never uses another company&apos;s pictures.
								</p>
								<div>
									<Button variant='outline' onClick={() => fileRef.current?.click()}>
										<ImagePlus /> Upload photos
									</Button>
									<Input
										ref={fileRef}
										type='file'
										accept='image/*'
										multiple
										className='hidden'
										tabIndex={-1}
										aria-hidden
										onChange={(event) => {
											const files = [...(event.target.files ?? [])]
											event.target.value = ''
											onUpload(files)
										}}
									/>
								</div>
								{shown.length === 0 && uploading === 0 ? (
									<p className='text-sm text-muted-foreground'>No photos in this project yet.</p>
								) : (
									<div className='grid grid-cols-4 gap-2 sm:grid-cols-6'>
										{Array.from({ length: uploading }, (_, index) => (
											<Skeleton key={`upload-${index}`} className='aspect-square w-full' />
										))}
										<ToggleGroup
											type='multiple'
											spacing={2}
											value={selected}
											onValueChange={(ids) => {
												const hidden = draft.photoIds.filter((id) => !shownIds.has(id))
												set({ photoIds: [...ids, ...hidden].slice(0, AI_LIMITS.photosMax) })
											}}
											className='col-span-full grid w-full grid-cols-4 sm:grid-cols-6'>
											{shown.map((item) => (
												<ToggleGroupItem
													key={item.id}
													value={item.id}
													aria-label={item.name}
													className='aspect-square h-auto w-full overflow-hidden p-0 opacity-50 data-[state=on]:opacity-100 data-[state=on]:ring-2 data-[state=on]:ring-brand'>
													{/* eslint-disable-next-line @next/next/no-img-element */}
													<img src={item.src} alt='' className='size-full object-cover' />
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</div>
								)}
								<FieldError problem={problem} field='photoIds' />
								<div className='grid gap-1'>
									<div className='flex items-center gap-2'>
										<Switch
											id='ai-use-library'
											checked={draft.useLibrary}
											onCheckedChange={(useLibrary) => set({ useLibrary })}
										/>
										<Label htmlFor='ai-use-library' className='font-normal'>
											Also use photos from my account&apos;s media library ({capability?.library.photos ?? 0})
										</Label>
									</div>
									<Helper>Only turn this on if your library holds photos of this business.</Helper>
								</div>
								<Helper>JPG, PNG or WebP, up to 12 MB each.</Helper>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value='reviews'>
							<AccordionTrigger>
								<span className='flex w-full items-start justify-between gap-3'>
									<span className='grid gap-0.5'>
										<span>Reviews</span>
										<span className='text-xs font-normal text-muted-foreground'>
											{draft.reviews.length > 0
												? `${draft.reviews.length} ${draft.reviews.length === 1 ? 'review' : 'reviews'}`
												: 'None yet. Without reviews there are no testimonials.'}
										</span>
									</span>
									{draft.reviews.length > 0 && <Badge variant='secondary'>{draft.reviews.length}</Badge>}
								</span>
							</AccordionTrigger>
							<AccordionContent className='grid gap-4'>
								<p className='text-sm text-muted-foreground'>
									Paste real reviews from Google, Yelp or your customers. They&apos;re placed word for word and never rewritten. The AI never invents any.
								</p>
								<div className='grid gap-2'>
									<Label htmlFor='ai-reviews-paste'>Paste one or more reviews</Label>
									<Textarea
										id='ai-reviews-paste'
										rows={4}
										value={pasted}
										placeholder={'They replaced our roof in two days and cleaned up every nail.\n- Dana M., Round Rock'}
										onChange={(event) => setPasted(event.target.value)}
									/>
									<Button
										variant='outline'
										size='sm'
										className='justify-self-start'
										disabled={!pasted.trim() || draft.reviews.length >= AI_LIMITS.reviewsMax}
										onClick={addReviews}>
										Add
									</Button>
								</div>
								{draft.reviews.map((review, index) => (
									<Card key={index} className='gap-0 py-4'>
										<CardContent className='grid gap-3 px-4'>
											<div className='flex items-start gap-2'>
												<div className='grid min-w-0 flex-1 gap-2'>
													<Label htmlFor={fieldId(`reviews.${index}.quote`)}>Quote</Label>
													<Textarea
														id={fieldId(`reviews.${index}.quote`)}
														rows={3}
														maxLength={AI_LIMITS.reviewQuoteMax}
														value={review.quote}
														onChange={(event) => setReview(index, { quote: event.target.value })}
													/>
												</div>
												<Button
													variant='ghost'
													size='icon'
													aria-label='Remove review'
													onClick={() => set({ reviews: draft.reviews.filter((_, i) => i !== index) })}>
													<Trash2 />
												</Button>
											</div>
											<div className='grid gap-3 sm:grid-cols-3'>
												<div className='grid gap-2'>
													<Label htmlFor={fieldId(`reviews.${index}.name`)}>Name</Label>
													<Input
														id={fieldId(`reviews.${index}.name`)}
														maxLength={AI_LIMITS.reviewNameMax}
														value={review.name}
														onChange={(event) => setReview(index, { name: event.target.value })}
													/>
												</div>
												<div className='grid gap-2'>
													<Label htmlFor={fieldId(`reviews.${index}.role`)}>Role or place</Label>
													<Input
														id={fieldId(`reviews.${index}.role`)}
														maxLength={AI_LIMITS.reviewRoleMax}
														value={review.role}
														onChange={(event) => setReview(index, { role: event.target.value })}
													/>
												</div>
												<div className='grid gap-2'>
													<Label htmlFor={fieldId(`reviews.${index}.source`)}>Source</Label>
													<Input
														id={fieldId(`reviews.${index}.source`)}
														maxLength={AI_LIMITS.reviewSourceMax}
														value={review.source}
														placeholder='Google'
														onChange={(event) => setReview(index, { source: event.target.value })}
													/>
												</div>
											</div>
											<FieldError problem={problem} field={`reviews.${index}`} />
										</CardContent>
									</Card>
								))}
								<FieldError problem={problem} field='reviews' />
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value='design'>
							<AccordionTrigger>
								<span className='flex w-full items-start justify-between gap-3'>
									<span className='grid gap-0.5'>
										<span>Design choices</span>
										<span className='text-xs font-normal text-muted-foreground'>{designSummary}</span>
									</span>
									{labels.length > 0 && <Badge variant='secondary'>{labels.length}</Badge>}
								</span>
							</AccordionTrigger>
							<AccordionContent>
								<DesignChoices
									draft={draft}
									setPins={setPins}
									theme={theme}
									hasPages={hasPages}
									show={show}
									problem={problem}
								/>
							</AccordionContent>
						</AccordionItem>
					</Accordion>

					{draft.mode === 'site' && draft.placement === 'replace-site' && hasPages && (
						<Alert>
							<AlertDescription>
								Replaces your {pages.length} {pages.length === 1 ? 'page' : 'pages'}, header, footer and design. Undo brings them back.
							</AlertDescription>
						</Alert>
					)}
					{draft.placement === 'replace-page' && target && target.sections > 0 && (
						<Alert>
							<AlertDescription>
								Replaces the {target.sections} {target.sections === 1 ? 'section' : 'sections'} on {target.name}. Undo brings them back.
							</AlertDescription>
						</Alert>
					)}
				</div>
			</ScrollArea>

			<div className='grid gap-3 border-t p-6 pt-4'>
				{errorText && (
					<Alert variant='destructive'>
						<AlertDescription className='grid gap-3'>
							<p>
								{errorText}
								{refunded && error?.code !== 'bad-request' ? ' Nothing was charged.' : ''}
							</p>
							{error?.code === 'conflict' && error.buildId && (
								<div className='flex flex-wrap gap-2'>
									<Button size='sm' onClick={() => error.buildId && onResume(error.buildId)}>
										Resume it
									</Button>
									<Button size='sm' variant='outline' onClick={() => error.buildId && onRestart(error.buildId)}>
										Stop it and start over
									</Button>
								</div>
							)}
						</AlertDescription>
					</Alert>
				)}
				{overBudget ? (
					<Alert variant='destructive'>
						<AlertDescription>
							This needs up to {units} AI writes and you have {remaining} left today. Pin fewer pages, or try again after {resetsAt}.
						</AlertDescription>
					</Alert>
				) : null}
				<DialogFooter className='items-center'>
					{!overBudget && remaining !== null && (
						<p className='mr-auto text-sm text-muted-foreground'>
							Uses up to {units} of your {remaining} AI writes left today.
						</p>
					)}
					<Button variant='ghost' onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={submit} disabled={disabled}>
						<Sparkles /> {primary}
					</Button>
				</DialogFooter>
			</div>

			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Replace your site?</AlertDialogTitle>
						<AlertDialogDescription>
							This replaces your {pages.length} {pages.length === 1 ? 'page' : 'pages'}, header, footer and design. You can undo it.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirming(false)
								onSubmit()
							}}>
							Replace my site
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
