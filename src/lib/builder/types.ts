// Field descriptors that let the inspector build its controls without per-section code.
export type FieldType =
	| 'text'
	| 'textarea'
	| 'richtext'
	| 'number'
	| 'boolean'
	| 'select'
	| 'image'
	| 'icon'
	| 'tint'
	| 'list'

export type Field = {
	key: string
	label: string
	type: FieldType
	/** Shown under the control in the inspector. */
	hint?: string
	/** `select` only. */
	options?: { value: string; label: string }[]
	/** `number` only. */
	min?: number
	max?: number
	step?: number
	/** `list` only: the shape of one row. */
	of?: Field[]
	/** `list` only: how a row is labeled in the collapsed list. */
	rowLabel?: string
	/** `list` only: the component reads exactly this many rows, so slots are locked. */
	fixed?: number
}

export type VariantOption = { id: string; label: string }

export type SectionSchema = {
	/** Stable key stored in page JSON. */
	type: string
	label: string
	description: string
	/** Library group id, used to group the "add section" picker. */
	group: string
	/** The prop name that carries the visual variant, e.g. `variant`, `layout`, `design`. */
	variantProp?: string
	variants?: VariantOption[]
	/** Seeded on create, for sections whose component defaults to rendering nothing. */
	defaults?: Record<string, unknown>
	/** Field keys moved to their own Items tab, for sections built around a set. */
	itemFields?: string[]
	fields: Field[]
	/** Containers accept a `children` array of blocks. */
	container?: {
		/** Section types offered when adding a child. */
		accepts: string[]
		/** Used when a container is created empty. */
		defaultChild: string
		defaultChildCount: number
	}
	/** True when this section is only ever a child of a container. */
	displayItem?: boolean
}

export type Block = {
	id: string
	type: string
	variant?: string
	props?: Record<string, unknown>
	children?: Block[]
}

export type PageDoc = {
	id: string
	name: string
	slug: string
	blocks: Block[]
	createdAt: string
	updatedAt: string
}
