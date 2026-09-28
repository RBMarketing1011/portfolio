/**
 * Ids nobody should have to type. Authored rows carry a label already, so every id a
 * block needs is derived from it rather than asked for in the inspector.
 */

/** Matches the heading ids the article pages emit, so anchors line up. */
export function anchorId(label: unknown) {
	return String(label ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}

/** For ids nothing outside the block references. The index keeps repeats distinct. */
export function rowId(label: unknown, index: number) {
	const slug = anchorId(label)
	return slug ? `${index}-${slug}` : `row-${index}`
}

/** A name a formula can reference: identifier characters only, never leading with a digit. */
export function formulaName(label: unknown, index: number) {
	const name = String(label ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
	if (!name) return `input_${index + 1}`
	return /^[0-9]/.test(name) ? `_${name}` : name
}
