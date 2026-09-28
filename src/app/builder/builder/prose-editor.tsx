'use client'

import { useEffect } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
	Bold,
	Code,
	Italic,
	List,
	ListOrdered,
	Minus,
	Pilcrow,
	Quote,
	Redo2,
	Strikethrough,
	Undo2,
	type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = {
	label: string
	icon?: LucideIcon
	text?: string
	isActive: (e: Editor) => boolean
	run: (e: Editor) => void
}

const TOOLS: Tool[][] = [
	[
		{
			label: 'Paragraph',
			icon: Pilcrow,
			isActive: (e) => e.isActive('paragraph'),
			run: (e) => e.chain().focus().setParagraph().run(),
		},
		...([2, 3, 4, 5, 6] as const).map((level) => ({
			label: `Heading ${level}`,
			text: `H${level}`,
			isActive: (e: Editor) => e.isActive('heading', { level }),
			run: (e: Editor) => e.chain().focus().toggleHeading({ level }).run(),
		})),
	],
	[
		{
			label: 'Bold',
			icon: Bold,
			isActive: (e) => e.isActive('bold'),
			run: (e) => e.chain().focus().toggleBold().run(),
		},
		{
			label: 'Italic',
			icon: Italic,
			isActive: (e) => e.isActive('italic'),
			run: (e) => e.chain().focus().toggleItalic().run(),
		},
		{
			label: 'Strikethrough',
			icon: Strikethrough,
			isActive: (e) => e.isActive('strike'),
			run: (e) => e.chain().focus().toggleStrike().run(),
		},
		{
			label: 'Inline code',
			icon: Code,
			isActive: (e) => e.isActive('code'),
			run: (e) => e.chain().focus().toggleCode().run(),
		},
	],
	[
		{
			label: 'Bullet list',
			icon: List,
			isActive: (e) => e.isActive('bulletList'),
			run: (e) => e.chain().focus().toggleBulletList().run(),
		},
		{
			label: 'Ordered list',
			icon: ListOrdered,
			isActive: (e) => e.isActive('orderedList'),
			run: (e) => e.chain().focus().toggleOrderedList().run(),
		},
		{
			label: 'Quote',
			icon: Quote,
			isActive: (e) => e.isActive('blockquote'),
			run: (e) => e.chain().focus().toggleBlockquote().run(),
		},
		{
			label: 'Divider',
			icon: Minus,
			isActive: () => false,
			run: (e) => e.chain().focus().setHorizontalRule().run(),
		},
	],
	[
		{
			label: 'Undo',
			icon: Undo2,
			isActive: () => false,
			run: (e) => e.chain().focus().undo().run(),
		},
		{
			label: 'Redo',
			icon: Redo2,
			isActive: () => false,
			run: (e) => e.chain().focus().redo().run(),
		},
	],
]

/** Body copy authored as HTML, for blocks whose content is a real document. */
export function ProseEditor({
	value,
	onChange,
}: {
	value: string | undefined
	onChange: (value: string | undefined) => void
}) {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({ heading: { levels: [2, 3, 4, 5, 6] } }),
			Placeholder.configure({ placeholder: 'Write the body copy…' }),
		],
		content: value ?? '',
		editorProps: {
			attributes: {
				class:
					'prose-editor min-h-40 max-h-96 overflow-y-auto px-3 py-2 text-sm leading-7 text-slate-200 outline-none',
			},
		},
		onUpdate: ({ editor }) =>
			onChange(editor.isEmpty ? undefined : editor.getHTML()),
	})

	// A Reset elsewhere in the inspector has to be reflected back into the document.
	useEffect(() => {
		if (!editor) return
		const next = value ?? ''
		if (next !== editor.getHTML()) {
			editor.commands.setContent(next, { emitUpdate: false })
		}
	}, [value, editor])

	if (!editor) return null

	return (
		<div className='overflow-hidden rounded-md border border-white/10 bg-white/4'>
			<div className='flex flex-wrap items-center gap-0.5 border-b border-white/10 p-1'>
				{TOOLS.map((group, groupIndex) => (
					<div key={groupIndex} className='flex items-center gap-0.5'>
						{groupIndex > 0 && (
							<span aria-hidden className='mx-1 h-4 w-px bg-white/10' />
						)}
						{group.map((tool) => {
							const Icon = tool.icon
							const active = tool.isActive(editor)
							return (
								<button
									key={tool.label}
									type='button'
									title={tool.label}
									aria-label={tool.label}
									aria-pressed={active}
									onClick={() => tool.run(editor)}
									className={cn(
										'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-semibold transition-colors',
										active
											? 'bg-brand/20 text-brand'
											: 'text-slate-400 hover:bg-white/5 hover:text-white',
									)}>
									{Icon ? <Icon className='size-3.5' /> : tool.text}
								</button>
							)
						})}
					</div>
				))}
			</div>
			<EditorContent editor={editor} />
		</div>
	)
}
