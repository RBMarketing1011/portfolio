/**
 * The page template catalog the Add Page dialog offers. Seeded into the
 * `templates` collection by `pnpm db:seed`; categories live in
 * template-categories.ts so the dialog can label them without this data.
 *
 * Order here is the order within a category in the dialog.
 */
import { aboutTemplates } from './about'
import { companyTemplates } from './company'
import { contactTemplates } from './contact'
import { contentTemplates } from './content'
import { eventTemplates } from './events'
import { homeTemplates } from './home'
import { landingTemplates } from './landing'
import { leadMagnetTemplates } from './lead-magnet'
import { pricingTemplates } from './pricing'
import { productTemplates } from './product'
import { promotionTemplates } from './promotion'
import { proofTemplates } from './proof'
import { serviceTemplates } from './services'
import { utilityTemplates } from './utility'

export type { PageTemplate } from './helpers'

export const builderTemplates = [
	...homeTemplates,
	...landingTemplates,
	...leadMagnetTemplates,
	...promotionTemplates,
	...pricingTemplates,
	...serviceTemplates,
	...productTemplates,
	...proofTemplates,
	...aboutTemplates,
	...contactTemplates,
	...eventTemplates,
	...contentTemplates,
	...companyTemplates,
	...utilityTemplates,
]
