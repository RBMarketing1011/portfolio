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

export type Insight = {
	slug: string
	category: string
	title: string
	excerpt: string
	readTime: string
	date: string
	body: { heading: string; paragraphs: string[] }[]
}

const insightEntries: Insight[] = [
	{
		slug: 'where-ai-actually-pays-off',
		category: 'AI',
		title: 'Where AI actually pays off in a small business',
		excerpt:
			'Most AI pilots fail because they start with the technology instead of a job that costs real money. Here is the filter we use.',
		readTime: '9 min',
		date: '2026-02-18',
		body: [
			{
				heading: 'Start with the expensive hour, not the exciting demo',
				paragraphs: [
					'The AI projects that survive contact with a real business have one thing in common. They were pointed at a task someone was already paying for, repeatedly, every week. Not a capability someone found impressive in a demo, a line item that already existed.',
					'That ordering matters because it determines what success looks like before anything is built. If you cannot name the hour it gives back or the error it prevents, you have a demo rather than a project, and demos are extremely good at surviving review meetings without ever producing a number.',
					'It also protects you from the most common failure, which is not technical. It is finishing a build that works exactly as specified and changes nothing about the business, because the thing it automated was not costing anybody very much.',
				],
			},
			{
				heading: 'Three shapes that consistently work',
				paragraphs: [
					'Reading things. Invoices, applications, contracts, inbound email. Anything where a person currently opens a document and types what they see into another system. This is the highest-yield category in most small businesses because the work is genuinely mechanical and the volume is usually larger than anyone estimates.',
					'Drafting things. First-pass quotes, responses, summaries, and reports that a human then edits. The value here is removing the blank page, not removing the person, and framing it that way is also what makes it acceptable to the team doing the work.',
					'Sorting things. Routing, triage, and classification. Deciding what matters and who should see it next. This one is underrated because the time it saves is distributed in small pieces across many people, which makes it invisible until you measure it.',
				],
			},
			{
				heading: 'The shapes that consistently disappoint',
				paragraphs: [
					'Anything requiring judgement that the experienced person cannot fully articulate. If the rule cannot be written down, it is usually contextual rather than absent, and a system that automates the visible steps while discarding the context fails precisely in the cases that mattered.',
					'Anything with low volume and high variation. A task performed twice a year is not worth building for regardless of how irritating it is, and irritation is a poor proxy for cost.',
					'Anything where being wrong is expensive and hard to detect. Those situations need a person, and adding one back removes most of the saving you were projecting.',
				],
			},
			{
				heading: 'Keep a person where the stakes are',
				paragraphs: [
					'The useful question is not whether the model is right every time. It is what happens when it is wrong, and that answer should differ by task rather than being set globally.',
					'Where a mistake is cheap and reversible, let it run unsupervised. Where a mistake costs money or trust, keep a review step. That single distinction separates the systems that get adopted from the ones quietly turned off after an incident.',
					'It is also what makes sceptical teams comfortable. Resistance to AI drops sharply when people can see exactly which decisions the system is allowed to make on its own, and that the consequential ones still come to them.',
				],
			},
			{
				heading: 'Cost the running, not just the building',
				paragraphs: [
					'AI systems have an ongoing cost that traditional software largely does not. Every call is a charge, and a process running thousands of times a month has a bill that scales with your success.',
					'Size it before building. Most business tasks do not require the largest available model, and a meaningful share of what people reach for AI to do is handled better and more cheaply by ordinary code.',
					'Then compare that running cost against the hours it returns. A system that costs a few hundred a month and saves a day a week is obviously worth it. One that costs the same and saves twenty minutes is not, and you want to know which you have before you commit.',
				],
			},
			{
				heading: 'Decide how you will know',
				paragraphs: [
					'Build an evaluation set from your own real examples before anything goes live. Fifty representative cases with known correct answers turns accuracy from an impression into a number you can defend.',
					'Set the bar against the manual process rather than against perfection. Human error rates in repetitive work are higher than anyone assumes, mostly because nobody has ever measured them.',
					'Then keep measuring. A system that passed in March can degrade quietly when a model version changes underneath it, and without a standing evaluation you will find out from a complaint rather than from a dashboard.',
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
		readTime: '8 min',
		date: '2026-01-27',
		body: [
			{
				heading: 'Automation is an amplifier',
				paragraphs: [
					'Point it at a clean process and you get leverage. Point it at a confused one and you get the same confusion at higher volume, arriving faster, and now harder to see because it is happening inside a system rather than on somebody desk.',
					'This is the single most common way automation projects go wrong, and it is rarely diagnosed correctly afterwards. The automation gets blamed when the process it encoded was already broken, and the blame is misplaced enough that the same mistake gets repeated with the next tool.',
					'Before connecting two systems, you should be able to describe the handoff in one sentence. If you cannot, the problem is not technical and no amount of engineering will resolve it.',
				],
			},
			{
				heading: 'Pick work that is boring and repeated',
				paragraphs: [
					'Good first candidates are high frequency, low judgement, and clearly defined. Copying data between systems. Sending the same follow-up. Generating the same weekly report. Nothing about these is interesting, which is exactly why they work.',
					'Bad first candidates are the exceptions everyone argues about. Those cases need a decision from the business, not a script, and trying to encode an unresolved disagreement produces a system that satisfies nobody.',
					'The instinct is to start with the hardest thing because that is where the pain is loudest. Resist it. Finishing something builds the momentum that carries a programme, and complexity early buys you a long stretch with nothing working.',
				],
			},
			{
				heading: 'Decide who owns each piece of data first',
				paragraphs: [
					'Most sync problems are governance problems wearing a technical costume. Two systems both believing they own the customer record will conflict forever, and no clever merge logic fixes a decision nobody has made.',
					'Assign one owner per field. This system is authoritative for contact details, that one for billing, and the data flows one way. Once that is settled, the engineering becomes straightforward.',
					'That conversation is frequently the most valuable hour of an integration project, and it involves no code at all.',
				],
			},
			{
				heading: 'Make failure loud',
				paragraphs: [
					'The real risk with automation is silent failure. A job stops running and nobody notices for a month, because the absence of output looks exactly like the absence of work.',
					'Every automation should assert something about what it expected. A nightly job that normally processes between forty and four hundred records should treat zero as an alert, and four thousand as one too.',
					'It also needs a heartbeat that lives outside the job itself, because a process that is not running cannot report that it is not running. Fast detection is the difference between a Tuesday afternoon fix and six months of quietly corrupted data.',
				],
			},
			{
				heading: 'Give exceptions somewhere to go',
				paragraphs: [
					'Every automation eventually meets input it was not designed for. What it does then is a business decision, and the easiest thing to build is usually the wrong one: skip the record and carry on.',
					'Skipped records accumulate invisibly. The safer default is to stop and route the case to a person with enough context to resolve it, which means the exception path needs designing rather than being an afterthought.',
					'A log file is not a person. If the only record of a problem is a line nobody reads, you have documentation rather than detection.',
				],
			},
			{
				heading: 'Write down what the automation assumes',
				paragraphs: [
					'Every automation encodes assumptions about how the business works. Which statuses exist, what a category means, who handles what. Those assumptions are invisible once the thing is running.',
					'When someone renames a status or restructures a team six months later, the automation breaks or, worse, quietly does the wrong thing. Having the assumptions written down turns that from a mystery into a checklist.',
					'It is also what lets somebody other than the original builder maintain it, which is the difference between an asset and a liability.',
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
		readTime: '8 min',
		date: '2026-01-09',
		body: [
			{
				heading: 'Buy anything that is not your advantage',
				paragraphs: [
					'Accounting, email, payroll, storage, ticketing. These are solved problems with mature products, and paying for them is dramatically cheaper than owning them. No customer has ever chosen a supplier because of their expense tool.',
					'The test is whether the process is a source of advantage. If doing it differently from everyone else is part of why customers pick you, that is a candidate for building. If it is simply something the business has to do, buy it and move on.',
					'This sounds obvious and gets violated constantly, usually because a product does ninety percent of what is needed and the missing ten percent feels intolerable. It is almost always cheaper to adapt to the ten percent than to own the ninety.',
				],
			},
			{
				heading: 'The workaround is the signal',
				paragraphs: [
					'The clearest sign a build is justified is a workaround that has become permanent. A spreadsheet shadowing the real system. A person whose actual job is moving data between two tools. A report rebuilt by hand every month.',
					'Those workarounds have a running cost nobody puts on a budget line, which is why they persist. The spreadsheet does not appear in any software spend review, so its cost is invisible while the subscription that would replace it is not.',
					'Add up the hours honestly and the comparison often reverses. A permanent workaround consuming a day a week is a substantial annual cost, and it is a cost that grows with the business.',
				],
			},
			{
				heading: 'Check what you already own before deciding',
				paragraphs: [
					'Before pricing a build, audit the software you already pay for. Licensed modules that were never configured are one of the most common findings in an assessment, and they are the cheapest possible thing to act on.',
					'A dormant feature rarely covers the whole need, and it is worth being honest about that rather than overselling it. But the comparison is not against a perfect solution, it is against a build with a budget and a maintenance burden.',
					'Something that covers seventy percent and takes two days to configure usually wins decisively. It also narrows whatever build is still required, which makes that build cheaper and more likely to land.',
				],
			},
			{
				heading: 'Price the replacement honestly',
				paragraphs: [
					'When the option on the table is replacing an existing system, the quoted figure covers licensing and implementation and almost never covers migration, retraining, or the history you lose.',
					'Years of records are not just data. They are pricing precedent and customer context, and in businesses that quote work based on what similar jobs cost, losing that is a direct hit to margin.',
					'Ask specifically what does not come across, and schedule the transition away from your peak period. Both questions change the arithmetic more than the licence price does.',
				],
			},
			{
				heading: 'Leaving it alone is a real option',
				paragraphs: [
					'Some inefficiency is cheaper than the software required to remove it. A task taking twenty minutes a month does not need a system, however annoying it is when it comes round.',
					'The number that matters is total annual handling time, not how irritating the task feels. A twenty-minute job done weekly costs far more than a two-day job done once a year, even though the second one generates more complaints.',
					'A good assessment tells you what not to build. That list is usually longer than the build list, and it saves more money than anything on it.',
				],
			},
			{
				heading: 'When the decision is genuinely close',
				paragraphs: [
					'Sometimes buying and building are within range of each other. In that case, prefer the option that is easier to reverse. A subscription you can cancel is a smaller commitment than a codebase you now own.',
					'Consider also who maintains it. A build means you are responsible for it forever, which is fine if you have the capacity and a real problem if the person who understands it leaves.',
					'And start narrow either way. One workflow, one team, in production tells you more about the right answer than another month of comparison.',
				],
			},
		],
	},
	{
		slug: 'what-an-assessment-finds',
		category: 'Assessment',
		title: 'What we actually find in an operations assessment',
		excerpt:
			'The same handful of problems show up in nearly every business we walk through. Here is the pattern, and why none of it is anyone fault.',
		readTime: '9 min',
		date: '2025-12-12',
		body: [
			{
				heading: 'Data entered more than once',
				paragraphs: [
					'It shows up in almost every business. The same customer information typed into a quote, then an invoice, then a scheduling tool, then a spreadsheet somebody keeps for reporting. Four entries of one fact.',
					'Each retype is a chance to introduce an error, and every downstream report inherits it. Worse, the copies drift, so when two systems disagree there is no principled way to decide which is right.',
					'Nobody designed this. It accumulated, one reasonable decision at a time, as the business grew faster than the systems connecting it.',
				],
			},
			{
				heading: 'Knowledge that lives in one person',
				paragraphs: [
					'There is usually one person who knows how the exceptions work. Which client needs a call before arrival, which job type always takes longer than quoted, which supplier will accept a late order. None of it is written down, because they have always been there.',
					'This is an operational risk long before it is a software problem. It surfaces the first time that person takes a holiday, and it becomes acute the day they leave.',
					'They are usually very good at their job, which is part of the trap. Because they handle it well, nobody has ever needed to formalise it, so the dependency deepens quietly.',
				],
			},
			{
				heading: 'Reports nobody trusts',
				paragraphs: [
					'When two systems disagree about a number, people stop believing either and revert to instinct. Once that happens, the reporting infrastructure is a cost with no benefit, because decisions are being made without it.',
					'The root cause is almost never a bug. It is that both systems are correct according to their own definitions, and nobody has decided which definition is the company one.',
					'Fixing that is a business decision rather than an engineering one, and restoring trust in the numbers is often worth more than any single automation on the roadmap.',
				],
			},
			{
				heading: 'Software paid for and not used',
				paragraphs: [
					'Licensed modules sitting unconfigured turn up in most assessments. Something was bought to solve a specific problem, configured narrowly, and renewed annually by somebody comparing this year invoice to last year.',
					'Meanwhile the vendor ships features into your tier and nobody is assigned to notice. It is a process gap, not negligence, and it stays open indefinitely because no role owns it.',
					'It is also the cheapest finding to act on, which makes it a good early win in any programme.',
				],
			},
			{
				heading: 'The number that justified the project is usually wrong',
				paragraphs: [
					'Most businesses arrive with a figure attached to the problem. Lost revenue from missed calls, hours lost to paperwork, deals lost to slow response. That number is what got the budget approved.',
					'It is very often derived from a report that cannot distinguish between similar-looking events. Unanswered calls that were immediately called back get counted as lost customers. Time spent on paperwork gets estimated from how long the work feels.',
					'Testing that number against actual records is frequently the highest-value thing an assessment does, because it either confirms the plan or redirects the budget before it is spent.',
				],
			},
			{
				heading: 'Work that should not exist at all',
				paragraphs: [
					'Every operation carries vestigial processes. A report produced for a decision nobody makes anymore. A form completed for a person who left. An approval step added after an incident a decade ago.',
					'These survive because stopping requires someone to take responsibility for stopping, and continuing requires nothing. So they continue.',
					'Deleting a process is the highest return available, and it is the one thing no vendor will ever recommend, because there is nothing to sell attached to it.',
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
		readTime: '8 min',
		date: '2025-11-20',
		body: [
			{
				heading: 'It has to be faster than the workaround',
				paragraphs: [
					'People do not resist new tools out of stubbornness. They resist tools that are slower than the spreadsheet they already have, and they work that out considerably faster than whoever is measuring adoption.',
					'If the new system takes more clicks to do the common thing, it loses, regardless of how much better it is in theory or how complete its data model is.',
					'Count the interactions for the frequent case and compare them honestly against the old way. That comparison predicts adoption better than any amount of enthusiasm in a requirements meeting.',
				],
			},
			{
				heading: 'Design for the frequent path',
				paragraphs: [
					'Most internal tools are designed around the full feature set rather than the one screen a user opens forty times a day. Every field has an advocate in the specification meeting, and none of those advocates are the person who has to fill them in.',
					'Make the frequent path effortless and bury the rare one. Optimising for the common case at the expense of the exception feels wrong when you are writing the spec and is almost always correct in production.',
					'Every field you remove is a field that cannot be filled in wrong, which improves data quality at the same time as adoption.',
				],
			},
			{
				heading: 'Beware data entry that benefits somebody else',
				paragraphs: [
					'A reliable adoption killer is asking one person to enter data purely so another person can have a report. The cost is immediate and personal; the benefit is invisible and belongs to someone the user may never meet.',
					'Sometimes it is genuinely necessary. When it is, make it as cheap as possible and close the loop so the person entering the data sees something useful come back. Silence guarantees the discipline decays.',
					'Where it is not necessary, cut it. A lot of mandatory fields exist because somebody once thought the information might be useful, not because anyone uses it.',
				],
			},
			{
				heading: 'Ship it in front of people early',
				paragraphs: [
					'The gap between what someone describes in a meeting and what they actually do is enormous, and it is not dishonesty. Expertise makes steps invisible, so people genuinely cannot narrate their own routine accurately.',
					'Working software in front of a real user in week two prevents months of building the wrong thing. It also surfaces the informal steps nobody mentioned because they had stopped noticing them.',
					'An hour watching someone work is usually worth several hours of requirements meetings.',
				],
			},
			{
				heading: 'Roll out to one team first',
				paragraphs: [
					'Launching to everyone at once means discovering adoption problems at maximum blast radius, after the design has become expensive to change.',
					'One team, one workflow, in production surfaces the same problems while fixing them is still cheap. It also produces the most persuasive thing available: colleagues telling other colleagues that it is genuinely faster.',
					'The people who resisted hardest often make the best pilot group, because they will tell you exactly what is wrong instead of being polite about it.',
				],
			},
			{
				heading: 'Adoption is a metric, so watch it',
				paragraphs: [
					'Decide before launch what usage should look like and then actually check. Not a satisfaction survey, which measures politeness, but whether the thing is being opened and whether the old workaround has stopped.',
					'If the shadow spreadsheet reopens, you did not replace it. You added a system beside it, and that is worse than before because now there are two places to look.',
					'Being willing to change the tool in response to that signal is what separates internal software that survives from internal software that gets quietly abandoned.',
				],
			},
		],
	},
	{
		slug: 'ai-readiness',
		category: 'AI',
		title: 'Is your business actually ready for AI?',
		excerpt:
			'A short, honest checklist. Most companies are ready for two of these and not the rest, and knowing which is the useful part.',
		readTime: '7 min',
		date: '2025-11-04',
		body: [
			{
				heading: 'Your data has to be reachable',
				paragraphs: [
					'AI cannot use knowledge trapped in a filing cabinet, a PDF nobody can query, or a system with no export. Readiness usually means getting the information somewhere it can be accessed first.',
					'That work is unglamorous and it is most of the project. Teams are frequently surprised that the AI portion of an AI project is the small part, and that the majority of the effort goes into plumbing.',
					'It is also work that pays off regardless. Data you can reach is useful for reporting, for integration, and for whatever you decide to do next, even if the AI idea is abandoned.',
				],
			},
			{
				heading: 'The process has to be stable enough to encode',
				paragraphs: [
					'If a workflow is being redesigned next quarter, building on it now means throwing the build away with the process. The same applies to processes wrapped around a system you are actively considering replacing.',
					'Stability does not mean perfection. It means the shape of the work is settled enough that the assumptions you encode will still hold in six months.',
					'Where a process is genuinely in flux, the honest recommendation is to wait, or to automate at a layer that will survive the change.',
				],
			},
			{
				heading: 'Someone has to own the outcome',
				paragraphs: [
					'Projects without a named owner drift. Someone inside the business needs to care whether this works, and to have enough authority to make decisions when the design meets reality.',
					'That person does not need to be technical. They need to know the process well enough to say when the output is wrong, which is a completely different qualification and much harder to substitute.',
					'When nobody will take that role, it is usually a signal that the problem is not painful enough to justify the project.',
				],
			},
			{
				heading: 'You have to be able to say what wrong looks like',
				paragraphs: [
					'Before anything is built, somebody has to be able to look at an output and judge it. If nobody in the business can reliably distinguish a good result from a plausible-looking bad one, you cannot evaluate the system and you cannot safely deploy it.',
					'This is the readiness criterion most often missed, because it sounds obvious and is frequently untrue in practice. Plenty of processes produce output that only one person can assess, and sometimes not even them.',
					'Where that is the case, the first piece of work is defining the standard, not building the system.',
				],
			},
			{
				heading: 'You need a way to tell if it worked',
				paragraphs: [
					'Decide the measure before the build. Hours returned, errors avoided, response time cut, percentage of cases handled without escalation. Any of these is fine; having none is not.',
					'Baseline it first, while the old process still exists. Once it is gone, the previous cost becomes a matter of recollection, and recollection is generous in whichever direction suits the person recalling.',
					'Without a measure, every conversation about the system becomes an argument about impressions, and the system survives or dies on politics rather than results.',
				],
			},
			{
				heading: 'Somebody has to be prepared to switch it off',
				paragraphs: [
					'Set a review date before you start. Ninety days is usually about right: long enough for novelty to fade, short enough to still act.',
					'Then look honestly, including at the possibility that it did not work. The ability to retire something is what makes it safe to try things in the first place.',
					'A portfolio where nothing is ever switched off is not a portfolio. It is an accumulation, and every item in it has a maintenance cost somebody is paying.',
				],
			},
		],
	},
	{
		slug: 'the-spreadsheet-is-the-spec',
		category: 'Strategy',
		title: 'The spreadsheet your team built is the best spec you have',
		excerpt:
			'Every business has a shadow spreadsheet holding the operation together. Most software projects throw it away. That is a mistake, and an expensive one.',
		readTime: '8 min',
		date: '2026-08-24',
		body: [
			{
				heading: 'The file nobody admits to',
				paragraphs: [
					'Almost every operation we walk into has one. A spreadsheet, sometimes several, sitting beside the real system, holding the information the real system could not accommodate. Gate codes. Which crews can handle which buildings. Which client hates being called before ten. The exceptions that make the business work.',
					'Nobody is proud of it. It usually gets introduced apologetically, as the thing they know they should have moved into the platform by now. That apology is the reason it gets discarded during projects, and discarding it is how you end up rebuilding it.',
					'Because the spreadsheet is not a workaround. It is a specification, written in the only language available to the person who wrote it, refined against reality every single day for years.',
				],
			},
			{
				heading: 'What a mature spreadsheet actually encodes',
				paragraphs: [
					'Look at the columns. Each one exists because somebody needed that information often enough to make a place for it. Nobody adds a column speculatively; they add it after the third time they had to go and find that fact.',
					'Look at the conditional formatting and the ad hoc colour coding. Those are business rules. Red means something specific to the person maintaining it, and that meaning is a rule your new system will need to encode or consciously discard.',
					'Look at what is missing too. A field the platform offers that nobody bothered to duplicate is a field that does not matter to the actual work, whatever the vendor documentation says.',
				],
			},
			{
				heading: 'Why projects throw it away anyway',
				paragraphs: [
					'Partly embarrassment. The spreadsheet feels like evidence of disorganisation, so it gets minimised in requirements conversations rather than examined.',
					'Partly because it is unglamorous. Reading someone else spreadsheet carefully is tedious work that produces no visible progress, and it competes with the much more satisfying activity of designing something new.',
					'And partly because requirements gathering usually happens with managers rather than with the person maintaining the file. Managers describe the process as designed. The spreadsheet describes it as it runs.',
				],
			},
			{
				heading: 'How to read one properly',
				paragraphs: [
					'Sit with the person who owns it and go column by column. Ask why each one exists and what happens when it is wrong. You will get a story for most of them, and the story is the requirement.',
					'Pay attention to anything maintained manually that could have been a formula. That is usually a place where the rule is too subtle to express mechanically, which means it needs a human decision point in whatever you build.',
					'Check the edit history if you can. Columns added recently are live problems. Columns nobody has touched in a year are candidates for deletion, and deleting a requirement is worth as much as discovering one.',
				],
			},
			{
				heading: 'Migrate the logic, not just the data',
				paragraphs: [
					'Most migrations move the rows and lose the reasoning. The new system holds the same information and none of the rules, so within a quarter someone opens a fresh spreadsheet beside it and the cycle restarts.',
					'The test of a successful replacement is not whether the data arrived. It is whether the shadow file stayed closed. If it reopens, you did not replace the spreadsheet, you added a system next to it.',
				],
			},
		],
	},
	{
		slug: 'automation-fails-silently',
		category: 'Automation',
		title: 'The worst automation failure is the one nobody notices',
		excerpt:
			'An automation that breaks loudly gets fixed the same day. One that fails quietly can corrupt six months of data before anyone asks a question.',
		readTime: '7 min',
		date: '2026-07-30',
		body: [
			{
				heading: 'Loud failure is a feature',
				paragraphs: [
					'When an automation crashes and someone gets an alert, the system worked. It failed in the way a system is supposed to fail: visibly, immediately, and to a person who can do something about it.',
					'The dangerous failure is different. The automation runs, completes, reports success, and does the wrong thing. Or it stops running entirely and nothing tells anyone, because absence of output looks identical to absence of work.',
					'That second category is what turns automation from a time saving into a liability, and it is almost always a design omission rather than a bug.',
				],
			},
			{
				heading: 'How silent failure actually happens',
				paragraphs: [
					'A vendor changes an API response and a field arrives empty instead of missing. Your automation writes the empty value confidently, every day, and the data degrades slowly enough that nobody spots a step change.',
					'A scheduled job stops firing. There is no error because nothing ran, and the only symptom is that a report someone skims looks slightly lighter than usual.',
					'A rule matches fewer records than it should because a category was renamed upstream. The automation still processes everything it finds. It just finds less, and nothing in the design says how much it should have found.',
				],
			},
			{
				heading: 'Design for the absence of output',
				paragraphs: [
					'The fix is unglamorous: every scheduled automation should assert something about what it expected. If a nightly job normally processes between forty and four hundred records, zero is an alert and four thousand is an alert.',
					'A heartbeat matters as much as an error. Something should notice that a job which runs daily has not run in two days, and that has to live outside the job itself, because a job that is not running cannot report that it is not running.',
					'These checks cost very little to build and are the difference between finding a problem in a day and finding it in a quarter.',
				],
			},
			{
				heading: 'Exceptions need a person, not a log file',
				paragraphs: [
					'Every automation eventually meets input it was not designed for. What it does then is a business decision, not a technical one, and it should be made deliberately.',
					'The safe default is to stop and route the case to a human with enough context to resolve it. The unsafe default, which is also the easiest to build, is to skip the record and continue. Skipped records accumulate invisibly.',
					'A log file is not a person. If the only record of a problem is a line in a log nobody reads, you have documentation, not detection.',
				],
			},
			{
				heading: 'Somebody has to own it',
				paragraphs: [
					'Integrations break because vendors change things on their schedule, not yours. That is not a failure of the build, it is the permanent condition of connecting systems you do not control.',
					'So the realistic plan is not prevention, it is fast detection and a named owner. Ask who gets the alert and what they are expected to do with it. If neither question has an answer, monitoring is decoration.',
				],
			},
		],
	},
	{
		slug: 'hallucination-is-a-design-problem',
		category: 'AI',
		title: 'Hallucination is a design problem, not a model problem',
		excerpt:
			'Waiting for a model that never invents anything is not a plan. Building systems that assume it will is.',
		readTime: '9 min',
		date: '2026-07-08',
		body: [
			{
				heading: 'The question is not whether it will be wrong',
				paragraphs: [
					'Every conversation about deploying AI eventually arrives at hallucination, and it usually arrives as a blocking objection: what if it makes something up. It is the right concern and usually the wrong framing.',
					'Models produce confident output regardless of whether they have the grounds for it. That is not a defect to be patched, it is a property of how they work, and any system design that assumes it will be solved by the next release is building on sand.',
					'The useful question is the same one you would ask about a new employee: not whether they will ever be wrong, but what happens when they are.',
				],
			},
			{
				heading: 'Ground the output in something checkable',
				paragraphs: [
					'Most fabrication happens when a model is asked to produce specifics it was never given. Ask it to write about a service in a town it knows nothing particular about and it will produce something plausible, because plausible is all it has.',
					'Retrieval fixes a large share of this. Give the model the source material and require it to work from that, and the failure mode shifts from inventing facts to misreading supplied ones, which is a much easier problem to detect.',
					'It also makes verification possible. Output grounded in a document can be checked against that document. Output from nowhere can only be checked by someone who already knows the answer.',
				],
			},
			{
				heading: 'Separate the checks',
				paragraphs: [
					'A single reviewer asked to check accuracy, tone, formatting, and completeness at once will do all four badly. That applies to automated checks exactly as it applies to people.',
					'Splitting them works better. One pass asks only whether anything was invented and whether the claims match the source. A second asks only whether the structure and format are right. Each check is simpler, and a simple check is a reliable check.',
					'When a check fails, the specific failure is also more actionable. Knowing the format was wrong tells you what to fix. Knowing it did not pass tells you nothing.',
				],
			},
			{
				heading: 'Put the human where the stakes are',
				paragraphs: [
					'Review is not free, so spending it uniformly is waste. The design question is where an error is expensive and irreversible, and that is where a person belongs.',
					'A wrong word in an internal summary costs nothing. A wrong figure in a client deliverable costs trust. A wrong instruction in a regulated document costs considerably more. The same system can reasonably auto-publish the first and require sign-off on the third.',
					'This is also what makes AI acceptable to sceptical teams. People object far less when they can see exactly which decisions the system is allowed to make alone.',
				],
			},
			{
				heading: 'Measure it before you trust it',
				paragraphs: [
					'Build an evaluation set from your own real examples before anything goes live. Fifty representative cases with known correct answers turns accuracy from an impression into a number.',
					'Then set the bar against the process being replaced, not against perfection. Manual processes have error rates too, and they are usually higher than anyone assumes because nobody measures them.',
					'Keep running it. A system that passed in March can quietly degrade when a model version changes underneath it, and without a standing evaluation you will discover that from a complaint.',
				],
			},
			{
				heading: 'Log enough to diagnose',
				paragraphs: [
					'When something does go wrong, you need to know what the system saw, what it was asked, and what it produced. Without that, a wrong answer is a mystery and the only available response is to lose confidence in the whole thing.',
					'Good logs turn a failure into a fix. They are also what lets you spot that a class of input is consistently producing bad output, which is usually a scoping problem you can solve by routing that class to a human.',
				],
			},
		],
	},
	{
		slug: 'audit-what-you-already-pay-for',
		category: 'Strategy',
		title: 'Before you buy more software, audit what you already own',
		excerpt:
			'Licensed features sitting unconfigured are the most common finding in an assessment, and the cheapest thing to act on.',
		readTime: '6 min',
		date: '2026-06-17',
		body: [
			{
				heading: 'The renewal nobody reads',
				paragraphs: [
					'Software gets bought to solve a specific problem, configured for that problem, and then renewed annually by someone comparing the invoice to last year. Nothing in that cycle prompts anyone to ask what else the licence includes.',
					'Meanwhile the vendor ships features. Modules get added to your tier, capabilities get folded into the plan you are already on, and none of it arrives with a person whose job is to notice.',
					'The result is completely ordinary and slightly embarrassing: businesses proposing six-figure builds for capability sitting dormant on an invoice they already pay.',
				],
			},
			{
				heading: 'What an audit actually looks like',
				paragraphs: [
					'Start with the invoices rather than the tools. Every recurring software charge, what it is for, who uses it, and what tier you are on. That list alone usually surprises people, because subscriptions accumulate without anyone holding the total.',
					'Then, for the three or four most expensive, read the feature list for your tier against what you actually use. Not the marketing page, the documentation. Look specifically for modules that were never switched on.',
					'Finally, look for overlap. Two tools doing the same job is common after a few years of solving problems tactically, and consolidating is usually easier than either building or buying.',
				],
			},
			{
				heading: 'Configuring is not the same as building',
				paragraphs: [
					'A dormant module is rarely a complete answer. It will do part of the job, in a way that is less tailored than something purpose-built, and it is worth being honest about that rather than overselling it.',
					'But the comparison is not against perfect. It is against a build with a budget, a timeline, and a maintenance burden. A feature that covers seventy percent of the need and takes two days to configure usually wins that comparison decisively.',
					'It also narrows the build if one is still needed, which makes the build cheaper and more likely to succeed.',
				],
			},
			{
				heading: 'The uncomfortable conversation',
				paragraphs: [
					'This finding is awkward to deliver, because somebody approved that subscription and somebody has been renewing it. Nobody enjoys learning they have paid three years for something unused.',
					'The way to handle it is to make it about the system rather than the person. Nobody is assigned to audit licences, which means it is a process gap, not negligence. Assign it annually to someone and it stops recurring.',
				],
			},
		],
	},
	{
		slug: 'the-real-cost-of-replacement',
		category: 'Strategy',
		title: 'What replacing a system actually costs',
		excerpt:
			'The licence and the implementation are the parts you get quoted. The migration, the retraining, and the history you lose are the parts that decide whether it was worth it.',
		readTime: '8 min',
		date: '2026-05-28',
		body: [
			{
				heading: 'The quote covers the easy part',
				paragraphs: [
					'A replacement proposal arrives with licensing and implementation costed, because those are the parts a vendor can quote confidently. Everything expensive about a replacement sits outside that number.',
					'Data migration is rarely included and is almost never trivial. Retraining a team is a real cost measured in reduced output for weeks. And the risk of running two systems during transition is borne entirely by you.',
					'None of this argues against replacing anything. It argues for comparing the honest figure rather than the quoted one.',
				],
			},
			{
				heading: 'History is the part people forget',
				paragraphs: [
					'Years of records in an old system are not just data. They are pricing precedent, customer history, and the evidence behind decisions. In businesses that quote work based on what similar jobs cost before, losing that is a direct hit to margin.',
					'Migration tools handle structured records reasonably well and handle context badly. Notes, attachments, and the informal record of what actually happened on a job are what get dropped, and they are frequently the most valuable part.',
					'Ask specifically what is not coming across. The answer is more revealing than the migration plan.',
				],
			},
			{
				heading: 'People are the expensive resource',
				paragraphs: [
					'A team that is fast in an old system is slow in a new one for a while, no matter how much better the new one is. That dip is real, it lasts longer than anyone plans for, and it lands on the same people who are still expected to hit their normal numbers.',
					'Scheduling a transition through a peak period turns that dip into a crisis. It is one of the most common avoidable mistakes in replacement projects, and it comes from planning around software timelines rather than business ones.',
				],
			},
			{
				heading: 'Will the workaround follow you?',
				paragraphs: [
					'The question that decides most replacements: what were people working around, and does the new system address it?',
					'If a team maintains a shadow spreadsheet because the platform cannot hold a particular kind of information, and the new platform also cannot hold it, the spreadsheet reappears. You will have paid for a migration to arrive at the same operating model with a different logo.',
					'When the answer is that the gap is unaddressed, closing the gap around the existing system is usually cheaper, faster, and lower risk than replacing it.',
				],
			},
			{
				heading: 'When replacement is right',
				paragraphs: [
					'Sometimes it is clearly correct. A platform that is genuinely end of life, a vendor whose pricing has become extractive, or a system that structurally cannot represent how the business now works.',
					'The distinction is whether the problem is the system or the gap around it. Systems that are merely disliked are usually being blamed for a gap, and unanimity that the tool is bad is a signal to investigate rather than a mandate to shop.',
				],
			},
		],
	},
	{
		slug: 'document-automation-that-holds-up',
		category: 'Automation',
		title: 'Document automation works when you stop trying to cover everything',
		excerpt:
			'Almost every document project fails the same way: it is scoped across every document type instead of the handful that carry the volume.',
		readTime: '7 min',
		date: '2026-05-06',
		body: [
			{
				heading: 'Volume is never evenly distributed',
				paragraphs: [
					'Ask a team which documents eat their time and you get a list of everything they handle. Measure it and you find a small number of types carrying most of the volume, and a long tail of formats that appear a handful of times a year.',
					'That distribution is the single most useful thing an assessment produces here, and almost nobody has measured it before we arrive. The perception of the problem is shaped by how annoying a document is, not by how often it appears.',
					'Scope to the concentration and a project becomes tractable. Scope to the perception and it becomes a platform.',
				],
			},
			{
				heading: 'The long tail is where accuracy targets go to die',
				paragraphs: [
					'High-volume documents are usually structured. Same layout, same fields, predictable variation, which is exactly the condition under which extraction is reliable.',
					'The tail is the opposite. Unusual formats, unstructured correspondence, one-off documents from a party who sends one a year. Extraction on those is unreliable, and the errors are hard to spot because there is no pattern to check against.',
					'Setting one accuracy target across both is how projects promise something they cannot deliver. Accuracy targets belong per document type.',
				],
			},
			{
				heading: 'Confidence thresholds beat blanket automation',
				paragraphs: [
					'A well-built extraction system knows when it is unsure. Using that signal to route uncertain documents to a person is the difference between a system that quietly corrupts data and one people trust.',
					'The threshold is a business decision. Set it high and more work reaches humans but errors are rare. Set it low and throughput rises along with risk. It should be tunable and revisited once you have real numbers.',
					'Systems that force a confident answer for every input are the ones that eventually produce a costly mistake nobody catches.',
				],
			},
			{
				heading: 'Deciding not to automate is a deliverable',
				paragraphs: [
					'The hardest part is writing down what stays manual. It feels like an admission of failure, and teams often relitigate it repeatedly because the decision was never recorded with its reasoning.',
					'Record it explicitly: this document type stays manual, because the volume is low and the variation is high and an error would be expensive. Then it can be revisited when volume changes, rather than argued about every quarter.',
					'That section is regularly the most referenced part of an assessment, because it settles arguments that had been running for a year.',
				],
			},
		],
	},
	{
		slug: 'why-your-team-ignores-the-new-system',
		category: 'Product design',
		title: 'Adoption is a design problem, not a training problem',
		excerpt:
			'If people go back to the spreadsheet after the training, more training will not fix it. The tool is slower than what they were doing.',
		readTime: '7 min',
		date: '2026-04-14',
		body: [
			{
				heading: 'The tell is the reversion',
				paragraphs: [
					'A team is trained on a new system, uses it for a fortnight, and drifts back to the old way. The usual diagnosis is that they need more training or that people resist change.',
					'Both explanations are comfortable and usually wrong. People are relentlessly efficient about their own time. If they abandon a tool, it is because the tool costs them more than it returns, and they worked that out faster than anyone measuring adoption.',
					'The useful response is not another session. It is to watch the specific task where they gave up.',
				],
			},
			{
				heading: 'Count the interactions for the common case',
				paragraphs: [
					'Take the action someone performs forty times a day and count what it costs. Clicks, fields, page loads, decisions. Then count the same thing in whatever they were doing before.',
					'A system that is comprehensive but takes ninety seconds for something that took fifteen will lose, and it should. Completeness is a benefit to whoever designed the schema and a tax on whoever does the work.',
					'Optimising the frequent path at the expense of the rare one is almost always correct, even though it feels wrong in a requirements meeting where every field has an advocate.',
				],
			},
			{
				heading: 'Data entry that benefits someone else',
				paragraphs: [
					'A reliable adoption killer is asking one person to enter data purely so another person can have a report. The cost is immediate and personal, the benefit is invisible and belongs to someone else.',
					'Sometimes that is genuinely necessary. When it is, the honest move is to make it as cheap as possible and to close the loop, so the person entering it sees something useful come back. Silence guarantees decay.',
					'Where it is not necessary, cutting the field is the fix. Every field you remove is a field that cannot be filled in wrong.',
				],
			},
			{
				heading: 'Ship to one team first',
				paragraphs: [
					'Rolling out to everyone simultaneously means discovering adoption problems at maximum blast radius, after the design is expensive to change.',
					'One team, one workflow, in production surfaces the same problems while fixing them is still cheap. It also produces something more persuasive than any training session: colleagues saying the thing is genuinely faster.',
					'The people who resisted hardest are frequently the best pilot group, because they will tell you precisely what is wrong instead of being polite about it.',
				],
			},
		],
	},
	{
		slug: 'the-first-project-should-be-boring',
		category: 'Strategy',
		title: 'Your first automation project should be boring',
		excerpt:
			'The exciting project is the wrong place to start. Pick the dull, high-frequency one that proves the plumbing works.',
		readTime: '6 min',
		date: '2026-03-25',
		body: [
			{
				heading: 'The temptation to start big',
				paragraphs: [
					'When a roadmap is approved there is pressure to begin with the item that justified the budget. It is the most visible, the most discussed, and usually the most complex.',
					'It is also the worst possible first project. Complexity early means a long stretch with nothing working, during which enthusiasm decays and the people who were sceptical get quietly confirmed.',
					'Momentum is a real asset in these programmes, and the fastest way to build it is to finish something.',
				],
			},
			{
				heading: 'What makes a good first project',
				paragraphs: [
					'High frequency, low stakes, and few dependencies. Something that happens many times a week, where an error is cheap and reversible, and which does not require three vendors to cooperate.',
					'It should also be genuinely useful. A demonstration nobody needed teaches you nothing about whether the approach works in your business.',
					'Estimate follow-up, intake routing, and scheduled reporting all fit this shape. None of them are exciting. All of them return time immediately.',
				],
			},
			{
				heading: 'What you are actually testing',
				paragraphs: [
					'The first project is as much about the plumbing as the outcome. Can you get data out of that system. Does the API behave as documented. Who has admin rights and are they available. How does your team actually respond to a change in their workflow.',
					'Those answers reshape every subsequent estimate. Discovering that a platform only exports nightly is a minor detail in a small project and a catastrophe in a large one.',
					'Better to learn it while the blast radius is small.',
				],
			},
			{
				heading: 'Sequence by payback, not by ambition',
				paragraphs: [
					'Order the roadmap by return against effort and the boring items rise to the top on their own, because they usually have the best ratio.',
					'The ambitious project stays on the list. It just moves behind the work that funds it and de-risks it, and it is frequently cheaper by the time you reach it because the integration it needed already exists.',
				],
			},
		],
	},
	{
		slug: 'agents-versus-one-good-prompt',
		category: 'AI',
		title: 'Most things called agents should be one good prompt',
		excerpt:
			'Agent architectures earn their complexity in a narrow set of cases. Outside those cases they add failure modes and cost for no benefit.',
		readTime: '7 min',
		date: '2026-03-03',
		body: [
			{
				heading: 'A naming problem with a budget attached',
				paragraphs: [
					'Agent has become the default word for any AI feature, which is unhelpful, because the architecture it describes is genuinely different from a single well-scoped call and genuinely more expensive to build and operate.',
					'Most systems being described as agents are one step: classify this, extract that, draft this. Built directly, they are cheap, fast, and easy to evaluate. Built as agents, they acquire orchestration, retries, and state for no gain.',
					'The distinction is worth defending because the wrong choice shows up as unreliability, not just cost.',
				],
			},
			{
				heading: 'When multiple agents genuinely help',
				paragraphs: [
					'The case for separate agents is separation of concerns. A research step that gathers material, a writing step that uses it, and a checking step that evaluates the result are genuinely different jobs, and a single prompt asked to do all three does each of them worse.',
					'That is not really about autonomy. It is the same reason you do not ask one reviewer to check accuracy and formatting simultaneously: narrow tasks produce reliable output.',
					'The other real case is a task that branches unpredictably and has to take actions across systems based on what it finds. That is a genuine agent, and it is rarer than the marketing suggests.',
				],
			},
			{
				heading: 'What complexity costs you',
				paragraphs: [
					'Every additional step is a place to fail, and multi-step systems fail in ways that are harder to diagnose because the error surfaces several steps from its cause.',
					'They cost more to run, since each step is a call. They are slower. And they are harder to evaluate, because a poor final output could originate anywhere in the chain.',
					'None of that is disqualifying when the complexity is buying something. It is simply not free, and it is often bought without noticing.',
				],
			},
			{
				heading: 'A reasonable default',
				paragraphs: [
					'Start with the simplest thing that could work, which is usually one well-scoped call with good grounding. Measure it against real examples.',
					'Add a step only when you can name the specific failure it fixes. Adding a quality check because output quality is inconsistent is a good reason. Adding orchestration because agents are the current architecture is not.',
					'Systems built this way tend to end up with two or three deliberate steps rather than a graph nobody can reason about.',
				],
			},
		],
	},
	{
		slug: 'measuring-automation-honestly',
		category: 'Assessment',
		title: 'How to tell whether an automation actually worked',
		excerpt:
			'Most automation success is asserted rather than measured, because nobody recorded what the process cost before it changed.',
		readTime: '7 min',
		date: '2026-02-06',
		body: [
			{
				heading: 'You cannot measure what you did not baseline',
				paragraphs: [
					'The most common reason nobody can prove an automation worked is that nobody measured the process it replaced. Once it is gone, the old cost is a matter of recollection, and recollection is generous in whichever direction suits the speaker.',
					'Baselining takes very little effort and has to happen before the build. How many times does this run a week, how long does it take, how often does it go wrong, and what does fixing it cost.',
					'Rough numbers are fine. Precision matters far less than having recorded anything at all.',
				],
			},
			{
				heading: 'Hours saved is a weak metric on its own',
				paragraphs: [
					'Time returned is the usual headline and it is easy to inflate. Twenty minutes saved across ten people does not reliably become three hours of new output; frequently it becomes a slightly less pressured day, which is valuable but different.',
					'Better measures are usually about outcomes. Errors caught before they reached a customer. Response time from request to first action. Jobs quoted per week. Percentage of accounts contacted within their threshold.',
					'Those are harder to argue with because they connect to something the business already cares about.',
				],
			},
			{
				heading: 'Count what it costs to keep running',
				paragraphs: [
					'Automations are not free after launch. Integrations break, exceptions need handling, and somebody reviews the cases the system routes to a human.',
					'An honest evaluation subtracts that. A system returning ten hours a week and consuming three in exception handling returns seven, and knowing the real figure is what lets you decide whether to invest in reducing the exception rate.',
					'Systems evaluated only on their best case tend to get quietly abandoned when the maintenance becomes visible.',
				],
			},
			{
				heading: 'Set the review date at the start',
				paragraphs: [
					'Agree when you will look, before you build. Ninety days is usually right: long enough for novelty to wear off, short enough to act on.',
					'Then actually look, including at the possibility that it did not work. Being able to switch something off is what makes it safe to try things, and a portfolio where nothing is ever retired is not a portfolio, it is an accumulation.',
				],
			},
		],
	},
	{
		slug: 'integrations-break-plan-for-it',
		category: 'Automation',
		title: 'Integrations break. Plan for that instead of pretending otherwise',
		excerpt:
			'Connecting systems you do not control means accepting that something will change on somebody else schedule. The plan is detection, not prevention.',
		readTime: '6 min',
		date: '2026-01-16',
		body: [
			{
				heading: 'A permanent condition, not a defect',
				paragraphs: [
					'Every integration depends on a system somebody else controls, and that somebody will change it. APIs are versioned and deprecated, authentication requirements tighten, fields get renamed, rate limits change.',
					'None of that is a failure of the original build. It is the ordinary weather of connecting systems, and treating each occurrence as a surprise is what makes integrations feel fragile.',
					'The projects that go badly are the ones where nobody planned for maintenance because nobody said out loud that maintenance would be needed.',
				],
			},
			{
				heading: 'Detection is the whole strategy',
				paragraphs: [
					'You cannot prevent a vendor from changing an endpoint. You can find out within an hour instead of within a quarter.',
					'That means health checks that verify the connection still works, alerts when volumes fall outside expected bounds, and a heartbeat that notices when something stops running entirely.',
					'Fast detection turns a potential data quality disaster into a Tuesday afternoon fix.',
				],
			},
			{
				heading: 'Decide who owns each field',
				paragraphs: [
					'Most sync problems are not technical, they are governance. Two systems both believing they own the customer record will fight forever, and no amount of clever conflict resolution fixes an unmade decision.',
					'Assign one owner per field. This system is authoritative for contact details, that one for billing, and the flow goes one way. Once that is settled the technical work becomes straightforward.',
					'That conversation is often the most valuable part of an integration project, and it has nothing to do with code.',
				],
			},
			{
				heading: 'Platform or custom',
				paragraphs: [
					'Integration platforms are good value for standard connections between popular tools, with maintenance handled for you. That is a real benefit and worth paying for when it fits.',
					'They become awkward when the mapping is unusual, the volume is high, or the error handling needs to be specific. At that point the platform is the constraint and the cost curve turns against you.',
					'Either choice is defensible. Choosing on requirements rather than preference is the part that matters.',
				],
			},
		],
	},
	{
		slug: 'reporting-nobody-reads',
		category: 'Product design',
		title: 'The dashboard nobody opens',
		excerpt:
			'Dashboards get checked enthusiastically for two weeks and then forgotten. Something that arrives where people already work usually survives longer.',
		readTime: '6 min',
		date: '2025-12-29',
		body: [
			{
				heading: 'The two-week enthusiasm curve',
				paragraphs: [
					'A new dashboard gets attention immediately. People open it, explore it, comment on it. Within a month, usage has collapsed to whoever commissioned it, and often not even them.',
					'The reason is that checking a dashboard is a task someone has to remember to do, competing against work that is actively demanding attention. Passive information loses that competition every time.',
					'This is not a design quality problem. Beautiful dashboards suffer the same fate as ugly ones.',
				],
			},
			{
				heading: 'Push beats pull for anything routine',
				paragraphs: [
					'Information that should drive a regular decision is better delivered than displayed. A short summary arriving in the channel a team already uses gets read; the same numbers behind a login get checked when someone remembers.',
					'The bar for a push is that it must be worth the interruption. A daily message nobody acts on trains people to ignore it, which is worse than silence.',
					'Better still is an alert tied to a threshold. Tell me when something needs attention rather than telling me everything is fine every morning.',
				],
			},
			{
				heading: 'Dashboards are for investigation',
				paragraphs: [
					'None of this means dashboards are useless. They are the right tool when someone has a question and needs to explore, filter, and drill into it.',
					'The mistake is using an exploration tool for routine monitoring. Those are different jobs and the same interface rarely does both well.',
					'A useful test: if you can name the decision the dashboard supports and how often it is made, you probably want a report or an alert instead.',
				],
			},
			{
				heading: 'Agree the definitions first',
				paragraphs: [
					'Reporting projects stall on a question that looks technical and is not: which number is right. Two systems each computing revenue by their own defensible definition will disagree, and no amount of engineering resolves that.',
					'Somebody has to decide which definition is the company one, and write it down. Surfacing the conflict is the useful part; the decision belongs to the business.',
					'Skip it and you ship a dashboard people argue with rather than act on.',
				],
			},
		],
	},
	{
		slug: 'onboarding-is-where-churn-starts',
		category: 'Automation',
		title: 'Churn usually starts in the first two weeks',
		excerpt:
			'A client signs at peak confidence. What happens next either confirms the decision or begins undoing it, and for most businesses what happens next is silence.',
		readTime: '7 min',
		date: '2025-12-04',
		body: [
			{
				heading: 'The gap after the signature',
				paragraphs: [
					'A client commits at the moment they are most confident. Then, in most businesses, very little visibly happens for a week or two while the internal handoff occurs.',
					'The work is often genuinely underway. But invisible progress and no progress look identical from outside, and a client who has just spent money is unusually alert to which one they are experiencing.',
					'Impressions formed in that window are disproportionately durable, and they are formed with almost no input from you.',
				],
			},
			{
				heading: 'Handoffs are where things stall',
				paragraphs: [
					'Sales closes and moves on. Operations starts when it hears. That gap is filled by somebody remembering to mention it, usually at whatever meeting comes next.',
					'Everything downstream inherits the delay: assigning the work, requesting documents, getting access, scheduling the kickoff. Each step waits on a person recalling that the previous one finished.',
					'None of it is negligence and all of it is avoidable, because the trigger already exists.',
				],
			},
			{
				heading: 'Trigger from the signature',
				paragraphs: [
					'The completed signature is unambiguous, timestamped, and cannot be forgotten or entered late. That makes it a far better trigger than a pipeline stage somebody updates manually.',
					'Hang the sequence off it and onboarding begins the moment the deal closes. Tasks assign themselves, the client hears something immediately, and nobody has to be told the deal is done.',
					'That single change removes most of the dead first week without altering anything about how the work is actually delivered.',
				],
			},
			{
				heading: 'Chase documents without a person feeling like a nag',
				paragraphs: [
					'Every onboarding needs things from the client, and chasing them is nobody favourite task. So it happens late, apologetically, or not at all until it blocks something.',
					'Automated, it is neutral and timely. It also tends to be more specific, because a system will list exactly what is outstanding rather than sending a vague reminder.',
					'Clients generally prefer this. Being told precisely what is needed is easier to act on than being asked whether they have had a chance to look at things.',
				],
			},
			{
				heading: 'Tell them what stage they are in',
				paragraphs: [
					'The whole point is replacing silence with a sequence. Received, assigned, scheduled, in progress, waiting on you.',
					'None of it requires anyone to write an email, and it converts the first two weeks from an anxious gap into visible momentum, which is the impression you actually paid to create when you closed the deal.',
				],
			},
		],
	},
	{
		slug: 'questions-for-your-ai-vendor',
		category: 'AI',
		title: 'The questions to ask before letting an AI vendor near your data',
		excerpt:
			'Most AI procurement conversations are about capability. The ones that matter later are about data handling, and they are rarely asked.',
		readTime: '7 min',
		date: '2025-11-12',
		body: [
			{
				heading: 'Where does the data actually go',
				paragraphs: [
					'The first question is the least asked: when we send you a document, which systems does it pass through and where does it rest. Many products are a thin layer over an underlying provider, which is fine, but it means your data handling is really theirs.',
					'Ask for the chain explicitly. Every subprocessor, every region, every point of storage. Vagueness at this stage is itself an answer.',
					'You need this regardless of regulatory obligations, because you cannot make a sensible judgement about risk without knowing where the risk lives.',
				],
			},
			{
				heading: 'Is our data used for training',
				paragraphs: [
					'Business tiers of the major providers exclude customer data from training by contract. Consumer tiers frequently do not, and the difference is a setting or a plan rather than a technology.',
					'Ask for it in writing rather than accepting a verbal assurance, and check whether it applies to everything or only to certain endpoints.',
					'If a vendor cannot answer this crisply, they either do not know their own stack or would rather you did not press.',
				],
			},
			{
				heading: 'What is retained, and for how long',
				paragraphs: [
					'Retention is usually where the surprises are. Prompts and outputs are commonly kept for a period for abuse monitoring, which is reasonable and is also a copy of your data existing somewhere you did not plan for.',
					'Ask for the retention window, whether it is configurable, and what deletion actually means. Deleted from the interface and deleted from backups are different claims.',
					'Where the work genuinely demands it, private deployment removes most of this conversation, at a cost worth weighing rather than assuming.',
				],
			},
			{
				heading: 'What happens when it is wrong',
				paragraphs: [
					'Ask what the system does with input it is not confident about, and whether that behaviour is configurable. A product that always produces a confident answer is not more capable, it is less safe.',
					'Ask what is logged. If you cannot see what the system was given and what it returned, you cannot diagnose a bad result and your only response will be to stop trusting the whole thing.',
				],
			},
			{
				heading: 'How do we leave',
				paragraphs: [
					'Exit terms tell you a great deal about a vendor. Can you export your data in a usable format, what happens to it after termination, and is there anything about the setup that makes moving harder than it needs to be.',
					'Asking early is not pessimism. It is the difference between choosing a supplier and acquiring a dependency.',
				],
			},
		],
	},
	{
		slug: 'when-not-to-automate',
		category: 'Strategy',
		title: 'When not to automate',
		excerpt:
			'Some processes should be left alone, and a few should be deleted instead of automated. Knowing which is most of the skill.',
		readTime: '6 min',
		date: '2025-10-21',
		body: [
			{
				heading: 'Automating something nobody needs',
				paragraphs: [
					'The first question about any process is not how to automate it but whether it should exist. Plenty of recurring work is vestigial: a report that was needed for a decision nobody makes anymore, a form filled in for a person who left.',
					'Automating that is worse than leaving it, because you have now spent money making something permanent that was on its way to being questioned.',
					'Ask who consumes the output and what they do with it. If the honest answer is nothing, delete the process.',
				],
			},
			{
				heading: 'When judgement is the job',
				paragraphs: [
					'Some work looks repetitive and is actually a judgement call performed quickly by someone experienced. Automating the visible steps while discarding the judgement produces something that looks right and behaves badly in exactly the cases that mattered.',
					'The tell is when the person doing it cannot fully explain the rule. That usually means the rule is real and contextual rather than absent, and the right move is a tool that supports the decision rather than replaces it.',
				],
			},
			{
				heading: 'When volume does not justify it',
				paragraphs: [
					'A process that runs twice a year is rarely worth building for, no matter how irritating it is when it comes round. Irritation and cost are not the same thing, and roadmaps built from irritation solve the wrong problems.',
					'Total annual handling time is the number that matters. A twenty-minute task done weekly beats a two-day task done annually, even though the second one feels worse.',
				],
			},
			{
				heading: 'When the process is about to change',
				paragraphs: [
					'Automating a workflow that is being restructured next quarter is building on sand. The same applies to a process wrapped around a system you are actively considering replacing.',
					'Wait, or automate deliberately at the layer that will survive. Otherwise the build is scrapped along with the process it encoded.',
				],
			},
			{
				heading: 'Saying so is part of the job',
				paragraphs: [
					'A consultancy that never recommends against building is not exercising judgement, it is selling. Every assessment we produce has a section on what to leave alone, and it is frequently the part clients quote back to us.',
					'Being told what not to do is worth paying for, because it is the advice nobody with something to sell has an incentive to give.',
				],
			},
		],
	},
	{
		slug: 'what-a-good-requirements-conversation-sounds-like',
		category: 'Assessment',
		title: 'What a good requirements conversation sounds like',
		excerpt:
			'Asking people what they want produces a feature list. Asking what happened last Tuesday produces a specification.',
		readTime: '7 min',
		date: '2025-09-30',
		body: [
			{
				heading: 'Feature lists are the wrong output',
				paragraphs: [
					'Ask a team what they need and you will get a list of features, because that is the vocabulary available. The list is sincere and it describes solutions rather than problems.',
					'Building from it produces software that satisfies the list and misses the point, because nobody in the conversation examined whether those features address what is actually costing money.',
					'The job of the conversation is to get underneath the list to the situation that generated it.',
				],
			},
			{
				heading: 'Ask about specific recent events',
				paragraphs: [
					'General questions get general answers, and general answers are usually the process as designed rather than as run. Ask instead about the last concrete instance. Walk me through the most recent time this went wrong. What did you do on Tuesday.',
					'Specific events produce specific detail, including the workarounds people do not think to mention because they have stopped noticing them.',
					'This is also where you find the informal steps that never appear in a process document and are load-bearing.',
				],
			},
			{
				heading: 'Talk to whoever actually does it',
				paragraphs: [
					'Managers describe the intended process. The person performing it forty times a week describes the real one. The gap between those two accounts is reliably where the interesting problems are.',
					'Both conversations are necessary. The manager knows what the process is for and where it fits; the operator knows what it costs and where it breaks.',
					'When the accounts differ, that is not someone being wrong. It is a finding.',
				],
			},
			{
				heading: 'Watch, do not just ask',
				paragraphs: [
					'Sitting with someone during real work surfaces things no interview will. The second window they keep open. The note they check before every entry. The step they described as quick that takes four minutes.',
					'People are unreliable narrators of their own routines, not through dishonesty but because expertise makes steps invisible. Observation catches what description omits.',
					'An hour of watching is usually worth several hours of meetings.',
				],
			},
			{
				heading: 'End with what you were told not to build',
				paragraphs: [
					'A good requirements conversation produces a list of things you deliberately will not do, with reasons. That list proves you were listening for problems rather than collecting orders.',
					'It also protects the project. Scope agreed by omission reappears later as an assumption; scope declined explicitly stays declined.',
				],
			},
		],
	},
	{
		slug: 'ai-that-writes-in-your-voice',
		category: 'AI',
		title: 'Getting AI to sound like your business rather than like AI',
		excerpt:
			'Generic output is usually a research failure rather than a writing failure. A model with nothing specific to say will say something that could apply anywhere.',
		readTime: '7 min',
		date: '2025-09-08',
		body: [
			{
				heading: 'Everyone can spot it now',
				paragraphs: [
					'The tell is not vocabulary, it is the absence of specifics. Copy that could apply to any business in the sector reads as automated because nothing in it required knowing anything about you.',
					'Customers notice this faster than most companies expect, and the damage is not embarrassment. It signals that nobody local was paying attention, which is precisely the opposite of what most of this content is trying to convey.',
					'Prompting harder for a warmer tone does not fix it, because tone was never the problem.',
				],
			},
			{
				heading: 'Specificity comes from research, not instruction',
				paragraphs: [
					'A model asked to write about a service in a town it knows nothing particular about will produce something generic, because generic is the only honest option available to it.',
					'Give it material first. What this business actually does, which services it sells, what is true about this area, what the customer said. Then the writing step has something to be specific about.',
					'This reordering, research before drafting rather than during, is most of the difference between output that reads as informed and output that reads as filler.',
				],
			},
			{
				heading: 'Voice is data, not a prompt',
				paragraphs: [
					'Tone instructions buried in a prompt drift and cannot be inspected. A better approach is to treat voice as stored, editable data: preferred vocabulary, phrasings to avoid, how formal to be, which local references are safe.',
					'Stored that way it stays consistent across every generation, and someone can correct it when it is wrong. A prompt nobody can see is a prompt nobody can fix.',
					'Regional variation matters more than people expect. Copy that reads naturally in one part of the country reads as slightly off in another, and slightly off is worse than plain.',
				],
			},
			{
				heading: 'Human edits are the best feedback you have',
				paragraphs: [
					'Track what people change before publishing. Those edits are a precise map of where the voice profile is still wrong, and they are far more useful than any general assessment of quality.',
					'A phrase that gets removed every time belongs on the avoid list. A correction made repeatedly is a rule waiting to be written down.',
					'Systems that capture this improve. Systems that do not stay exactly as good as they were on day one.',
				],
			},
		],
	},
]

/** Newest first. Every listing, feed, and nav slice reads from this order. */
export const insights: Insight[] = [...insightEntries].sort((a, b) =>
	b.date.localeCompare(a.date),
)

export const insightCategories = [
	...new Set(insights.map((insight) => insight.category)),
]

export const topicSlug = (category: string) =>
	category
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

export const insightTopics = insightCategories.map((category) => ({
	category,
	slug: topicSlug(category),
	posts: insights.filter((insight) => insight.category === category),
}))

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
