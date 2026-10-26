'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { findBlock } from '@/lib/builder/block-ops'
import { useBuilder } from '@/lib/builder/builder-context'
import { pageHref } from '@/lib/builder/page-schema'
import { LOCAL_SITE_ID } from '@/lib/builder/drivers'
import { SaveIndicator } from '../save-indicator'
import { SiteLoadError } from '../site-load-error'
import { BuilderSkeleton } from '../builder-skeleton'
import { globalBackground } from '../background-settings'
import { BackgroundDrawer } from '../background-drawer'
import { BlockInspector } from '../builder/block-inspector'
import { CanvasFrame } from '../builder/canvas-frame'

/**
 * Text fields keep their own undo: a shortcut typed in an input, a textarea, a select,
 * an editable region or anywhere in an open dialog is not the site's undo.
 */
function isEditable(target: EventTarget | null) {
	const element = target as HTMLElement | null
	if (!element || typeof element.closest !== 'function') return false
	return (
		element.isContentEditable ||
		element.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"]') !== null
	)
}

export function PageEditor({
	pageId,
	siteId = LOCAL_SITE_ID,
	signedIn = false,
}: {
	pageId: string
	siteId?: string
	signedIn?: boolean
}) {
	const store = useBuilder()
	const router = useRouter()
	const [colorsOpen, setColorsOpen] = useState(false)
	// Whether this page was here while editing: then its disappearing (an undo, a redo,
	// a delete) moves on to a page that exists, and only a typed URL shows the message.
	const seen = useRef(false)
	const pagesBase = `/builder/sites/${siteId}/pages`

	useEffect(() => {
		if (store.hydrated && store.pageId !== pageId) store.setPageId(pageId)
	}, [store, pageId])

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return
			if (isEditable(event.target)) return
			// With Shift held the key is 'Z', so compare it lowercased.
			const key = event.key.toLowerCase()
			if (key === 'z' && !event.shiftKey) {
				event.preventDefault()
				store.undo()
			} else if ((key === 'z' && event.shiftKey) || key === 'y') {
				event.preventDefault()
				store.redo()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [store])

	const page = store.pages.find((p) => p.id === pageId)
	if (page) seen.current = true
	const vanished = store.hydrated && !store.loadError && !page && seen.current
	const first = store.pages[0]

	useEffect(() => {
		if (!vanished) return
		router.replace(first ? `${pagesBase}/${first.id}` : pagesBase)
	}, [vanished, first, pagesBase, router])

	if (store.loadError) return <SiteLoadError message={store.loadError} />

	if (!store.hydrated || vanished) return <BuilderSkeleton />

	if (!page) {
		return (
			<div className='flex h-screen items-center justify-center px-6 text-center'>
				<div className='grid max-w-sm justify-items-center gap-4'>
					<p className='leading-7 text-slate-400'>
						That page no longer exists. Pick another from the sidebar, or add a
						new one.
					</p>
					{first && (
						<Button variant='outline' asChild>
							<Link href={`${pagesBase}/${first.id}`}>Open {first.name}</Link>
						</Button>
					)}
				</div>
			</div>
		)
	}

	const selected = findBlock(page.blocks, store.selectedId ?? '') ?? null

	return (
		<div className='flex h-screen overflow-hidden'>
			<SaveIndicator
				state={store.saveState}
				error={store.saveError}
				onRetry={store.retrySave}
			/>
			<main className='min-w-0 flex-1'>
				<CanvasFrame
					blocks={page.blocks}
					pageId={page.id}
					selectedId={store.selectedId}
					viewHref={pageHref(`/preview/${siteId}`, page.slug)}
					nav={store.pages
						.filter((p) => p.inHeader)
						.map(({ id, name, slug }) => ({ id, name, slug }))}
					footerPages={store.pages.map(({ id, name, slug }) => ({ id, name, slug }))}
					chrome={store.chrome}
					currentSlug={page.slug}
					signedIn={signedIn}
					onSelect={store.setSelectedId}
					onUndo={store.undo}
					onRedo={store.redo}
				/>
			</main>

			<BlockInspector
				block={selected}
				theme={store.look.theme}
				open={store.inspectorOpen}
				onOpenChange={store.setInspectorOpen}
				onOpenColors={() => setColorsOpen(true)}
				childOps={{
					add: (type) => selected && store.addChild(selected.id, type),
					remove: (childId) =>
						selected && store.removeChild(selected.id, childId),
					duplicate: (childId) =>
						selected && store.duplicateChild(selected.id, childId),
					move: (from, to) =>
						selected && store.moveChild(selected.id, from, to),
					setProp: (childId, key, value) => store.setProp(childId, key, value),
					setVariant: (childId, variant) => store.setVariant(childId, variant),
					setAllTypes: (type) =>
						selected && store.setChildrenType(selected.id, type),
					setAllVariants: (variant) =>
						selected && store.setChildrenVariant(selected.id, variant),
				}}
				onVariantChange={(variant) =>
					store.selectedId && store.setVariant(store.selectedId, variant)
				}
				onPropChange={(key, value) =>
					store.selectedId && store.setProp(store.selectedId, key, value)
				}
			/>

			<BackgroundDrawer
				slug={selected?.type ?? 'section'}
				open={colorsOpen && selected !== null}
				onOpenChange={setColorsOpen}
				settings={store.look.blocks[selected?.id ?? ''] ?? globalBackground}
				theme={store.look.theme}
				onChange={(next) => selected && store.setBlockLook(selected.id, next)}
			/>
		</div>
	)
}
