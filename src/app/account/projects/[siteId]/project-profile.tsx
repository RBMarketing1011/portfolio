'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { SettingSwitch } from '@/components/setting-switch'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
	BUSINESS_TYPES,
	WEEKDAYS,
	type BusinessType,
	type SiteProfile,
	type Weekday,
} from '@/lib/builder/site-profile'
import { SiteImageField, type ProjectImage } from './site-image-field'

const lines = (value: string) =>
	value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)

const isWebUrl = (value: string) => {
	try {
		return /^https?:$/.test(new URL(value).protocol)
	} catch {
		return false
	}
}

function Field({
	label,
	htmlFor,
	hint,
	children,
	className,
}: {
	label: string
	htmlFor?: string
	hint?: React.ReactNode
	children: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn('space-y-2', className)}>
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
			{hint && <p className='text-xs text-muted-foreground'>{hint}</p>}
		</div>
	)
}

function Section({
	title,
	description,
	children,
}: {
	title: string
	description?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent className='space-y-5'>{children}</CardContent>
		</Card>
	)
}

/**
 * The Brand, Business and SEO tabs of a project. They edit one profile together
 * and save it in one request, so switching tabs never loses a change.
 */
export function ProjectProfile({
	siteId,
	projectName,
	address,
	initial,
	initialImages,
	canEdit,
}: {
	siteId: string
	projectName: string
	/** Where the site is reachable, without the protocol, for the search preview. */
	address: string
	initial: SiteProfile
	initialImages: ProjectImage[]
	canEdit: boolean
}) {
	const router = useRouter()
	const [saved, setSaved] = useState(initial)
	const [draft, setDraft] = useState(initial)
	const [areas, setAreas] = useState(initial.business.serviceArea.join('\n'))
	const [profiles, setProfiles] = useState(initial.business.profiles.join('\n'))
	const [images, setImages] = useState(initialImages)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	const next: SiteProfile = useMemo(
		() => ({
			...draft,
			business: {
				...draft.business,
				serviceArea: lines(areas),
				profiles: lines(profiles),
			},
		}),
		[draft, areas, profiles],
	)
	const dirty = JSON.stringify(next) !== JSON.stringify(saved)

	const brand = (patch: Partial<SiteProfile['brand']>) =>
		setDraft((d) => ({ ...d, brand: { ...d.brand, ...patch } }))
	const seo = (patch: Partial<SiteProfile['seo']>) =>
		setDraft((d) => ({ ...d, seo: { ...d.seo, ...patch } }))
	const business = (patch: Partial<SiteProfile['business']>) =>
		setDraft((d) => ({ ...d, business: { ...d.business, ...patch } }))

	const reset = (profile: SiteProfile) => {
		setDraft(profile)
		setAreas(profile.business.serviceArea.join('\n'))
		setProfiles(profile.business.profiles.join('\n'))
	}

	const save = async () => {
		setError(null)
		setNotice(null)
		const badProfile = next.business.profiles.find((url) => !isWebUrl(url))
		if (badProfile) {
			setError(`“${badProfile}” is not a full web address. Start it with https://`)
			return
		}
		setBusy(true)
		const response = await fetch(`/api/sites/${siteId}/profile`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(next),
		})
		setBusy(false)
		const body = await response.json().catch(() => ({}))
		if (!response.ok) {
			setError(body.error ?? 'Those settings could not be saved.')
			return
		}
		setSaved(body.profile)
		reset(body.profile)
		setNotice('Saved. Live pages pick it up on their next load.')
		router.refresh()
	}

	const saveBar = (
		<div className='space-y-3'>
			{error && <FormAlert>{error}</FormAlert>}
			{notice && !dirty && <FormAlert tone='success'>{notice}</FormAlert>}
			<div className='flex flex-wrap items-center gap-2'>
				<Button onClick={save} disabled={!canEdit || !dirty || busy}>
					{busy && <Loader2 className='animate-spin' />} Save changes
				</Button>
				{dirty && !busy && (
					<Button
						variant='ghost'
						onClick={() => {
							reset(saved)
							setError(null)
						}}>
						Discard
					</Button>
				)}
			</div>
		</div>
	)

	const imageProps = {
		siteId,
		images,
		disabled: !canEdit,
		onUploaded: (image: ProjectImage) => setImages((list) => [...list, image]),
	}

	const name = next.seo.siteTitle || next.business.name || projectName
	const previewTitle = next.seo.homeTitle || name
	const previewDescription =
		next.seo.description ||
		next.business.description ||
		'No description yet. Search engines will pick some text from the page instead.'

	return (
		<>
			{/* ---------------------------------------------------------------- Brand */}
			<TabsContent value='brand' className='space-y-6 pt-6'>
				<Section
					title='Logo'
					description='Shown in the site’s header and footer. Without one, the business name is set in the heading font instead.'>
					<SiteImageField
						{...imageProps}
						id='brand-logo'
						label='Logo image'
						hint='A PNG with a transparent background works best. Wide logos fit the header better than tall ones.'
						value={next.brand.logo}
						onChange={(logo) => brand({ logo })}
					/>
					<Field
						label='Logo description'
						htmlFor='brand-logo-alt'
						hint='Read aloud by screen readers. Usually just the business name.'>
						<Input
							id='brand-logo-alt'
							value={next.brand.logoAlt}
							disabled={!canEdit}
							placeholder={name}
							onChange={(event) => brand({ logoAlt: event.target.value })}
						/>
					</Field>
				</Section>

				<Section
					title='Favicon'
					description='The small icon in browser tabs, bookmarks, and on phone home screens.'>
					<SiteImageField
						{...imageProps}
						id='brand-favicon'
						label='Icon image'
						hint='A square PNG, at least 512 × 512. Without one, the site shows its first letter on a dark tile.'
						value={next.brand.favicon}
						preview='square'
						onChange={(favicon) => brand({ favicon })}
					/>
				</Section>
				{saveBar}
			</TabsContent>

			{/* ------------------------------------------------------------- Business */}
			<TabsContent value='business' className='space-y-6 pt-6'>
				<Section
					title='Business details'
					description='Published as structured data (schema.org), which helps search engines show your hours, address, and phone number, and connect the site to your Google Business Profile. Use exactly the same name, address, and phone as your listings elsewhere.'>
					<SettingSwitch
						id='biz-enabled'
						checked={next.business.enabled}
						disabled={!canEdit}
						onCheckedChange={(enabled) => business({ enabled })}
						title='Publish these details for search engines'
						description='Adds the business markup to every page of the live site.'
					/>
					<Separator />
					<div className='grid gap-4 sm:grid-cols-2'>
						<Field label='Business type' htmlFor='biz-type' hint='Pick the closest match.'>
							<Select
								value={next.business.type}
								disabled={!canEdit}
								onValueChange={(type) => business({ type: type as BusinessType })}>
								<SelectTrigger id='biz-type' className='w-full'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{BUSINESS_TYPES.map((type) => (
										<SelectItem key={type.value} value={type.value}>
											{type.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field label='Business name' htmlFor='biz-name'>
							<Input
								id='biz-name'
								value={next.business.name}
								disabled={!canEdit}
								placeholder={projectName}
								onChange={(event) => business({ name: event.target.value })}
							/>
						</Field>
					</div>
					<Field
						label='Short description'
						htmlFor='biz-description'
						hint='One or two sentences on what you do and where.'>
						<Textarea
							id='biz-description'
							rows={3}
							value={next.business.description}
							disabled={!canEdit}
							onChange={(event) => business({ description: event.target.value })}
						/>
					</Field>
					<div className='grid gap-4 sm:grid-cols-3'>
						<Field label='Phone' htmlFor='biz-phone'>
							<Input
								id='biz-phone'
								type='tel'
								value={next.business.phone}
								disabled={!canEdit}
								placeholder='(555) 010-0000'
								onChange={(event) => business({ phone: event.target.value })}
							/>
						</Field>
						<Field label='Email' htmlFor='biz-email'>
							<Input
								id='biz-email'
								type='email'
								value={next.business.email}
								disabled={!canEdit}
								onChange={(event) => business({ email: event.target.value })}
							/>
						</Field>
						<Field label='Price range' htmlFor='biz-price' hint='$, $$, $$$, or $50-$200'>
							<Input
								id='biz-price'
								value={next.business.priceRange}
								disabled={!canEdit}
								onChange={(event) => business({ priceRange: event.target.value })}
							/>
						</Field>
					</div>
				</Section>

				<Section
					title='Location'
					description='Leave the street blank if customers do not visit you, and list the areas you serve below instead.'>
					<Field label='Street address' htmlFor='biz-street'>
						<Input
							id='biz-street'
							value={next.business.street}
							disabled={!canEdit}
							onChange={(event) => business({ street: event.target.value })}
						/>
					</Field>
					<div className='grid gap-4 sm:grid-cols-4'>
						<Field label='City' htmlFor='biz-city' className='sm:col-span-2'>
							<Input
								id='biz-city'
								value={next.business.city}
								disabled={!canEdit}
								onChange={(event) => business({ city: event.target.value })}
							/>
						</Field>
						<Field label='State or region' htmlFor='biz-region'>
							<Input
								id='biz-region'
								value={next.business.region}
								disabled={!canEdit}
								onChange={(event) => business({ region: event.target.value })}
							/>
						</Field>
						<Field label='Postal code' htmlFor='biz-postal'>
							<Input
								id='biz-postal'
								value={next.business.postalCode}
								disabled={!canEdit}
								onChange={(event) => business({ postalCode: event.target.value })}
							/>
						</Field>
					</div>
					<div className='grid gap-4 sm:grid-cols-3'>
						<Field label='Country code' htmlFor='biz-country' hint='Two letters, such as US.'>
							<Input
								id='biz-country'
								value={next.business.country}
								maxLength={2}
								disabled={!canEdit}
								onChange={(event) => business({ country: event.target.value.toUpperCase() })}
							/>
						</Field>
						<Field label='Latitude' htmlFor='biz-lat' hint='Optional, for the map pin.'>
							<Input
								id='biz-lat'
								type='number'
								step='any'
								value={next.business.latitude ?? ''}
								disabled={!canEdit}
								onChange={(event) =>
									business({ latitude: event.target.value === '' ? null : Number(event.target.value) })
								}
							/>
						</Field>
						<Field label='Longitude' htmlFor='biz-lng'>
							<Input
								id='biz-lng'
								type='number'
								step='any'
								value={next.business.longitude ?? ''}
								disabled={!canEdit}
								onChange={(event) =>
									business({ longitude: event.target.value === '' ? null : Number(event.target.value) })
								}
							/>
						</Field>
					</div>
					<Field label='Areas served' htmlFor='biz-areas' hint='One city, town, or region per line.'>
						<Textarea
							id='biz-areas'
							rows={4}
							value={areas}
							disabled={!canEdit}
							placeholder={'Austin\nRound Rock\nCedar Park'}
							onChange={(event) => setAreas(event.target.value)}
						/>
					</Field>
				</Section>

				<Section
					title='Opening hours'
					description='Add a row for each set of days that share the same hours.'>
					<HoursEditor
						hours={next.business.hours}
						disabled={!canEdit}
						onChange={(hours) => business({ hours })}
					/>
				</Section>

				<Section
					title='Profiles elsewhere'
					description='Links to the same business on other sites, so search engines know they are one business.'>
					<Field
						label='Profile links'
						htmlFor='biz-profiles'
						hint='One full address per line: Google Business Profile, Facebook, Instagram, LinkedIn, Yelp.'>
						<Textarea
							id='biz-profiles'
							rows={4}
							value={profiles}
							disabled={!canEdit}
							placeholder={'https://www.facebook.com/yourbusiness\nhttps://www.instagram.com/yourbusiness'}
							onChange={(event) => setProfiles(event.target.value)}
						/>
					</Field>
				</Section>
				{saveBar}
			</TabsContent>

			{/* ------------------------------------------------------------------ SEO */}
			<TabsContent value='seo' className='space-y-6 pt-6'>
				<Section
					title='Search results'
					description={`How the site is named and described on search engines. Other pages are titled “Page name | ${name}”.`}>
					<Card className='gap-2 py-4 shadow-none'>
						<CardHeader className='gap-1 px-4'>
							<CardDescription className='truncate text-xs'>{address}</CardDescription>
							<CardTitle className='truncate text-base font-medium text-primary'>
								{previewTitle}
							</CardTitle>
						</CardHeader>
						<CardContent className='px-4'>
							<p className='line-clamp-2 text-sm text-muted-foreground'>{previewDescription}</p>
						</CardContent>
					</Card>

					<div className='grid gap-4 sm:grid-cols-2'>
						<Field
							label='Site name'
							htmlFor='seo-title'
							hint={`Defaults to “${next.business.name || projectName}”.`}>
							<Input
								id='seo-title'
								value={next.seo.siteTitle}
								maxLength={70}
								disabled={!canEdit}
								placeholder={next.business.name || projectName}
								onChange={(event) => seo({ siteTitle: event.target.value })}
							/>
						</Field>
						<Field label='Home page title' htmlFor='seo-home' hint='Optional. Under 60 characters reads in full.'>
							<Input
								id='seo-home'
								value={next.seo.homeTitle}
								maxLength={70}
								disabled={!canEdit}
								placeholder={`${name} | What you do in Your City`}
								onChange={(event) => seo({ homeTitle: event.target.value })}
							/>
						</Field>
					</div>
					<Field
						label='Description'
						htmlFor='seo-description'
						hint={`${next.seo.description.length} characters. Around 150 to 160 shows in full.`}>
						<Textarea
							id='seo-description'
							rows={3}
							value={next.seo.description}
							disabled={!canEdit}
							placeholder='What you do, who for, and where, in one or two sentences.'
							onChange={(event) => seo({ description: event.target.value })}
						/>
					</Field>
				</Section>

				<Section
					title='Social sharing'
					description='The image and handle used when someone shares a link to the site.'>
					<SiteImageField
						{...imageProps}
						id='seo-share-image'
						label='Share image'
						hint='1200 × 630 pixels. Shown on Facebook, LinkedIn, X, iMessage and Slack. Without one, the logo is used.'
						value={next.seo.shareImage}
						preview='card'
						onChange={(shareImage) => seo({ shareImage })}
					/>
					<Field label='X (Twitter) handle' htmlFor='seo-twitter' hint='Without the @. Optional.'>
						<Input
							id='seo-twitter'
							value={next.seo.twitter}
							disabled={!canEdit}
							placeholder='yourbusiness'
							onChange={(event) => seo({ twitter: event.target.value.replace(/^@/, '') })}
						/>
					</Field>
				</Section>

				<Section title='Indexing'>
					<SettingSwitch
						id='seo-noindex'
						checked={next.seo.noindex}
						disabled={!canEdit}
						onCheckedChange={(noindex) => seo({ noindex })}
						title='Hide this site from search engines'
						description='For staging or private sites. Leave this off for any site that should be found.'
					/>
				</Section>
				{saveBar}
			</TabsContent>
		</>
	)
}

const DAY_SHORT: Record<Weekday, string> = {
	Monday: 'Mon',
	Tuesday: 'Tue',
	Wednesday: 'Wed',
	Thursday: 'Thu',
	Friday: 'Fri',
	Saturday: 'Sat',
	Sunday: 'Sun',
}

function HoursEditor({
	hours,
	disabled,
	onChange,
}: {
	hours: SiteProfile['business']['hours']
	disabled?: boolean
	onChange: (hours: SiteProfile['business']['hours']) => void
}) {
	const set = (index: number, patch: Partial<(typeof hours)[number]>) =>
		onChange(hours.map((row, i) => (i === index ? { ...row, ...patch } : row)))

	return (
		<div className='space-y-4'>
			{hours.length === 0 && (
				<p className='text-sm text-muted-foreground'>No hours set.</p>
			)}
			{hours.map((row, index) => (
				<div key={index} className='space-y-4'>
					{index > 0 && <Separator />}
					<div className='flex flex-wrap items-center gap-3'>
						<ToggleGroup
							type='multiple'
							variant='outline'
							size='sm'
							disabled={disabled}
							aria-label='Days'
							value={row.days}
							// Kept in week order, whatever order the days were clicked in.
							onValueChange={(days) =>
								set(index, { days: WEEKDAYS.filter((day) => days.includes(day)) })
							}>
							{WEEKDAYS.map((day) => (
								<ToggleGroupItem key={day} value={day} aria-label={day}>
									{DAY_SHORT[day]}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
						<div className='flex items-center gap-2'>
							<Input
								type='time'
								aria-label='Opens'
								value={row.opens}
								disabled={disabled}
								onChange={(event) => set(index, { opens: event.target.value })}
								className='w-32'
							/>
							<span className='text-sm text-muted-foreground'>to</span>
							<Input
								type='time'
								aria-label='Closes'
								value={row.closes}
								disabled={disabled}
								onChange={(event) => set(index, { closes: event.target.value })}
								className='w-32'
							/>
						</div>
						<Button
							type='button'
							variant='ghost'
							size='icon'
							disabled={disabled}
							aria-label='Remove these hours'
							onClick={() => onChange(hours.filter((_, i) => i !== index))}
							className='ml-auto'>
							<Trash2 />
						</Button>
					</div>
				</div>
			))}
			<Button
				type='button'
				variant='outline'
				size='sm'
				disabled={disabled || hours.length >= 7}
				onClick={() =>
					onChange([
						...hours,
						{
							days: hours.length === 0 ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] : [],
							opens: '09:00',
							closes: '17:00',
						},
					])
				}>
				<Plus /> Add hours
			</Button>
		</div>
	)
}
