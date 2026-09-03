export type Project = {
	slug: string
	name: string
	category: string
	summary: string
	image: string
	video?: string
	capabilities: string[]
}

export const projects: Project[] = [
	{
		slug: 'operations-hub',
		name: 'Operations Hub',
		category: 'Internal software',
		summary: 'A central workspace for the moving parts of a growing operation.',
		image: '/hub/hub.png',
		capabilities: ['Workflow design', 'Dashboards', 'Role-based access'],
	},
	{
		slug: 'management-command-center',
		name: 'Management Command Center',
		category: 'Business intelligence',
		summary:
			'A clearer operating picture for leadership teams making daily decisions.',
		image: '/mmc/mmc.png',
		video: '/mmc/mmc.mp4',
		capabilities: ['Reporting', 'Data visualization', 'Executive workflows'],
	},
	{
		slug: 'omni-u',
		name: 'Omni U',
		category: 'Learning platform',
		summary:
			'A digital learning environment designed for a focused, repeatable experience.',
		image: '/omni-u/omni.png',
		video: '/omni-u/omni.mp4',
		capabilities: ['Product design', 'Learning flows', 'Content delivery'],
	},
	{
		slug: 'client-portal',
		name: 'Client Portal',
		category: 'Customer experience',
		summary:
			'A dedicated place for customers to get answers, take action, and stay informed.',
		image: '/portal/portal.png',
		capabilities: [
			'Self-service',
			'Information architecture',
			'Customer workflows',
		],
	},
	{
		slug: 'reporting-suite',
		name: 'Reporting Suite',
		category: 'Business intelligence',
		summary:
			'Reporting surfaces that turn operational data into useful decisions.',
		image: '/reports/reports.png',
		capabilities: ['Data reporting', 'Metrics', 'Operational visibility'],
	},
	{
		slug: 'scheduling-platform',
		name: 'Scheduling Platform',
		category: 'Operations',
		summary:
			'A streamlined scheduling experience built for teams with real-world constraints.',
		image: '/scheduler/scheduler.png',
		video: '/scheduler/scheduler.mp4',
		capabilities: ['Scheduling', 'Team coordination', 'Workflow automation'],
	},
]

export const insights = [
	{
		slug: 'custom-software-brief',
		category: 'Build strategy',
		title: 'What makes a custom software project worth building?',
		excerpt:
			'A practical framework for deciding whether a workflow deserves a dedicated product.',
	},
	{
		slug: 'automation-without-chaos',
		category: 'Automation',
		title: 'Automation without creating more operational chaos',
		excerpt:
			'How to choose repetitive work that is ready for an integration or AI-assisted workflow.',
	},
	{
		slug: 'portal-experience',
		category: 'Product design',
		title: 'A client portal should reduce questions, not create them',
		excerpt:
			'The patterns that make self-service software feel obvious for customers and teams.',
	},
]
