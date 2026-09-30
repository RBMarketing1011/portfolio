'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Every password field in the app. The toggle is a real button so it is
 * reachable by keyboard, but it sits outside the tab order between the field
 * and the next one, which is where people expect to land.
 */
export function PasswordInput({
	className,
	...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
	const [visible, setVisible] = React.useState(false)
	const Icon = visible ? EyeOff : Eye

	return (
		<div className='relative'>
			<Input
				{...props}
				type={visible ? 'text' : 'password'}
				className={cn('pr-10', className)}
			/>
			<button
				type='button'
				tabIndex={-1}
				onClick={() => setVisible((current) => !current)}
				aria-label={visible ? 'Hide password' : 'Show password'}
				aria-pressed={visible}
				className='absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'>
				<Icon className='size-4' />
			</button>
		</div>
	)
}
