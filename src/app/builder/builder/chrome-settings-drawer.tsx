'use client'

import { Fragment, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { MenuEditorDialog } from './menu-editor-dialog'
import { BackgroundDrawer } from '@/app/builder/background-drawer'
import type { BackgroundSettings } from '@/app/builder/background-settings'
import type { ThemeSettings } from '@/app/builder/theme-settings'
import { useBuilder } from '@/lib/builder/builder-context'
import {
	displaySlug,
	FOOTER_VARIANT_LABELS,
	FOOTER_VARIANTS,
	HEADER_VARIANT_LABELS,
	HEADER_VARIANTS,
	type Chrome,
	type Page,
} from '@/lib/builder/page-schema'
import {
	addressLine,
	hoursLines,
	phoneHref,
	type SiteProfile,
} from '@/lib/builder/site-profile'

const NO_LINK = '__none'

type Target = { value: string; label: string; hint?: string }

/**
 * Where the header button can go: a page, the business's phone or email, and whatever
 * it points at now (an address the AI or an older editor set), shown as it is so that
 * opening the list never loses it.
 */
function buttonTargets(
	pages: Page[],
	business: SiteProfile['business'] | null,
	current: string,
) {
	const toPages: Target[] = pages.map((page) => ({
		value: page.slug,
		label: page.name,
		hint: displaySlug(page.slug),
	}))
	const toContact: Target[] = []
	const phone = business?.phone.trim() ?? ''
	const tel = phone ? phoneHref(phone) : ''
	if (tel) toContact.push({ value: tel, label: `Call ${phone}` })
	const email = business?.email.trim() ?? ''
	if (email) toContact.push({ value: `mailto:${email}`, label: `Email ${email}` })
	const known = [...toPages, ...toContact].some((target) => target.value === current)
	const other: Target[] = current && !known ? [{ value: current, label: current }] : []
	return [toPages, toContact, other].filter((group) => group.length > 0)
}

/** Whether the footer's Contact column would show anything. */
const hasContact = (business: SiteProfile['business'] | null) =>
	Boolean(
		business &&
			(business.phone.trim() ||
				business.email.trim() ||
				addressLine(business) ||
				hoursLines(business).length > 0 ||
				business.serviceArea.length > 0),
	)

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
	const [menuOpen, setMenuOpen] = useState(false)
	// Business details live with the project, not the chrome; a browser-only site has none.
	const business = useBuilder().profile?.business ?? null
	const targets = buttonTargets(pages, business, chrome.ctaHref)

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

			{!isHeader && (
				<div className='flex items-start justify-between gap-4'>
					<div className='space-y-1'>
						<Label htmlFor='chrome-footer-details'>Contact details</Label>
						<p className='text-xs leading-5 text-slate-500'>
							{hasContact(business)
								? 'A Contact column with the phone, email, address, hours and areas from your business details.'
								: 'Shows your phone, email, address and hours once they are in your business details.'}
						</p>
					</div>
					<Switch
						id='chrome-footer-details'
						checked={chrome.footerDetails === true}
						onCheckedChange={(footerDetails) => onChrome({ footerDetails })}
						className='data-[state=checked]:bg-brand data-[state=unchecked]:bg-white/15'
					/>
				</div>
			)}

			{isHeader && (
				<>
					<div className='space-y-2'>
						<Label>Menu</Label>
						<p className='text-xs leading-5 text-slate-500'>
							{chrome.menu.length > 0
								? `A custom menu with ${chrome.menu.length} ${chrome.menu.length === 1 ? 'item' : 'items'}. The pages set to show in the header are not used while it is on.`
								: 'Showing your pages. Build a menu to add dropdowns and mega menus.'}
						</p>
						<Button
							type='button'
							variant='outline'
							onClick={() => setMenuOpen(true)}
							className='w-full border-white/15 bg-transparent'>
							{chrome.menu.length > 0 ? 'Edit menu' : 'Build a menu'}
						</Button>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='chrome-cta-label'>Button text</Label>
						{/* The saved site drops a longer label altogether. */}
						<Input
							id='chrome-cta-label'
							value={chrome.ctaLabel}
							maxLength={60}
							placeholder='Book An Assessment'
							onChange={(event) => onChrome({ ctaLabel: event.target.value })}
						/>
					</div>
					<div className='space-y-2'>
						<Label>Button goes to</Label>
						<Select
							value={chrome.ctaHref || NO_LINK}
							onValueChange={(value) =>
								onChrome({ ctaHref: value === NO_LINK ? '' : value })
							}>
							<SelectTrigger className='w-full'>
								<SelectValue placeholder='Pick a page' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_LINK}>No link</SelectItem>
								{targets.map((group, index) => (
									<Fragment key={index}>
										{index > 0 && <SelectSeparator />}
										<SelectGroup>
											{group.map((target) => (
												<SelectItem key={target.value} value={target.value}>
													<span className='truncate'>{target.label}</span>
													{target.hint && (
														<span className='ml-2 text-xs text-slate-500'>
															{target.hint}
														</span>
													)}
												</SelectItem>
											))}
										</SelectGroup>
									</Fragment>
								))}
							</SelectContent>
						</Select>
					</div>
				</>
			)}
		</div>
	)

	return (
		<>
			<BackgroundDrawer
				slug={isHeader ? 'site-header' : 'site-footer'}
				scope={scope}
				open={open}
				onOpenChange={onOpenChange}
				settings={background}
				theme={theme}
				onChange={onBackground}
				extra={extra}
			/>
			{isHeader && (
				<MenuEditorDialog
					open={menuOpen}
					onOpenChange={setMenuOpen}
					menu={chrome.menu}
					pages={pages}
					onSave={(menu) => onChrome({ menu })}
				/>
			)}
		</>
	)
}
