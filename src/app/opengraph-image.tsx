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
	const [bold, light] = await Promise.all([
		loadFont('SpaceGrotesk-Bold.ttf'),
		loadFont('SpaceGrotesk-Light.ttf'),
	])

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
			{/* Mirrors .hero-grid: diagonal wash underneath, grid lines on top. */}
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
			<div
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: '100%',
					backgroundImage:
						'linear-gradient(to bottom, rgba(1,151,246,0.07) 1px, transparent 1px), linear-gradient(to right, rgba(1,151,246,0.07) 1px, transparent 1px)',
					backgroundSize: '44px 44px',
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
					{/* Satori renders inline SVG but not next/image, so the mark is duplicated from /public/logo. */}
					<svg width='82' height='64' viewBox='0 0 51 40' fill='none'>
						<path
							fill='#0197F6'
							d='M14.3633 17.4522C14.2097 16.8379 14.8085 16.3034 15.4014 16.5255L20.084 18.2813C21.2367 18.7136 22 19.8159 22 21.047C21.9999 22.678 20.6779 24.0001 19.0469 24.0001H18.6309C17.0849 24 15.7374 22.948 15.3623 21.4483L14.3633 17.4522Z'
						/>
						<path
							fill='#0197F6'
							d='M34.5986 16.5255C35.1915 16.3034 35.7903 16.8379 35.6367 17.4522L34.6377 21.4483C34.2626 22.948 32.9151 24 31.3691 24.0001H30.9531C29.3221 24.0001 28.0001 22.678 28 21.047C28 19.8159 28.7633 18.7136 29.916 18.2813L34.5986 16.5255Z'
						/>
						<path
							fill='#0197F6'
							fillRule='evenodd'
							clipRule='evenodd'
							d='M41.5928 0.324304C43.1168 -0.65543 45.0547 0.734588 44.6152 2.49227L42.8604 9.50887C47.2764 14.0176 50 20.1904 50 27.0001V28.1417C50 34.6908 44.6907 40.0001 38.1416 40.0001C35.0982 40 32.1714 38.8297 29.9668 36.7315L25.002 32.0059L20.0322 36.7335C17.8277 38.8303 14.9018 40.0001 11.8594 40.0001C5.30967 40.0001 0 34.6904 0 28.1407V27.0001C1.69261e-05 19.9152 2.9474 13.5189 7.68262 8.96981L6.06348 2.49227C5.62408 0.734675 7.56097 -0.655146 9.08496 0.324304L14.958 4.09969C18.0315 2.75003 21.4281 2.00008 25 2.00008C28.7271 2.00008 32.2631 2.81695 35.4404 4.27938L41.5928 0.324304ZM25 10.0001C15.6112 10.0001 8.00003 17.6113 8 27.0001V28.1407C8 30.2721 9.72795 32.0001 11.8594 32.0001C12.8492 32.0001 13.8012 31.6197 14.5186 30.9376L19.4902 26.2091L25.001 32.004L30.5156 26.21L35.4814 30.9366C36.1987 31.6193 37.1514 32 38.1416 32.0001C40.2724 32.0001 42 30.2725 42 28.1417V27.0001C42 17.6113 34.3888 10.0001 25 10.0001Z'
						/>
					</svg>
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
