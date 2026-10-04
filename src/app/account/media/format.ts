/** Small display helpers every part of the media UI shares, so numbers read the same everywhere. */
import type { MediaAssetDTO, MediaTaggingStatus } from '@/lib/media/types'

export function formatBytes(bytes: number) {
	if (!Number.isFinite(bytes) || bytes < 0) return '—'
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export const formatCount = (n: number) => n.toLocaleString('en-US')

export const pluralize = (n: number, one: string, many = `${one}s`) =>
	`${formatCount(n)} ${n === 1 ? one : many}`

export const formatDimensions = (asset: Pick<MediaAssetDTO, 'width' | 'height'>) =>
	`${formatCount(asset.width)} × ${formatCount(asset.height)}`

export function timeAgo(iso: string, now = Date.now()) {
	const diff = Math.max(0, now - new Date(iso).getTime())
	const minutes = Math.floor(diff / 60_000)
	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days}d ago`
	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})
}

export const taggingLabel = (status: MediaTaggingStatus) =>
	({
		pending: 'Waiting for tags',
		running: 'Tagging…',
		done: 'Tagged',
		failed: 'Tagging failed',
		skipped: 'Not tagged',
	})[status]

/** `tag:kitchen` for a slug; quotes a value that needs it. */
export const clauseFor = (field: string, value: string) =>
	`${field}:${/[\s"()]/.test(value) ? `"${value.replace(/"/g, '')}"` : value}`
