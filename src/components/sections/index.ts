// Barrel so `@/components/sections` resolves to every section in this folder.
export {
	Section,
	SectionHeading,
	PageHero,
	CheckList,
	CtaBand,
} from './primitives'
// Display items: the atoms every collection container arranges.
export {
	TestimonialCard,
	CaseStudyCard,
	ArticleCard,
	TeamCard,
	RelatedCard,
	FeatureCard,
	ClientLogo,
	exampleLogos,
	sampleTestimonials,
	sampleCaseStudies,
	sampleArticles,
	samplePeople,
	sampleRelated,
	sampleFeatures,
	sampleMedia,
	samplePhotos,
} from './cards'
export type {
	Testimonial,
	CaseStudyItem,
	Article,
	Person,
	RelatedItem,
	Feature,
	MediaItem,
	Logo,
} from './cards'
export { MediaCard } from './media-card'
// Collection containers: generic, item agnostic.
export { Grid, Masonry, Carousel, Marquee } from './collections'
export { SplitHero, StatHero, Breadcrumbs } from './entry'
export { StatBand, LogoStrip, Spotlight, BeforeAfter } from './proof'
export {
	FeatureRows,
	ProcessSteps,
	BentoGrid,
	TabsShowcase,
	ComparisonTable,
	TechStackChips,
} from './explain'
export { ProseBlock, Callout, AuthorBio } from './content'
export {
	FaqAccordion,
	ContactSplit,
	PricingTiers,
	LeadCapture,
	SplitCta,
} from './convert'
export {
	VideoPlayer,
	MediaGallery,
	MediaMosaic,
	ImageCompare,
	Figure,
} from './media'
export { FilterBar, Pagination, TableOfContents } from './navigation'
export { RoiCalculator, AnnouncementBar } from './interactive'
