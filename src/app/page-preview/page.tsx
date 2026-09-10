import { googleFontHref } from '@/app/sections/google-fonts'
import { readBackground } from '@/app/sections/background-settings'
import { readSettings } from '@/app/sections/theme-settings'
import { backgroundCss, themeCss } from '@/app/section-preview/theme'
import { PreviewCanvas } from './preview-canvas'

export const metadata = {
	title: 'Page Preview',
	robots: { index: false, follow: false },
}

export default async function BuilderPreviewPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
	const raw = await searchParams
	const flat = new URLSearchParams()
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string') flat.set(key, value)
		else if (Array.isArray(value) && value[0]) flat.set(key, value[0])
	}

	const settings = readSettings(flat)
	const background = readBackground(flat)
	const fontHref = googleFontHref([settings.headingFont, settings.bodyFont])

	return (
		<>
			{fontHref && <link rel='stylesheet' href={fontHref} />}
			<style dangerouslySetInnerHTML={{ __html: themeCss(settings) }} />
			<style dangerouslySetInnerHTML={{ __html: backgroundCss(background) }} />
			<PreviewCanvas inert={flat.get('inert') === '1'} />
		</>
	)
}
