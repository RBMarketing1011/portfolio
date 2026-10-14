import { requireAdminPage } from '@/lib/admin'
import { AdminShell } from './admin-shell'

export const metadata = {
	title: { default: 'Admin', template: '%s | Admin' },
	robots: { index: false, follow: false },
}

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode
}) {
	// Every page under here inherits this, so none of them can forget it.
	const { email } = await requireAdminPage()

	return (
		<AdminShell email={email} userName={email.replace(/@.*$/, '')}>
			{children}
		</AdminShell>
	)
}
