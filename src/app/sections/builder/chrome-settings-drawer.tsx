'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { BackgroundDrawer } from '@/app/sections/background-drawer'
import type { BackgroundSettings } from '@/app/sections/background-settings'
import type { ThemeSettings } from '@/app/sections/theme-settings'
import {
	displaySlug,
	FOOTER_VARIANT_LABELS,
	FOOTER_VARIANTS,
	HEADER_VARIANT_LABELS,
	HEADER_VARIANTS,
	type Chrome,
	type Page,
} from '@/lib/builder/page-schema'

/**
 * The same drawer the section library opens for site-header / site-footer, plus the
 * layout and call to action, which only exist once the chrome is builder-driven.
 */
export function ChromeSettingsDrawer({
	scope,
	open,
	onOpenChange,
	chrome,
	pages,
	background,
	theme,
	onChrome,
	onBackground,
}: {
	scope: 'header' | 'footer'
	open: boolean
	onOpenChange: (open: boolean) => void
	chrome: Chrome
	pages: Page[]
	background: BackgroundSettings
	theme: ThemeSettings
	onChrome: (patch: Partial<Chrome>) => void
	onBackground: (next: BackgroundSettings) => void
}) {
	const isHeader = scope === 'header'

	const extra = (
		<div className='mb-6 space-y-5 border-b border-white/10 pb-6'>
			<div className='space-y-2'>
				<Label>Layout</Label>
				{isHeader ? (
					<Select
						value={chrome.header}
						onValueChange={(header) =>
							onChrome({ header: header as Chrome['header'] })
						}>
						<SelectTrigger className='w-full'>
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
				) : (
					<Select
						value={chrome.footer}
						onValueChange={(footer) =>
							onChrome({ footer: footer as Chrome['footer'] })
						}>
						<SelectTrigger className='w-full'>
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
				)}
			</div>

			{isHeader && (
				<>
					<div className='space-y-2'>
						<Label htmlFor='chrome-cta-label'>Button text</Label>
						<Input
							id='chrome-cta-label'
							value={chrome.ctaLabel}
							placeholder='Book An Assessment'
							onChange={(event) => onChrome({ ctaLabel: event.target.value })}
						/>
					</div>
					<div className='space-y-2'>
						<Label>Button goes to</Label>
						<Select
							value={chrome.ctaHref || '__none'}
							onValueChange={(value) =>
								onChrome({ ctaHref: value === '__none' ? '' : value })
							}>
							<SelectTrigger className='w-full'>
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
							</SelectContent>
						</Select>
					</div>
				</>
			)}
		</div>
	)

	return (
		<BackgroundDrawer
			slug={isHeader ? 'site-header' : 'site-footer'}
			open={open}
			onOpenChange={onOpenChange}
			settings={background}
			theme={theme}
			onChange={onBackground}
			extra={extra}
		/>
	)
}
