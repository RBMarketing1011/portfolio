'use client'

import { useEffect, useState } from 'react'
import { findBlock } from '@/lib/builder/block-ops'
import { useBuilder } from '@/lib/builder/builder-context'
import { pageHref } from '@/lib/builder/page-schema'
import { LOCAL_SITE_ID } from '@/lib/builder/drivers'
import { SaveIndicator } from '../save-indicator'
import { SiteLoadError } from '../site-load-error'
import { globalBackground } from '../background-settings'
import { BackgroundDrawer } from '../background-drawer'
import { BlockInspector } from '../builder/block-inspector'
import { CanvasFrame } from '../builder/canvas-frame'

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
	const [colorsOpen, setColorsOpen] = useState(false)

	useEffect(() => {
		if (store.hydrated && store.pageId !== pageId) store.setPageId(pageId)
	}, [store, pageId])

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (!(event.metaKey || event.ctrlKey)) return
			if (event.key === 'z' && !event.shiftKey) {
				event.preventDefault()
				store.undo()
			} else if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
				event.preventDefault()
				store.redo()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [store])

	if (store.loadError) return <SiteLoadError message={store.loadError} />

	if (!store.hydrated) {
		return (
			<div className='flex h-screen items-center justify-center text-sm text-slate-500'>
				Loading…
			</div>
		)
	}

	const page = store.pages.find((p) => p.id === pageId)
	if (!page) {
		return (
			<div className='flex h-screen items-center justify-center px-6 text-center'>
				<p className='max-w-sm leading-7 text-slate-400'>
					That page no longer exists. Pick another from the sidebar, or add a
					new one.
				</p>
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
					selectedId={store.selectedId}
					viewHref={pageHref(`/preview/${siteId}`, page.slug)}
					nav={store.pages.filter((p) => p.inHeader)}
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
