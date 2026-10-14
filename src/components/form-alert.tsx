import { CircleAlert, CircleCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

/** The one way app forms report a result: a shadcn Alert, red for errors. */
export function FormAlert({
	tone = 'error',
	children,
}: {
	tone?: 'error' | 'success'
	children: React.ReactNode
}) {
	return (
		<Alert variant={tone === 'error' ? 'destructive' : 'default'}>
			{tone === 'error' ? <CircleAlert /> : <CircleCheck />}
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	)
}
