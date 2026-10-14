/**
 * One live call to the AI writer, to see what it writes for a sample business.
 * Spends one request of real API usage. Needs ANTHROPIC_API_KEY and MONGODB_URI.
 *
 *   node --env-file=.env scripts/try-builder-ai.cjs
 */
const { ObjectId } = require('mongodb')
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')

const { writeBlocks } = loadTs('src/lib/builder/ai-writer.ts')
const { readSiteProfile } = loadTs('src/lib/builder/site-profile.ts')
const { MongoClient } = rootRequire('mongodb')

async function main() {
	const client = await MongoClient.connect(process.env.MONGODB_URI)
	try {
		const profile = readSiteProfile({
			business: {
				enabled: true,
				type: 'Plumber',
				name: 'Rivera Plumbing',
				description: 'Family-run residential plumbing: leaks, drains, water heaters.',
				phone: '+1 512 555 0100',
				city: 'Austin',
				region: 'TX',
				serviceArea: ['Austin', 'Round Rock'],
			},
		})
		const started = Date.now()
		const blocks = await writeBlocks({
			db: client.db(),
			// A throwaway account, so the usage counter and media lookup touch nothing real.
			workspaceId: new ObjectId(),
			profile,
			projectName: 'Rivera',
			siteMedia: [],
			page: { name: 'Water Heaters', slug: 'water-heaters' },
			blocks: [
				{
					id: 'b1',
					type: 'split-hero',
					props: {
						eyebrow: 'Eyebrow',
						title: 'Big [[headline]] here',
						description: 'Template description.',
						actions: [{ label: 'Get started', href: '/contact', style: 'primary' }],
					},
				},
			],
			options: { text: true, replaceImages: false, fillImages: false },
			scope: 'section',
		})
		console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`)
		console.log(JSON.stringify(blocks, null, 2))
	} finally {
		await client.close()
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
