import {
	BarChart3,
	Bot,
	Boxes,
	Building2,
	CalendarClock,
	Car,
	ClipboardCheck,
	Code2,
	Compass,
	FileSearch,
	FileStack,
	GitBranch,
	GraduationCap,
	Hammer,
	LayoutDashboard,
	LineChart,
	Megaphone,
	Plug,
	Rocket,
	Store,
	Truck,
	Users,
	Wrench,
	Workflow,
	type LucideIcon,
} from 'lucide-react'

export type Industry = {
	slug: string
	icon: LucideIcon
	name: string
	blurb: string
	intro: string[]
	pains: string[]
	builds: string[]
	workflows: { title: string; body: string }[]
	faqs: { question: string; answer: string }[]
}

export const industries: Industry[] = [
	{
		slug: 'home-services-trades',
		icon: Wrench,
		name: 'Home Services & Trades',
		blurb:
			'Plumbing, HVAC, electrical, and roofing companies where the schedule is the business.',
		intro: [
			'In a trades business, the calendar is the product. Every hour a truck sits idle is margin you do not get back, and every job booked wrong costs you twice: once in the drive time and again in the callback.',
			'Most of the shops we walk into are running a field service platform they only use a third of, a separate spreadsheet for job costing, and a whiteboard that is the actual source of truth. Nobody planned that. It accumulated as the business grew faster than the systems did.',
			'Our work here is rarely about replacing the whole stack. It is about closing the gaps between the tools you already pay for, so a job booked in one place shows up everywhere it needs to without anyone retyping it.',
		],
		pains: [
			'Jobs booked across phone, text, and paper with no single source of truth',
			'Techs entering the same job details twice, once in the field and once in the office',
			'No reliable view of what each crew or job type actually costs you',
			'After-hours calls going to voicemail and never getting called back',
			'Quotes and change orders living in text threads',
		],
		builds: [
			'Dispatch and scheduling systems built around how your crews actually run',
			'Automated customer confirmations, reminders, and on-my-way notifications',
			'Job costing and margin reporting that updates without a monthly spreadsheet session',
			'After-hours intake that captures the lead instead of losing it',
			'Field-to-office data flow so nothing gets entered twice',
		],
		workflows: [
			{
				title: 'Intake and booking',
				body: 'Calls, forms, and after-hours requests land in one queue with the information you actually need to schedule the work. No more piecing a job together from three voicemails.',
			},
			{
				title: 'Dispatch and routing',
				body: 'Assign work based on skill, location, and the reality of the day rather than whoever answers the radio first.',
			},
			{
				title: 'Field execution',
				body: 'Techs get the job detail on their phone and capture what happened once. That record flows straight to invoicing and job costing.',
			},
			{
				title: 'Close-out and reporting',
				body: 'Invoicing, follow-up, and margin reporting happen off the same record, so the numbers agree without reconciliation.',
			},
		],
		faqs: [
			{
				question: 'Do we have to replace our field service software?',
				answer:
					'Usually not. Most of the value comes from making what you already run talk to the rest of the business. We only recommend replacement when the tool is actively costing you more than it returns.',
			},
			{
				question: 'Our techs are not technical. Will they use it?',
				answer:
					'If it is slower than what they do now, they will not, and we would be wrong to ship it. We design the field side around the two or three things a tech does forty times a day and bury everything else.',
			},
		],
	},
	{
		slug: 'auto-repair',
		icon: Car,
		name: 'Auto Repair & Automotive',
		blurb:
			'Shops that lose bookings after hours and lose time to scheduling software nobody wants to use.',
		intro: [
			'Auto repair has a scheduling problem that most software has made worse rather than better. The tools are accurate and complete, and they take a service writer ninety seconds to book a job that should take fifteen.',
			'So the shop stops using it. Work goes back on paper, the online booking widget quietly stops matching reality, and customers who tried to book at nine at night never hear back.',
			'We have built in this space directly. The pattern that works is a booking experience a customer finishes in under a minute and a shop-side calendar built for fast changes, not exhaustive data entry.',
		],
		pains: [
			'Bookings arrive after the phone stops being answered and go nowhere',
			'Scheduling tools too heavy for a busy service counter',
			'Estimates and approvals stuck in text threads with no record',
			'Double-booked bays and technicians standing idle',
			'No visibility into which marketing actually produced a repair order',
		],
		builds: [
			'Online booking a customer can finish in under a minute',
			'Shop-side calendars designed for fast rescheduling',
			'Automated confirmations, reminders, and status updates',
			'Digital estimates and approvals with a clear audit trail',
			'Source-to-repair-order reporting so you know what marketing worked',
		],
		workflows: [
			{
				title: 'Customer books',
				body: 'A short, mobile-first flow that captures the vehicle and the concern without asking for information the shop does not need yet.',
			},
			{
				title: 'Shop confirms',
				body: 'The service writer sees the request in context and confirms or adjusts in a couple of clicks.',
			},
			{
				title: 'Work in progress',
				body: 'Estimates and approvals move through the system instead of a personal cell phone, so there is a record when it matters.',
			},
			{
				title: 'Follow-up',
				body: 'Reminders for declined work and scheduled maintenance go out automatically rather than when someone remembers.',
			},
		],
		faqs: [
			{
				question: 'We already have a shop management system. Does this replace it?',
				answer:
					'No. In most cases we sit alongside it and fix the customer-facing and scheduling layer, which is usually where the money is leaking.',
			},
			{
				question: 'How fast can customers actually book?',
				answer:
					'The target we design to is under a minute on a phone. If it takes longer, people abandon it and call during business hours instead, which defeats the purpose.',
			},
		],
	},
	{
		slug: 'moving-logistics',
		icon: Truck,
		name: 'Moving & Logistics',
		blurb:
			'Operations where crews change weekly and training quality decides customer experience.',
		intro: [
			'In moving and logistics, your product is delivered by whoever showed up that morning. Crew composition changes constantly, and the difference between a clean job and a claim is usually whether someone was trained on a specific step.',
			'That training almost always lives in the heads of a few experienced people. When they are busy, onboarding gets skipped, and the cost shows up later as damage, rework, and reviews.',
			'We built MMC University for exactly this problem: turning operational knowledge into structured, mobile-first training that a new hire can complete before their first job.',
		],
		pains: [
			'Onboarding depends on whoever happens to be free that day',
			'Inconsistent process between crews and locations',
			'Damage and claims traced back to skipped steps',
			'No record of who has actually been trained on what',
			'Dispatch and job details living in a group text',
		],
		builds: [
			'Mobile training platforms built for people who are not at a desk',
			'Certification and progress tracking so managers know who is ready',
			'Standardized job checklists that produce a record',
			'Crew scheduling and dispatch tooling',
			'Damage and claims tracking tied back to the job',
		],
		workflows: [
			{
				title: 'Hire and onboard',
				body: 'A new crew member works through a structured path on their phone before their first job instead of learning on a customer.',
			},
			{
				title: 'Certify',
				body: 'Progress and completion are tracked, so a manager can see at a glance who is cleared for which work.',
			},
			{
				title: 'Execute consistently',
				body: 'Job checklists make the standard explicit and produce a record of what was done.',
			},
			{
				title: 'Review and improve',
				body: 'Claims and issues get tied back to the step that failed, which tells you what training to fix.',
			},
		],
		faqs: [
			{
				question: 'Our crews turn over constantly. Is training software worth it?',
				answer:
					'High turnover is the argument for it, not against it. The higher your turnover, the more expensive it is to have onboarding depend on a specific experienced person being available.',
			},
			{
				question: 'Can our team maintain the content ourselves?',
				answer:
					'Yes. We build the authoring side so your operations people can add and update lessons without calling us.',
			},
		],
	},
	{
		slug: 'marketing-agencies',
		icon: Megaphone,
		name: 'Marketing Agencies',
		blurb:
			'Agencies buried in reporting and client status questions instead of doing the work.',
		intro: [
			'Agencies lose an enormous amount of margin to two activities that no client would ever agree to pay for directly: assembling reports and answering status questions.',
			'The reporting problem comes from data living in five ad platforms, a call tracking tool, and a CRM that do not agree with each other. The status problem comes from clients having no visibility, so they email.',
			'We have built both sides of this, including Agency Aviator and a unified client reporting layer. The goal is straightforward: your team spends its hours on the work that renews the contract.',
		],
		pains: [
			'Monthly reporting assembled by hand across several platforms',
			'Clients emailing and texting for status updates',
			'Performance data that does not tie spend to revenue',
			'Deliverables and approvals scattered across email threads',
			'Onboarding a new client taking days of manual setup',
		],
		builds: [
			'Client portals with live status and deliverables',
			'Automated multi-source performance reporting',
			'White-labeled dashboards under your brand',
			'Approval and feedback workflows with a clear trail',
			'Client onboarding automation',
		],
		workflows: [
			{
				title: 'Onboard the client',
				body: 'Account setup, access, and kickoff information collected once and provisioned automatically.',
			},
			{
				title: 'Run the work',
				body: 'Deliverables and approvals move through a system the client can see, which removes most status emails before they happen.',
			},
			{
				title: 'Report automatically',
				body: 'Performance data is consolidated and assembled on a schedule rather than by a person at month end.',
			},
			{
				title: 'Renew',
				body: 'The client can see what they got for what they spent, which makes the renewal conversation a review instead of a defense.',
			},
		],
		faqs: [
			{
				question: 'Can it be white-labeled?',
				answer:
					'Yes. In most agency builds the client never sees our name anywhere. The portal and reporting run under your brand and domain.',
			},
			{
				question: 'We use a lot of different ad platforms. Can you pull them all in?',
				answer:
					'Generally yes, wherever the platform exposes an API. Part of the assessment is confirming which sources can be automated and which will need a different approach.',
			},
		],
	},
	{
		slug: 'professional-services',
		icon: Building2,
		name: 'Professional Services',
		blurb:
			'Firms whose margins get eaten by document handling, intake, and manual review.',
		intro: [
			'Professional services firms sell hours, which means every hour spent on administration is inventory you destroyed rather than sold.',
			'The biggest recoverable blocks are almost always intake and document handling. Someone retypes a form into a practice management system. Someone reads a hundred-page document to find six fields. Someone assembles the same status update every week.',
			'This is the category where applied AI has the clearest payback, provided it is pointed at a specific document type with a human review step where the stakes justify one.',
		],
		pains: [
			'Intake forms retyped into two or three other systems',
			'Documents reviewed line by line to extract a handful of fields',
			'Billable hours lost to administration and status reporting',
			'Matter or case status that only exists in someone is head',
			'Conflict checks and compliance steps done manually',
		],
		builds: [
			'Document extraction pipelines with human review where it matters',
			'Automated intake, routing, and conflict checking',
			'Matter and case dashboards',
			'Client-facing status portals',
			'Retrieval systems over your own document history',
		],
		workflows: [
			{
				title: 'Intake',
				body: 'Client information is captured once and flows into every downstream system without a second round of typing.',
			},
			{
				title: 'Document processing',
				body: 'Incoming documents are read, classified, and the relevant fields extracted, with a reviewer confirming anything consequential.',
			},
			{
				title: 'Work and track',
				body: 'Status lives in a system rather than in a person, so covering for someone does not mean reconstructing the file.',
			},
			{
				title: 'Report',
				body: 'Clients see progress without a partner writing an update email.',
			},
		],
		faqs: [
			{
				question: 'Is it safe to run client documents through AI?',
				answer:
					'It depends entirely on the architecture, and it is a fair question to ask hard. We design for data handling requirements first, including keeping processing private where the work demands it, and we will tell you when a use case is not appropriate.',
			},
			{
				question: 'What if the extraction gets something wrong?',
				answer:
					'Then a person catches it, because we put a review step anywhere a mistake is expensive. Automation without a review step belongs only where errors are cheap and reversible.',
			},
		],
	},
	{
		slug: 'retail-hospitality',
		icon: Store,
		name: 'Retail & Hospitality',
		blurb:
			'Multi-location brands that need consistency without adding a layer of management.',
		intro: [
			'Multi-location operations have a consistency problem that headcount alone cannot solve. Every location drifts a little, and by the time the numbers show it, the drift has been happening for months.',
			'Training is usually the first place it shows. Generic course tools deliver documents that do not look or feel like the brand, so nobody engages with them and the standard erodes.',
			'We built OMNI University for a specialty coffee brand facing exactly that: teaching a craft, not just distributing a PDF.',
		],
		pains: [
			'Training that does not match the brand and gets ignored',
			'Every location running the process slightly differently',
			'No visibility into performance until the numbers come in late',
			'Onboarding quality depending on the manager on shift',
			'Standards that exist in a binder nobody opens',
		],
		builds: [
			'Branded training platforms that feel like the company',
			'Location performance dashboards',
			'Standardized operating workflows and checklists',
			'Certification tracking across locations',
			'Automated reporting to district and ownership level',
		],
		workflows: [
			{
				title: 'Define the standard',
				body: 'Structure what good looks like into learning paths that build skill in a deliberate order.',
			},
			{
				title: 'Train and certify',
				body: 'Staff work through the path, and completion is tracked per person and per location.',
			},
			{
				title: 'Operate consistently',
				body: 'Daily and weekly checklists make the standard visible in the work rather than in a binder.',
			},
			{
				title: 'Measure',
				body: 'Location dashboards surface drift while it is still cheap to correct.',
			},
		],
		faqs: [
			{
				question: 'We only have a few locations. Is this premature?',
				answer:
					'A few locations is often the best time. The cost of standardizing goes up with every location you add, and the habits you set early are the ones that scale.',
			},
			{
				question: 'Can the training look like our brand?',
				answer:
					'That is usually the point. When training looks generic, people treat it as compliance. When it looks like the company, they treat it as part of the job.',
			},
		],
	},
]

