'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Menu } from 'lucide-react'
import { Wordmark } from '@/components/brand'
import { AccountLink } from '@/components/account-link'
import { MobileAccountLinks } from '@/components/mobile-account-links'
import { useHeaderOptions } from '@/components/header-options'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion'
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import {
	caseStudyHighlights,
	featuredProjects,
	industries,
	insightTopics,
	insights,
	serviceName,
	services,
	solutions,
} from '@/lib/site-content'
import { cn } from '@/lib/utils'

const panelClass = 'w-full p-3 md:w-full'

const triggerClass =
	'whitespace-nowrap bg-transparent px-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white data-[state=open]:bg-white/5 data-[state=open]:text-white'

const plainLinkClass =
	'inline-flex h-9 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white'

function MenuLink({
	href,
	icon: Icon,
	title,
	blurb,
}: {
	href: string
	icon?: React.ComponentType<{ className?: string }>
	title: string
	blurb: string
}) {
	return (
		<NavigationMenuLink asChild>
			<Link
				href={href}
				className='flex flex-row items-start gap-3 rounded-lg p-3 transition-colors hover:bg-white/5 focus:bg-white/5'>
				{Icon && (
					<span className='mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-brand/25 bg-brand/10'>
						<Icon className='size-4 text-brand' />
					</span>
				)}
				<span className='space-y-1'>
					<span className='block font-medium text-white'>{title}</span>
					<span className='block text-sm leading-6 text-slate-400'>
						{blurb}
					</span>
				</span>
			</Link>
		</NavigationMenuLink>
	)
}

function PromoPanel({
	eyebrow,
	title,
	body,
	href,
	cta,
	image,
}: {
	eyebrow: string
	title: string
	body: string
	href: string
	cta: string
	image?: string
}) {
	return (
		<NavigationMenuLink asChild>
			<Link
				href={href}
				data-menu-feature
				className='flex h-full flex-col justify-between rounded-lg border border-brand/20 bg-linear-to-br from-brand/15 via-panel to-panel p-5 transition-colors hover:border-brand/45'>
				<div>
					<p className='eyebrow'>{eyebrow}</p>
					<p className='mt-3 font-display text-lg font-semibold leading-snug text-white'>
						{title}
					</p>
					<p className='mt-2 text-sm leading-6 text-slate-400'>{body}</p>
				</div>
				{image && (
					<span className='relative mt-4 block aspect-video overflow-hidden rounded-md border border-white/10'>
						<Image
							src={image}
							alt=''
							fill
							sizes='320px'
							className='object-cover'
						/>
					</span>
				)}
				<span className='mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
					{cta} <ArrowRight className='size-4' />
				</span>
			</Link>
		</NavigationMenuLink>
	)
}

// Same destinations as the mega menu, flattened into plain dropdown lists.
const simpleMenus = [
	{
		label: 'Industries',
		links: industries.map((item) => ({
			href: `/industries/${item.slug}`,
			label: item.name,
		})),
	},
	{
		label: 'Solutions',
		links: solutions.map((item) => ({
			href: `/solutions/${item.slug}`,
			label: item.name,
		})),
	},
	{
		label: 'Services',
		links: services.map((item) => ({
			href: `/services/${item.slug}`,
			label: item.name,
		})),
	},
	{
		label: 'Case Studies',
		links: [
			...caseStudyHighlights.map((item) => ({
				href: `/case-studies/${item.slug}`,
				label: item.name,
			})),
			{ href: '/case-studies', label: 'All case studies' },
		],
	},
	{
		label: 'Blog',
		links: [
			...insightTopics.map((topic) => ({
				href: `/blog/topics/${topic.slug}`,
				label: topic.category,
			})),
			{ href: '/blog', label: 'All articles' },
		],
	},
]

