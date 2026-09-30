import { appHost, isProductionHost } from '@/lib/app-url'

/**
 * Shows which deployment you are looking at. Renders nothing on production, so
 * the only way to see it is to be somewhere that is not production.
 */
export function EnvironmentBadge() {
	if (isProductionHost) return null

	const label = appHost.startsWith('localhost') ? 'Local' : 'Staging'

	return (
		<div
			aria-hidden
			className='pointer-events-none fixed bottom-3 left-3 z-[100] rounded-full border border-white/15 bg-ink/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-400 backdrop-blur'>
			{label} · {appHost}
		</div>
	)
}
