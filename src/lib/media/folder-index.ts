/**
 * An in-memory view of one workspace's folder tree. Folders are few (the cap is a
 * thousand), so the tree is rebuilt per request instead of being denormalised onto
 * every asset. That is what makes renaming or moving a folder a single-document
 * write: nothing stored on an asset names its folder's path.
 *
 * Pure and client safe.
 */
import type { MediaFolderDoc } from './types'

export type FolderNode = {
	id: string
	parentId: string | null
	name: string
	/** `Clients/Acme/Hero`. */
	path: string
	/** A top-level folder is depth 0. */
	depth: number
	childIds: string[]
}

export type FolderIndex = {
	nodes: Map<string, FolderNode>
	/** Top-level folder ids, in display order. */
	roots: string[]
	has(id: string): boolean
	/** Empty string for the library root, an unknown id, or null. */
	pathOf(id: string | null | undefined): string
	/** -1 for an unknown id. */
	depthOf(id: string): number
	/** The folder and every folder beneath it, depth first. Empty for an unknown id. */
	subtree(id: string): string[]
	/** True when `id` is `ancestorId` or lives somewhere beneath it. */
	isInSubtree(ancestorId: string, id: string): boolean
	/** How many levels sit beneath this folder: 0 for a leaf. -1 for an unknown id. */
	height(id: string): number
	/** Case, accent and punctuation insensitive. Matches the full path. */
	findByPath(path: string): string | null
	/** Folders whose own name equals, or starts with, `text` (same loose matching). */
	findByName(text: string, mode: 'exact' | 'prefix'): string[]
	/** Every folder in display order: parents before children, siblings by name. */
	ordered(): FolderNode[]
}

/**
 * The one folder-name comparison key, and what `nameKey` stores: lowercase
 * Unicode words with accents and punctuation gone. It must be Unicode aware: an
 * ASCII-only key turns every non-Latin name ("日本", "Фото", an emoji) into an empty
 * string, and two such siblings would collide on the unique index. When nothing
 * letter-like survives (a name of pure punctuation) it falls back to the
 * lowercased trimmed name, so distinct names keep distinct keys.
 */
export const folderKey = (value: string) => {
	const key = value
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
	return key || value.normalize('NFKC').trim().toLowerCase()
}

const pathKey = (path: string) =>
	path
		.split('/')
		.map(folderKey)
		.filter(Boolean)
		.join('/')

export function buildFolderIndex(
	docs: Pick<MediaFolderDoc, '_id' | 'parentId' | 'name'>[],
): FolderIndex {
	const raw = new Map(
		docs.map((doc) => [
			doc._id.toString(),
			{
				id: doc._id.toString(),
				// A parent that no longer exists is treated as the root, so one
				// orphan cannot make a whole subtree unreachable.
				parentId: doc.parentId ? doc.parentId.toString() : null,
				name: doc.name,
			},
		]),
	)
	for (const node of raw.values())
		if (node.parentId && !raw.has(node.parentId)) node.parentId = null

	// A cycle is corrupt data, but it must not hang a page load. Walk up from every
	// node and cut the loop where it closes.
	for (const node of raw.values()) {
		const seen = new Set<string>([node.id])
		let cursor = node.parentId ? raw.get(node.parentId) : undefined
		while (cursor) {
			if (seen.has(cursor.id)) {
				cursor.parentId = null
				break
			}
			seen.add(cursor.id)
			cursor = cursor.parentId ? raw.get(cursor.parentId) : undefined
		}
	}

	const byName = (a: { name: string }, b: { name: string }) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })

	type Item = { id: string; parentId: string | null; name: string }
	const children = new Map<string | null, Item[]>()
	for (const node of raw.values()) {
		const list = children.get(node.parentId) ?? []
		list.push(node)
		children.set(node.parentId, list)
	}
	for (const list of children.values()) list.sort(byName)

	const nodes = new Map<string, FolderNode>()
	const order: FolderNode[] = []
	const visit = (parentId: string | null, parentPath: string, depth: number) => {
		for (const item of children.get(parentId) ?? []) {
			const path = parentPath ? `${parentPath}/${item.name}` : item.name
			const node: FolderNode = {
				id: item.id,
				parentId: item.parentId,
				name: item.name,
				path,
				depth,
				childIds: (children.get(item.id) ?? []).map((c) => c.id),
			}
			nodes.set(node.id, node)
			order.push(node)
			visit(item.id, path, depth + 1)
		}
	}
	visit(null, '', 0)

	const roots = (children.get(null) ?? []).map((c) => c.id)

	const subtree = (id: string): string[] => {
		if (!nodes.has(id)) return []
		const out: string[] = []
		const walk = (current: string) => {
			out.push(current)
			for (const child of nodes.get(current)?.childIds ?? []) walk(child)
		}
		walk(id)
		return out
	}

	const height = (id: string): number => {
		const node = nodes.get(id)
		if (!node) return -1
		return node.childIds.length
			? 1 + Math.max(...node.childIds.map((child) => height(child)))
			: 0
	}

	const byPathKey = new Map<string, string>()
	for (const node of order) byPathKey.set(pathKey(node.path), node.id)

	return {
		nodes,
		roots,
		has: (id) => nodes.has(id),
		pathOf: (id) => (id ? (nodes.get(id)?.path ?? '') : ''),
		depthOf: (id) => nodes.get(id)?.depth ?? -1,
		subtree,
		isInSubtree: (ancestorId, id) => subtree(ancestorId).includes(id),
		height,
		findByPath: (path) => byPathKey.get(pathKey(path)) ?? null,
		findByName: (text, mode) => {
			const wanted = folderKey(text)
			if (!wanted) return []
			return order
				.filter((node) => {
					const key = folderKey(node.name)
					return mode === 'exact' ? key === wanted : key.startsWith(wanted)
				})
				.map((node) => node.id)
		},
		ordered: () => order,
	}
}
