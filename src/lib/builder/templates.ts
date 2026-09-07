// Template seeds. Deliberately almost prop-free: every section renders its own
// self-describing placeholder copy, so a template only needs order and variant.
import type { Block } from './types'

type Spec = [type: string, variant?: string, children?: Spec[]]

let counter = 0
function build(spec: Spec): Block {
	const [type, variant, children] = spec
	const block: Block = { id: `seed_${(counter++).toString(36)}`, type }
	if (variant) block.variant = variant
	if (children) block.children = children.map(build)
	return block
}

const repeat = (spec: Spec, times: number): Spec[] =>
	Array.from({ length: times }, () => spec)

const template = (
	slug: string,
	name: string,
	description: string,
	specs: Spec[],
) => ({ slug, name, description, blocks: specs.map(build) })

const feature = (variant = 'card'): Spec => ['feature-card', variant]
const quote = (variant = 'card'): Spec => ['testimonial-card', variant]
const person = (variant = 'card'): Spec => ['team-card', variant]
const related: Spec = ['related-card', 'card']
const project: Spec = ['case-study-card', 'stacked']
const article: Spec = ['article-card', 'card']
const logo: Spec = ['client-logo']

export const builderTemplates = [
	template(
		'home',
		'Home',
		'Hero, capabilities, proof, and a closing call to action.',
		[
			['split-hero'],
			['marquee', 'inline', repeat(logo, 7)],
			['grid', 'beside', repeat(feature('inline'), 4)],
			['feature-rows', 'alternating'],
			['stat-band', 'divided'],
			['spotlight', 'overlap'],
			['carousel', 'bars', repeat(quote(), 5)],
			['cta-band', 'split'],
		],
	),

	template(
		'overview',
		'Overview',
		'Category hub that introduces a set of pages.',
		[
			['page-hero'],
			['grid', 'centered', repeat(feature(), 6)],
			['tabs-showcase', 'side'],
			['process-steps', 'columns'],
			['logo-strip', 'bare'],
			['spotlight', 'split'],
			['faq-accordion', 'split'],
			['cta-band', 'centered'],
		],
	),

	template(
		'service',
		'Service',
		'One service explained, priced, and evidenced.',
		[
			['page-hero'],
			['logo-strip', 'bare'],
			['feature-rows', 'alternating'],
			['process-steps', 'timeline'],
			['comparison-table', 'rules'],
			['stat-band', 'divided'],
			['testimonial-card', 'aside'],
			['faq-accordion', 'boxed'],
			['cta-band', 'split'],
		],
	),

	template('solution', 'Solution', 'Problem, shift, and what gets built.', [
		['split-hero'],
		['stat-band', 'cards'],
		['before-after', 'rows'],
		['grid', 'beside', repeat(feature('inline'), 4)],
		['spotlight', 'stacked'],
		['testimonial-card', 'bare'],
		['split-cta', 'divided'],
	]),

	template('industry', 'Industry', 'Sector page opening on the numbers.', [
		['stat-hero'],
		['check-list'],
		['grid', 'above', repeat(feature('numbered'), 6)],
		['marquee', 'rule', repeat(logo, 5)],
		['spotlight', 'overlap'],
		['testimonial-card', 'aside'],
		['faq-accordion', 'stacked'],
		['cta-band', 'centered'],
	]),

	template(
		'case-study',
		'Case Study',
		'The problem, the approach, and what shipped.',
		[
			['page-hero'],
			['media-card', 'card'],
			['detail-card', 'inline'],
			['prose-block', 'plain'],
			['check-list'],
			['chips', 'outline'],
			['grid', 'above', repeat(related, 3)],
			['cta-band', 'split'],
		],
	),

	template(
		'index-listing',
		'Index / Listing',
		'Filterable card grid with paging.',
		[
			['page-hero'],
			['filter-bar', 'underline'],
			['grid', 'above', repeat(project, 6)],
			['pagination', 'spread'],
			['marquee', 'inline', repeat(logo, 7)],
			['lead-capture', 'ruled'],
		],
	),

	template(
		'blog-post',
		'Blog Post',
		'Article hero, prose, figure, callout, related.',
		[
			['page-hero'],
			['table-of-contents', 'rail'],
			['prose-block', 'ruled'],
			['figure', 'framed'],
			['callout', 'rule'],
			['author-bio', 'bare'],
			['lead-capture', 'banner'],
			['grid', 'above', repeat(related, 3)],
		],
	),

	template(
		'author',
		'Author',
		'Byline profile and everything they have written.',
		[
			['page-hero'],
			['chips', 'inline'],
			['grid', 'above', repeat(article, 6)],
			['pagination', 'compact'],
			['marquee', 'inline', repeat(logo, 7)],
			['lead-capture', 'ruled'],
		],
	),

	template('about', 'About', 'Story, values, team, and proof.', [
		['page-hero'],
		['prose-block', 'plain'],
		['bento-grid', 'divided'],
		['stat-band', 'row'],
		['grid', 'centered', repeat(person(), 4)],
		['marquee', 'rule', repeat(logo, 7)],
		['testimonial-card', 'bare'],
		['cta-band', 'split'],
	]),

	template('team', 'Team', 'The people, how they work, and how to join.', [
		['page-hero'],
		['grid', 'centered', repeat(person('portrait'), 4)],
		['check-list'],
		['bento-grid', 'numbered'],
		['stat-band', 'divided'],
		['testimonial-card', 'aside'],
		['split-cta', 'rows'],
	]),

	template('process', 'Process', 'How an engagement runs, step by step.', [
		['page-hero'],
		['process-steps', 'timeline'],
		['before-after', 'columns'],
		['stat-band', 'divided'],
		['spotlight', 'stacked'],
		['testimonial-card', 'bare'],
		['faq-accordion', 'split'],
		['cta-band', 'centered'],
	]),

	template(
		'careers',
		'Careers',
		'Why here, open roles, and the hiring process.',
		[
			['page-hero'],
			['check-list'],
			['grid', 'beside', repeat(feature('inline'), 4)],
			['grid', 'above', repeat(related, 2)],
			['process-steps', 'timeline'],
			['stat-band', 'row'],
			['testimonial-card', 'bare'],
			['cta-band', 'centered'],
		],
	),

	template(
		'testimonials',
		'Testimonials',
		'A wall of client quotes with filtering.',
		[
			['page-hero'],
			['marquee', 'inline', repeat(logo, 7)],
			['testimonial-card', 'bare'],
			['filter-bar', 'segmented'],
			['masonry', undefined, repeat(quote(), 7)],
			['pagination', 'numbers'],
			['stat-band', 'divided'],
			['cta-band', 'split'],
		],
	),

	template(
		'location',
		'Location',
		'Map, hours, service area, and what happens here.',
		[
			['page-hero'],
			['media-card', 'card'],
			['chips', 'solid'],
			['grid', 'above', repeat(feature(), 3)],
			['stat-band', 'divided'],
			['testimonial-card', 'bare'],
			['faq-accordion', 'boxed'],
			['cta-band', 'split'],
		],
	),

	template(
		'contact',
		'Contact',
		'Form, expectations, and the questions people ask.',
		[
			['contact-split', 'split'],
			['marquee', 'inline', repeat(logo, 7)],
			['stat-band', 'divided'],
			['testimonial-card', 'bare'],
			['faq-accordion', 'boxed'],
		],
	),

	template('booking', 'Booking', 'Calendar slot and what the call covers.', [
		['contact-split', 'reversed'],
		['marquee', 'inline', repeat(logo, 7)],
		['before-after', 'columns'],
		['stat-band', 'row'],
		['testimonial-card', 'bare'],
		['faq-accordion', 'boxed'],
	]),

	template(
		'pricing',
		'Pricing',
		'Tiers, a calculator, and a comparison table.',
		[
			['page-hero'],
			['pricing-tiers', 'cards'],
			['roi-calculator', 'split'],
			['comparison-table', 'zebra'],
			['carousel', 'overlay', repeat(quote(), 5)],
			['faq-accordion', 'boxed'],
			['cta-band', 'centered'],
		],
	),

	template(
		'comparison',
		'Comparison',
		'Head to head, with an honest recommendation.',
		[
			['page-hero'],
			['comparison-table', 'accent'],
			['feature-rows', 'alternating'],
			['before-after', 'stacked'],
			['stat-band', 'row'],
			['testimonial-card', 'aside'],
			['faq-accordion', 'split'],
			['split-cta', 'cards'],
		],
	),

	template('faq', 'FAQ', 'Grouped question sets with a mid-page capture.', [
		['page-hero'],
		['filter-bar', 'segmented'],
		['faq-accordion', 'stacked'],
		['faq-accordion', 'stacked'],
		['lead-capture', 'ruled'],
		['faq-accordion', 'stacked'],
		['split-cta', 'divided'],
	]),

	template(
		'landing',
		'Campaign Landing',
		'Stripped chrome and a single conversion path.',
		[
			['split-hero'],
			['marquee', 'centered', repeat(logo, 7)],
			['check-list'],
			['stat-band', 'row'],
			['before-after', 'columns'],
			['testimonial-card', 'bare'],
			['lead-capture', 'banner'],
			['faq-accordion', 'boxed'],
			['cta-band', 'centered'],
		],
	),

	template(
		'lead-magnet',
		'Lead Magnet',
		'Gated download with proof and no competing links.',
		[
			['split-hero'],
			['marquee', 'inline', repeat(logo, 7)],
			['grid', 'above', repeat(feature('numbered'), 6)],
			['stat-band', 'divided'],
			['testimonial-card', 'bare'],
			['faq-accordion', 'boxed'],
			['cta-band', 'centered'],
		],
	),

	template(
		'event',
		'Event',
		'Agenda, speakers, gallery, and the practical bits.',
		[
			['page-hero'],
			['detail-card', 'card'],
			['marquee', 'inline', repeat(logo, 7)],
			['process-steps', 'timeline'],
			['grid', 'centered', repeat(person('portrait'), 4)],
			['media-gallery', 'bottom'],
			['stat-band', 'divided'],
			['testimonial-card', 'bare'],
			['faq-accordion', 'boxed'],
			['cta-band', 'centered'],
		],
	),

	template(
		'webinar',
		'Webinar',
		'Registration beside the outcomes, then the detail.',
		[
			['split-hero'],
			['marquee', 'inline', repeat(logo, 7)],
			['video-player'],
			['grid', 'beside', repeat(feature('inline'), 4)],
			['grid', 'above', repeat(person('row'), 2)],
			['stat-band', 'row'],
			['testimonial-card', 'bare'],
			['faq-accordion', 'stacked'],
			['lead-capture', 'banner'],
		],
	),

	template(
		'coming-soon',
		'Coming Soon',
		'One screen, one capture, no other links.',
		[
			['countdown', 'boxed'],
			['lead-capture', 'card'],
			['logo-strip', 'bare'],
		],
	),

	template('login', 'Login', 'Sign in beside a proof panel.', [
		['auth-panel', 'split'],
	]),

	template('legal', 'Legal', 'Narrow prose for privacy policy and terms.', [
		['page-hero'],
		['table-of-contents', 'card'],
		['prose-block', 'marked'],
	]),

	template(
		'not-found',
		'Not Found',
		'On-brand 404 with routes back into the site.',
		[
			['notice', 'code'],
			['grid', 'above', repeat(related, 4)],
		],
	),

	template(
		'thank-you',
		'Thank You',
		'Confirmation, next steps, and somewhere to go.',
		[
			['notice', 'confirmation'],
			['stat-band', 'divided'],
			['grid', 'above', repeat(related, 3)],
			['lead-capture', 'ruled'],
		],
	),
]

export type BuilderTemplate = (typeof builderTemplates)[number]