export type Solution = {
	slug: string
	icon: LucideIcon
	name: string
	blurb: string
	headline: string
	intro: string[]
	problems: string[]
	whatWeBuild: { title: string; body: string }[]
	outcomes: string[]
	goodFit: string[]
	faqs: { question: string; answer: string }[]
}

export const solutions: Solution[] = [
	{
		slug: 'ai-operations-audit',
		icon: FileSearch,
		name: 'AI Operations Audit',
		blurb: 'A full walkthrough of your business and a ranked build roadmap.',
		headline: 'Find out what should actually be built before you build anything.',
		intro: [
			'The most expensive software mistake is not a bad build. It is a good build of the wrong thing. The audit exists to make that mistake very hard to make.',
			'We spend time inside your operation, talking to the people doing the work rather than only the people describing it. We follow information from the moment it enters the business to the moment it produces an invoice, and we write down every place a human is doing something a system should be doing.',
			'What you get at the end is a ranked list. Not a list of everything that could be automated, which is infinite and useless, but the handful of things worth doing, in order, with an honest read on effort and payback.',
		],
		problems: [
			'You know there is waste but cannot point at exactly where',
			'Vendors keep pitching AI without connecting it to your numbers',
			'Previous software projects solved something nobody was asking about',
			'Every department has a different idea of the top priority',
		],
		whatWeBuild: [
			{
				title: 'Process and systems map',
				body: 'A documented view of how work actually moves through your business, including the spreadsheets and workarounds that are not on any official diagram.',
			},
			{
				title: 'Opportunity register',
				body: 'Every automation, AI, and software opportunity we found, scored by effort and expected payback so the sequencing argument is settled with evidence.',
			},
			{
				title: 'A recommended first project',
				body: 'One clearly defined starting point with a measurable outcome, scoped tightly enough to prove value quickly.',
			},
			{
				title: 'A do-not-build list',
				body: 'The things that look appealing but do not justify the cost. This list usually saves more money than the build list makes.',
			},
		],
		outcomes: [
			'A clear picture of where time and money leak',
			'Priorities your leadership team actually agrees on',
			'A roadmap you own, whether or not we build it',
			'Confidence that the first project is the right first project',
		],
		goodFit: [
			'You have outgrown the systems that got you here',
			'You are being pitched AI and cannot evaluate the claims',
			'Manual work is capping how fast you can grow',
			'You want a plan before you commit a budget',
		],
		faqs: [
			{
				question: 'What happens if the audit says we should not build anything?',
				answer:
					'Then we tell you that, and you have saved a great deal of money. It happens, and it is a legitimate outcome.',
			},
			{
				question: 'Do we have to hire you to build afterward?',
				answer:
					'No. The roadmap is yours. You can hand it to an internal team or another firm.',
			},
			{
				question: 'How disruptive is it to our team?',
				answer:
					'Light. It is mostly conversations and observation, scheduled around your operation rather than the other way around.',
			},
		],
	},
	{
		slug: 'document-automation',
		icon: FileStack,
		name: 'Document & Data Automation',
		blurb: 'Stop retyping invoices, applications, and inbound paperwork.',
		headline: 'The documents should read themselves.',
		intro: [
			'Almost every business has someone whose day includes opening a document and typing what they see into another system. Invoices, applications, purchase orders, insurance forms, inspection reports.',
			'It is the single most common recoverable cost we find, and it is also where applied AI has the clearest and least speculative payback. The task is well defined, it happens constantly, and the output is checkable.',
			'The important design decision is not the model. It is where the human stays in the loop. We put review steps wherever a mistake is expensive and let the system run unattended where it is not.',
		],
		problems: [
			'The same information typed into two or three systems',
			'Invoices and forms processed by hand at volume',
			'Errors introduced at each retype and inherited by every report downstream',
			'Backlogs that grow whenever one specific person is out',
		],
		whatWeBuild: [
			{
				title: 'Extraction pipelines',
				body: 'Documents come in by email, upload, or scan, get classified, and have the relevant fields pulled out automatically.',
			},
			{
				title: 'Validation and review',
				body: 'Confidence thresholds route anything uncertain to a person, with a review interface built for speed rather than completeness.',
			},
			{
				title: 'System delivery',
				body: 'Extracted data lands in your accounting, CRM, or operational system without a human copy-paste step.',
			},
			{
				title: 'Exception handling',
				body: 'Documents that do not fit the pattern get flagged loudly instead of failing quietly.',
			},
		],
		outcomes: [
			'Hours returned every week from repetitive data entry',
			'Fewer downstream errors because data is entered once',
			'Processing that does not stop when one person is out',
			'A clear audit trail of what was extracted and who confirmed it',
		],
		goodFit: [
			'You process the same document type repeatedly',
			'A person is a bottleneck for paperwork throughput',
			'Data entry errors are causing downstream problems',
			'Volume is growing faster than you want to hire',
		],
		faqs: [
			{
				question: 'What accuracy should we expect?',
				answer:
					'It depends on the document type and quality, which is why we measure it on your actual documents before committing to an approach rather than quoting a number from a brochure.',
			},
			{
				question: 'What about sensitive documents?',
				answer:
					'Data handling is a design constraint we set at the start, including keeping processing private where the work requires it.',
			},
		],
	},
	{
		slug: 'intake-scheduling',
		icon: CalendarClock,
		name: 'Customer Intake & Scheduling',
		blurb: 'Capture and book work without anyone answering the phone.',
		headline: 'Stop losing the jobs that arrive after hours.',
		intro: [
			'A significant share of inbound demand arrives when nobody is available to answer it. In service businesses, that call goes to voicemail and then to your competitor.',
			'The fix is not simply bolting a booking widget onto a website. Most of those fail because they either ask for too much information or do not reflect what the operation can actually deliver, so the shop stops trusting them.',
			'We have shipped this directly, including a scheduling product for auto repair shops. The design target is a customer completing a booking in under a minute on a phone, and a staff-side calendar fast enough that people actually keep it current.',
		],
		problems: [
			'After-hours demand going to voicemail and never being called back',
			'Booking tools too slow for staff to keep current',
			'Double bookings and idle capacity in the same week',
			'No-shows because reminders depend on someone remembering',
		],
		whatWeBuild: [
			{
				title: 'Customer-facing booking',
				body: 'A short mobile flow that captures exactly what you need to schedule the work and nothing else.',
			},
			{
				title: 'Staff-side calendar',
				body: 'Built for fast rescheduling and the messy reality of a working day, not exhaustive data capture.',
			},
			{
				title: 'Automated communication',
				body: 'Confirmations, reminders, and status updates that go out on their own.',
			},
			{
				title: 'Capacity rules',
				body: 'Availability that reflects real constraints, so what a customer books is something you can actually deliver.',
			},
		],
		outcomes: [
			'Demand captured outside business hours',
			'Fewer no-shows from automated reminders',
			'Less phone time spent on scheduling logistics',
			'A calendar people trust because it stays accurate',
		],
		goodFit: [
			'Customers try to book when you are closed',
			'Scheduling eats a meaningful share of staff time',
			'Your current tool is being worked around',
			'No-shows are a recurring cost',
		],
		faqs: [
			{
				question: 'Can it work with our existing system?',
				answer:
					'Usually yes. We frequently sit alongside an existing management system and handle the customer-facing and scheduling layer.',
			},
			{
				question: 'What if our availability rules are complicated?',
				answer:
					'They usually are. Encoding real constraints correctly is most of the work, and it is what separates a booking tool that gets used from one that does not.',
			},
		],
	},
	{
		slug: 'client-portals',
		icon: Users,
		name: 'Client Portals',
		blurb: 'Give customers a place to self-serve instead of emailing you.',
		headline: 'Answer the question before it is asked.',
		intro: [
			'Client questions are expensive in a way that never appears on an invoice. Each one interrupts someone doing billable work, and the answer is almost always information that already exists somewhere.',
			'A portal is worth building when the same handful of questions arrive constantly. Status, deliverables, documents, results. Surface those and most of the email disappears.',
			'We have built this pattern several times, including Agency Aviator. The failure mode to avoid is a portal that recreates your internal tooling. Clients need a small number of answers, not your project management system.',
		],
		problems: [
			'The same status questions arriving by email and text',
			'Account staff pulled off delivery to answer them',
			'Documents and deliverables scattered across email threads',
			'Clients with no visibility assuming nothing is happening',
		],
		whatWeBuild: [
			{
				title: 'Scoped client access',
				body: 'Every client sees their own work and nothing else, with permissions that hold up.',
			},
			{
				title: 'Status and deliverables',
				body: 'The specific questions clients ask most, answered on the first screen.',
			},
			{
				title: 'Document delivery',
				body: 'One durable place for files instead of a search through email history.',
			},
			{
				title: 'Approvals and feedback',
				body: 'Sign-off captured in the system with a record of who approved what and when.',
			},
		],
		outcomes: [
			'A large share of status inquiries eliminated',
			'Account teams returned to delivery work',
			'Clients who can see the value they are paying for',
			'A clear record when a disagreement comes up',
		],
		goodFit: [
			'You answer the same questions repeatedly',
			'Client communication lives in individual inboxes',
			'Renewal conversations turn into justification exercises',
			'Deliverables are hard for clients to locate',
		],
		faqs: [
			{
				question: 'Can it be white-labeled?',
				answer:
					'Yes. It runs under your brand and domain, and in most builds the client never sees our name.',
			},
			{
				question: 'Will clients actually log in?',
				answer:
					'Only if it is faster than emailing you. That is a design constraint we take seriously, and it is why we keep the surface small.',
			},
		],
	},
	{
		slug: 'reporting-dashboards',
		icon: LayoutDashboard,
		name: 'Reporting & Dashboards',
		blurb: 'One trustworthy set of numbers, assembled automatically.',
		headline: 'Reporting should not be a monthly project.',
		intro: [
			'Two problems usually show up together. Assembling reports takes days, and once assembled, nobody entirely believes them because two systems disagree.',
			'The second problem is worse. When people stop trusting the numbers, they fall back on instinct, and every decision meeting becomes an argument about whose spreadsheet is right.',
			'The work is to define what each metric means, consolidate the sources, and automate the assembly so reporting stops consuming a person and starts informing decisions.',
		],
		problems: [
			'Reports assembled by hand from several systems',
			'Systems that disagree, so nobody trusts either',
			'Numbers arriving too late to act on',
			'Every department reporting a different version of the truth',
		],
		whatWeBuild: [
			{
				title: 'Source consolidation',
				body: 'Pull the platforms and databases you already run into one model so the numbers reconcile.',
			},
			{
				title: 'Metric definitions',
				body: 'Agree on what each number actually means and encode it once, so it cannot drift between teams.',
			},
			{
				title: 'Operational dashboards',
				body: 'Views built for the decisions people actually make, rather than every chart the tool can render.',
			},
			{
				title: 'Automated delivery',
				body: 'Scheduled reports that arrive without anyone assembling them.',
			},
		],
		outcomes: [
			'Days returned every reporting cycle',
			'One set of numbers the whole company works from',
			'Problems visible while they are still cheap to fix',
			'Decisions made on data instead of instinct',
		],
		goodFit: [
			'Month-end reporting is a recurring fire drill',
			'Leadership disagrees about basic numbers',
			'Data lives in several disconnected platforms',
			'You find out about problems too late',
		],
		faqs: [
			{
				question: 'Do we need a data warehouse?',
				answer:
					'Sometimes, but often not. Many businesses are well served by something considerably simpler, and we would rather not sell you infrastructure you do not need.',
			},
			{
				question: 'What if our systems do not have APIs?',
				answer:
					'There are usually options, though they vary in cost. Confirming what is reachable is part of the assessment.',
			},
		],
	},
	{
		slug: 'training-systems',
		icon: GraduationCap,
		name: 'Training & Onboarding',
		blurb: 'Turn tribal knowledge into a system that scales past one person.',
		headline: 'Your best operator should not be your only training program.',
		intro: [
			'In most growing businesses, the knowledge that makes the operation work lives in a few experienced people. That is fine until you need to be in two places at once.',
			'The risk is not only turnover. It is that onboarding quality depends on who was available that week, so consistency degrades exactly as you scale.',
			'We have built two training platforms in production: MMC University for the moving industry and OMNI University for a specialty coffee brand. Both took knowledge out of people and put it into a system without making it feel like compliance training.',
		],
		problems: [
			'Onboarding depending on whoever is free',
			'Inconsistent quality between teams or locations',
			'No record of who has been trained on what',
			'Knowledge walking out the door with an experienced hire',
		],
		whatWeBuild: [
			{
				title: 'Structured learning paths',
				body: 'Knowledge broken into sequenced lessons that build skill in a deliberate order.',
			},
			{
				title: 'Mobile-first delivery',
				body: 'Built for people who are not at a desk, because most of the audience is not.',
			},
			{
				title: 'Progress and certification',
				body: 'Managers can see who has completed what and who is cleared for which work.',
			},
			{
				title: 'Team-managed authoring',
				body: 'Your operations people update content without needing us.',
			},
		],
		outcomes: [
			'New hires productive faster and more consistently',
			'Knowledge that survives turnover',
			'A defensible record of who was trained on what',
			'Experienced staff freed from repeating the same explanations',
		],
		goodFit: [
			'Onboarding quality varies by who runs it',
			'One or two people hold critical knowledge',
			'You are adding staff or locations',
			'Errors trace back to inconsistent training',
		],
		faqs: [
			{
				question: 'Can we use an off-the-shelf LMS instead?',
				answer:
					'Sometimes you should, and we will say so. Custom makes sense when the experience needs to feel like your brand or the workflow does not fit a standard course model.',
			},
			{
				question: 'Who creates the content?',
				answer:
					'Usually your team, with us designing the structure and building the platform. The expertise is yours.',
			},
		],
	},
	{
		slug: 'internal-tools',
		icon: Boxes,
		name: 'Internal Tools',
		blurb: 'Replace the spreadsheet that is quietly running your operation.',
		headline: 'The spreadsheet was never supposed to be permanent.',
		intro: [
			'Nearly every business has one. A spreadsheet that started as a temporary workaround and is now load-bearing, maintained by one person, with no validation and no history.',
			'It works right up until it does not. Someone sorts one column without the others, or the person who understands it leaves.',
			'Replacing it is not about the spreadsheet. It is about understanding why the official system could not do the job, then building something that fits the process and is faster than the workaround.',
		],
		problems: [
			'A critical spreadsheet with no validation or audit trail',
			'One person who understands how it works',
			'Official systems being actively worked around',
			'Data that cannot be trusted because anyone can overwrite it',
		],
		whatWeBuild: [
			{
				title: 'Purpose-built interfaces',
				body: 'Designed around the screen your team opens forty times a day, with the rare paths kept out of the way.',
			},
			{
				title: 'Validation and permissions',
				body: 'Rules that prevent bad data instead of catching it later, with appropriate access per role.',
			},
			{
				title: 'History and audit trail',
				body: 'Know what changed, when, and who changed it.',
			},
			{
				title: 'Integration',
				body: 'Connected to the systems around it so it stops being an island.',
			},
		],
		outcomes: [
			'A critical process that no longer depends on one person',
			'Data you can trust because it is validated on entry',
			'Faster work, because the tool matches the process',
			'A real audit trail when something needs explaining',
		],
		goodFit: [
			'A spreadsheet is running something important',
			'Your team works around the official system',
			'Data quality problems keep recurring',
			'Only one person can operate a critical process',
		],
		faqs: [
			{
				question: 'Could we just buy something?',
				answer:
					'Often yes, and we will tell you when that is the better answer. Custom is justified when your process is genuinely different and that difference matters commercially.',
			},
			{
				question: 'How do we get people to switch?',
				answer:
					'By making it faster than the spreadsheet for the common task. Adoption is a design problem, not a training problem.',
			},
		],
	},
	{
		slug: 'systems-integration',
		icon: Plug,
		name: 'Systems Integration',
		blurb: 'Make the tools you already pay for talk to each other.',
		headline: 'You probably already own most of what you need.',
		intro: [
			'Most businesses do not have a software shortage. They have a connection shortage. The CRM does not know what the accounting system knows, so a person becomes the integration.',
			'That person is expensive, slow, and occasionally on vacation. Every manual bridge between two systems is a place where data goes stale and errors get introduced.',
			'Integration is unglamorous and it is frequently the highest-return work available, because the tools are already paid for.',
		],
		problems: [
			'A person manually moving data between systems',
			'Systems holding contradictory versions of the same record',
			'Delays because information has not been copied across yet',
			'Tools you pay for but barely use because they are isolated',
		],
		whatWeBuild: [
			{
				title: 'API integrations',
				body: 'Direct connections between systems so records stay in agreement without a human in between.',
			},
			{
				title: 'Data synchronization',
				body: 'Clear rules about which system owns which field, so conflicts resolve predictably.',
			},
			{
				title: 'Legacy bridges',
				body: 'Approaches for older systems that were never designed to be connected.',
			},
			{
				title: 'Monitoring',
				body: 'Integrations that announce their own failures instead of stopping quietly.',
			},
		],
		outcomes: [
			'Data entered once and available everywhere',
			'Systems that agree with each other',
			'More value from software you already own',
			'A person returned to work that requires judgment',
		],
		goodFit: [
			'Someone regularly exports from one system to import into another',
			'Your systems disagree about basic records',
			'You bought tools that never got connected',
			'Delays are caused by information lag',
		],
		faqs: [
			{
				question: 'What if a vendor has no API?',
				answer:
					'There are usually alternatives, though they range from clean to unpleasant. We will be direct about which one you are looking at.',
			},
			{
				question: 'How do we know an integration is still working?',
				answer:
					'Monitoring is part of the build. Silent failure is the main risk with integrations, so they are built to report their own health.',
			},
		],
	},
]

