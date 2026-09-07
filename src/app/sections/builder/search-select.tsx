'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SearchOption = {
	value: string
	label: string
	hint?: string
	icon?: React.ReactNode
}

/** Used instead of a plain select once a list is long enough to need searching. */
export function SearchSelect({
	id,
	value,
	options,
	placeholder = 'Select',
	emptyLabel = 'Nothing found.',
	onChange,
}: {
	id?: string
	value: string | undefined
	options: SearchOption[]
	placeholder?: string
	emptyLabel?: string
	onChange: (value: string) => void
}) {
	const [open, setOpen] = useState(false)
	const selected = options.find((option) => option.value === value)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					id={id}
					type='button'
					role='combobox'
					aria-expanded={open}
					className='flex h-9 w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/4 px-3 text-sm text-white transition-colors hover:bg-white/6'>
					<span className='flex min-w-0 items-center gap-2'>
						{selected?.icon}
						<span className={cn('truncate', !selected && 'text-slate-500')}>
							{selected?.label ?? placeholder}
						</span>
					</span>
					<ChevronsUpDown className='size-3.5 shrink-0 opacity-50' />
				</button>
			</PopoverTrigger>
			<PopoverContent className='w-(--radix-popover-trigger-width) p-0'>
				<Command>
					<CommandInput placeholder='Search…' />
					<CommandList>
						<CommandEmpty>{emptyLabel}</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option.value}
									value={`${option.label} ${option.hint ?? ''}`}
									onSelect={() => {
										onChange(option.value)
										setOpen(false)
									}}>
									<Check
										className={cn(
											'size-3.5',
											option.value === value
												? 'text-brand opacity-100'
												: 'opacity-0',
										)}
									/>
									{option.icon}
									<span className='min-w-0 flex-1 truncate'>
										{option.label}
									</span>
									{option.hint && (
										<span className='shrink-0 text-xs text-slate-500'>
											{option.hint}
										</span>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
