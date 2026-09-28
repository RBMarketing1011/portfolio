import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { site } from '@/lib/site'

// Rendered at 64 so the browser downscaling to 16/32 stays crisp.
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default async function Icon() {
	const logo = await readFile(join(process.cwd(), 'public', site.logo))

	// Satori takes an SVG data URI but not next/image, so the file is embedded.
	const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`

	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: '#03080f',
				borderRadius: 14,
			}}>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={logoSrc} width={41} height={44} alt='' />
		</div>,
		size,
	)
}