export type Service = {
	slug: string
	icon: LucideIcon
	name: string
	tagline: string
	summary: string
	outcomes: string[]
	deliverables: string[]
}

export const services: Service[] = [
	{
		slug: 'ai-automation-assessment',
		icon: FileSearch,
		name: 'AI & Automation Assessment',
		tagline: 'Start here',
		summary:
			'We come into your business and walk the whole thing end to end. Every process, every handoff, every spreadsheet holding the operation together. You get a clear picture of what should be automated, what should be rebuilt, and what should be left alone.',
		outcomes: [
			'A map of every process and where time is actually lost',
			'A ranked list of automation and AI opportunities',
			'An honest read on what is not worth building',
		],
		deliverables: [
			'Operational walkthrough and stakeholder interviews',
			'Process and systems map',
			'Opportunity register ranked by effort and payback',
			'A build roadmap you can act on with or without us',
		],
	},
	{
		slug: 'workflow-automation',
		icon: Workflow,
		name: 'Workflow Automation',
		tagline: 'Remove the busywork',
		summary:
			'Most teams lose hours a day copying data between systems, chasing approvals, and re-keying the same information. We connect what you already run and take the manual steps out of the middle.',
		outcomes: [
			'Manual handoffs replaced with automatic ones',
			'One source of truth instead of five spreadsheets',
			'Work that moves without someone remembering to move it',
		],
		deliverables: [
			'Integrations between the tools you already pay for',
			'Automated intake, routing, and approvals',
			'Scheduled reporting and alerting',
			'Documentation your team can actually follow',
		],
	},
	{
		slug: 'ai-systems',
		icon: Bot,
		name: 'AI Systems & Agents',
		tagline: 'Practical, not theatrical',
		summary:
			'AI is useful when it is pointed at a specific job with a measurable result. We build it into the workflow where it earns its place, with a human in the loop wherever the stakes call for one.',
		outcomes: [
			'Document and email handling that no longer eats the day',
			'Faster drafting, classification, and summarization',
			'Decision support that shows its work',
		],
		deliverables: [
			'Document extraction and processing pipelines',
			'Retrieval over your own knowledge base',
			'Assistants and agents scoped to real tasks',
			'Evaluation, guardrails, and human review steps',
		],
	},
	{
		slug: 'custom-software',
		icon: Code2,
		name: 'Custom Software',
		tagline: 'When off-the-shelf will not do it',
		summary:
			'Sometimes the tool you need does not exist. We design and build the portals, dashboards, internal systems, and full products that your operation runs on.',
		outcomes: [
			'Software shaped around your process, not the other way around',
			'Fewer tools, fewer logins, fewer workarounds',
			'A system you own instead of rent',
		],
		deliverables: [
			'Client and customer portals',
			'Internal tools and admin systems',
			'Dashboards and reporting surfaces',
			'Full product design and engineering',
		],
	},
]

