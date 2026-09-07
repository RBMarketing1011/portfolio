import Link from 'next/link'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

/**
 * Masks the file in /public/logo rather than inlining its paths, so replacing the
 * artwork updates the site, and the mark still takes its color from the theme.
 */
export function LogoMark({
	className,
	style,
	...props
}: React.ComponentProps<'span'>) {
	const mask = `url(${site.logo}) center / contain no-repeat`

	return (
		<span
			aria-hidden
			className={cn('inline-block bg-brand', className)}
			style={{ mask, WebkitMask: mask, ...style }}
			{...props}
		/>
	)
}

export function Wordmark({
	className,
	size = 'default',
	href = '/',
}: {
	className?: string
	size?: 'default' | 'sm'
	href?: string
}) {
	return (
		<Link
			href={href}
			className={cn('flex items-center gap-2.5', className)}
			aria-label={`${site.name} home`}>
			<LogoMark
				className={cn(
					'aspect-[791/841] shrink-0',
					size === 'sm' ? 'h-6' : 'h-7.5',
				)}
			/>
			<span
				className={cn(
					'font-display font-semibold tracking-tight text-white',
					size === 'sm' ? 'text-base' : 'text-lg',
				)}>
				{site.nameParts.first}
				<span className='text-brand'>{site.nameParts.second}</span>
			</span>
		</Link>
	)
}
