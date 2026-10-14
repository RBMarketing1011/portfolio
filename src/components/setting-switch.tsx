'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/** An on/off setting: a shadcn Switch with its label and one line of explanation. */
export function SettingSwitch({
	id,
	checked,
	onCheckedChange,
	title,
	description,
	disabled,
}: {
	id: string
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	title: string
	description?: string
	disabled?: boolean
}) {
	return (
		<div className='flex items-start justify-between gap-4'>
			<div className='space-y-1'>
				<Label htmlFor={id}>{title}</Label>
				{description && (
					<p className='text-sm text-muted-foreground'>{description}</p>
				)}
			</div>
			<Switch
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	)
}
