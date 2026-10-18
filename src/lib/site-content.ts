import {
	BarChart3,
	Bot,
	Boxes,
	Building2,
	CalendarClock,
	ClipboardCheck,
	Code2,
	Compass,
	FileSearch,
	FileStack,
	GitBranch,
	GraduationCap,
	Hammer,
	KeyRound,
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
			{
				question: 'What does this cost compared to hiring another dispatcher?',
				answer:
					'A build is a one-time cost against a salary that recurs every year. That said, if your dispatch problem is genuinely volume rather than process, hire the person. We will tell you which one you have.',
			},
			{
				question: 'We are busiest in season. When should we start?',
				answer:
					'Off-season, if you can. We need time with the people who run the schedule, and in peak season they do not have it. Assessments during the busy stretch are still useful because you see the failure modes live, but builds go better in the quiet months.',
			},
			{
				question: 'Can you fix after-hours calls going to voicemail?',
				answer:
					'Yes, and it is usually the fastest money on the table. Intake that captures the job overnight and puts it in the morning queue with enough detail to schedule generally pays for itself before the rest of the project ships.',
			},
			{
				question: 'Will we lose our job history if we change anything?',
				answer:
					'No. Migrating history is part of the work when we touch a system of record, and where we sit alongside your existing platform the history never moves at all.',
			},
		],
	},
	{
		slug: 'property-management',
		icon: KeyRound,
		name: 'Property Management & Real Estate',
		blurb:
			'Portfolios where every unit, tenant, and owner generates paperwork nobody has time for.',
		intro: [
			'Property management scales badly for a specific reason: the work per unit barely drops as you add units. Two hundred doors is not one big job, it is two hundred small ones, each with a lease, a tenant, a maintenance history, and an owner who wants a statement.',
			'Most offices we walk into are running a property management platform for accounting, a separate inbox for maintenance requests, a spreadsheet for renewals, and a folder of PDFs that is the real record. The platform is not the problem. The gaps between it and everything else are.',
			'The recoverable time sits in three places: maintenance intake, lease and renewal paperwork, and owner reporting. All three are repetitive, all three are deadline-driven, and all three are why someone is working Saturday.',
		],
		pains: [
			'Maintenance requests arriving by text, email, and voicemail with no queue',
			'Renewals and rent increases tracked in a spreadsheet somebody has to remember to open',
			'Owner statements assembled by hand every month',
			'Applications and screening documents retyped between systems',
			'No single view of what a unit has cost you over the last two years',
		],
		builds: [
			'One maintenance queue fed by every channel, routed by property and urgency',
			'Automated renewal, rent increase, and inspection reminders',
			'Owner portals and statements generated from the data you already have',
			'Application intake and document collection without the email chase',
			'Per-unit cost and turnover reporting that updates itself',
		],
		workflows: [
			{
				title: 'Request and triage',
				body: 'Tenant requests land in one queue with the unit, the history, and photos attached, instead of scattered across three inboxes.',
			},
			{
				title: 'Dispatch and vendor',
				body: 'Work orders reach the right vendor with the access details and scope already filled in, and come back with documentation attached.',
			},
			{
				title: 'Leasing and renewals',
				body: 'Applications, screening, signatures, and renewal notices run on a schedule rather than on someone remembering the date.',
			},
			{
				title: 'Owner reporting',
				body: 'Statements and portfolio performance are generated from the same records, so the numbers agree without a monthly reconciliation.',
			},
		],
		faqs: [
			{
				question:
					'We already pay for AppFolio, Buildium, or similar. Are you replacing it?',
				answer:
					'Almost never. Those platforms handle accounting and compliance well, and replacing one is rarely worth the disruption. We connect it to the parts of your operation living outside it, which is usually maintenance intake, owner communication, and reporting.',
			},
			{
				question: 'Does this work for a small portfolio?',
				answer:
					'It depends on where your time actually goes. Under about fifty doors, the payback is usually in maintenance intake and owner reporting rather than a full build. We will tell you if the honest answer is that you are not big enough yet.',
			},
			{
				question: 'Can tenants submit maintenance requests without an app?',
				answer:
					'Yes, and they should be able to. Anything that requires a download loses half your tenants. A mobile web form and a phone number that routes into the same queue covers almost everyone.',
			},
			{
				question: 'How do you handle trust accounting and compliance?',
				answer:
					'We leave it where it is. Trust accounting is regulated, your platform already handles it, and moving it creates risk with no upside. We work around that boundary rather than through it.',
			},
			{
				question: 'Can owners see their own data without calling us?',
				answer:
					'That is one of the most common builds we do here. An owner portal with statements, work orders, and occupancy removes a surprising volume of routine phone calls and email.',
			},
			{
				question:
					'We manage both residential and commercial. Is that a problem?',
				answer:
					'No, but they are genuinely different workflows and we treat them that way. Trying to force one process over both is how these systems end up unused by whichever side got the worse fit.',
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
				question:
					'Our crews turn over constantly. Is training software worth it?',
				answer:
					'High turnover is the argument for it, not against it. The higher your turnover, the more expensive it is to have onboarding depend on a specific experienced person being available.',
			},
			{
				question: 'Can our team maintain the content ourselves?',
				answer:
					'Yes. We build the authoring side so your operations people can add and update lessons without calling us.',
			},
			{
				question: 'How long before a new hire is productive?',
				answer:
					'The gain is less about speed and more about consistency. The value shows up as every new crew member getting the same standard, rather than whichever version the person training that week happened to know.',
			},
			{
				question: 'Our crews do not sit at desks. How do they use this?',
				answer:
					'On a phone, in short pieces, between jobs. Anything that assumes a desk and a spare hour does not get completed in this industry, so we design for five-minute sessions on the device people already carry.',
			},
			{
				question:
					'Can we prove someone completed safety or compliance training?',
				answer:
					'Yes. Completion records, timestamps, and version history are standard, because the value of that training is largely in being able to demonstrate it later.',
			},
			{
				question: 'Does this connect to dispatch and job data?',
				answer:
					'It can, and that is where it gets genuinely useful. Tying completion to who is eligible for which jobs turns training from a compliance exercise into part of how you schedule.',
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
				question:
					'We use a lot of different ad platforms. Can you pull them all in?',
				answer:
					'Generally yes, wherever the platform exposes an API. Part of the assessment is confirming which sources can be automated and which will need a different approach.',
			},
			{
				question: 'How much of reporting can actually be automated?',
				answer:
					'The assembly, almost all of it. The interpretation, none of it, and you would not want it to be. The goal is that your strategists spend their time on the commentary instead of on copying numbers into slides.',
			},
			{
				question: 'Will this replace our project management tool?',
				answer:
					'Rarely. Agencies usually have a tool that works fine for tasks and a total gap around client-facing reporting and approvals. That gap is where we build.',
			},
			{
				question: 'Can we resell this to our clients?',
				answer:
					'Several agencies do. If the portal is under your brand and your domain, packaging it as part of your retainer is a straightforward conversation. We will flag anything in the architecture that would make that harder.',
			},
			{
				question: 'What about client data separation?',
				answer:
					'Designed in from the start. Multi-tenant separation is not something you retrofit safely, so it is part of the architecture on day one rather than a later feature.',
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
			{
				question: 'Will this interfere with billable time tracking?',
				answer:
					'It should improve it. Most time leakage in these firms is administrative work that never gets recorded anywhere. Removing it does not reduce billables, it reduces the unbilled hours nobody was capturing.',
			},
			{
				question: 'Does this integrate with our practice management system?',
				answer:
					'Usually, and that is normally the right approach. Those systems handle the compliance and billing side well. The gaps are intake, document handling, and client communication, which is where we work.',
			},
			{
				question:
					'Our clients are not technical. Will a portal help or annoy them?',
				answer:
					'It depends entirely on whether it replaces email or adds to it. A portal that is one more place to check gets ignored. One that removes the status-update phone call gets used.',
			},
			{
				question: 'How do you handle confidentiality and privilege?',
				answer:
					'As a design constraint before anything else, including keeping processing private where the work demands it. If a use case cannot meet your obligations, the answer is that we do not build it, and we will say so early.',
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
			{
				question: 'How do we keep every location doing things the same way?',
				answer:
					'By making the standard easier to follow than to work around. Standards enforced by memos drift within a month. Standards built into the tool people already use hold.',
			},
			{
				question: 'We have high seasonal turnover. Is this worth it?',
				answer:
					'That is the case for it. When you rehire every season, onboarding is a recurring cost, and anything that shortens it compounds across every location and every year.',
			},
			{
				question: 'Does this replace our POS or scheduling system?',
				answer:
					'No. Those are usually the least of your problems. The gap is normally between locations and head office, which is reporting, consistency, and communication rather than transactions.',
			},
			{
				question: 'Can head office see performance across all locations?',
				answer:
					'Yes, and it is often the first thing we build. A single view that updates itself removes the weekly cycle of chasing each location for numbers that then have to be reconciled anyway.',
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
		headline:
			'Find out what should actually be built before you build anything.',
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
				question:
					'What happens if the audit says we should not build anything?',
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
			{
				question: 'What if we already know what we want built?',
				answer:
					'Then say so and we can go straight to the build. The audit earns its keep when the symptom and the cause are different things, which is common but not universal.',
			},
			{
				question: 'Do you look at cost as well as time?',
				answer:
					'Yes, including software you are paying for and not using. Overlapping subscriptions and unused seats turn up in most audits and are the easiest saving to act on.',
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
			{
				question: 'Will it work with scans and handwriting?',
				answer:
					'Printed scans, generally yes. Handwriting varies enormously and we test it on your actual documents before promising anything. A pilot on real samples is always the first step.',
			},
			{
				question: 'How many documents do we need to make this worthwhile?',
				answer:
					'It is about total handling time rather than count. A hundred documents that each take twenty minutes is a stronger case than a thousand that take thirty seconds.',
			},
			{
				question: 'What happens with a document type it has not seen?',
				answer:
					'It routes to a person rather than guessing. Systems that force a confident answer for everything are the ones that quietly corrupt your data.',
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
			{
				question: 'How do we cut down no-shows?',
				answer:
					'Reminders on a schedule, and making it trivially easy to reschedule. Most no-shows are people who could not cancel conveniently, so a one-tap reschedule recovers bookings a cancellation policy never will.',
			},
			{
				question: 'Can customers book outside business hours?',
				answer:
					'That is usually the entire point. A large share of booking attempts happen in the evening, and if that request only reaches a voicemail box it is generally lost to whoever answers first tomorrow.',
			},
			{
				question: 'How long should a booking take?',
				answer:
					'Under a minute on a phone. That is the number we design to, because past that abandonment climbs sharply and people revert to calling during business hours, which defeats the purpose.',
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
			{
				question: 'What should actually go in a portal?',
				answer:
					'The three or four things clients ask you for repeatedly. Status, documents, invoices, and a way to send something back. Everything beyond that tends to dilute the parts people came for.',
			},
			{
				question: 'How do you handle logins and permissions?',
				answer:
					'Email or single sign-on, with role-based access so a client sees only their own records. Separation is architectural rather than a filter applied at display time.',
			},
			{
				question: 'Can it replace the status update emails?',
				answer:
					'That is the measure of success. If your team still writes the same update by hand afterward, the portal has added a system without removing any work.',
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
			{
				question: 'How often should the numbers refresh?',
				answer:
					'As often as you would act on them, which is rarely real time. Daily covers most operational decisions, and chasing live data adds cost and fragility for a number nobody checks hourly.',
			},
			{
				question: 'Our numbers disagree between systems. Can you fix that?',
				answer:
					'Partly, and the rest is a decision you have to make. Usually the systems are each right by their own definition, so someone has to pick which definition is the company one. We surface the conflict and hold you to one answer.',
			},
			{
				question: 'Should this be a dashboard or a scheduled report?',
				answer:
					'A report, more often than people expect. Dashboards get checked for a fortnight and then forgotten. Something that arrives where the team already works tends to survive far longer.',
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
			{
				question: 'How do we know whether anyone is actually learning?',
				answer:
					'Completion is the weakest possible signal and it is the one most platforms report. We prefer to tie it to something operational, like time to first solo job or error rates in the first month.',
			},
			{
				question: 'Can we use this for customers or partners too?',
				answer:
					'Often, and it can turn into a revenue line rather than a cost. Certification and partner training run on the same foundation as internal onboarding.',
			},
			{
				question: 'What happens when a process changes?',
				answer:
					'You update the lesson and the system tracks who saw which version. Without that, training quietly drifts out of date and starts teaching people the wrong thing with full confidence.',
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
			{
				question: 'What happens to the spreadsheets afterward?',
				answer:
					'They get read carefully first. A mature spreadsheet encodes years of hard-won rules and exceptions, and it is the best specification you have. We migrate the data and the logic rather than discarding either.',
			},
			{
				question: 'Can we start with one team?',
				answer:
					'That is the approach we would push for. One team, one workflow, in production. It surfaces how your data actually behaves before the design is expensive to change.',
			},
			{
				question: 'Is this a low-code build or real software?',
				answer:
					'Whichever survives the job. Low-code is genuinely good for a simple internal form and becomes the constraint once logic, volume, or integrations get serious. We pick on requirements, not preference.',
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
			{
				question: 'What happens when a vendor changes their API?',
				answer:
					'Something breaks, eventually, on somebody else schedule. That is why integrations need an owner. The realistic plan is fast detection and a quick fix, not pretending it will not happen.',
			},
			{
				question: 'Which system should own each piece of data?',
				answer:
					'That decision is the integration project. Once each field has exactly one owner, most sync problems stop existing. Two systems both believing they own the customer record is the usual root cause.',
			},
			{
				question: 'Should we use an integration platform instead?',
				answer:
					'Sometimes, and we will say so. Those platforms are good value for standard connections between popular tools. They get expensive and awkward once the mapping is unusual or the volume is high.',
			},
		],
	},
]

export type Service = {
	slug: string
	icon: LucideIcon
	name: string
	tagline: string
	headline: string
	summary: string
	intro: string[]
	outcomes: string[]
	deliverables: string[]
	faqs: { question: string; answer: string }[]
}

export const services: Service[] = [
	{
		slug: 'ai-automation-assessment',
		icon: FileSearch,
		name: 'AI & Automation Assessment',
		tagline: 'Start here',
		headline: 'Find out what should be built before anyone builds it.',
		summary:
			'We come into your business and walk the whole thing end to end. Every process, every handoff, every spreadsheet holding the operation together. You get a clear picture of what should be automated, what should be rebuilt, and what should be left alone.',
		intro: [
			'Most failed software projects were decided before a line of code was written. Someone picked a tool, or a feature, or a vendor, based on a symptom rather than the process underneath it. The build then goes fine and changes nothing.',
			'The assessment exists to stop that. We spend time with the people actually doing the work, map how information really moves through your business, and find where the hours and the errors are concentrated. Not where you assume they are.',
			'What you get back is a ranked list with effort and payback attached, and an explicit section on what is not worth touching. You own it. You can act on it with us, with another firm, or with your own team.',
		],
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
		faqs: [
			{
				question: 'How long does an assessment take?',
				answer:
					'For most small and mid-sized operations, two to four weeks end to end. The variable is not our speed, it is how much time your team can give us. We need real conversations with the people doing the work, not just the org chart.',
			},
			{
				question: 'Do we have to build with you afterward?',
				answer:
					'No, and the roadmap is written so you do not have to. It is deliberately specific enough for another firm or your own developers to execute. We would rather be judged on whether the plan was right than lock you into the build.',
			},
			{
				question: 'How disruptive is this to the team?',
				answer:
					'Expect an hour with each key person, plus some shadowing of the workflows that matter most. We work around your schedule. Nobody has to stop doing their job to explain their job.',
			},
			{
				question: 'What if you find nothing worth automating?',
				answer:
					'Then we tell you that, and you have saved yourself a build. It happens. Some operations are already tight enough that the honest recommendation is to change a process rather than buy or build anything.',
			},
			{
				question: 'Will you tell us to replace software we already pay for?',
				answer:
					'Rarely. Replacement is expensive and disruptive, and most of the value sits in the gaps between tools rather than in the tools themselves. When a platform genuinely costs more than it returns, we will say so and show the arithmetic.',
			},
			{
				question: 'Who needs to be involved from our side?',
				answer:
					'Whoever owns the operation, and the two or three people who know how it actually runs day to day. Those are rarely the same people, and the gap between their answers is usually where the interesting problems are.',
			},
		],
	},
	{
		slug: 'workflow-automation',
		icon: Workflow,
		name: 'Workflow Automation',
		tagline: 'Remove the busywork',
		headline: 'Take the manual steps out of the middle.',
		summary:
			'Most teams lose hours a day copying data between systems, chasing approvals, and re-keying the same information. We connect what you already run and take the manual steps out of the middle.',
		intro: [
			'Almost every business has a person whose real job is moving information from one screen to another. They would not describe it that way, but that is where the hours go: retyping an order, chasing a signature, rebuilding the same report every Monday.',
			'That work is invisible because it is distributed. Ten minutes here, twenty there, spread across five people. It only becomes obvious when someone is on holiday and the whole thing stalls.',
			'Workflow automation is unglamorous and it is usually where the fastest payback lives. We connect the tools you already pay for, remove the retyping, and make the handoffs happen on their own instead of when somebody remembers.',
		],
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
		faqs: [
			{
				question: 'Do you use Zapier and Make, or do you write code?',
				answer:
					'Both, depending on what the workflow has to survive. Off-the-shelf automation is fine for low-volume, low-stakes steps and it is cheaper to maintain. When volume, error handling, or auditability matter, those tools become the fragile part and we build properly.',
			},
			{
				question: 'What happens when an automation fails?',
				answer:
					'It tells someone. Every automation we ship has a defined failure path, because silent failure is worse than no automation at all: the work stops and nobody notices for a week. Exceptions route to a human with enough context to fix them.',
			},
			{
				question: 'Our tools do not have an API. Is that a dead end?',
				answer:
					'Usually not. There is often a export, a webhook, a database, or a scheduled file drop that gets us most of the way. It is less elegant, and we will tell you when the workaround is fragile enough that it is not worth relying on.',
			},
			{
				question: 'How long before we see anything working?',
				answer:
					'The first automation is usually live in two to three weeks. We deliberately start with a single high-frequency workflow rather than the whole map, so the team sees something real early and we learn how your data actually behaves.',
			},
			{
				question: 'Who maintains this after you leave?',
				answer:
					'You can, and the documentation is written for that. Plenty of clients keep us on for the long tail instead, because integrations break when vendors change their APIs and somebody has to notice. Either way, you are not locked in.',
			},
			{
				question: 'Will our team actually use it?',
				answer:
					'They will if it is faster than what they do now, and they will not if it is not. That is the whole test. We design around the two or three actions someone performs forty times a day and keep everything else out of the way.',
			},
		],
	},
	{
		slug: 'ai-systems',
		icon: Bot,
		name: 'AI Systems & Agents',
		tagline: 'Practical, not theatrical',
		headline: 'AI pointed at a job with a number attached.',
		summary:
			'AI is useful when it is pointed at a specific job with a measurable result. We build it into the workflow where it earns its place, with a human in the loop wherever the stakes call for one.',
		intro: [
			'The AI projects that survive contact with a real business have one thing in common: they were pointed at a task someone was already paying for, repeatedly, every week. If you cannot name the hour it gives back or the error it prevents, it is a demo.',
			'Three shapes work consistently. Reading things, where a person currently opens a document and types what they see into another system. Drafting things, where the value is removing the blank page rather than removing the person. Sorting things, where the job is deciding what matters and who sees it next.',
			'The design question is never whether the model is right every time. It is what happens when it is wrong. Where a mistake is cheap and reversible, we let it run. Where it costs money or trust, a person reviews it. That single distinction separates the systems that get adopted from the ones quietly switched off.',
		],
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
		faqs: [
			{
				question: 'What happens when the AI gets something wrong?',
				answer:
					'That is the design question, not an afterthought. We put a review step anywhere a mistake is expensive, and we let it run unsupervised only where errors are cheap and reversible. Every system also logs what it did and why, so a wrong answer is diagnosable rather than mysterious.',
			},
			{
				question: 'Does our data get used to train someone else model?',
				answer:
					'Not on the configurations we deploy. Business tiers of the major providers exclude your data from training by contract, and where the work demands it we run models in a private environment instead. We will tell you exactly where your data goes before anything is built.',
			},
			{
				question: 'How do we know it is actually working?',
				answer:
					'We build an evaluation set from your real examples before the system goes live, so accuracy is a number you can look at rather than an impression. If it cannot beat the manual process on that set, it does not ship.',
			},
			{
				question: 'Is this going to cost a fortune to run?',
				answer:
					'Usually not, and we size it before building. Most business tasks do not need the largest model, and a lot of what people reach for AI to do is better handled by ordinary code. Running costs get estimated up front against the hours saved.',
			},
			{
				question: 'Do we need an agent, or is that overkill?',
				answer:
					'Usually overkill. Agents earn their complexity when a task genuinely branches and needs to take actions across systems. Most of what gets called an agent is a single well-scoped step, and it is more reliable and cheaper built that way.',
			},
			{
				question: 'Our team is nervous about AI. How do you handle that?',
				answer:
					'By being specific about scope. Fear comes from vagueness. When people can see it handles this document type and nothing else, and that they still review the output, resistance drops fast. We also do not point AI at anyone whole job.',
			},
		],
	},
	{
		slug: 'custom-software',
		icon: Code2,
		name: 'Custom Software',
		tagline: 'When off-the-shelf will not do it',
		headline: 'When the tool you need does not exist yet.',
		summary:
			'Sometimes the tool you need does not exist. We design and build the portals, dashboards, internal systems, and full products that your operation runs on.',
		intro: [
			'Building software should be the last option, not the first. It costs more than a subscription, it takes longer than a configuration, and it becomes yours to own. We say that to every client before we quote a build.',
			'It is the right call when your process is genuinely your advantage and bending it to fit a product would cost you that advantage. Or when you are paying for four tools that half-cover one workflow. Or when the thing you need simply is not on the market.',
			'When it is the right call, the risk is not the code. It is building the wrong thing well. So we ship in small working increments, put real software in front of your team early, and adjust while adjusting is still cheap.',
		],
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
		faqs: [
			{
				question: 'How do we know custom is the right answer?',
				answer:
					'Often it is not, and the assessment exists partly to catch that. Custom makes sense when the process is your advantage, when you are stacking several tools to half-cover one workflow, or when what you need does not exist. Otherwise buy it.',
			},
			{
				question: 'Who owns the code?',
				answer:
					'You do, completely. The repository, the infrastructure, the documentation, and the accounts are in your name. If you want to move to another team, nothing about our setup makes that harder than it should be.',
			},
			{
				question: 'How is this priced?',
				answer:
					'By defined phase rather than an open hourly meter. You approve a scope and a number before each phase starts, which keeps the decision to continue in your hands and stops the project from quietly expanding.',
			},
			{
				question: 'What happens if requirements change mid-build?',
				answer:
					'They will, and the increments exist for exactly that. Because working software is in front of your team early, changes surface while they are still cheap. We re-scope openly instead of absorbing it quietly and missing the date.',
			},
			{
				question: 'Do you maintain it after launch?',
				answer:
					'If you want us to. Plenty of clients keep us on for iteration and support, and some take it in-house immediately. We hand over documented, conventional code either way, because the alternative is a hostage situation and we are not interested in that.',
			},
			{
				question: 'Who actually builds it?',
				answer:
					'The same team that ran your assessment. There is no account layer between you and the work, which means the engineers who understood your process are the ones writing the code and the ones you call when something is wrong.',
			},
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
			'Direct access to the engineers building it',
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

// ProcessSteps is a client component, so the icon cannot cross the boundary.
export const deliverySteps = processSteps.map(({ icon, ...step }) => step)

export type Project = {
	slug: string
	name: string
	category: string
	/** Which service delivered this. Drives the case study filters. */
	service: Service['slug']
	client: string
	summary: string
	/** Assessment engagements produce a decision, not a screen, so this is optional. */
	image?: string
	video?: string
	featured?: boolean
	challenge: string
	approach: string[]
	delivered: string[]
	capabilities: string[]
	stack: string[]
	/** Renamed for engagements where the list is systems audited rather than tech used. */
	stackLabel?: string
	/** Headline figures, shown above the narrative. */
	stats?: { value: string; label: string }[]
	/** Long-form narrative, rendered with its own table of contents. */
	sections?: { heading: string; paragraphs: string[] }[]
	/** The plan the client arrived with, against what the work actually recommended. */
	comparison?: {
		planned: { title: string; caption: string; points: string[] }
		recommended: { title: string; caption: string; points: string[] }
	}
	/** What happened after the engagement ended. */
	outcome?: string[]
}
export const projects: Project[] = [
	{
		slug: 'leadsnearme-hub',
		name: 'The Hub',
		category: 'Website operations platform',
		service: 'custom-software',
		client: 'LeadsNearMe',
		summary:
			'One place to see every WordPress site they run: PHP version, firewall status, plugins, Core Web Vitals, and DNS records they can edit without leaving the page.',
		image: '/hub/hub.png',
		featured: true,
		challenge:
			'They were responsible for a large fleet of WordPress sites spread across their own servers, and there was no single place to look at any of it. Checking which sites were on an outdated PHP version meant logging into servers. Confirming a firewall was actually on meant checking each one. DNS changes meant finding the right registrar login. Every question about the fleet was answered one site at a time.',
		stats: [
			{
				value: 'One view',
				label: 'Every site, every server, without logging into any of them',
			},
			{
				value: 'Live',
				label:
					'PHP, firewall, plugin, and performance data pulled from the source',
			},
			{
				value: 'In place',
				label: 'DNS records read and edited without opening a registrar',
			},
		],
		sections: [
			{
				heading: 'Everything was answerable, one site at a time',
				paragraphs: [
					'Nothing about the estate was unknowable. Every fact they needed existed somewhere: on the server, in the WordPress install, at the registrar, in a performance tool. The problem was that answering a question across the whole fleet meant asking it individually, dozens of times.',
					'That made routine maintenance expensive enough to defer. Which sites are still on an old PHP version is a five-minute question for one site and a whole afternoon for the fleet, so it got asked rarely, which is exactly the wrong cadence for something security-relevant.',
					'It also meant problems were found reactively. A site with a plugin missing, a firewall that had been switched off, or Core Web Vitals that had quietly degraded were all discoverable, but only if somebody happened to look at that specific site.',
				],
			},
			{
				heading: 'Pulling the truth off the servers',
				paragraphs: [
					'The Hub reads directly from where the sites actually live rather than from a record of how they were set up. That distinction matters, because a configuration record tells you what someone intended and a server tells you what is true.',
					'For every site it surfaces the PHP version it is genuinely running, whether the firewall is active, and which plugins are installed and at what version. Those three answers alone covered most of what the team had previously been checking by hand.',
					'Because it reads live, a change made outside the platform still shows up. Somebody disabling protection during troubleshooting and forgetting to re-enable it is visible on the next read rather than at the next audit.',
				],
			},
			{
				heading: 'Performance data next to the site it belongs to',
				paragraphs: [
					'PageSpeed and Core Web Vitals data is pulled in per site and shown against everything else about that site. That sounds obvious and is the part most tooling gets wrong: performance scores usually live in a separate tool, disconnected from the PHP version, the plugin list, and the host.',
					'Sitting together, the numbers become diagnostic rather than decorative. A poor score next to a bloated plugin list and an old PHP version is a specific piece of work, not a metric to feel bad about.',
					'It also made the fleet sortable by how bad things were, so attention went where it was worth spending instead of wherever a client complained loudest.',
				],
			},
			{
				heading: 'DNS without the registrar tab',
				paragraphs: [
					'DNS was the piece the team most wanted and the piece most likely to go wrong. Records are read into the Hub and can be updated from it directly, so a change does not require finding the right login for the right registrar for the right client.',
					'That removes the two failure modes that make DNS work stressful. Editing the wrong account, which is easy when you have a dozen registrar tabs open, and having no record afterward of who changed what.',
					'Everything else about the site is on the same screen, so a record is edited with the context of what it points at rather than in an isolated control panel.',
				],
			},
			{
				heading: 'What it replaced',
				paragraphs: [
					'It replaced a habit rather than a tool. There was no incumbent system to migrate off, just an accumulated set of logins, spreadsheets, and the knowledge of which team member remembered which detail.',
					'The measure of whether it worked was simple: could someone answer a question about the whole estate without opening anything else. That is what it was built to make possible.',
				],
			},
		],
		approach: [
			'Read state directly from the servers rather than from a configuration record',
			'Put security, version, plugin, and performance data on one screen per site',
			'Made the fleet sortable so attention goes to the worst cases first',
			'Brought DNS reads and writes into the same interface as everything else',
			'Designed for the question "what is true across all of them" rather than per site',
		],
		delivered: [
			'Fleet-wide view of every WordPress site across their servers',
			'Live PHP version, firewall status, and installed plugin reporting',
			'PageSpeed and Core Web Vitals pulled in per site',
			'DNS record inspection and direct editing without a registrar login',
			'Sorting and filtering to surface the sites that need work',
		],
		outcome: [
			'Fleet-wide questions stopped requiring a site-by-site audit',
			'Security and version drift became visible instead of discovered reactively',
			'Performance numbers sat beside the configuration causing them',
			'DNS changes stopped meaning a hunt for the right registrar login',
		],
		capabilities: [
			'Server and site integration',
			'Fleet monitoring',
			'DNS management',
			'Performance reporting',
		],
		stack: [
			'Next.js',
			'TypeScript',
			'MongoDB',
			'Third-party APIs',
			'NodeMailer',
			'Vercel',
		],
	},
	{
		slug: 'leadsnearme-scheduling',
		name: 'Appointment Scheduling',
		category: 'Booking software',
		service: 'custom-software',
		client: 'LeadsNearMe',
		summary:
			'Online booking for auto repair shops that reads real availability out of their shop management software, drops onto any site with one script tag, and lets customers reschedule without creating an account.',
		image: '/scheduler/scheduler.png',
		video: '/scheduler/scheduler.mp4',
		featured: true,
		challenge:
			'Auto repair shops were losing bookings that arrived after the phone stopped being answered. The booking widgets they had tried showed availability that did not match the shop calendar, so bookings had to be confirmed by phone anyway, which defeated the purpose and trained customers not to trust them.',
		stats: [
			{
				value: 'One script',
				label: 'Plus a class on a button is the entire installation',
			},
			{
				value: 'Live',
				label:
					'Availability read from the shop management software, not a copy',
			},
			{
				value: 'No account',
				label: 'Customers verify by emailed code and manage the booking after',
			},
		],
		sections: [
			{
				heading: 'A booking form is worthless if the availability is fiction',
				paragraphs: [
					'The failure mode of most booking widgets in this space is the same. The widget keeps its own calendar, the shop keeps the real one, and the two drift apart within a week. Customers book slots that are not available, the shop calls to move them, and everyone learns that the online booking is really a request form.',
					'So availability had to come from the shop management software the shop already runs, live, rather than from a schedule someone syncs or re-enters. If the shop books a job over the counter, that slot has to disappear online without anyone doing anything.',
					'That integration is the hard part of the product and the reason it works. Everything else is interface.',
				],
			},
			{
				heading: 'Installation had to be something a shop can do',
				paragraphs: [
					'These are not businesses with a web team. If installing the scheduler requires a developer, it does not get installed, and the product fails for reasons that have nothing to do with whether it is good.',
					'So the whole integration is a script tag on the site and a class added to whatever button they already have. Whatever the shop uses as its Book Appointment button becomes the trigger, in place, with the design they already have.',
					'That kept it out of the category of change that requires scheduling a developer, which is the category where good tools go to die.',
				],
			},
			{
				heading: 'Verification without making people sign up',
				paragraphs: [
					'Asking a customer to create an account to book a repair is the fastest way to lose the booking. But with no verification at all you collect junk bookings and have no way to confirm the person is reachable.',
					'The compromise is an emailed code. The customer enters their details, receives a code, and enters it to confirm. It takes a few seconds, it proves the address is real, and it does not create a password nobody wants.',
					'That same verified address is what lets them come back later, which is the part that removed work from the shop.',
				],
			},
			{
				heading: 'Letting customers manage their own appointment',
				paragraphs: [
					'Once verified, a customer can reschedule or cancel without calling. That is a small feature and it removed a meaningful share of the calls the front counter was taking, because a large share of inbound calls to a shop are not new work, they are changes to existing work.',
					'It also improves the schedule quality. A customer who can move an appointment in ten seconds does that instead of not showing up, and a rescheduled slot can be filled where a no-show cannot.',
				],
			},
			{
				heading: 'The shop side stays configurable',
				paragraphs: [
					'Every shop runs differently. Bay counts, job types, how far ahead they will take bookings, and which work they want online at all. The shop-side dashboard lets them set that up themselves rather than having it configured for them at onboarding and then never revisited.',
					'The design target throughout was a service writer who is busy. Fast changes, few clicks, nothing that requires exhaustive data entry to complete a simple action.',
				],
			},
		],
		approach: [
			'Integrated with the shop management software so availability is never a copy',
			'Reduced installation to a script tag and a class on an existing button',
			'Verified customers with an emailed code rather than an account signup',
			'Used that verification to let customers reschedule and cancel themselves',
			'Made the shop-side configuration something staff can change themselves',
		],
		delivered: [
			'Customer-facing booking driven by live shop availability',
			'One-script embed that attaches to any existing button',
			'Email code verification with no account creation',
			'Customer self-service rescheduling and cancellation',
			'A configurable shop dashboard for bays, job types, and booking windows',
		],
		outcome: [
			'After-hours bookings stopped depending on someone returning a voicemail',
			'Online availability matched the shop calendar, so bookings stopped needing confirmation calls',
			'Front counter calls dropped because customers could move their own appointments',
			'Shops installed it themselves without waiting on a developer',
		],
		capabilities: [
			'Third-party system integration',
			'Embeddable widget',
			'Customer self-service',
			'Scheduling logic',
		],
		stack: [
			'Next.js',
			'TypeScript',
			'MongoDB',
			'JWT',
			'Server-side sessions',
			'Third-party APIs',
			'Embeddable JS widget',
			'NodeMailer',
			'Vercel',
		],
	},
	{
		slug: 'leadsnearme-reporting',
		name: 'Client Reporting',
		category: 'Reporting dashboard',
		service: 'custom-software',
		client: 'LeadsNearMe',
		summary:
			'A focused dashboard that shows clients what is happening with their Google Ads, so the account team stops rebuilding the same report every month.',
		image: '/reports/reports.png',
		challenge:
			'Clients wanted to know what was being done with their Google Ads spend, and the only way to tell them was to pull the numbers and assemble a report by hand. It was monthly, it was repetitive, and it produced a static document that was out of date the moment it was sent.',
		stats: [
			{
				value: 'Self-serve',
				label:
					'Clients check their own numbers instead of waiting for a report',
			},
			{
				value: 'Live',
				label:
					'Pulled from Google Ads rather than assembled by hand each month',
			},
			{
				value: 'Scoped',
				label: 'Deliberately one job, done well, rather than a general BI tool',
			},
		],
		sections: [
			{
				heading: 'The report was the product, and it was made by hand',
				paragraphs: [
					'Every month the team pulled Google Ads performance, put it into a document, and sent it out. It was not difficult work. It was repetitive work with a deadline, which is a worse combination, because it consumed a predictable chunk of every month and could not be skipped.',
					'The output was also stale on arrival. A monthly PDF describes a period that has already ended, so any client question about the current month restarted the whole process.',
				],
			},
			{
				heading: 'Give the client the dashboard instead of the document',
				paragraphs: [
					'The dashboard pulls directly from Google Ads and shows the client what is happening with their account whenever they look. No assembly, no send date, no version that is more current than the one they have.',
					'That changed what the monthly conversation was about. Instead of walking through numbers the client was seeing for the first time, the account team could talk about what to do next, because the client had already seen the performance.',
				],
			},
			{
				heading: 'Deliberately narrow',
				paragraphs: [
					'This is a Google Ads reporting dashboard. It is not a business intelligence platform, it does not tie spend to downstream revenue across every channel, and it was not built to.',
					'That scope was the right call. The job was to answer what is happening with my ads, for a client, without a person assembling it. Broadening it would have made the build longer, the interface heavier, and the answer to that specific question harder to find.',
				],
			},
		],
		approach: [
			'Replaced the monthly assembly with a live pull from Google Ads',
			'Gave clients direct access rather than sending a document',
			'Kept the scope to one question rather than building a general reporting tool',
		],
		delivered: [
			'Client-facing Google Ads performance dashboard',
			'Live data pulled from the ad account',
			'Self-serve client access with no report request needed',
		],
		outcome: [
			'The monthly report assembly stopped being a recurring task',
			'Clients could answer their own question at any point in the month',
			'Review calls moved from presenting numbers to deciding what to change',
		],
		capabilities: ['Data reporting', 'Dashboards', 'API integration'],
		stack: [
			'Node.js',
			'Express',
			'TypeScript',
			'React',
			'Vite',
			'Redux',
			'Redis',
			'Google Ads API',
			'NodeMailer',
			'AWS for the API',
			'Vercel for the frontend',
		],
	},
	{
		slug: 'mmc-university',
		name: 'MMC University',
		category: 'Training platform',
		service: 'custom-software',
		client: 'Moving industry',
		summary:
			'A training platform where courses are built from uploaded video, assigned automatically by job title and location, and tracked to a pass or fail that the team hears about.',
		image: '/mmc/mmc.png',
		video: '/mmc/mmc.mp4',
		featured: true,
		challenge:
			'Training depended on an experienced person being available to deliver it. That meant onboarding quality varied by who ran it and how busy they were, nobody could prove a new hire had actually been trained on anything, and in an industry with constant turnover the same conversations were repeated indefinitely.',
		stats: [
			{
				value: 'By role',
				label: 'Courses assign themselves from job title and work area',
			},
			{
				value: 'Pass or fail',
				label:
					'A recorded result per person, per course, not a completion tick',
			},
			{
				value: 'Locked',
				label: 'Failed sections cannot be retaken until they are reopened',
			},
		],
		sections: [
			{
				heading: 'Training that only exists when someone is free to deliver it',
				paragraphs: [
					'The knowledge was real and it was good. It lived with a handful of experienced people, and it reached new hires when one of those people had time, which in a busy season meant a shortened version or none at all.',
					'That produces two problems at once. Inconsistent standards, because everyone was taught slightly differently, and no evidence, because nothing about an informal walkthrough is recorded.',
					'In an industry where crews turn over constantly, that combination compounds. Every departure takes some of the training capacity with it.',
				],
			},
			{
				heading: 'Record it once, assign it forever',
				paragraphs: [
					'The platform is built around uploading video. Someone records the thing they would otherwise explain in person, uploads it, and builds a course around it with questions attached to check the material actually landed.',
					'That is the whole authoring model, and keeping it that simple was deliberate. A platform that requires instructional design skills to produce a lesson does not get content added to it, and an empty training platform is worse than none.',
					'Once a course exists it is available permanently, at the same standard, whether the person who recorded it is available or not.',
				],
			},
			{
				heading: 'The right training finds the right person',
				paragraphs: [
					'Nobody should be handed the full library. Courses are assigned based on job title and the area of the business someone works in, so a new hire logs in and finds the set that applies to their role rather than a catalogue to navigate.',
					'That removes the judgement call that used to sit with a manager, which is where the inconsistency came from. Two people hired into the same role get the same training, automatically, regardless of who onboarded them or how busy that week was.',
					'It also means adding a course to a role updates what every future hire in that role receives, without anyone maintaining a list.',
				],
			},
			{
				heading: 'Pass or fail, and what happens after a fail',
				paragraphs: [
					'Courses end in a result, not a completion tick. The questions determine a pass or a fail, and both are recorded against the person.',
					'A failure notifies the team rather than quietly sitting in a report. That is the difference between a system that records outcomes and one that acts on them, and it means somebody knows to have a conversation instead of finding out months later.',
					'A failed section also cannot be immediately retaken. It stays locked until it is reopened, which stops the guess-until-it-passes behaviour that makes assessment scores meaningless and forces the material to actually be revisited.',
				],
			},
			{
				heading: 'What the admin side is for',
				paragraphs: [
					'Administrators can see who has been assigned what, who has completed it, and how they did. That is the reporting that makes the platform useful beyond onboarding, because it answers the question that matters operationally: is this person actually trained for the work I am about to give them.',
					'It is also the record that did not exist before. Where training used to be an informal event with no trace, it is now something the business can demonstrate.',
				],
			},
		],
		approach: [
			'Built authoring around video upload so recording a lesson is the whole workflow',
			'Attached questions to each course so completion means comprehension',
			'Assigned courses automatically from job title and work area',
			'Made failures notify the team rather than sit in a report',
			'Locked failed sections until reopened, to prevent retry-until-pass',
		],
		delivered: [
			'Video-based course authoring with questions and answers',
			'Automatic course assignment by job title and work area',
			'Individual logins with per-person progress tracking',
			'Pass and fail recording with team notification on failure',
			'Retake locking until a failed section is reopened',
			'Admin reporting on who took what and how they did',
		],
		outcome: [
			'Onboarding stopped depending on an experienced person having time',
			'Every hire in a role now receives the same training, in the same order',
			'Failures surface immediately instead of at a later review',
			'The business can demonstrate who was trained on what, and when',
		],
		capabilities: [
			'Video learning platform',
			'Role-based assignment',
			'Assessment and tracking',
			'Admin reporting',
		],
		stack: [
			'Next.js',
			'TypeScript',
			'MongoDB',
			'JWT',
			'Video streaming',
			'NodeMailer',
			'AWS for video storage and delivery',
			'Vercel for the app',
		],
	},
	{
		slug: 'omni-university',
		name: 'OMNI University',
		category: 'Training platform',
		service: 'custom-software',
		client: 'Specialty coffee',
		summary:
			'The same training engine deployed for a brand that needed learning to feel like part of the product: upload video, build the assessment, assign by role, and track who passed.',
		image: '/omni-u/omni.png',
		video: '/omni-u/omni.mp4',
		challenge:
			'Teaching a craft is different from distributing documents. The team needed people to genuinely learn technique, not click through a compliance module, and generic course tools flattened the material into something that looked like everybody else and got treated accordingly.',
		stats: [
			{
				value: 'Video first',
				label: 'Because you cannot teach technique in a slide deck',
			},
			{
				value: 'By role',
				label:
					'Assignment driven by job title and area rather than a catalogue',
			},
			{
				value: 'Tracked',
				label:
					'Pass and fail recorded per person, with failures flagged to the team',
			},
		],
		sections: [
			{
				heading: 'Generic training gets treated as generic',
				paragraphs: [
					'People take training as seriously as it appears to have been taken. A module that looks like it came out of a template gets clicked through, because its own presentation signals that it is a box to tick.',
					'That mattered more here than in most deployments, because the material was craft knowledge. Technique is learned by watching it done properly and then being checked, and neither of those survives being flattened into a slide deck with a quiz bolted on.',
				],
			},
			{
				heading: 'Video is the lesson, not an attachment',
				paragraphs: [
					'Authoring is built around uploading video, with questions attached to confirm the material landed. For teaching a physical craft that ordering is not a preference, it is the requirement, because the demonstration is the content.',
					'Keeping authoring that simple also kept the library growing. The people who hold the expertise are not instructional designers, and any workflow that demanded more than record, upload, and add questions would have quietly stopped being used.',
				],
			},
			{
				heading: 'The right set for the right role',
				paragraphs: [
					'Courses are assigned from job title and area rather than presented as a catalogue. Somebody logs in and sees what applies to their job, which removes both the navigation problem and the possibility of the wrong training being assigned by whoever handled onboarding that week.',
					'As roles change or courses are added, the assignment follows automatically. Nobody maintains a spreadsheet of who owes what.',
				],
			},
			{
				heading: 'Assessment that means something',
				paragraphs: [
					'Each course resolves to a pass or a fail against its questions, recorded per person. A failure notifies the team so it can be addressed, and the failed section stays locked until it is reopened rather than being immediately retakeable.',
					'That lock is what keeps the result honest. Without it, an assessment becomes a memory test of which answer the system accepts, and the record it produces is worthless.',
					'Administrators can see the whole picture: who was assigned what, who completed it, and how they did.',
				],
			},
		],
		approach: [
			'Designed the interface around the brand so training reads as part of the product',
			'Built authoring around video upload, because the demonstration is the lesson',
			'Assigned courses from job title and area rather than a browsable catalogue',
			'Recorded pass and fail per person, with team notification on failure',
			'Locked failed sections until reopened so results stay meaningful',
		],
		delivered: [
			'Fully branded learning environment',
			'Video course authoring with attached questions',
			'Role and area based course assignment',
			'Individual logins with completion and result tracking',
			'Failure notification and retake locking',
			'Admin visibility into assignment, completion, and results',
		],
		outcome: [
			'Training looked like the company rather than a compliance tool',
			'Craft technique was taught by demonstration and then actually checked',
			'Assignment stopped depending on who ran onboarding',
			'The team could see who had genuinely passed, not just who had clicked through',
		],
		capabilities: [
			'Product design',
			'Video learning platform',
			'Role-based assignment',
			'Assessment and tracking',
		],
		stack: [
			'Node.js',
			'JavaScript',
			'React',
			'Vite',
			'Redux',
			'React Query',
			'Tailwind CSS',
			'MongoDB',
			'Video streaming',
			'NodeMailer',
			'AWS for the API and video',
			'Vercel for the frontend',
		],
	},
	{
		slug: 'agency-aviator',
		name: 'Agency Aviator',
		category: 'Agency operations platform',
		service: 'custom-software',
		client: 'Agency operations',
		summary:
			'The single source of truth an agency had been trying to keep in spreadsheets: every client, what they actually bought, when they were last met with, how happy they are, and where they sit on a map.',
		image: '/portal/portal.png',
		challenge:
			'Client information lived in spreadsheets, and there was more than one. The social team kept theirs, SEO kept theirs, and the account team kept a third. Nobody could reliably say when a client had last been met with, exactly which package they were on, or which clients were near enough to see on the same trip. Updating anything meant updating it in several places, which meant it was updated in one.',
		stats: [
			{
				value: 'One record',
				label: 'Updated once and reflected across every team that needs it',
			},
			{
				value: 'Per team',
				label:
					'Service breakdowns split the way each department actually thinks',
			},
			{
				value: 'Mapped',
				label: 'Clients plotted nationally, with proximity visible at a glance',
			},
		],
		sections: [
			{
				heading: 'Three teams, three spreadsheets, three versions of the truth',
				paragraphs: [
					'Every team had built the view they needed, because none of them had one. Social tracked which clients got which posting cadence. SEO tracked which tier a client was on. The account team tracked meetings and renewals. All of it described the same clients from different angles.',
					'The cost was not the duplication itself, it was the drift. A client upgrading their package meant an update in several places, so in practice it happened in the one the person making the change owned. Every other view then quietly described a client who no longer existed.',
					'They knew what they wanted, and described it as a CRM. What they actually needed was narrower than any CRM they had looked at, and every product they trialled asked them to reshape how they worked to fit it.',
				],
			},
			{
				heading: 'One record, seen the way each team thinks',
				paragraphs: [
					'The client record became the single place anything is updated, and the teams get views onto it rather than copies of it. Change what a client is subscribed to once and every department sees it immediately, because there is nothing to propagate.',
					'The service breakdown is the part that made it usable rather than merely correct. Services are not tracked as a flat list, they are tracked at the granularity each team distinguishes. Social sees who gets regular Facebook posts against who gets the enhanced package. SEO sees basic against plus. Paid sees local service ads against standard Google Ads.',
					'That granularity is why generic tools had failed. A CRM that records the client is on the mid tier is useless to a social manager who needs to know exactly what to produce this week.',
				],
			},
			{
				heading: 'When did we last actually speak to them',
				paragraphs: [
					'The record carries the last meeting date and how satisfied the client is, which together answer the question that predicts churn better than any usage metric. A client nobody has spoken to in months, whose last recorded satisfaction was lukewarm, is not a mystery when it cancels.',
					'Previously that question could only be answered by asking around, and the answer depended on someone remembering. As data on the record it is sortable, which turns it from a recollection into a list of who to call.',
				],
			},
			{
				heading: 'The map, and why proximity mattered',
				paragraphs: [
					'Clients are plotted across the United States, and the map turned out to be more than presentation. Because it shows which clients are near each other, a trip to see one client becomes a trip to see three.',
					'That is a scheduling insight that is effectively impossible to extract from a spreadsheet of addresses. Nobody cross-references postal codes by hand to plan a visit, so the opportunity had always been there and had never been visible.',
					'It also gave a geographic read on the book of business that had previously only existed as a sense of where clients tended to be.',
				],
			},
			{
				heading: 'Why we did not tell them to buy something',
				paragraphs: [
					'We usually push clients toward an off-the-shelf product, and here we did not. The requirement was unusually specific: service tracking at a granularity that mapped to their own packages, meeting recency, satisfaction, and geography, all on one record.',
					'Generic CRMs handled the contact management well and could not represent the service breakdown without heavy customisation, which is where the cost stops being a subscription. What they needed was narrow, and narrow is exactly when building beats configuring.',
				],
			},
		],
		approach: [
			'Consolidated three team spreadsheets into one client record with per-team views',
			'Modelled services at the granularity each department actually distinguishes',
			'Made meeting recency and satisfaction sortable data rather than recollection',
			'Plotted clients geographically so proximity became visible',
			'Chose to build only after confirming off-the-shelf could not represent the packages',
		],
		delivered: [
			'A single client record replacing several team spreadsheets',
			'Per-team service breakdowns for social, SEO, and paid',
			'Last meeting date and client satisfaction on every record',
			'A national client map with proximity visible for trip planning',
			'Update-once behaviour with every view reading from the same source',
		],
		outcome: [
			'Package changes stopped being wrong in two out of three places',
			'Each team got the detail it needed without maintaining its own list',
			'Quiet, unhappy clients became a sortable list instead of a recollection',
			'Client visits could be planned around who else was nearby',
		],
		capabilities: [
			'Operations platform',
			'Data modelling',
			'Geographic visualization',
			'Multi-team access',
		],
		stack: [
			'Next.js',
			'TypeScript',
			'MongoDB',
			'Google Maps API',
			'Zoom API',
			'Calendly API',
			'Stax Payments API',
			'NodeMailer',
			'Vercel',
		],
	},
	{
		slug: 'hvac-voice-agent-assessment',
		name: 'The AI Receptionist That Should Not Have Been Built',
		category: 'Operations assessment',
		service: 'ai-automation-assessment',
		client: 'Multi-location HVAC and plumbing contractor',
		summary:
			'A contractor arrived ready to spend six figures on an AI phone agent. The assessment found call handling was not where the money was going, and redirected the budget at three problems that were.',
		challenge:
			'A four-location residential HVAC and plumbing company was convinced its growth ceiling was the phone. Calls went unanswered at peak, and leadership had already scoped an AI voice agent to answer every inbound call across all four branches. They called us in to build it. We asked to run the assessment first.',
		stats: [
			{
				value: '3.4x',
				label: 'The planned build cost against what we recommended instead',
			},
			{
				value: '11%',
				label: 'Share of lost revenue that unanswered calls actually explained',
			},
			{
				value: '9 weeks',
				label: 'From assessment to the first automation running in production',
			},
		],
		sections: [
			{
				heading: 'The plan they walked in with',
				paragraphs: [
					'The brief was specific and confidently argued. An AI voice agent would answer every inbound call across four branches, qualify the caller, look up availability, and book the job. Leadership had a vendor quote, an internal champion, and a board slide showing recovered revenue from missed calls.',
					'The number on that slide was the entire justification. It had been calculated by taking every unanswered call from the phone system report, multiplying by average ticket value, and assuming each one was a lost job. That arithmetic produces a very large number, and nobody had questioned it.',
					'Our first request was not for a technical spec. It was for six months of call detail records and the corresponding job records, so we could match one against the other.',
				],
			},
			{
				heading: 'What the numbers actually said',
				paragraphs: [
					'Roughly two thirds of unanswered calls came from numbers that called again within twenty minutes and reached someone. Those were not lost customers. They were mildly annoyed customers who had already been counted as revenue on the board slide.',
					'A further slice were existing customers calling about a job already scheduled, plus a meaningful volume of supplier and recruiter calls. Once we removed everything that was not a genuine new-work enquiry that never came back, unanswered calls accounted for about eleven percent of the revenue leak leadership believed they were solving.',
					'The eighty-nine percent was somewhere else, and it was not hard to find once we stopped looking at the phone system. Estimates were being written and then never followed up. Nearly a third of quoted work over the prior year had no recorded second contact of any kind. Nobody owned the follow-up, so it happened when a service manager had a slow afternoon.',
				],
			},
			{
				heading: 'The part that would have cost them three times over',
				paragraphs: [
					'Cost was only half the problem with the original plan. The other half was that it could not have been built as scoped. The voice agent needed live technician availability to book a job, and their dispatch system exposed availability only through a nightly export. Booking against a schedule that was up to twenty-four hours stale would have produced double-booked trucks in week one.',
					'Closing that gap meant either replacing the dispatch platform or paying for a custom real-time integration the vendor had not quoted. Both had been priced at zero because neither had been discovered. Adding realistic figures took the programme from the quoted number to roughly three and a half times our recommended alternative, on a timeline stretching past nine months.',
					'We put that on one page: their plan with the missing line items filled in, against a staged alternative aimed at the eighty-nine percent. We did not tell them the voice agent was a bad idea forever. We told them it was the fourth-best use of the money and could not run correctly until the dispatch data problem was solved anyway.',
				],
			},
			{
				heading: 'What we recommended instead',
				paragraphs: [
					'Three pieces, sequenced by payback. Automated estimate follow-up first, because unsold quotes were the largest single pool and the work was mostly plumbing between systems they already owned. Then after-hours intake capturing enough detail overnight to schedule in the morning, which addressed the genuine share of the call problem at a fraction of the voice agent cost.',
					'Third, a dispatch data fix, which was unglamorous and was the reason the original plan could not work. Getting availability out of the scheduling system in real time was a prerequisite for anything customer-facing, including the voice agent if they still wanted it later.',
					'The roadmap was explicit that the voice agent stayed on the table. It moved from phase one to a decision point after phase three, at which point the integration would already exist and the honest cost would be a fraction of the original quote.',
				],
			},
			{
				heading: 'Why the assessment paid for itself before anything was built',
				paragraphs: [
					'The most valuable output was not the roadmap. It was the six weeks and the six figures that did not get committed to a project whose central assumption was wrong.',
					'Leadership was not wrong to want the voice agent. They were working from a number that had never been tested, produced by a report that could not distinguish a lost customer from an impatient one. That is the ordinary case, not an unusual one.',
				],
			},
		],
		comparison: {
			planned: {
				title: 'What they arrived with',
				caption:
					'Quoted at roughly 3.4x our recommendation once the missing work was priced.',
				points: [
					'AI voice agent answering all inbound calls across four branches',
					'Justified by a lost-revenue figure that counted callbacks as lost jobs',
					'Assumed live technician availability the dispatch system could not provide',
					'Real-time integration and platform replacement both priced at zero',
					'Nine-month timeline before any measurable result',
				],
			},
			recommended: {
				title: 'What the assessment recommended',
				caption:
					'Staged by payback, with the first automation live in nine weeks.',
				points: [
					'Automated estimate follow-up against the largest pool of lost revenue',
					'After-hours intake capturing enough detail to schedule next morning',
					'Real-time dispatch availability, the prerequisite nobody had costed',
					'Voice agent deferred to a decision point, not cancelled',
					'Each phase independently justified and separately approvable',
				],
			},
		},
		approach: [
			'Matched six months of call detail records against actual job records',
			'Separated genuine lost enquiries from callbacks, suppliers, and existing customers',
			'Audited every quoted job for evidence of a follow-up contact',
			'Tested whether the dispatch system could support the planned build at all',
			'Priced the original plan with the missing integration work included',
		],
		delivered: [
			'A process and systems map across all four branches',
			'A corrected revenue-leak model with the assumptions written down',
			'An opportunity register ranked by payback against effort',
			'A costed comparison of the original plan against the alternative',
			'A phased roadmap with the voice agent kept as a later decision',
		],
		outcome: [
			'The six-figure voice agent programme was shelved before contracts were signed',
			'Estimate follow-up went live in nine weeks and became the first measured win',
			'The dispatch data problem was fixed as a prerequisite rather than discovered mid-build',
			'Leadership got a revenue model they could defend rather than a report total',
		],
		capabilities: [
			'Operational assessment',
			'Data analysis',
			'Opportunity ranking',
			'Build roadmap',
		],
		stackLabel: 'Systems reviewed',
		stack: [
			'Field service platform',
			'VoIP call records',
			'Dispatch and scheduling',
			'Accounting exports',
			'Estimating tool',
		],
	},
	{
		slug: 'accounting-document-ai-assessment',
		name: 'The AI Platform They Were Already Paying For',
		category: 'Operations assessment',
		service: 'ai-automation-assessment',
		client: 'Regional accounting and advisory firm',
		summary:
			'A firm scoped a bespoke AI document platform to read everything clients sent them. The assessment found three form types carried most of the volume, and that a feature they already licensed handled part of the rest.',
		challenge:
			'A mid-sized accounting and advisory practice was drowning in client documents during filing season. Partners had approved a business case for a custom AI platform that would read, classify, and extract every document type the firm received. They wanted a build partner. We asked to sample the documents first.',
		stats: [
			{
				value: '71%',
				label: 'Of document volume carried by just three form types',
			},
			{
				value: '3x',
				label: 'The original platform scope against the phased alternative',
			},
			{
				value: '1 seat',
				label: 'Unused licensed feature already covering part of the problem',
			},
		],
		sections: [
			{
				heading: 'A platform scoped from a feeling',
				paragraphs: [
					'The business case described a document intelligence platform handling every inbound document type across the practice. It was thorough, well written, and built on an estimate of document volume that came from asking staff how much time they spent on paperwork.',
					'That is a reasonable way to discover you have a problem. It is a poor way to scope a build, because it tells you the total pain without telling you where it is concentrated. Everything looks equally urgent when you measure it by how it feels in March.',
					'We asked for a random sample of four thousand documents received over the previous two seasons, along with the time-tracking records for the staff processing them.',
				],
			},
			{
				heading: 'The distribution nobody had looked at',
				paragraphs: [
					'Three form types accounted for roughly seventy-one percent of all documents received. They were highly structured, arrived in predictable formats, and were being keyed by hand into the practice management system by junior staff.',
					'The remaining twenty-nine percent was a long tail of nearly ninety distinct document types, many appearing a handful of times a year. Several were genuinely unstructured client correspondence that no extraction system would handle reliably, and where an error would be expensive and hard to detect.',
					'The original scope treated all of this as one problem. Building for the long tail meant an accuracy target the technology could not honestly hit on those documents, an open-ended review burden, and a system that would be blamed for every mistake it made on a document it should never have been pointed at.',
				],
			},
			{
				heading: 'The feature already on the invoice',
				paragraphs: [
					'Partway through the systems review we found that the firm practice management platform included a structured-document ingestion module. It was on the licence. It had been enabled during the original rollout, never configured, and had been quietly renewed for three years.',
					'It did not solve everything, and we were careful not to oversell it. It handled one of the three high-volume form types competently and a portion of a second. But it existed, it was paid for, and configuring it was days of work rather than a build.',
					'This is the least glamorous finding in an assessment and often the most common. Firms rarely use everything they license, and nobody audits it because the renewal is smaller than the build being proposed.',
				],
			},
			{
				heading: 'Scoping to the volume instead of the anxiety',
				paragraphs: [
					'The recommendation was narrow extraction built properly for the three high-volume form types, with a confidence threshold that routed anything uncertain to a person instead of guessing. Configure the licensed module for what it genuinely covered. Leave the long tail manual, deliberately and on the record.',
					'That last point mattered most to the partners and took the longest conversation. Choosing not to automate something feels like an incomplete project. We put it in writing as a decision with reasoning attached, so it could be revisited when volume changed rather than relitigated every season.',
					'Total cost landed at roughly a third of the platform scope, and the accuracy target for what was built was one we could actually commit to, because it applied to documents that could support it.',
				],
			},
			{
				heading: 'What we told them not to build',
				paragraphs: [
					'The assessment recommended against automating client correspondence entirely. The volume was low, the variation was extreme, and the cost of a confident wrong answer on a client instruction is not a rounding error in this profession.',
					'That section was the shortest in the document and the one most referenced afterwards, because it settled an argument the firm had been having internally for over a year.',
				],
			},
		],
		comparison: {
			planned: {
				title: 'The approved business case',
				caption:
					'Roughly 3x the phased alternative, with an accuracy target it could not meet.',
				points: [
					'One platform covering every document type the firm receives',
					'Volume estimated from how long staff felt the work took',
					'A single accuracy target applied across structured and unstructured documents',
					'No audit of features already licensed and unused',
					'Long-tail document types treated as equal in priority to high-volume forms',
				],
			},
			recommended: {
				title: 'What the assessment recommended',
				caption:
					'Scoped to the 71% that carried the volume, with the rest left alone on purpose.',
				points: [
					'Narrow extraction built properly for three high-volume form types',
					'Confidence thresholds routing uncertain documents to a reviewer',
					'Configure the ingestion module already on the licence',
					'Client correspondence explicitly excluded, with the reasoning recorded',
					'Accuracy target set per document type rather than across the board',
				],
			},
		},
		approach: [
			'Sampled four thousand documents across two filing seasons',
			'Measured actual distribution by type rather than by perceived effort',
			'Cross-referenced document volume against staff time-tracking records',
			'Audited licensed software for capability already paid for',
			'Tested extraction viability per document type instead of in aggregate',
		],
		delivered: [
			'A document taxonomy with real volume attached to every type',
			'A viability rating per type, including the ones we advised against',
			'A licence audit identifying paid capability sitting unused',
			'A phased build scope with per-type accuracy targets',
			'A written record of what was deliberately left manual, and why',
		],
		outcome: [
			'The full-platform business case was withdrawn before procurement',
			'Extraction shipped for the three form types carrying most of the volume',
			'A licensed module was configured in days instead of rebuilt from scratch',
			'A year-long internal argument about AI on client correspondence was settled',
		],
		capabilities: [
			'Operational assessment',
			'Document analysis',
			'Licence and systems audit',
			'Scope definition',
		],
		stackLabel: 'Systems reviewed',
		stack: [
			'Practice management platform',
			'Document management system',
			'Time tracking',
			'Client portal',
			'Email intake',
		],
	},
	{
		slug: 'logistics-tms-replacement-assessment',
		name: 'The Replacement That Was Not The Problem',
		category: 'Operations assessment',
		service: 'ai-automation-assessment',
		client: 'Regional moving and logistics operator',
		summary:
			'An operator had budget approved to rip out and replace their dispatch platform. The assessment found the platform was not the failure point, and that replacing it would have destroyed six years of operating history.',
		challenge:
			'A regional moving and logistics company had lost confidence in its transport management system. Dispatchers complained daily, drivers ignored it, and the leadership team had approved budget to replace it. We were brought in to help select the replacement. The assessment changed the question.',
		stats: [
			{
				value: '2 entries',
				label: 'Every job was being keyed into two systems by hand',
			},
			{
				value: '6 years',
				label: 'Of operating history a replacement would have stranded',
			},
			{
				value: '3x',
				label:
					'Replacement programme cost against the integration we recommended',
			},
		],
		sections: [
			{
				heading: 'Everyone agreed the system was the problem',
				paragraphs: [
					'When we arrived, the diagnosis was unanimous, which is usually a signal worth testing. Dispatchers said the system was slow. Drivers said it was useless. Operations said reporting was unreliable. A replacement had been approved on the strength of that agreement.',
					'Unanimity about a tool is often unanimity about a symptom. We spent the first week sitting with dispatchers during live shifts rather than in a conference room, because what people describe in a meeting and what they do at four in the afternoon on a Friday are different things.',
					'The system was not fast, and it was not the reason the operation was struggling.',
				],
			},
			{
				heading: 'What was actually happening on the floor',
				paragraphs: [
					'Every job was being entered twice. Once into the transport system, and again into a separate spreadsheet that dispatch had built years earlier to hold the information the system did not capture: gate codes, difficult access notes, which crews could handle which buildings, and which customers needed a call before arrival.',
					'That spreadsheet was the real operating system. It was where the institutional knowledge lived. Nobody had ever asked why it existed, so the answer had never surfaced, and the platform got blamed for a gap it had merely failed to fill.',
					'Drivers ignored the system for a related reason. Their information arrived on paper because the mobile app required a login that timed out and a data connection that did not exist inside half the buildings they worked in. The office then re-keyed the paper afterwards, which is where the reporting errors came from. Three entries of the same job, and the reports were built from the least reliable one.',
				],
			},
			{
				heading: 'What replacement would have actually cost',
				paragraphs: [
					'The approved budget covered licensing and implementation. It did not cover data migration, and six years of job history, customer records, and pricing precedent lived in the existing platform. Losing pricing precedent alone would have been serious in a business where quoting leans on what similar past jobs cost.',
					'It also did not cover the retraining of a dispatch team through peak season, or the near-certainty that the same spreadsheet would reappear beside the new system within a quarter, because nothing about the replacement addressed why it existed.',
					'Priced honestly, the replacement programme came in at roughly three times the integration work we recommended, and carried a real risk of arriving at the same position with a different logo on the screen.',
				],
			},
			{
				heading: 'Fixing the gap instead of the logo',
				paragraphs: [
					'The recommendation was to keep the platform and close the three gaps that made it unusable. Extend the job record to hold what the spreadsheet held, so the knowledge moved into the system of record rather than beside it. Replace the driver app with an offline-first mobile capture flow that survives a basement with no signal and does not demand a login mid-shift.',
					'Then remove the double entry entirely, which the first two changes make possible, and rebuild reporting off a single record instead of the least reliable of three.',
					'None of this is exciting. It is also the difference between a dispatch team that trusts the system and one that keeps a shadow copy, and no amount of new software fixes that on its own.',
				],
			},
			{
				heading: 'The uncomfortable part of the report',
				paragraphs: [
					'We told the leadership team that the replacement they had approved would probably have failed, and that the spreadsheet would have been rebuilt within three months of go-live. That is not a comfortable conversation with people who have already defended a budget.',
					'It landed because it was evidenced. We were not offering an opinion about their platform. We were showing them three copies of the same job, the report those copies fed, and the gap every one of them was working around.',
				],
			},
		],
		comparison: {
			planned: {
				title: 'The approved replacement',
				caption:
					'Roughly 3x the recommended work, with migration and retraining unpriced.',
				points: [
					'Rip out and replace the transport management platform',
					'Approved on unanimous complaints about the tool itself',
					'Data migration for six years of history not included in budget',
					'Retraining a dispatch team scheduled through peak season',
					'Nothing in scope addressed why the shadow spreadsheet existed',
				],
			},
			recommended: {
				title: 'What the assessment recommended',
				caption:
					'Keep the platform, close the three gaps that made people work around it.',
				points: [
					'Extend the job record to hold what the spreadsheet was holding',
					'Offline-first driver capture that works without signal or a mid-shift login',
					'Eliminate double entry once the first two changes land',
					'Rebuild reporting from one record instead of three copies',
					'Six years of history and pricing precedent stay where they are',
				],
			},
		},
		approach: [
			'Observed live dispatch shifts instead of interviewing in a meeting room',
			'Traced a single job through every system and piece of paper it touched',
			'Found and read the shadow spreadsheet dispatch had built themselves',
			'Rode along to confirm why drivers abandoned the mobile app',
			'Priced the replacement with migration and retraining included',
		],
		delivered: [
			'A trace of one job across every system, spreadsheet, and paper form',
			'A gap analysis of what the platform did not capture and why it mattered',
			'A true cost model for replacement, including migration and lost precedent',
			'A three-phase remediation plan keeping the existing system',
			'A written argument for why replacement would likely repeat the failure',
		],
		outcome: [
			'The replacement programme was cancelled before vendor selection',
			'Six years of job history and pricing precedent were preserved',
			'Double entry was designed out rather than migrated to a new platform',
			'Dispatch knowledge moved into the system of record instead of beside it',
		],
		capabilities: [
			'Operational assessment',
			'Process tracing',
			'Systems gap analysis',
			'Build-versus-replace analysis',
		],
		stackLabel: 'Systems reviewed',
		stack: [
			'Transport management system',
			'Driver mobile app',
			'Dispatch spreadsheets',
			'Customer records',
			'Reporting exports',
		],
	},
	{
		slug: 'review-response-agents',
		name: 'The Review Replies That Sound Like Someone Local',
		category: 'Reputation automation',
		service: 'ai-systems',
		client: 'Multi-location local services brand',
		summary:
			'An agent system that answers Google Business Profile reviews in the voice of the location it belongs to, publishes the positive ones on its own, and never posts a word to an unhappy customer without a human choosing it.',
		challenge:
			'Reviews were being answered late, inconsistently, or not at all. The replies that did go out read like a corporate template written a thousand miles away, which is exactly how they read to a local customer. Leadership wanted automation, but nobody was willing to let software talk unsupervised to somebody who had just left one star.',
		stats: [
			{
				value: '2 hours',
				label: 'Median time from review posted to reply published',
			},
			{
				value: '0',
				label:
					'Negative replies ever published without a person approving them',
			},
			{
				value: '3 drafts',
				label:
					'Offered for every negative review, each taking a different angle',
			},
		],
		sections: [
			{
				heading: 'Why generic replies are worse than none',
				paragraphs: [
					'A review reply is read by two audiences. The customer who wrote it, and every prospect who scrolls the profile afterwards. The second audience is much larger, and it can spot a template instantly.',
					'The brand had locations spread across regions that genuinely do not talk the same way. Copy written to sound natural in one part of the country reads as slightly off in another, and a reply that reads as slightly off does more damage than silence, because it advertises that nobody local is paying attention.',
					'That constraint shaped the whole build. The system had to sound like the specific location, not like the brand, and definitely not like a language model with a friendly system prompt.',
				],
			},
			{
				heading: 'Profiling the area before answering anything',
				paragraphs: [
					'The first time an account is connected, a research agent studies the location before a single reply is generated. It looks at regional phrasing, the terms locals actually use for the services on offer, nearby landmarks and neighbourhood names, and the register that reads as normal rather than stiff in that part of the country.',
					'That produces a persistent voice profile attached to the Google Business Profile. It records the vocabulary to prefer, the phrasing to avoid, how formal to be, and which local references are safe to use. It is written once, stored, and reused on every subsequent reply, so the location sounds like itself consistently rather than differently each time.',
					'The profile is editable. Location managers can correct it, because a research agent can learn how a region talks but it cannot know that one particular phrase is a sore subject in one particular town.',
				],
			},
			{
				heading: 'Four and five stars answer themselves',
				paragraphs: [
					'For a positive review, the system pulls the review content, the reviewer history where available, and the service context, then writes a reply as a member of that location team using the stored voice profile.',
					'It references what the customer actually said rather than thanking them generically, because a reply that could have been pasted under any review is the thing everyone is trying to avoid. Where the review names a technician or a specific job, the reply names it too.',
					'These publish automatically. The reasoning is straightforward: the downside of an imperfect thank-you to a happy customer is close to zero, and the cost of the delay is real, because reply speed is visible on the profile.',
				],
			},
			{
				heading: 'One to three stars never publish on their own',
				paragraphs: [
					'Negative reviews take the opposite path, and this was the part that made the system acceptable to leadership. Nothing is ever published automatically. The system generates three candidate replies, each taking a deliberately different approach rather than three rewordings of the same paragraph. One leads with the apology, one leads with the specific fix, one invites the conversation offline.',
					'The client gets an email with a link to a selection page. They can send one of the three as written, edit one before sending, or discard all three and write their own. The same queue lives in the dashboard for anyone who would rather work from there than from email.',
					'The three drafts are not there to be sent blindly. They are there because the hard part of answering an angry review is starting, and a manager with three angles in front of them responds in two minutes instead of avoiding it for two days.',
				],
			},
			{
				heading: 'The guardrails that made it shippable',
				paragraphs: [
					'Sentiment classification decides which path a review takes, and the threshold is deliberately cautious. Anything ambiguous is treated as negative and routed to a human, because the cost of those two errors is not symmetrical. An unnecessary human review costs a minute. An automated reply to a furious customer costs a screenshot on social media.',
					'Every generated reply is logged with the review it answered, the profile version used, and whether a person edited it before publishing. Those edits are the most useful signal in the system, because they show exactly where the voice profile is still wrong.',
				],
			},
		],
		approach: [
			'Built a per-location research agent that profiles regional voice before any reply is written',
			'Stored the voice profile as editable data rather than a hidden prompt',
			'Split the pipeline by sentiment, with a deliberately cautious threshold',
			'Generated three genuinely different angles for negative reviews, not three rewordings',
			'Logged every human edit as feedback on where the profile is still wrong',
		],
		delivered: [
			'Automatic replies to four and five star reviews in the location own voice',
			'A per-profile voice model built on first connection and editable afterwards',
			'Three-option approval flow by email and in the dashboard',
			'Edit-before-send and write-your-own paths for every negative review',
			'A full audit log of what was generated, what was edited, and what was published',
		],
		outcome: [
			'Review replies stopped depending on whoever remembered to check the profile',
			'Locations read as locally staffed rather than centrally managed',
			'Negative reviews got answered in minutes instead of being avoided for days',
			'No unapproved reply to an unhappy customer has ever gone out',
		],
		capabilities: [
			'Multi-agent research',
			'Voice and tone modelling',
			'Sentiment routing',
			'Human-in-the-loop approval',
		],
		stackLabel: 'Built on',
		stack: [
			'Google Business Profile API',
			'LLM agents for area research and drafting',
			'Stored per-location voice profiles',
			'Email approval flow',
			'Scheduled review polling',
		],
	},
	{
		slug: 'blog-automation-agents',
		name: 'Nine Hundred Blogs A Month, Without The Prompt Grind',
		category: 'Content platform',
		service: 'ai-systems',
		client: 'Multi-client marketing operation',
		summary:
			'A multi-agent writing system that replaced a team copying prompts into a chat window roughly nine hundred times a month, with two quality gates that send failing drafts back to be rewritten before a human ever sees them.',
		challenge:
			'The team was producing close to nine hundred blogs a month by pasting near-identical prompts into a chat window, one at a time. Output was generic, weakly optimised, and needed several rounds of reprompting before it was usable. The bottleneck was not writing ability. It was that every single post required a person to babysit a conversation.',
		stats: [
			{
				value: '~900',
				label: 'Blogs produced per month, now started in a single batch',
			},
			{
				value: '2 gates',
				label:
					'Independent quality checks every draft must clear before a human sees it',
			},
			{
				value: '0',
				label: 'Full rewrites needed across several hundred test posts',
			},
		],
		sections: [
			{
				heading: 'The real cost was the reprompting',
				paragraphs: [
					'Nine hundred posts a month is a volume problem, but volume was not what made it painful. The pain was that each post took several rounds. Write, read, notice it was generic, reprompt, read again, fix the format, paste it in.',
					'Every one of those rounds was a person waiting on a chat window. Multiply three or four rounds across hundreds of posts and the team was spending most of its month supervising a tool rather than doing anything that needed judgement.',
					'The output was also inconsistent in a way that is hard to fix by prompting harder. Two writers using the same starting prompt got different structures, different depth, and different levels of specificity, because the follow-up prompts were improvised each time.',
				],
			},
			{
				heading: 'Research before writing, not during',
				paragraphs: [
					'Generic writing is usually a research problem wearing a style costume. A model asked to write about a service in a town it knows nothing specific about will produce something that could be about anywhere, because that is genuinely all it has.',
					'So the pipeline researches first. One agent studies the client, what they actually do, and which services they sell. Another researches the specific topic the post is about. A third researches the locality, both for regional phrasing and for concrete local detail the post can legitimately reference.',
					'Only then does a writing agent draft, and it drafts against gathered material rather than from a standing start. That single reordering is most of the difference between copy that reads like it came from an industry and copy that reads like it came from a template.',
				],
			},
			{
				heading: 'Two quality gates that do different jobs',
				paragraphs: [
					'The first gate checks substance. Is the topic actually covered, is the information accurate against the researched material, and has anything been invented. Fabricated statistics, invented credentials, services the client does not offer, and confidently wrong local detail are all failures. This gate exists because the fastest way to destroy trust in a content system is one hallucinated claim published under a client name.',
					'The second gate checks format independently. Heading structure, section ordering, length, internal conventions, and whatever house style the client expects. It is deliberately separate from the substance check, because a reviewer looking for both at once reliably does neither well.',
					'A draft has to clear both. A pass on substance with a broken structure is still a fail.',
				],
			},
			{
				heading: 'Failure triggers a rewrite, not an alert',
				paragraphs: [
					'When a draft fails either gate, nothing lands in a human queue. A prompt-rewriting agent takes the specific failure, composes revised instructions targeting exactly what was wrong, and sends the piece back through.',
					'The rewritten draft then faces both gates again from scratch. It does not inherit a pass from the earlier round, because a fix for a format problem can easily introduce a substance one.',
					'That loop is the reason the human at the end is proofreading rather than repairing. The reprompting that used to consume the team still happens on every post that needs it. It just happens without anybody watching it.',
				],
			},
			{
				heading: 'The human stays, with better tools',
				paragraphs: [
					'Every post still reaches a person before publication, and they can act at whatever granularity the problem deserves. Regenerate a single heading. Rewrite one paragraph they do not like. Send the entire post back if it missed.',
					'That granularity matters more than it sounds. Without it, a reviewer who dislikes one paragraph either accepts it or throws away a whole acceptable post, and in practice they accept it. Being able to fix exactly the sentence that is wrong is what keeps quality from drifting downward over hundreds of posts.',
					'Across several hundred posts in testing, the full-rewrite path was never used. Individual paragraph and heading regeneration was, which is the outcome the design was aiming at.',
				],
			},
		],
		approach: [
			'Replaced one-at-a-time prompting with batch runs configured once per cycle',
			'Put client, topic, and locality research ahead of drafting rather than inside it',
			'Split quality control into independent substance and format gates',
			'Added a prompt-rewriting agent so failures self-correct before reaching a person',
			'Built editing at heading, paragraph, and whole-post granularity',
		],
		delivered: [
			'Batch generation across many posts from a single configuration',
			'Client, topic, and locality research agents feeding every draft',
			'A substance gate covering accuracy, coverage, and hallucination',
			'A separate format gate enforcing house structure',
			'An automatic rewrite loop that re-runs both gates from scratch',
			'Human review with single-heading, single-paragraph, and full-post regeneration',
		],
		outcome: [
			'The team stopped supervising a chat window several hundred times a month',
			'Output quality stopped depending on which writer wrote the follow-up prompts',
			'Local and client specifics appear because they were researched, not guessed',
			'Across several hundred test posts, none needed a full rewrite',
		],
		capabilities: [
			'Multi-agent orchestration',
			'Automated quality control',
			'Hallucination checking',
			'Human-in-the-loop editing',
		],
		stackLabel: 'Built on',
		stack: [
			'LLM research agents for client, topic, and locality',
			'Writing agent',
			'Substance and format quality control agents',
			'Prompt-rewrite loop',
			'Batch runner',
			'Human review step',
		],
	},
	{
		slug: 'account-manager-checkin-agents',
		name: 'The Account Manager Who Never Forgets To Check In',
		category: 'Revenue operations',
		service: 'ai-systems',
		client: 'Agency account management team',
		summary:
			'Agents working from each account manager inbox that notice which clients have gone quiet, pull the relevant CRM context, and send a check-in that reads like the person whose name is on it.',
		challenge:
			'Client relationships were being lost to nothing more dramatic than forgetting. Account managers stayed on top of whoever emailed most recently, and the quiet accounts went untouched for months. Nobody could say which clients had not been contacted, because that information only existed as an absence.',
		stats: [
			{ value: 'Daily', label: 'Sweep across every account for contact gaps' },
			{
				value: 'Per-account',
				label: 'Configurable silence threshold rather than one blanket rule',
			},
			{
				value: '0',
				label: 'Accounts sitting quietly past their threshold unnoticed',
			},
		],
		sections: [
			{
				heading: 'Nobody forgets the loud clients',
				paragraphs: [
					'The accounts that get attention are the ones that ask for it. That is not negligence, it is how a full inbox works. Whatever arrived most recently sets the agenda, and a client who is quietly satisfied generates nothing to react to.',
					'The problem is that quiet and satisfied are not the same thing, and by the time the difference becomes visible it usually arrives as a cancellation. The team knew this and had tried the usual fixes: reminder tasks, a shared spreadsheet, a recurring calendar block. All of them worked for a few weeks.',
					'Every one of those solutions failed the same way. They required someone to maintain them during exactly the weeks they were too busy to maintain anything.',
				],
			},
			{
				heading: 'Working from the inbox, not beside it',
				paragraphs: [
					'The system connects to each account manager mailbox and reads the actual record of contact. Not a CRM field somebody was supposed to update, but the messages that genuinely went back and forth.',
					'That distinction is the whole design. A last-contacted field is only as good as the discipline of the person maintaining it, and the people who let accounts go quiet are the same people not updating the field. Reading the mailbox removes the dependency on the behaviour we were trying to fix.',
					'Every morning it sweeps every account, compares the real last contact against that account threshold, and produces a list of relationships going cold.',
				],
			},
			{
				heading: 'Context is what stops it reading like a robot',
				paragraphs: [
					'A check-in that says only that it has been a while is transparently automated and slightly insulting. Before drafting, the system pulls what the CRM knows: recent work, open items, what the last conversation was actually about, and where the account stands.',
					'The draft uses that. It asks about the specific thing that was in flight, references the work that shipped, and raises the question a manager who had been paying attention would raise. It goes out under the account manager name, from their mailbox, in their voice.',
					'Threshold length is set per account, not globally, because a strategic client and a small retainer do not need the same rhythm and a single blanket rule produces either nagging or neglect.',
				],
			},
			{
				heading: 'No new software',
				paragraphs: [
					'Worth being clear about what this was, because it is smaller than it sounds. There is no product here. The whole thing runs inside the Claude account the client already paid for, connected to Gmail and to their CRM.',
					'We considered building something and could not justify it. Everything the job needed already existed in tools they were subscribed to. Adding a system would have meant another login, another vendor, and another thing to maintain, in exchange for nothing the automation could not already do.',
					'That is frequently the right answer with agent work and it is rarely the one being sold. The interesting part was the design of what it checks and what it says, not the infrastructure underneath it.',
				],
			},
			{
				heading: 'What it changed about the team',
				paragraphs: [
					'The value the team named first was not the emails. It was no longer carrying the list in their heads. Remembering who has gone quiet is a low-grade background task that occupies attention all week and gets dropped the moment anything urgent lands.',
					'Handing that to something that runs every morning removed the drop. Coverage stopped being a function of how busy the week had been.',
					'The replies were the second surprise. A meaningful share of check-ins came back with actual work attached, because the client had been meaning to ask about something and had not gotten around to it either.',
				],
			},
		],
		approach: [
			'Read real inbox history instead of trusting a manually maintained CRM field',
			'Made the silence threshold per-account rather than one blanket rule',
			'Pulled CRM context so the check-in references something specific',
			'Sent from the account manager own mailbox, in their name and voice',
			'Ran the sweep daily so coverage does not depend on a quiet week',
		],
		delivered: [
			'Daily contact-gap detection across every account',
			'Per-account silence thresholds',
			'CRM-informed drafting that references live work',
			'Sending from the account manager own mailbox',
			'Visibility into which relationships are drifting, before they end',
		],
		outcome: [
			'Coverage stopped depending on how busy the week had been',
			'Quiet accounts surfaced while there was still time to act',
			'Check-ins returned real work the client had been meaning to raise',
			'The team stopped carrying the follow-up list in their heads',
		],
		capabilities: [
			'Inbox integration',
			'CRM context retrieval',
			'Scheduled agent runs',
			'Personalized outbound drafting',
		],
		stackLabel: 'Built on',
		stack: [
			"The client's own Claude account",
			'Gmail connection',
			'CRM integration',
			'Scheduled daily runs',
		],
	},
	{
		slug: 'google-ads-recommendation-agents',
		name: 'The Ads Audit That Runs Every Morning',
		category: 'Marketing intelligence',
		service: 'ai-systems',
		client: 'Performance marketing team',
		summary:
			'An agent platform that reads Google Ads performance daily and returns specific recommendations on negative keywords, geography, headlines and descriptions, and the landing page each ad actually points at.',
		challenge:
			'Account audits happened when someone had a free afternoon, which in practice meant monthly at best and usually when a client asked why performance had slipped. Wasted spend accumulated quietly in search terms nobody had reviewed, and nobody was checking whether the ad copy still matched the page it sent people to.',
		stats: [
			{
				value: 'Daily',
				label: 'Full account review instead of a monthly afternoon',
			},
			{
				value: '4 areas',
				label: 'Negatives, geography, ad copy, and the landing page behind it',
			},
			{
				value: 'Reviewed',
				label: 'Every recommendation is proposed, never applied automatically',
			},
		],
		sections: [
			{
				heading: 'Audits that only happen when someone has time',
				paragraphs: [
					'Everything in a paid account decays. Search terms drift toward irrelevance, geography that converted last quarter stops converting, and ad copy slowly stops matching the page behind it as the site gets updated by someone who does not run the ads.',
					'None of that decay announces itself. It shows up as a gradually worse cost per acquisition, which is exactly the kind of slow trend a busy team explains away for a month or two before investigating.',
					'The team knew what a good audit looked like. They simply could not run one across every account every week, so audits became reactive, triggered by a client noticing before they did.',
				],
			},
			{
				heading: 'Negative keywords and where the money leaks',
				paragraphs: [
					'The first agent works through search term data looking for spend that was never going to convert. Job seekers, students researching, people looking for a free version, competitor names being paid for at a premium, and the long tail of terms that are adjacent to the service but not the intent.',
					'It proposes negatives with the evidence attached: the term, what it cost, what it returned, and why it was flagged. That evidence matters, because a negative keyword list applied without review will eventually block something that was converting quietly.',
					'Geography gets the same treatment. Where the account is spending against where it is actually returning, surfaced as specific inclusions and exclusions rather than a heatmap somebody has to interpret.',
				],
			},
			{
				heading: 'Copy judged against what it is competing with',
				paragraphs: [
					'A second agent reviews headlines and descriptions, but not in isolation. An ad is only strong relative to the results around it, so the review considers what the ad has to sit next to, whether the value proposition is specific enough to distinguish it, and whether the copy still matches the intent of the terms it is now serving.',
					'Recommendations are written as replacement copy rather than advice. The output is a headline you could paste in, not a note suggesting the headline be made more compelling, because the second kind of feedback creates work rather than removing it.',
				],
			},
			{
				heading: 'The landing page is part of the ad',
				paragraphs: [
					'The piece the team valued most was the one that looks least like an ads tool. A third agent fetches and analyses the landing page each ad points to, and judges it against that specific ad rather than in general.',
					'It checks whether the promise in the headline is visible above the fold, whether the page confirms the offer the ad made, whether the call to action matches the intent of the keyword, and whether the page mentions the geography the ad is targeting. A perfectly written ad pointed at a page that does not confirm its promise is a slow leak, and it is invisible if you only ever look inside the ads platform.',
					'Those recommendations are the ones that most often sat outside the team remit, which is precisely why nobody had been making them.',
				],
			},
			{
				heading: 'Recommendations, not autopilot',
				paragraphs: [
					'Nothing is applied automatically, and that was a deliberate limit rather than a phase-one compromise. An agent can see that a term is expensive and unconverting. It cannot see that the term is a strategic bet on a market the client is entering next quarter.',
					'So the platform proposes, with reasoning and numbers attached, and a person decides. What changed is not who makes the call. It is that the call now gets put in front of them every morning instead of whenever someone has an afternoon free.',
				],
			},
		],
		approach: [
			'Replaced ad-hoc audits with a scheduled daily pass over every account',
			'Attached evidence and cost to every recommendation rather than a bare suggestion',
			'Wrote copy recommendations as paste-ready replacements, not advice',
			'Analysed the landing page against the specific ad pointing at it',
			'Kept every change behind human approval by design',
		],
		delivered: [
			'Daily automated review across connected Google Ads accounts',
			'Negative keyword proposals with spend and conversion evidence',
			'Geographic inclusion and exclusion recommendations',
			'Replacement headlines and descriptions ready to paste',
			'Landing page analysis judged against the ad that points to it',
		],
		outcome: [
			'Audits stopped being reactive to a client noticing first',
			'Wasted spend surfaced within a day instead of at month end',
			'Landing page mismatches became visible to the team running the ads',
			'Every change still passed through a person who could veto it',
		],
		capabilities: [
			'Performance data analysis',
			'Automated recommendations',
			'Landing page evaluation',
			'Scheduled agent runs',
		],
		stackLabel: 'Built on',
		stack: [
			'Google Ads API',
			'LLM analysis agents',
			'Landing page fetch and analysis',
			'Scheduled daily runs',
		],
	},
	{
		slug: 'ticket-routing-workflow',
		name: 'The Ticket Queue That Routes Itself',
		category: 'Process automation',
		service: 'workflow-automation',
		client: 'Client services team',
		summary:
			'Intake, assignment, and every client update automated around the ticketing platform they already owned. One person stopped being the router, and nobody had to write a status email again.',
		challenge:
			'Every ticket that came in landed with one person, who read it, worked out which team it belonged to, decided who had capacity, and assigned it by hand. Nothing moved until they had done that. When they were in a meeting, tickets waited. When they were on holiday, the queue backed up for a week and clients heard nothing at all.',
		stats: [
			{
				value: 'On submit',
				label: 'Tickets reach the right person the moment the form is sent',
			},
			{
				value: '5 stages',
				label:
					'Points where the client is updated without anyone writing an email',
			},
			{
				value: '0',
				label:
					'Platforms replaced. The ticketing system stayed exactly where it was',
			},
		],
		sections: [
			{
				heading: 'One person was the entire routing layer',
				paragraphs: [
					'The ticketing platform was fine. That is worth saying first, because the instinct in this situation is to blame the tool and go shopping. The tool held tickets, tracked status, and reported perfectly well. What it did not do was decide who should pick something up, and that decision had quietly become one person entire morning.',
					'They were good at it. That was part of the problem. Because they knew which team handled which request type and who was already buried, the routing knowledge lived in their head rather than anywhere written down. The queue moved at exactly the speed of one human reading it.',
					'The failure mode was predictable and kept happening. Any day that person was unavailable, tickets sat unassigned. Clients did not know whether their request had been received, so they emailed to ask, which produced more inbound for the same person to handle.',
				],
			},
			{
				heading: 'Routing is a decision, and decisions can be written down',
				paragraphs: [
					'We started by extracting what that person was actually doing. Not what the process document said, but the real logic: this request type always goes to that team, this kind of client goes to the senior person, anything mentioning billing gets handled separately regardless of what the client selected.',
					'That produced a routing table. Once the rules existed as data rather than as expertise, the intake form could do the work. The form asks the questions that determine routing, and the answers drive assignment directly, so the ticket lands on the right person at submission rather than after a triage pass.',
					'The rules stayed editable, because routing logic is never finished. Teams change, people leave, new request types appear. A rules engine that requires a developer to adjust becomes wrong within a quarter and then gets worked around.',
				],
			},
			{
				heading: 'The client hears something immediately',
				paragraphs: [
					'The moment a ticket is submitted, the client gets confirmation that it arrived, what it was logged as, and a realistic expectation of how long that type of request takes. That acknowledgement alone removed a meaningful share of the inbound email, because most of those follow-ups were people checking whether their request had vanished.',
					'Assignment triggers the next message, and it names the person. Not a queue, not a department, a name. Being told that Natalie has your ticket and will pick it up shortly is a different experience from being told your ticket is in the queue, even when the wait is identical.',
					'That detail took almost no engineering and changed the tone of the whole thing more than anything else we built.',
				],
			},
			{
				heading: 'Every stage speaks for itself',
				paragraphs: [
					'When work finishes and the ticket enters quality control, the client is told that too, and told what quality control means: someone is reviewing the work to check nothing was missed and that it meets the standard before it comes back.',
					'That message was the one the team was most sceptical about and the one clients responded to best. It reframes a delay as diligence. Silence during review reads as being ignored; being told the work is under review reads as care.',
					'When QC approves, the closing message goes out automatically, confirming the work is complete and inviting anything else. Nobody on the team writes any of these. They fire off the status the platform already tracks.',
				],
			},
			{
				heading: 'We did not touch the platform',
				paragraphs: [
					'No migration, no replacement, no retraining on new software. The team works in the same system they worked in before, and the entire build sits around it: the intake form feeding it, the routing logic assigning within it, and the messages triggered by the status changes it was already recording.',
					'The automation itself runs on Make, which is what this client already had a subscription to. We do not have a preferred platform, and the answer has been Zapier and n8n on other engagements depending on what the team already paid for and could maintain.',
					'That was a deliberate scope decision. A replacement would have cost several times as much, put the queue at risk during the transition, and solved a problem the platform never had. What was missing was the connective tissue, and connective tissue is much cheaper to build than a system of record.',
				],
			},
		],
		approach: [
			'Extracted the real routing logic from the person who had been doing it by hand',
			'Turned that logic into an editable rules table instead of hard-coded branching',
			'Rebuilt intake so the form captures exactly what routing needs to decide',
			'Attached client messaging to the status changes the platform already tracked',
			'Deliberately left the ticketing platform itself untouched',
		],
		delivered: [
			'A structured intake form that drives assignment directly',
			'Rules-based routing to the correct person and team on submission',
			'Immediate acknowledgement with a realistic expectation for that request type',
			'Assignment notification naming the person who owns the ticket',
			'Quality control and completion notifications fired by status change',
			'An editable rules table the team maintains without a developer',
		],
		outcome: [
			'Tickets stopped waiting on one person being at their desk',
			'Holiday and sick days no longer backed the queue up for a week',
			'Chasing emails dropped because clients knew where their ticket stood',
			'Routing knowledge moved out of one head and into something maintainable',
		],
		capabilities: [
			'Workflow design',
			'Rules-based routing',
			'Automated client communication',
			'Systems integration',
		],
		stackLabel: 'Built on',
		stack: [
			'Their existing ticketing platform',
			'Make',
			'Custom intake form',
			'Webhooks and REST APIs',
			'Transactional email',
		],
	},
	{
		slug: 'signature-to-onboarding-workflow',
		name: 'From Signature To Kickoff Without A Handoff',
		category: 'Sales operations',
		service: 'workflow-automation',
		client: 'Professional services firm',
		summary:
			'A signed agreement now starts onboarding on its own: tasks assigned, the client updated at each step, the kickoff call scheduled against real calendars, and a portal where they hand over access without an email thread.',
		challenge:
			'Sales closed a deal and then onboarding started whenever somebody noticed. The signed agreement landed in an inbox, and the tasks that followed depended on a salesperson remembering to tell operations, operations remembering to assign the work, and someone chasing the client for the documents and the access nobody had asked for yet. New clients experienced their first week as silence.',
		stats: [
			{
				value: 'On signature',
				label:
					'Onboarding starts when the agreement is signed, not at the next standup',
			},
			{
				value: 'Same day',
				label: 'Kickoff scheduling offered instead of starting an email thread',
			},
			{
				value: '0',
				label:
					'Onboarding steps that rely on somebody remembering to begin them',
			},
		],
		sections: [
			{
				heading: 'The worst week to go quiet is the first one',
				paragraphs: [
					'A client signs at the peak of their confidence in you. What happens next either confirms that decision or starts eroding it, and in this firm what happened next was usually nothing visible for several days.',
					'Not through neglect. The signed document arrived, the salesperson moved to the next deal, and the handoff to operations happened at whatever meeting came next. Every step after that was somebody remembering: assign the build tasks, request the documents, get access to the accounts, book the kickoff.',
					'Each individual gap was small. Stacked together they meant a client who had just committed money spent their first week wondering whether anything was happening. That is an expensive impression to create and a hard one to undo.',
				],
			},
			{
				heading: 'The signature is the only trigger that is never ambiguous',
				paragraphs: [
					'We hung the entire workflow off the completed signature event. It is unambiguous, it is timestamped, and unlike a CRM stage it cannot be forgotten, entered late, or disagreed about. The deal is either signed or it is not.',
					'The moment it completes, the whole onboarding sequence assigns itself. Website build tasks go to the build team, document collection is raised against the right owner, the account setup work is created, and the kickoff scheduling starts, all with the client details already populated from the agreement rather than retyped.',
					'Nobody has to be told the deal closed. The work exists before anyone would have gotten around to mentioning it.',
				],
			},
			{
				heading: 'Scheduling the kickoff without the email thread',
				paragraphs: [
					'Kickoff calls were reliably the slowest part of onboarding, because arranging one meant a thread proposing times, checking internal availability, and going back with alternatives. Days went by on scheduling alone.',
					'The workflow reads the internal calendars of the people who need to attend and finds genuine mutual availability rather than proposing times someone then has to decline. Where that produces a clean slot, it books it. Where it does not, or where the client would rather choose, it sends a link to pick from the times that actually work.',
					'Both paths end the same way, with a booked call and everyone invited. What disappears is the thread.',
				],
			},
			{
				heading: 'The client is told what is happening, each time',
				paragraphs: [
					'Every stage sends the client something. The agreement is received and onboarding has begun. The build has been assigned. The kickoff is booked. Documents are outstanding, here is exactly which ones.',
					'The document chasing message mattered more than expected. Previously somebody had to notice that a client had not sent something and write an awkward reminder, which meant it happened late or not at all. Automated, it is neutral, timely, and nobody has to feel like a nag to send it.',
					'The client experience changes from silence punctuated by requests, to a sequence where they always know what stage they are in and what is waiting on them.',
				],
			},
			{
				heading: 'Where a workflow was not enough',
				paragraphs: [
					'One part of onboarding could not be solved by automation, and it is worth being clear about that. Granting access to accounts and platforms was genuinely painful, and no amount of email sequencing fixes it. Credentials in email threads are both insecure and confusing, and clients frequently do not know how to grant the access being asked for.',
					'So this engagement included building a small client onboarding portal. The client logs in, sees exactly what access is needed and why, and grants it through a guided flow rather than pasting passwords into an email.',
					'That is a custom software build living inside a workflow project, and it existed because the honest answer to that particular step was that connecting existing tools would not have solved it. Everything else here is workflow. That piece is not, and pretending otherwise would have produced a worse result.',
				],
			},
		],
		approach: [
			'Triggered the entire sequence off the completed signature rather than a CRM stage',
			'Mapped who genuinely owns each onboarding task before automating any assignment',
			'Populated tasks from the agreement instead of asking anyone to retype client details',
			'Read real calendar availability, with a booking link as the fallback path',
			'Built a portal for the access step, because sequencing alone would not have fixed it',
		],
		delivered: [
			'Signature-triggered onboarding with automatic task assignment',
			'Website build, document collection, and account setup all kicked off together',
			'Calendar-aware kickoff scheduling with a self-service booking fallback',
			'Client notifications at each stage, including targeted document chasing',
			'A client onboarding portal for granting access without emailing credentials',
		],
		outcome: [
			'New clients stopped experiencing their first week as silence',
			'Onboarding no longer waited on a handoff conversation between sales and operations',
			'Kickoff calls got booked in a day instead of over a scheduling thread',
			'Access handover stopped moving credentials through email',
		],
		capabilities: [
			'Workflow design',
			'E-signature and CRM integration',
			'Calendar automation',
			'Client portal',
		],
		stackLabel: 'Built on',
		stack: [
			'E-signature platform',
			'Their CRM',
			'Zapier',
			'Calendar APIs',
			'Next.js and TypeScript for the portal',
			'MongoDB',
			'Vercel',
		],
	},
]

export const featuredProjects = projects.filter((project) => project.featured)

/** The Portfolio is a gallery of shipped interfaces, so it only carries builds. */
export const shippedProjects = projects.filter((project) => project.image)

export const projectsForService = (slug: Service['slug']) =>
	projects.filter((project) => project.service === slug)

export const serviceName = (slug: Service['slug']) =>
	services.find((service) => service.slug === slug)?.name ?? slug

/** One case study per service. The navigation shows these rather than all of them. */
export const caseStudyHighlights = services
	.map((service) => projectsForService(service.slug)[0])
	.filter((project): project is Project => Boolean(project))

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
		answer: 'You do. The code, the systems, and the documentation are yours.',
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
		items: [
			'API integrations',
			'Data synchronization',
			'Legacy system bridges',
		],
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
		title: 'You talk to the team building it',
		body: 'No account layer between you and the work. The engineers who understand your process are the ones writing the code.',
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
