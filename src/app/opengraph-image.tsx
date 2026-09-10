import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { site } from '@/lib/site'

export const alt = `${site.name} — AI, automation, and custom software`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Satori cannot read woff2, so the brand face ships as static TTFs beside this route.
// Read off disk at prerender time; fetch() cannot open file: URLs and bundlers
// rewrite new URL(..., import.meta.url) into an asset path.
const loadFont = (file: string) =>
	readFile(join(process.cwd(), 'src/app/_fonts', file))

export default async function Image() {
	const [bold, light, logo] = await Promise.all([
		loadFont('SpaceGrotesk-Bold.ttf'),
		loadFont('SpaceGrotesk-Light.ttf'),
		readFile(join(process.cwd(), 'public', site.logo)),
	])

	// Satori takes an SVG data URI but not next/image, so the file is embedded.
	const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`

	return new ImageResponse(
		<div
			style={{
				position: 'relative',
				width: '100%',
				height: '100%',
				display: 'flex',
				backgroundColor: '#03080f',
				fontFamily: 'Space Grotesk',
			}}>
			{/* Mirrors .hero-grid: diagonal wash underneath, crosshatch on top. */}
			<div
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: '100%',
					backgroundImage:
						'linear-gradient(135deg, rgba(63,178,250,0.28) 0%, rgba(1,151,246,0.14) 28%, rgba(4,22,40,0.6) 62%, rgba(3,8,15,0.95) 100%)',
				}}
			/>
			{/* Satori has no repeating-linear-gradient, so one hairline is tiled per
			    diagonal. 31px ≈ the 22px CSS spacing measured across the diagonal. */}
			<div
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: '100%',
					backgroundImage:
						'linear-gradient(45deg, transparent 48.5%, rgba(1,151,246,0.07) 48.5%, rgba(1,151,246,0.07) 51.5%, transparent 51.5%), linear-gradient(135deg, transparent 48.5%, rgba(1,151,246,0.07) 48.5%, rgba(1,151,246,0.07) 51.5%, transparent 51.5%)',
					backgroundSize: '31px 31px',
				}}
			/>
			<div
				style={{
					position: 'relative',
					width: '100%',
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
					padding: '72px',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 20,
						fontSize: 44,
						letterSpacing: '-0.02em',
					}}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={logoSrc} width={60} height={64} alt='' />
					<div style={{ display: 'flex', color: '#ffffff' }}>
						<span style={{ fontWeight: 700 }}>{site.nameParts.first}</span>
						<span style={{ fontWeight: 300, color: '#0197f6' }}>
							{site.nameParts.second}
						</span>
					</div>
				</div>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						color: '#ffffff',
						fontSize: 68,
						fontWeight: 700,
						letterSpacing: '-0.02em',
						lineHeight: 1.1,
					}}>
					AI, automation, and software
					<span style={{ color: '#0197f6' }}>built around your business.</span>
				</div>
				<div
					style={{
						display: 'flex',
						color: '#9cb0c6',
						fontSize: 28,
						fontWeight: 300,
					}}>
					{site.domain}
				</div>
			</div>
		</div>,
		{
			...size,
			fonts: [
				{ name: 'Space Grotesk', data: bold, weight: 700, style: 'normal' },
				{ name: 'Space Grotesk', data: light, weight: 300, style: 'normal' },
			],
		},
	)
}
