'use client'

import { Component, type ReactNode } from 'react'

/** One bad block should not blank the whole page in the builder. */
export class BlockBoundary extends Component<
	{ label: string; children: ReactNode },
	{ error: Error | null }
> {
	state = { error: null as Error | null }

	static getDerivedStateFromError(error: Error) {
		return { error }
	}

	render() {
		if (!this.state.error) return this.props.children
		return (
			<div className='mx-auto my-6 max-w-6xl rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-8 text-center'>
				<p className='text-sm font-semibold text-destructive'>
					{this.props.label} could not render
				</p>
				<p className='mt-2 text-xs text-slate-400'>
					{this.state.error.message}
				</p>
			</div>
		)
	}
}
