import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const glassCardVariants = cva(
	// The top sheen sells the glass edge; it must stay above the blurred surface.
	'relative overflow-hidden rounded-xl border backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-white/25 before:to-transparent',
	{
		variants: {
			variant: {
				default:
					'border-white/10 bg-white/[0.035] shadow-[0_8px_32px_-12px_color-mix(in_srgb,var(--color-ink)_65%,transparent)]',
				accent:
					'border-brand/25 bg-linear-to-br from-brand/12 via-white/[0.04] to-white/[0.02] shadow-[0_8px_32px_-12px_color-mix(in_srgb,var(--color-brand)_25%,transparent)]',
				subtle: 'border-white/[0.07] bg-white/[0.02]',
			},
			interactive: {
				true: 'transition-colors duration-200 hover:border-brand/40 hover:bg-white/[0.06]',
				false: '',
			},
		},
		defaultVariants: {
			variant: 'default',
			interactive: false,
		},
	},
)

function GlassCard({
	className,
	variant,
	interactive,
	asChild = false,
	...props
}: React.ComponentProps<'div'> &
	VariantProps<typeof glassCardVariants> & {
		asChild?: boolean
	}) {
	const Comp = asChild ? Slot : 'div'

	return (
		<Comp
			data-slot='glass-card'
			className={cn(glassCardVariants({ variant, interactive, className }))}
			{...props}
		/>
	)
}

export { GlassCard }