export type ProcessStep = {
	number: string
	icon: LucideIcon
	title: string
	summary: string
	detail: string[]
}

export const processSteps: ProcessStep[] = [
	{
		number: '01',
		icon: Compass,
		title: 'We look at everything',
		summary:
			'Before anything gets built, we sit with your team and walk the business end to end.',
		detail: [
			'Interviews with the people doing the work, not just the org chart',
			'A full inventory of systems, spreadsheets, and manual steps',
			'Where time, money, and information are leaking',
		],
	},
	{
		number: '02',
		icon: ClipboardCheck,
		title: 'You get the blueprint',
		summary:
			'We show you what should be built, in what order, and what each piece is worth.',
		detail: [
			'Opportunities ranked by payback and effort',
			'A clear first project with a defined outcome',
			'A plan you own, whether or not we build it',
		],
	},
	{
		number: '03',
		icon: Hammer,
		title: 'We build it',
		summary:
			'Small, working increments. You see progress continuously instead of waiting for a reveal.',
		detail: [
			'Working software in front of your team early',
			'Direct access to the person building it',
			'Scope that adjusts as we learn, without losing the target',
		],
	},
	{
		number: '04',
		icon: LineChart,
		title: 'We make sure it sticks',
		summary:
			'A system nobody uses is a failed project. We measure adoption and stay on for the long tail.',
		detail: [
			'Rollout, training, and documentation',
			'Measurement against the outcome we agreed on',
			'Ongoing support and iteration',
		],
	},
]

