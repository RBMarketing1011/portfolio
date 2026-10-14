/**
 * The page template catalog's categories, in the order the Add Page dialog lists
 * them. Client safe on purpose (no template data), so the dialog can label and
 * order templates without shipping the catalog itself to the browser.
 */
export const TEMPLATE_CATEGORIES = [
	{
		id: 'home',
		label: 'Home Pages',
		description: 'The front door: who you help, what you do, and the one next step.',
	},
	{
		id: 'landing',
		label: 'Landing Pages',
		description: 'One offer, one action. Built for paid traffic such as Google Ads.',
	},
	{
		id: 'lead-magnet',
		label: 'Lead Magnets',
		description: 'Trade something useful for an email address.',
	},
	{
		id: 'promotion',
		label: 'Sales & Promotions',
		description: 'Time-boxed offers, launches, bundles, and referrals.',
	},
	{
		id: 'pricing',
		label: 'Pricing',
		description: 'Plans, comparisons, calculators, and quote-based pricing.',
	},
	{
		id: 'services',
		label: 'Services',
		description: 'One service, all services, service areas, and industries.',
	},
	{
		id: 'product',
		label: 'Product & SaaS',
		description: 'Features, how it works, comparisons, and use cases.',
	},
	{
		id: 'proof',
		label: 'Proof & Portfolio',
		description: 'Case studies, results, reviews, and before-and-after work.',
	},
	{
		id: 'about',
		label: 'About',
		description: 'The story, the people, and what you stand for.',
	},
	{
		id: 'contact',
		label: 'Contact',
		description: 'Forms, booking, quotes, locations, and support.',
	},
	{
		id: 'events',
		label: 'Events & Webinars',
		description: 'Registration pages for webinars, workshops, and live events.',
	},
	{
		id: 'content',
		label: 'Blog & Resources',
		description: 'Articles, guides, resource hubs, and author pages.',
	},
	{
		id: 'company',
		label: 'Company',
		description: 'Careers, FAQ, partner programs, and press.',
	},
	{
		id: 'utility',
		label: 'Utility Pages',
		description: 'Thank you, not found, coming soon, sign in, and legal.',
	},
] as const

export type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number]['id']

export const TEMPLATE_CATEGORY_IDS: readonly string[] = TEMPLATE_CATEGORIES.map(
	(category) => category.id,
)

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> =
	Object.fromEntries(
		TEMPLATE_CATEGORIES.map((category) => [category.id, category.label]),
	)
