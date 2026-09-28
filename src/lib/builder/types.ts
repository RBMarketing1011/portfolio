// Field descriptors that let the inspector build its controls without per-section code.
export type FieldType =
	| 'text'
	| 'textarea'
	| 'richtext'
	| 'number'
	| 'range'
	| 'prose'
	| 'boolean'
	| 'select'
	| 'image'
	| 'icon'
	| 'tint'
	| 'group'
	| 'list'

export type Field = {
	key: string
	label: string
	type: FieldType
	/** Shown under the control in the inspector. */
	hint?: string
	/** `select` only. */
	options?: { value: string; label: string }[]
	/** `number` and `range` only. */
	min?: number
	max?: number
	step?: number
	/** `range` only: appended to the readout, e.g. `%`. */
	unit?: string
	/** `range` and `boolean`: what the control shows before anything is stored. */
	defaultValue?: number | boolean
	/** `list` only: the shape of one row. */
	of?: Field[]	/** `list` only: how a row is labeled in the collapsed list. */
	rowLabel?: string
	/** `list` only: wording for the add button, when `rowLabel` names a row property. */
	addLabel?: string
	/** `list` only: the component reads exactly this many rows, so slots are locked. */
	fixed?: number
	/** `list` only: slot count and row labels come from this sibling list instead. */
	slotsFrom?: string
	/** `text` only: offers one insertable token per row of this top-level list. */
	tokensFrom?: string
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
	/** True when this is never a section on its own: a container child or an in-section primitive. */
	displayItem?: boolean
	/** Renders its own measure only, so the builder wraps it in a full-width Section. */
	bare?: boolean
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