export type Project = {
	slug: string
	name: string
	category: string
	client: string
	summary: string
	image: string
	video?: string
	featured?: boolean
	challenge: string
	approach: string[]
	delivered: string[]
	capabilities: string[]
	stack: string[]
}

export const projects: Project[] = [
	{
		slug: 'leadsnearme-platform',
		name: 'LeadsNearMe Platform',
		category: 'SaaS platform',
		client: 'LeadsNearMe',
		summary:
			'The account and access layer behind a multi-product lead generation platform, built to onboard businesses quickly and keep their data separated cleanly.',
		image: '/hub/hub.png',
		featured: true,
		challenge:
			'A growing lead generation product needed a single front door. Accounts, permissions, and billing context were spread across tools, which made onboarding slow and support expensive.',
		approach: [
			'Mapped every path a new account takes from signup through first value',
			'Consolidated authentication and account state into one system',
			'Designed the shell so additional products could be added without a rebuild',
		],
		delivered: [
			'Email and Google authentication with session management',
			'Multi-tenant account and permission model',
			'A shared application shell for every product surface',
		],
		capabilities: ['Authentication', 'Multi-tenancy', 'Platform architecture'],
		stack: ['Next.js', 'TypeScript', 'PostgreSQL', 'Prisma'],
	},
	{
		slug: 'leadsnearme-scheduling',
		name: 'Appointment Scheduling',
		category: 'Operations software',
		client: 'LeadsNearMe',
		summary:
			'A scheduling product for auto repair shops that trades the usual complexity for something a service writer can use between phone calls.',
		image: '/scheduler/scheduler.png',
		video: '/scheduler/scheduler.mp4',
		featured: true,
		challenge:
			'Existing scheduling tools in the auto repair space were accurate but cumbersome. Shops abandoned them, fell back to paper and phone calls, and lost bookings that arrived after hours.',
		approach: [
			'Studied how shops actually book, reschedule, and confirm work',
			'Cut the interface down to the decisions a shop makes every day',
			'Made online booking work without the shop babysitting it',
		],
		delivered: [
			'Customer-facing online booking',
			'Shop-side calendar built for fast changes',
			'Automated confirmations and reminders',
		],
		capabilities: ['Scheduling', 'Customer self-service', 'Workflow automation'],
		stack: ['Next.js', 'TypeScript', 'PostgreSQL', 'Tailwind CSS'],
	},
	{
		slug: 'leadsnearme-reporting',
		name: 'Client Reporting',
		category: 'Business intelligence',
		client: 'LeadsNearMe',
		summary:
			'Reporting that answers the only question a client actually asks: what did this produce for my business?',
		image: '/reports/reports.png',
		challenge:
			'Performance data lived across several ad and call-tracking sources. Assembling a client report was a manual monthly exercise, and the output still did not tie spend to revenue.',
		approach: [
			'Consolidated the reporting sources into one model',
			'Defined the handful of metrics that drive renewal conversations',
			'Automated the assembly so reporting stopped being a monthly project',
		],
		delivered: [
			'Unified reporting across lead sources',
			'Self-serve client access to live numbers',
			'Automated report generation and delivery',
		],
		capabilities: ['Data reporting', 'Dashboards', 'Automation'],
		stack: ['Next.js', 'TypeScript', 'PostgreSQL'],
	},
	{
		slug: 'mmc-university',
		name: 'MMC University',
		category: 'Learning platform',
		client: 'Moving industry',
		summary:
			'A training platform that turns hard-won operational knowledge into courses new crews can actually complete.',
		image: '/mmc/mmc.png',
		video: '/mmc/mmc.mp4',
		featured: true,
		challenge:
			'Training lived in the heads of a few experienced people. Onboarding was inconsistent, quality varied by crew, and scaling meant repeating the same conversations forever.',
		approach: [
			'Broke existing know-how into structured, sequenced lessons',
			'Designed for phones, because the audience is not at a desk',
			'Built progress tracking so managers can see who is actually ready',
		],
		delivered: [
			'Course authoring and content delivery',
			'Video lessons with progress tracking',
			'Student enrollment and completion reporting',
		],
		capabilities: ['Course delivery', 'Video platform', 'Progress tracking'],
		stack: ['Next.js', 'TypeScript', 'PostgreSQL', 'Video streaming'],
	},
	{
		slug: 'omni-university',
		name: 'OMNI University',
		category: 'Learning platform',
		client: 'Specialty coffee',
		summary:
			'A branded learning environment for a coffee company, built so training feels like part of the product rather than a compliance chore.',
		image: '/omni-u/omni.png',
		video: '/omni-u/omni.mp4',
		challenge:
			'The brand needed to teach a craft, not just deliver documents. Generic course tools flattened the experience and did not look or feel like the company.',
		approach: [
			'Designed the interface around the brand rather than a template',
			'Structured content into paths that build skill in order',
			'Kept the authoring side simple enough for the team to maintain',
		],
		delivered: [
			'Fully branded learning experience',
			'Structured learning paths',
			'Team-managed content authoring',
		],
		capabilities: ['Product design', 'Learning paths', 'Content delivery'],
		stack: ['Next.js', 'TypeScript', 'Tailwind CSS'],
	},
	{
		slug: 'agency-aviator',
		name: 'Agency Aviator',
		category: 'Client portal',
		client: 'Agency operations',
		summary:
			'A portal that gives agency clients a single place to see status, deliverables, and results without emailing to ask.',
		image: '/portal/portal.png',
		challenge:
			'Client questions arrived by email and text, and answering them pulled the team off delivery. Status lived in project tools clients could not see.',
		approach: [
			'Identified the questions clients ask most and surfaced those first',
			'Gave every client a scoped, secure view of their own work',
			'Reduced the reporting burden on the account team',
		],
		delivered: [
			'Secure per-client access',
			'Deliverable and status visibility',
			'Centralized document and asset delivery',
		],
		capabilities: ['Client portal', 'Access control', 'Self-service'],
		stack: ['Next.js', 'TypeScript', 'PostgreSQL'],
	},
]

