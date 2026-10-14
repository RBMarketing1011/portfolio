'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useBuilder } from '@/lib/builder/builder-context'
import { findBlock } from '@/lib/builder/block-ops'
import { getSchema } from '@/lib/builder/schema'
import { writeWithAi } from './builder-ai'

const CHOICES = [
	{
		key: 'text',
		label: 'Write the content',
		detail: 'Headings, copy, buttons and list items, from your business details.',
	},
	{
		key: 'images',
		label: 'Select images',
		detail: 'Picks images from your media for every image spot, replacing any already there.',
	},
] as const

type Choice = (typeof CHOICES)[number]['key']

/**
 * Rewrites one section with AI. The person says what they want and which parts the
 * AI may touch; colours, layout and spacing are never among them. The result lands
 * in the draft like any edit, so undo takes it back.
 */
export function SectionAiDialog({
	blockId,
	onOpenChange,
}: {
	/** The section to write; null keeps the dialog closed. */
	blockId: string | null
	onOpenChange: (open: boolean) => void
}) {
	const store = useBuilder()
	const open = blockId !== null
	const block = blockId && store.page ? findBlock(store.page.blocks, blockId) : undefined
	const label = block ? (getSchema(block.type)?.label ?? 'section') : 'section'

	const [notes, setNotes] = useState('')
	const [choices, setChoices] = useState<Record<Choice, boolean>>({
		text: true,
		images: false,
	})
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const abort = useRef<AbortController | null>(null)

	useEffect(() => {
		if (!open) {
			abort.current?.abort()
			return
		}
		setNotes('')
		setChoices({ text: true, images: false })
		setBusy(false)
		setError(null)
	}, [open, blockId])

	const anything = choices.text || choices.images

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		if (!block || !store.page || !anything) return
		const controller = new AbortController()
		abort.current = controller
		setBusy(true)
		setError(null)
		try {
			const [written] = await writeWithAi(
				store.siteId,
				{
					page: { name: store.page.name, slug: store.page.slug },
					blocks: [block],
					instructions: notes.trim() || undefined,
					scope: 'section',
					// Selecting images fills empty spots and replaces set ones alike.
					options: {
						text: choices.text,
						replaceImages: choices.images,
						fillImages: choices.images,
					},
				},
				controller.signal,
			)
			if (controller.signal.aborted) return
			if (written) store.replaceBlock(block.id, written)
			onOpenChange(false)
		} catch (failure) {
			if (controller.signal.aborted) return
			setError(failure instanceof Error ? failure.message : 'The AI could not write this section.')
		} finally {
			if (abort.current === controller) abort.current = null
			setBusy(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-lg'>
				<form onSubmit={submit} className='grid gap-5'>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							<Sparkles className='size-4 text-brand' /> Write this {label.toLowerCase()} with AI
						</DialogTitle>
						<DialogDescription>
							The AI uses your business details and this page. It only changes words and
							images, never colours or layout. You can undo it.
						</DialogDescription>
					</DialogHeader>

					<div className='grid gap-2'>
						<Label htmlFor='section-ai-notes'>What should it say?</Label>
						<Textarea
							id='section-ai-notes'
							rows={4}
							maxLength={2000}
							disabled={busy}
							value={notes}
							placeholder='e.g. Focus on our 24/7 emergency service and same-day appointments. Keep it short and friendly.'
							onChange={(event) => setNotes(event.target.value)}
						/>
						<p className='text-xs text-muted-foreground'>
							Optional. Leave it empty and the AI writes from your business details.
						</p>
					</div>

					<div className='grid gap-3'>
						{CHOICES.map((choice) => (
							<div key={choice.key} className='flex items-start gap-3'>
								<Checkbox
									id={`section-ai-${choice.key}`}
									checked={choices[choice.key]}
									disabled={busy}
									onCheckedChange={(value) =>
										setChoices((current) => ({ ...current, [choice.key]: value === true }))
									}
									className='mt-0.5'
								/>
								<div className='grid gap-1'>
									<Label htmlFor={`section-ai-${choice.key}`}>{choice.label}</Label>
									<p className='text-xs text-muted-foreground'>{choice.detail}</p>
								</div>
							</div>
						))}
					</div>

					{error && <FormAlert>{error}</FormAlert>}

					<DialogFooter>
						<Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type='submit' disabled={busy || !anything || !block}>
							{busy ? <Loader2 className='animate-spin' /> : <Sparkles />}
							{busy ? 'Writing…' : 'Write it'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