// Radix dropdowns are click-only, so the open state is driven by pointer here to
// match the mega menu. The delay stops the panel flickering on the gap below the trigger.
function HoverDropdown({
	label,
	links,
}: {
	label: string
	links: { href: string; label: string }[]
}) {
	const [open, setOpen] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const cancelClose = () => {
		if (timer.current) clearTimeout(timer.current)
		timer.current = null
	}
	const scheduleClose = () => {
		cancelClose()
		timer.current = setTimeout(() => setOpen(false), 120)
	}

	useEffect(() => cancelClose, [])

	return (
		<DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
			<DropdownMenuTrigger
				onPointerEnter={() => {
					cancelClose()
					setOpen(true)
				}}
				onPointerLeave={scheduleClose}
				className={cn(plainLinkClass, 'gap-1 data-[state=open]:text-white')}>
				{label}
				<ChevronDown className='size-3 transition-transform duration-200 group-data-[state=open]:rotate-180' />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align='start'
				sideOffset={10}
				onPointerEnter={cancelClose}
				onPointerLeave={scheduleClose}
				// Hover menus must not pull focus back to the trigger on close.
				onCloseAutoFocus={(event) => event.preventDefault()}
				className='w-64 border-white/10 bg-popover'>
				{links.map((link) => (
					<DropdownMenuItem key={`${link.href}-${link.label}`} asChild>
						<Link
							href={link.href}
							className='cursor-pointer text-slate-300 focus:bg-white/5 focus:text-white'>
							{link.label}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function DesktopNav() {
	const { megaMenu } = useHeaderOptions()

	if (!megaMenu) {
		return (
			<div className='hidden items-center lg:flex'>
				<Link href='/about' className={plainLinkClass}>
					About Us
				</Link>

				{simpleMenus.map((menu) => (
					<HoverDropdown
						key={menu.label}
						label={menu.label}
						links={menu.links}
					/>
				))}

				<Link href='/portfolio' className={plainLinkClass}>
					Portfolio
				</Link>

				<AccountLink className={plainLinkClass} />
			</div>
		)
	}

	return (
		<NavigationMenu className='static hidden lg:block'>
			<NavigationMenuList className='gap-0'>
				<NavigationMenuItem>
					<NavigationMenuLink asChild>
						<Link href='/about' className={plainLinkClass}>
							About Us
						</Link>
					</NavigationMenuLink>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Industries
					</NavigationMenuTrigger>
					<NavigationMenuContent className={panelClass}>
						<div className='grid gap-2 md:grid-cols-[1fr_1fr_17rem]'>
							<ul className='space-y-1'>
								{industries.slice(0, 3).map((industry) => (
									<li key={industry.slug}>
										<MenuLink
											href={`/industries/${industry.slug}`}
											icon={industry.icon}
											title={industry.name}
											blurb={industry.blurb}
										/>
									</li>
								))}
							</ul>
							<ul className='space-y-1'>
								{industries.slice(3).map((industry) => (
									<li key={industry.slug}>
										<MenuLink
											href={`/industries/${industry.slug}`}
											icon={industry.icon}
											title={industry.name}
											blurb={industry.blurb}
										/>
									</li>
								))}
							</ul>
							<PromoPanel
								eyebrow='Not listed?'
								title='The same problems repeat everywhere'
								body='Duplicate data entry, tribal knowledge, and reports nobody trusts. We start by finding yours.'
								href='/contact'
								cta='Book an assessment'
							/>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Solutions
					</NavigationMenuTrigger>
					<NavigationMenuContent className={panelClass}>
						<div className='grid gap-2 md:grid-cols-[1fr_1fr_17rem]'>
							<ul className='space-y-1'>
								{solutions.slice(0, 4).map((solution) => (
									<li key={solution.slug}>
										<MenuLink
											href={`/solutions/${solution.slug}`}
											icon={solution.icon}
											title={solution.name}
											blurb={solution.blurb}
										/>
									</li>
								))}
							</ul>
							<ul className='space-y-1'>
								{solutions.slice(4).map((solution) => (
									<li key={solution.slug}>
										<MenuLink
											href={`/solutions/${solution.slug}`}
											icon={solution.icon}
											title={solution.name}
											blurb={solution.blurb}
										/>
									</li>
								))}
							</ul>
							<PromoPanel
								eyebrow='Start here'
								title='AI & Automation Assessment'
								body='We walk your entire operation and hand you a ranked roadmap of what to build first.'
								href='/services/ai-automation-assessment'
								cta='See what you get'
							/>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Services
					</NavigationMenuTrigger>
					<NavigationMenuContent className={panelClass}>
						<div className='grid gap-2 md:grid-cols-[1fr_1fr_17rem]'>
							<ul className='space-y-1'>
								{services.slice(0, 2).map((service) => (
									<li key={service.slug}>
										<MenuLink
											href={`/services/${service.slug}`}
											icon={service.icon}
											title={service.name}
											blurb={service.tagline}
										/>
									</li>
								))}
							</ul>
							<ul className='space-y-1'>
								{services.slice(2).map((service) => (
									<li key={service.slug}>
										<MenuLink
											href={`/services/${service.slug}`}
											icon={service.icon}
											title={service.name}
											blurb={service.tagline}
										/>
									</li>
								))}
							</ul>
							<PromoPanel
								eyebrow='How we work'
								title='Assess, blueprint, build, support'
								body='Four steps, no mystery. See how an engagement runs before you commit to anything.'
								href='/process'
								cta='View our process'
							/>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuLink asChild>
						<Link href='/portfolio' className={plainLinkClass}>
							Portfolio
						</Link>
					</NavigationMenuLink>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Case Studies
					</NavigationMenuTrigger>
					<NavigationMenuContent className={panelClass}>
						<div className='grid gap-2 md:grid-cols-[1fr_17rem]'>
							<ul className='space-y-1'>
								{caseStudyHighlights.map((project) => (
									<li key={project.slug}>
										<MenuLink
											href={`/case-studies/${project.slug}`}
											title={project.name}
											blurb={serviceName(project.service)}
										/>
									</li>
								))}
								<li>
									<MenuLink
										href='/case-studies'
										title='All case studies'
										blurb='Every engagement, filterable by service'
									/>
								</li>
							</ul>
							{featuredProjects[0] && (
								<PromoPanel
									eyebrow='Featured'
									title={featuredProjects[0].name}
									body={featuredProjects[0].summary}
									href={`/case-studies/${featuredProjects[0].slug}`}
									cta='Read case study'
									image={featuredProjects[0].image}
								/>
							)}
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Blog
					</NavigationMenuTrigger>
					<NavigationMenuContent className={panelClass}>
						<div className='grid gap-2 md:grid-cols-[13rem_1fr_17rem]'>
							<div className='p-3'>
								<p className='eyebrow'>Topics</p>
								<ul className='mt-4 space-y-1'>
									{insightTopics.map((topic) => (
										<li key={topic.slug}>
											<NavigationMenuLink asChild>
												<Link
													href={`/blog/topics/${topic.slug}`}
													className='flex w-full flex-row items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white'>
													{topic.category}
													<span className='text-xs tabular-nums text-slate-600'>
														{topic.posts.length}
													</span>
												</Link>
											</NavigationMenuLink>
										</li>
									))}
								</ul>
								<NavigationMenuLink asChild>
									<Link
										href='/blog'
										className='mt-4 flex flex-row items-center gap-2 px-2 text-sm font-semibold text-brand hover:text-brand-strong'>
										All articles <ArrowRight className='size-4' />
									</Link>
								</NavigationMenuLink>
							</div>

							<ul className='space-y-1'>
								{insights.slice(1, 5).map((insight) => (
									<li key={insight.slug}>
										<MenuLink
											href={`/blog/${insight.slug}`}
											title={insight.title}
											blurb={`${insight.category} · ${insight.readTime} read`}
										/>
									</li>
								))}
							</ul>

							{insights[0] && (
								<PromoPanel
									eyebrow='Latest'
									title={insights[0].title}
									body={insights[0].excerpt}
									href={`/blog/${insights[0].slug}`}
									cta='Read article'
								/>
							)}
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<AccountLink className={plainLinkClass} />
				</NavigationMenuItem>
			</NavigationMenuList>
		</NavigationMenu>
	)
}

function MobileNav() {
	const [open, setOpen] = useState(false)
	const close = () => setOpen(false)

	const groups = [
		{
			label: 'Industries',
			items: industries.map((i) => ({
				href: `/industries/${i.slug}`,
				label: i.name,
			})),
		},
		{
			label: 'Solutions',
			items: solutions.map((s) => ({
				href: `/solutions/${s.slug}`,
				label: s.name,
			})),
		},
		{
			label: 'Services',
			items: services.map((s) => ({
				href: `/services/${s.slug}`,
				label: s.name,
			})),
		},
		{
			label: 'Case Studies',
			items: [
				...caseStudyHighlights.map((p) => ({
					href: `/case-studies/${p.slug}`,
					label: p.name,
				})),
				{ href: '/case-studies', label: 'All case studies' },
			],
		},
		{
			label: 'Blog',
			items: [
				...insightTopics.map((topic) => ({
					href: `/blog/topics/${topic.slug}`,
					label: `${topic.category} (${topic.posts.length})`,
				})),
				{ href: '/blog', label: 'All articles' },
			],
		},
	]

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button
					variant='outline'
					size='icon'
					className='border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white lg:hidden'>
					<Menu />
					<span className='sr-only'>Open menu</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				side='right'
				className='hero-grid w-full overflow-y-auto border-white/10 sm:max-w-sm'>
				<SheetHeader>
					<SheetTitle className='text-left text-white'>Menu</SheetTitle>
				</SheetHeader>

				<div className='px-4 pb-10'>
					<div className='border-b border-white/10'>
						<Link
							href='/about'
							onClick={close}
							className='flex items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium text-white transition-all outline-none hover:underline'>
							About Us
						</Link>
					</div>

					<Accordion type='multiple'>
						{groups.map((group) => (
							<AccordionItem
								key={group.label}
								value={group.label}
								className='border-white/10'>
								<AccordionTrigger className='text-white hover:no-underline'>
									{group.label}
								</AccordionTrigger>
								<AccordionContent>
									<ul className='space-y-1 pl-1'>
										{group.items.map((item) => (
											<li key={item.href}>
												<Link
													href={item.href}
													onClick={close}
													className='block rounded-md px-2 py-2 text-slate-400 hover:bg-white/5 hover:text-white'>
													{item.label}
												</Link>
											</li>
										))}
									</ul>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>

					<div className='border-b border-white/10'>
						<Link
							href='/portfolio'
							onClick={close}
							className='flex items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium text-white transition-all outline-none hover:underline'>
							Portfolio
						</Link>
					</div>

					<MobileAccountLinks
						onNavigate={close}
						className='flex items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium text-white transition-all outline-none hover:underline'
					/>

					<Button
						asChild
						className='mt-6 w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href='/contact' onClick={close}>
							Book An Assessment
						</Link>
					</Button>
					<Button
						asChild
						variant='outline'
						className='mt-3 w-full border-brand/40 bg-transparent font-semibold text-white hover:border-brand hover:bg-brand/10 hover:text-white'>
						<Link href='/builder' onClick={close}>
							Try The Builder
						</Link>
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	)
}

// The tinted surface lives on its own clipped layer so the pattern can overhang
// the edges without the header cropping the mega menu that opens below it.
function Surface({ className }: { className?: string }) {
	return (
		<div
			data-surface='header'
			aria-hidden
			className={cn(
				'header-fade pointer-events-none absolute inset-0 -z-10 overflow-hidden',
				className,
			)}
		/>
	)
}

export default function SiteHeader({
	design = 'bar',
}: {
	/** How the fixed bar is shaped. */
	design?: 'bar' | 'floating' | 'stacked'
}) {
	// Both sit in the same slot, so every header design picks them up together.
	const cta = (
		<>
			<Button
				asChild
				className='hidden whitespace-nowrap bg-brand font-bold text-ink hover:bg-brand-strong sm:inline-flex lg:hidden xl:inline-flex'>
				<Link href='/contact'>Book An Assessment</Link>
			</Button>
			<Button
				asChild
				variant='outline'
				className='hidden whitespace-nowrap border-brand/40 bg-transparent font-semibold text-white hover:border-brand hover:bg-brand/10 hover:text-white sm:inline-flex lg:hidden xl:inline-flex'>
				<Link href='/builder'>Try The Builder</Link>
			</Button>
		</>
	)

	if (design === 'floating') {
		return (
			<header className='fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 lg:px-10'>
				<nav
					className='relative mx-auto flex max-w-7xl items-center justify-between gap-6 rounded-full border border-white/12 px-5 py-2.5 shadow-[0_8px_32px_-12px_color-mix(in_srgb,var(--color-ink)_80%,transparent)] backdrop-blur-md'
					aria-label='Main'>
					<Surface className='rounded-full' />
					<Wordmark />
					{/* The pill is the positioned ancestor, so the menu already matches its width. */}
					<DesktopNav />
					<div className='flex items-center gap-2'>
						{cta}
						<MobileNav />
					</div>
				</nav>
			</header>
		)
	}

	if (design === 'stacked') {
		return (
			<header className='fixed inset-x-0 top-0 z-50 border-b border-white/10 backdrop-blur-md'>
				<Surface />
				<div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3 sm:px-6 lg:px-10'>
					<Wordmark />
					<div className='flex items-center gap-2'>
						{cta}
						<MobileNav />
					</div>
				</div>
				<nav
					className='hidden border-t border-white/8 px-4 sm:px-6 lg:block lg:px-10'
					aria-label='Main'>
					{/* Positioned here so the menu spans the content row and opens from its bottom. */}
					<div className='relative mx-auto flex max-w-7xl justify-center'>
						<DesktopNav />
					</div>
				</nav>
			</header>
		)
	}

	return (
		<header className='fixed inset-x-0 top-0 z-50 border-b border-white/10 px-4 backdrop-blur-md sm:px-6 lg:px-10'>
			<Surface />
			{/* Carries the row's padding so the menu spans logo to CTA and opens from the header's edge. */}
			<nav
				className='relative mx-auto flex max-w-7xl items-center justify-between gap-6 py-3'
				aria-label='Main'>
				<Wordmark />
				<DesktopNav />

				<div className='flex items-center gap-2'>
					{cta}
					<MobileNav />
				</div>
			</nav>
		</header>
	)
}