export const featuredProjects = projects.filter((project) => project.featured)

export type Insight = {
	slug: string
	category: string
	title: string
	excerpt: string
	readTime: string
	date: string
	body: { heading: string; paragraphs: string[] }[]
}

export const insights: Insight[] = [
	{
		slug: 'where-ai-actually-pays-off',
		category: 'AI',
		title: 'Where AI actually pays off in a small business',
		excerpt:
			'Most AI pilots fail because they start with the technology instead of a job that costs real money. Here is the filter we use.',
		readTime: '6 min',
		date: '2026-02-18',
		body: [
			{
				heading: 'Start with the expensive hour, not the exciting demo',
				paragraphs: [
					'The AI projects that survive contact with a real business have one thing in common. They were pointed at a task someone was already paying for, repeatedly, every week.',
					'If you cannot name the hour it gives back or the error it prevents, it is a demo, not a project.',
				],
			},
			{
				heading: 'Three shapes that consistently work',
				paragraphs: [
					'Reading things: invoices, applications, contracts, inbound email. Anything where a person currently opens a document and types what they see into another system.',
					'Drafting things: first-pass quotes, responses, summaries, and reports that a human then edits. The value is in removing the blank page, not removing the person.',
					'Sorting things: routing, triage, and classification. Deciding what matters and who should see it next.',
				],
			},
			{
				heading: 'Keep a person where the stakes are',
				paragraphs: [
					'The useful question is not whether the model is right every time. It is what happens when it is wrong.',
					'Where a mistake is cheap and reversible, let it run. Where a mistake costs money or trust, keep a review step. That single distinction separates the systems that get adopted from the ones quietly turned off.',
				],
			},
		],
	},
	{
		slug: 'automation-without-chaos',
		category: 'Automation',
		title: 'Automation without creating more chaos',
		excerpt:
			'Automating a broken process just makes the mess arrive faster. What to fix before you connect anything.',
		readTime: '5 min',
		date: '2026-01-27',
		body: [
			{
				heading: 'Fix the process before you wire it up',
				paragraphs: [
					'Automation is an amplifier. Point it at a clean process and you get leverage. Point it at a confused one and you get the same confusion at higher volume, now harder to see.',
					'Before connecting two systems, be able to describe the handoff in one sentence. If you cannot, the problem is not technical.',
				],
			},
			{
				heading: 'Pick work that is boring and repeated',
				paragraphs: [
					'Good first candidates are high frequency, low judgment, and clearly defined. Copying data between systems. Sending the same follow-up. Generating the same weekly report.',
					'Bad first candidates are the exceptions everyone argues about. Those need a decision, not a script.',
				],
			},
			{
				heading: 'Make failure loud',
				paragraphs: [
					'The real risk with automation is silent failure. A job stops running and nobody notices for a month.',
					'Every automation should be able to tell you it is still alive, and tell someone specific when it is not.',
				],
			},
		],
	},
	{
		slug: 'buy-versus-build',
		category: 'Strategy',
		title: 'Buy, build, or leave it alone',
		excerpt:
			'Custom software is not automatically the answer. A straightforward way to decide which problems deserve a build.',
		readTime: '6 min',
		date: '2026-01-09',
		body: [
			{
				heading: 'Buy anything that is not your advantage',
				paragraphs: [
					'Accounting, email, payroll, storage. These are solved. Paying for them is cheaper than owning them, and no customer will ever choose you because of your expense tool.',
					'Build where your process is genuinely different, and where that difference is why customers pick you.',
				],
			},
			{
				heading: 'The workaround is the signal',
				paragraphs: [
					'The clearest sign a build is justified is a workaround that has become permanent. A spreadsheet that shadows the real system. A person whose job is moving data between two tools.',
					'Those workarounds have a running cost that nobody puts on a budget line.',
				],
			},
			{
				heading: 'Leaving it alone is a real option',
				paragraphs: [
					'Some inefficiency is cheaper than the software to remove it. A task that takes twenty minutes a month does not need a system.',
					'A good assessment tells you what not to build. That list is usually longer than the build list, and it saves more money.',
				],
			},
		],
	},
	{
		slug: 'what-an-assessment-finds',
		category: 'Assessment',
		title: 'What we actually find in an operations assessment',
		excerpt:
			'The same handful of problems show up in nearly every business we walk through. Here is the pattern.',
		readTime: '7 min',
		date: '2025-12-12',
		body: [
			{
				heading: 'Data entered more than once',
				paragraphs: [
					'It shows up in almost every business. The same customer information typed into a quote, then an invoice, then a scheduling tool, then a spreadsheet someone keeps for reporting.',
					'Each retype is a chance to introduce an error, and every downstream report inherits it.',
				],
			},
			{
				heading: 'Knowledge that lives in one person',
				paragraphs: [
					'There is usually one person who knows how the exceptions work. Nothing is written down because they have always been there.',
					'This is an operational risk long before it is a software problem.',
				],
			},
			{
				heading: 'Reports nobody trusts',
				paragraphs: [
					'When two systems disagree, people stop believing either one and go back to instinct.',
					'Restoring trust in the numbers is often worth more than any single automation.',
				],
			},
		],
	},
	{
		slug: 'internal-tools-that-get-used',
		category: 'Product design',
		title: 'Why most internal tools go unused',
		excerpt:
			'Adoption is a design problem, not a training problem. What separates the tools people open from the ones they avoid.',
		readTime: '5 min',
		date: '2025-11-20',
		body: [
			{
				heading: 'It has to be faster than the workaround',
				paragraphs: [
					'People do not resist new tools out of stubbornness. They resist tools that are slower than the spreadsheet they already have.',
					'If the new system takes more clicks to do the common thing, it loses, no matter how much better it is in theory.',
				],
			},
			{
				heading: 'Design for the frequent path',
				paragraphs: [
					'Most internal tools are designed around the full set of features rather than the one screen a user opens forty times a day.',
					'Make the frequent path effortless and bury the rare one.',
				],
			},
			{
				heading: 'Ship it in front of people early',
				paragraphs: [
					'The gap between what someone describes in a meeting and what they actually do is enormous.',
					'Working software in front of a real user in week two prevents months of building the wrong thing.',
				],
			},
		],
	},
	{
		slug: 'ai-readiness',
		category: 'AI',
		title: 'Is your business actually ready for AI?',
		excerpt:
			'A short, honest checklist. Most companies are ready for two of these and not the rest.',
		readTime: '4 min',
		date: '2025-11-04',
		body: [
			{
				heading: 'Your data has to be reachable',
				paragraphs: [
					'AI cannot use knowledge trapped in a filing cabinet or in a format nobody can query.',
					'Readiness usually means getting the information into one place first. That work is unglamorous and it is most of the project.',
				],
			},
			{
				heading: 'Someone has to own the outcome',
				paragraphs: [
					'Projects without a named owner drift. Someone inside the business needs to care whether this works.',
					'That person does not need to be technical. They need to know the process well enough to say when the output is wrong.',
				],
			},
			{
				heading: 'You need a way to tell if it worked',
				paragraphs: [
					'Decide the measure before the build. Hours returned, errors avoided, response time cut.',
					'Without it, every conversation about the system becomes an argument about vibes.',
				],
			},
		],
	},
]

