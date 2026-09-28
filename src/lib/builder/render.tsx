'use client'

import { Section } from '@/components/sections/primitives'
import { BlockBoundary } from './block-boundary'
import { hydrateProps } from './hydrate'
import { sectionRegistry } from './registry'
import { getSchema } from './schema'
import type { Block } from './types'

function MissingBlock({ type }: { type: string }) {
	return (
		<div className='mx-auto my-6 max-w-6xl rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-8 text-center text-sm text-destructive'>
			Unknown section type: <code>{type}</code>
		</div>
	)
}

export function RenderBlock({
	block,
	selectable = false,
	selectedId,
	flashId,
	nested = false,
}: {
	block: Block
	selectable?: boolean
	selectedId?: string | null
	flashId?: string | null
	nested?: boolean
}) {
	const Component = sectionRegistry[block.type]
	const schema = getSchema(block.type)
	if (!Component || !schema) return <MissingBlock type={block.type} />

	const props = hydrateProps(block.type, block.props)

	if (schema.variantProp && block.variant) {
		props[schema.variantProp] = block.variant
	}

	// A real array, not a component returning one: Carousel maps over its children.
	// Children are edited from the parent's Items tab, so they are never selectable.
	const children = block.children?.length
		? block.children.map((child) => (
				<RenderBlock key={child.id} block={child} selectable={false} nested />
			))
		: undefined

	const content = (
		<BlockBoundary label={schema.label}>
			{schema.container ? (
				<Component {...props}>{children ?? []}</Component>
			) : (
				<Component {...props} />
			)}
		</BlockBoundary>
	)

	// Content primitives render their own measure only. Standing alone on a page they
	// need the full-width shell every other section already carries.
	const element =
		schema.bare && !nested ? <Section>{content}</Section> : content

	// Children are painted through their parent, so only top-level blocks are tagged.
	if (nested) return element

	// display:contents keeps the node addressable for per-block surfaces and
	// click-to-select without adding a box that would disturb grid or flex layout.
	return (
		<div
			data-block-id={block.id}
			data-selected={selectable && block.id === selectedId ? 'true' : undefined}
			data-flash={selectable && block.id === flashId ? 'true' : undefined}
			style={{ display: 'contents' }}>
			{element}
		</div>
	)
}

export function RenderBlocks({
	blocks,
	selectable = false,
	selectedId,
	flashId,
}: {
	blocks: Block[]
	selectable?: boolean
	selectedId?: string | null
	flashId?: string | null
}) {
	return (
		<>
			{blocks.map((block) => (
				<RenderBlock
					key={block.id}
					block={block}
					selectable={selectable}
					selectedId={selectedId}
					flashId={flashId}
				/>
			))}
		</>
	)
}
