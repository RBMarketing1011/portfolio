'use client'

import type { Block } from './types'
import { getSchema } from './schema'

export function newId(prefix = 'blk') {
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** Fresh ids throughout, so a template can be cloned into a page safely. */
export function cloneBlocks(blocks: Block[]): Block[] {
	return blocks.map((block) => ({
		...block,
		id: newId(),
		props: block.props ? structuredClone(block.props) : undefined,
		children: block.children ? cloneBlocks(block.children) : undefined,
	}))
}

export function createBlock(type: string): Block {
	const schema = getSchema(type)
	const block: Block = { id: newId(), type }
	if (schema?.variants?.length) block.variant = schema.variants[0].id
	if (schema?.defaults) block.props = { ...schema.defaults }
	if (schema?.container) {
		block.children = Array.from(
			{ length: schema.container.defaultChildCount },
			() => createBlock(schema.container!.defaultChild),
		)
	}
	return block
}

export function findBlock(blocks: Block[], id: string): Block | undefined {
	for (const block of blocks) {
		if (block.id === id) return block
		const nested = block.children && findBlock(block.children, id)
		if (nested) return nested
	}
	return undefined
}

function mapTree(blocks: Block[], fn: (block: Block) => Block | null): Block[] {
	const out: Block[] = []
	for (const block of blocks) {
		const next = fn(block)
		if (!next) continue
		out.push(
			next.children ? { ...next, children: mapTree(next.children, fn) } : next,
		)
	}
	return out
}

export function updateBlock(
	blocks: Block[],
	id: string,
	patch: (block: Block) => Block,
): Block[] {
	return mapTree(blocks, (block) => (block.id === id ? patch(block) : block))
}

export function removeBlock(blocks: Block[], id: string): Block[] {
	return mapTree(blocks, (block) => (block.id === id ? null : block))
}

/** Inserts after `afterId`, or at the end when it is not found. */
export function insertBlock(
	blocks: Block[],
	block: Block,
	afterId?: string | null,
): Block[] {
	if (!afterId) return [...blocks, block]
	const index = blocks.findIndex((b) => b.id === afterId)
	if (index === -1) return [...blocks, block]
	return [...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)]
}

export function duplicateBlock(blocks: Block[], id: string): Block[] {
	const index = blocks.findIndex((b) => b.id === id)
	if (index === -1) {
		return blocks.map((block) =>
			block.children
				? { ...block, children: duplicateBlock(block.children, id) }
				: block,
		)
	}
	const [copy] = cloneBlocks([blocks[index]])
	return [...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]
}

export function moveBlock(blocks: Block[], from: number, to: number): Block[] {
	if (from === to || from < 0 || from >= blocks.length) return blocks
	const next = [...blocks]
	const [moved] = next.splice(from, 1)
	next.splice(Math.max(0, Math.min(to, next.length)), 0, moved)
	return next
}
