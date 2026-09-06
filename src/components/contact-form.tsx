'use client'

import { type FormEvent, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type FormStatus = 'idle' | 'sending' | 'success' | 'error'

const fieldClass =
	'border-white/15 bg-ink text-white placeholder:text-slate-500 focus-visible:border-brand focus-visible:ring-brand/30'

const labelClass = 'text-sm font-medium text-white'

export default function ContactForm() {
	const [status, setStatus] = useState<FormStatus>('idle')
	const [message, setMessage] = useState('')

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setStatus('sending')
		const form = event.currentTarget

		try {
			const response = await fetch('/api/contact', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(Object.fromEntries(new FormData(form))),
			})

			if (!response.ok) {
				const data = await response.json().catch(() => null)
				setMessage(data?.error ?? 'Something went wrong. Please try again.')
				setStatus('error')
				return
			}

			form.reset()
			setStatus('success')
		} catch {
			setMessage('Could not reach the server. Please try again.')
			setStatus('error')
		}
	}

	if (status === 'success') {
		return (
			<div className='rounded-lg border border-brand/30 bg-brand/10 p-8 text-center'>
				<CheckCircle2 className='mx-auto size-8 text-brand' />
				<h3 className='mt-4 font-display text-xl font-semibold text-white'>
					Message sent
				</h3>
				<p className='mt-2 leading-7 text-slate-300'>
					We will get back to you within one business day.
				</p>
				<Button
					variant='outline'
					className='mt-6 border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white'
					onClick={() => setStatus('idle')}>
					Send another message
				</Button>
			</div>
		)
	}

	return (
		<form onSubmit={handleSubmit} className='space-y-6'>
			<div className='grid gap-6 sm:grid-cols-2'>
				<div className='space-y-2'>
					<Label htmlFor='name' className={labelClass}>
						Name <span className='text-brand'>*</span>
					</Label>
					<Input
						id='name'
						name='name'
						required
						autoComplete='name'
						placeholder='Jane Smith'
						className={fieldClass}
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='email' className={labelClass}>
						Work email <span className='text-brand'>*</span>
					</Label>
					<Input
						id='email'
						name='email'
						type='email'
						required
						autoComplete='email'
						placeholder='jane@company.com'
						className={fieldClass}
					/>
				</div>
			</div>

			<div className='grid gap-6 sm:grid-cols-2'>
				<div className='space-y-2'>
					<Label htmlFor='company' className={labelClass}>
						Company
					</Label>
					<Input
						id='company'
						name='company'
						autoComplete='organization'
						placeholder='Company name'
						className={fieldClass}
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='phone' className={labelClass}>
						Phone
					</Label>
					<Input
						id='phone'
						name='phone'
						type='tel'
						autoComplete='tel'
						placeholder='(555) 123-4567'
						className={fieldClass}
					/>
				</div>
			</div>

			<div className='space-y-2'>
				<Label htmlFor='message' className={labelClass}>
					What is slowing your team down? <span className='text-brand'>*</span>
				</Label>
				<Textarea
					id='message'
					name='message'
					required
					rows={6}
					placeholder='Tell us about the process that is costing you the most time right now.'
					className={`${fieldClass} min-h-36`}
				/>
			</div>

			{status === 'error' && (
				<p
					role='alert'
					className='flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-300'>
					<AlertCircle className='mt-0.5 size-4 shrink-0' />
					{message}
				</p>
			)}

			<Button
				type='submit'
				size='lg'
				disabled={status === 'sending'}
				className='w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
				{status === 'sending' ? (
					<>
						<Loader2 className='animate-spin' /> Sending
					</>
				) : (
					<>
						Send Message <Send />
					</>
				)}
			</Button>

			<p className='text-sm text-slate-500'>
				We reply to every inquiry within one business day.
			</p>
		</form>
	)
}
