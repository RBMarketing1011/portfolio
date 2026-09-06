'use client'

import { useState } from 'react'
import { Check, RotateCcw, Settings } from 'lucide-react'
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
import { FontCombobox } from './font-combobox'
import { fontStack } from './google-fonts'
import { defaultSettings, type ThemeSettings } from './theme-settings'
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
					<Settings className='size-4' />
					<span className='sr-only'>Theme settings</span>
				</button>
			</DialogTrigger>

			<DialogContent className='max-h-[90vh] overflow-y-auto border-white/10 bg-panel sm:max-w-3xl'>
				<DialogHeader>
					<DialogTitle className='text-white'>Theme</DialogTitle>
					<DialogDescription className='text-slate-400'>
						Applies to every section and template in the library.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-8 py-2'>
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
									<Label htmlFor={`color-${field.key}`} className='text-white'>
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

					<div className='flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-6'>
						{dirty && (
							<p className='mr-auto text-xs text-slate-500'>
								Unapplied changes
							</p>
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
				</div>
			</DialogContent>
		</Dialog>
	)
}
