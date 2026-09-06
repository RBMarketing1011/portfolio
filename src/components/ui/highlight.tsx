import { cn } from '@/lib/utils'

export function Highlight({
	children,
	className,
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<span
			className={cn(
				'relative inline-block whitespace-nowrap text-brand',
				className,
			)}>
			{children}
			{/* One closed outline traced along both sides of a single pen gesture,
			    so the sweep, the Z reversal, and the run-out stay continuous. */}
			<svg
				aria-hidden
				viewBox='0 0 300 24'
				preserveAspectRatio='none'
				fill='currentColor'
				className='absolute inset-x-0 bottom-[-0.30em] h-[0.44em] w-full overflow-visible'>
				<path d='M5 18.7 C 55 13.6, 130 5.8, 196.5 3.9 Q 200.5 3.6, 200.5 5.4 C 192 8.6, 180 12.4, 168.2 15.5 L 167.2 12.9 C 205 11.4, 250 8.2, 293 5.9 Q 296 7.2, 293.5 8.6 C 250 11.2, 205 14.4, 169 16.6 C 163 17.2, 161.5 13.4, 170 12.4 C 179 10.6, 188 8.4, 196 6.2 L 196.8 6.9 C 132 8.8, 58 16.2, 5 20.3 Z' />
			</svg>
		</span>
	)
}
