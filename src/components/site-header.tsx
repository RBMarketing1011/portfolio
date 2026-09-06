'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Menu } from 'lucide-react'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
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
	featuredProjects,
	industries,
	insightCategories,
	insights,
	projects,
	services,
	solutions,
} from '@/lib/site-content'

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

function DesktopNav() {
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
								href='/services#ai-automation-assessment'
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
											href={`/services#${service.slug}`}
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
											href={`/services#${service.slug}`}
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
					<NavigationMenuTrigger className={triggerClass}>
						Portfolio
					</NavigationMenuTrigger>
					<NavigationMenuContent className={panelClass}>
						<div className='grid gap-3 md:grid-cols-3'>
							{projects.map((project) => (
								<NavigationMenuLink asChild key={project.slug}>
									<Link
										href={`/portfolio#${project.slug}`}
										className='group rounded-lg p-2 transition-colors hover:bg-white/5'>
										<span className='relative block h-24 overflow-hidden rounded-md border border-white/10 bg-ink'>
											<Image
												src={project.image}
												alt=''
												fill
												sizes='240px'
												className='object-cover object-top transition-transform duration-300 group-hover:scale-105'
											/>
										</span>
										<span className='mt-2.5 block text-sm font-medium text-white'>
											{project.name}
										</span>
										<span className='mt-0.5 block text-xs text-slate-400'>
											{project.category}
										</span>
									</Link>
								</NavigationMenuLink>
							))}
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>

				<NavigationMenuItem>
					<NavigationMenuTrigger className={triggerClass}>
						Case Studies
					</NavigationMenuTrigger>
					<NavigationMenuContent className={panelClass}>
						<div className='grid gap-2 md:grid-cols-[1fr_17rem]'>
							<ul className='space-y-1'>
								{projects.map((project) => (
									<li key={project.slug}>
										<MenuLink
											href={`/case-studies/${project.slug}`}
											title={project.name}
											blurb={project.summary}
										/>
									</li>
								))}
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
									{insightCategories.map((category) => (
										<li key={category}>
											<NavigationMenuLink asChild>
												<Link
													href='/blog'
													className='block rounded-md px-2 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white'>
													{category}
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

				{/* Internal build tool; remove before production. */}
				<NavigationMenuItem>
					<NavigationMenuLink asChild>
						<Link href='/sections' className={plainLinkClass}>
							Sections
						</Link>
					</NavigationMenuLink>
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
				href: `/services#${s.slug}`,
				label: s.name,
			})),
		},
		{
			label: 'Portfolio',
			items: projects.map((p) => ({
				href: `/portfolio#${p.slug}`,
				label: p.name,
			})),
		},
		{
			label: 'Case Studies',
			items: projects.map((p) => ({
				href: `/case-studies/${p.slug}`,
				label: p.name,
			})),
		},
		{
			label: 'Blog',
			items: insights.map((i) => ({
				href: `/blog/${i.slug}`,
				label: i.title,
			})),
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

					{/* Internal build tool; remove before production. */}
					<div className='border-b border-white/10'>
						<Link
							href='/sections'
							onClick={close}
							className='flex items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium text-white transition-all outline-none hover:underline'>
							Sections
						</Link>
					</div>

					<Button
						asChild
						className='mt-6 w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href='/contact' onClick={close}>
							Book An Assessment
						</Link>
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	)
}

export default function SiteHeader() {
	return (
		<header className='header-fade fixed inset-x-0 top-0 z-50 border-b border-white/10 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-10'>
			<nav
				className='relative mx-auto flex max-w-7xl items-center justify-between gap-6'
				aria-label='Main'>
				<Wordmark />
				<DesktopNav />

				<div className='flex items-center gap-2'>
					<Button
						asChild
						className='hidden whitespace-nowrap bg-brand font-bold text-ink hover:bg-brand-strong sm:inline-flex lg:hidden xl:inline-flex'>
						<Link href='/contact'>Book An Assessment</Link>
					</Button>
					<MobileNav />
				</div>
			</nav>
		</header>
	)
}
