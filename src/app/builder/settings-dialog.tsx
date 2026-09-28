'use client'

import { useState } from 'react'
import { Check, Palette, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { FontCombobox } from './font-combobox'
import { fontStack } from './google-fonts'
import {
	contentWidths,
	defaultSettings,
	paletteTokens,
	tintHex,
	type ThemeSettings,
} from './theme-settings'
import { useGoogleFonts } from './use-google-fonts'

const colorFields = [
	{ key: 'background', label: 'Background', hint: 'Page and section surface' },
	{ key: 'accent', label: 'Accent', hint: 'Buttons, badges, highlights' },
	{ key: 'heading', label: 'Heading', hint: 'All heading text' },
	{ key: 'body', label: 'Body', hint: 'Paragraphs and supporting copy' },
] as const

export function SettingsDialog({
	settings,
	onChange,
}: {
	settings: ThemeSettings
	onChange: (next: ThemeSettings) => void
}) {
	const [open, setOpen] = useState(false)
	// Edits are staged here so the preview only changes when Apply is pressed.
	const [draft, setDraft] = useState<ThemeSettings>(settings)

	// Pulls the staged faces in so the specimen renders in the real font.
	useGoogleFonts([draft.headingFont, draft.bodyFont])

	const dirty = (Object.keys(draft) as (keyof ThemeSettings)[]).some(
		(key) => draft[key] !== settings[key],
	)

	const set = <K extends keyof ThemeSettings>(
		key: K,
		value: ThemeSettings[K],
	) => setDraft((current) => ({ ...current, [key]: value }))

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) setDraft(settings)
				setOpen(next)
			}}>
			<DialogTrigger asChild>
				<button
					type='button'
					title='Theme settings'
					className='flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
					<Palette className='size-4' />
					<span className='sr-only'>Theme settings</span>
				</button>
			</DialogTrigger>

			<DialogContent className='flex max-h-[90vh] flex-col gap-0 overflow-hidden border-white/10 bg-panel p-0 sm:max-w-3xl'>
				<DialogHeader className='shrink-0 border-b border-white/10 px-6 py-5'>
					<DialogTitle className='text-white'>Theme</DialogTitle>
					<DialogDescription className='text-slate-400'>
						Applies to every section and template in the library.
					</DialogDescription>
				</DialogHeader>

				{/* Radix ScrollArea sizes its viewport with height:100%, which collapses to
				    auto inside a max-height flex item, so a plain overflow box is used here. */}
				<div className='min-h-0 flex-1 overflow-y-auto'>
					<div className='space-y-8 px-6 py-5'>
						<div className='grid gap-6 lg:grid-cols-3'>
							<div className='space-y-5'>
								<FontCombobox
									label='Heading font'
									value={draft.headingFont}
									onChange={(family) => set('headingFont', family)}
								/>
								<FontCombobox
									label='Body font'
									value={draft.bodyFont}
									onChange={(family) => set('bodyFont', family)}
								/>
							</div>

							<div className='rounded-xl border border-white/10 bg-ink/50 p-6 lg:col-span-2'>
								<p
									className='text-3xl font-semibold leading-tight text-white'
									style={{ fontFamily: fontStack(draft.headingFont) }}>
									This is the heading font
								</p>
								<p
									className='mt-1 text-sm text-slate-500'
									style={{ fontFamily: fontStack(draft.headingFont) }}>
									{draft.headingFont}
								</p>

								<div className='mt-6 border-t border-white/10 pt-6'>
									<p
										className='leading-8 text-slate-300'
										style={{ fontFamily: fontStack(draft.bodyFont) }}>
										This is the body font. It carries paragraphs and supporting
										copy, so check how it reads at this size across a couple of
										lines.
									</p>
									<p
										className='mt-2 text-sm text-slate-500'
										style={{ fontFamily: fontStack(draft.bodyFont) }}>
										{draft.bodyFont}
									</p>
								</div>
							</div>
						</div>

						<div className='grid gap-4 border-t border-white/10 pt-8 sm:grid-cols-2'>
							{colorFields.map((field) => (
								<div key={field.key} className='flex items-center gap-3'>
									<input
										type='color'
										id={`color-${field.key}`}
										value={draft[field.key]}
										onChange={(event) => set(field.key, event.target.value)}
										className='size-10 shrink-0 cursor-pointer rounded-md border border-white/15 bg-transparent'
									/>
									<div className='min-w-0 flex-1'>
										<Label
											htmlFor={`color-${field.key}`}
											className='text-white'>
											{field.label}
										</Label>
										<p className='mt-0.5 truncate text-xs text-slate-500'>
											{field.hint}
										</p>
									</div>
									<input
										type='text'
										aria-label={`${field.label} hex`}
										value={draft[field.key]}
										onChange={(event) => set(field.key, event.target.value)}
										className='w-24 rounded-md border border-white/15 bg-ink/60 px-2 py-1.5 text-sm tabular-nums text-white'
									/>
								</div>
							))}
						</div>

						<div className='border-t border-white/10 pt-8'>
							<div className='flex flex-wrap items-end justify-between gap-4'>
								<div>
									<p className='font-display text-sm font-semibold text-white'>
										Content width
									</p>
									<p className='mt-0.5 text-xs text-slate-500'>
										One measure for every section, the header, and the footer.
									</p>
								</div>
								<div className='flex flex-wrap gap-1.5'>
									{contentWidths.map((option) => (
										<button
											key={option.id}
											type='button'
											onClick={() => set('maxWidth', option.id)}
											aria-pressed={draft.maxWidth === option.id}
											title={`max-w-${option.id} · ${option.value}`}
											className={cn(
												'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
												draft.maxWidth === option.id
													? 'border-brand/40 bg-brand/12 text-white'
													: 'border-white/10 bg-white/3 text-slate-400 hover:border-white/25 hover:text-white',
											)}>
											{option.label}
										</button>
									))}
								</div>
							</div>
						</div>

						<div className='border-t border-white/10 pt-8'>
							<div className='flex flex-wrap items-end justify-between gap-4'>
								<div>
									<p className='font-display text-sm font-semibold text-white'>
										Primary button
									</p>
									<p className='mt-0.5 text-xs text-slate-500'>
										Applies to every solid accent button.
									</p>
								</div>
								<div className='grid grid-cols-2 gap-1.5'>
									{(['solid', 'gradient'] as const).map((fill) => (
										<button
											key={fill}
											type='button'
											onClick={() => set('buttonFill', fill)}
											aria-pressed={draft.buttonFill === fill}
											className={cn(
												'rounded-md border px-4 py-1.5 text-xs font-medium capitalize transition-colors',
												draft.buttonFill === fill
													? 'border-brand/40 bg-brand/12 text-white'
													: 'border-white/10 bg-white/3 text-slate-400 hover:border-white/25 hover:text-white',
											)}>
											{fill}
										</button>
									))}
								</div>
							</div>

							<div
								className={cn(
									'mt-5 grid gap-5 sm:grid-cols-2',
									draft.buttonFill === 'solid' &&
										'pointer-events-none opacity-40',
								)}>
								{(
									[
										{ key: 'buttonFrom', label: 'Gradient from' },
										{ key: 'buttonTo', label: 'Gradient to' },
									] as const
								).map((field) => (
									<div key={field.key}>
										<Label className='text-xs text-slate-300'>
											{field.label}
										</Label>
										<div className='mt-2 grid grid-cols-2 gap-1.5'>
											{paletteTokens.map((token) => (
												<button
													key={token.id}
													type='button'
													onClick={() =>
														set(field.key, {
															...draft[field.key],
															token: token.id,
														})
													}
													aria-pressed={draft[field.key].token === token.id}
													className={cn(
														'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
														draft[field.key].token === token.id
															? 'border-brand/40 bg-brand/12 text-white'
															: 'border-white/10 bg-white/3 text-slate-400 hover:border-white/25 hover:text-white',
													)}>
													<span
														aria-hidden
														className='size-3 shrink-0 rounded-full border border-white/20'
														style={{
															backgroundColor: tintHex(draft, {
																...draft[field.key],
																token: token.id,
															}),
														}}
													/>
													{token.label}
												</button>
											))}
										</div>
										<div className='mt-2 flex items-baseline justify-between text-xs text-slate-500'>
											<Label
												htmlFor={`${field.key}-lightness`}
												className='text-xs text-slate-500'>
												Darker
											</Label>
											<span className='tabular-nums text-slate-400'>
												{draft[field.key].lightness > 0 ? '+' : ''}
												{draft[field.key].lightness}%
											</span>
											<span>Lighter</span>
										</div>
										<input
											id={`${field.key}-lightness`}
											type='range'
											min={-100}
											max={100}
											step={5}
											value={draft[field.key].lightness}
											onChange={(event) =>
												set(field.key, {
													...draft[field.key],
													lightness: Number(event.target.value),
												})
											}
											className='mt-1 w-full accent-brand'
										/>
									</div>
								))}

								<div>
									<div className='flex items-baseline justify-between'>
										<Label
											htmlFor='button-angle'
											className='text-xs text-slate-300'>
											Gradient angle
										</Label>
										<span className='text-sm tabular-nums text-slate-500'>
											{draft.buttonAngle}&deg;
										</span>
									</div>
									<input
										id='button-angle'
										type='range'
										min={0}
										max={359}
										value={draft.buttonAngle}
										onChange={(event) =>
											set('buttonAngle', Number(event.target.value))
										}
										className='mt-2 w-full accent-brand'
									/>
								</div>

								<div className='flex items-center justify-center rounded-lg border border-white/10 bg-ink/50 p-4'>
									<span
										className='rounded-md px-5 py-2.5 text-sm font-bold'
										style={{
											color: draft.background,
											backgroundImage: `linear-gradient(${draft.buttonAngle}deg, ${tintHex(draft, draft.buttonFrom)}, ${tintHex(draft, draft.buttonTo)})`,
											backgroundColor: draft.accent,
										}}>
										Primary Button
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className='flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-panel px-6 py-4'>
					{dirty && (
						<p className='mr-auto text-xs text-slate-500'>Unapplied changes</p>
					)}
					<Button
						type='button'
						variant='outline'
						onClick={() => setDraft(defaultSettings)}
						className='border-white/20 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white'>
						<RotateCcw /> Reset To Defaults
					</Button>
					<Button
						type='button'
						onClick={() => {
							onChange(draft)
							setOpen(false)
						}}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Check /> Apply Settings
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