export const insightCategories = [
	...new Set(insights.map((insight) => insight.category)),
]

export const faqs = [
	{
		question: 'Do we have to start with an assessment?',
		answer:
			'No, but it is usually the cheapest way to avoid building the wrong thing. If you already know exactly what you need, we are happy to go straight to a build.',
	},
	{
		question: 'What does the assessment produce?',
		answer:
			'A map of your processes and systems, a ranked list of automation and AI opportunities with an estimate of effort and payback, and a recommended first project. It is yours to keep and act on, with us or with anyone else.',
	},
	{
		question: 'Do you only work with businesses already using AI?',
		answer:
			'Most of our clients are not using it in any meaningful way when we start. A large part of the work is separating where AI genuinely helps from where a simple automation or a fixed process would do the job better.',
	},
	{
		question: 'Will this replace people on my team?',
		answer:
			'That is not what we optimize for. The work we do usually takes the repetitive parts off people who are already stretched, so the team can handle more without growing headcount at the same rate.',
	},
	{
		question: 'Who owns what you build?',
		answer:
			'You do. The code, the systems, and the documentation are yours.',
	},
	{
		question: 'What size businesses do you work with?',
		answer:
			'Mostly small and mid-sized companies where a handful of people carry a lot of the operation, and where manual work has started to cap growth.',
	},
]

