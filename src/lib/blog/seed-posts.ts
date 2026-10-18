import type { BlogPost } from './types'

/**
 * The articles that shipped in code before the blog moved to the database. They
 * are copied into MongoDB the first time the blog is read (see posts.ts) and
 * after that the database is the only source; editing this file changes nothing
 * on the live site. Also the fallback when the database cannot be reached.
 */
export const seedPosts: BlogPost[] = [
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