export const capabilityGroups = [
	{
		icon: Plug,
		title: 'Systems integration',
		items: ['API integrations', 'Data synchronization', 'Legacy system bridges'],
	},
	{
		icon: Boxes,
		title: 'Platform engineering',
		items: ['Multi-tenant architecture', 'Authentication', 'Role-based access'],
	},
	{
		icon: BarChart3,
		title: 'Data & reporting',
		items: ['Dashboards', 'Automated reporting', 'Operational metrics'],
	},
	{
		icon: GitBranch,
		title: 'Process design',
		items: ['Workflow mapping', 'Approval routing', 'Exception handling'],
	},
	{
		icon: Rocket,
		title: 'Product delivery',
		items: ['Discovery', 'Interface design', 'Full-stack build'],
	},
	{
		icon: Bot,
		title: 'Applied AI',
		items: [
			'Document processing',
			'Retrieval systems',
			'Human-in-the-loop review',
		],
	},
]

export const principles = [
	{
		title: 'We tell you what not to build',
		body: 'The fastest way to lose your trust is to sell you a system you did not need. Part of every assessment is a list of things to leave alone.',
	},
	{
		title: 'You talk to the person building it',
		body: 'No account layer between you and the work. The person who understands your process is the person writing the code.',
	},
	{
		title: 'Plain language, always',
		body: 'You should be able to explain what we built and why it matters to someone else in your company without a translator.',
	},
	{
		title: 'You own the result',
		body: 'The code, the infrastructure, and the documentation belong to you. No hostage situations.',
	},
]

export const signals = [
	'The same information gets typed into more than one system',
	'A spreadsheet is quietly running a critical part of the business',
	'One person is the only one who knows how something works',
	'Reporting takes days and still gets argued about',
	'Growth means hiring more people to do more manual work',
	'You have bought AI tools that nobody uses',
]
