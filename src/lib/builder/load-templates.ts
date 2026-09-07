import 'server-only'
import { getDb } from '@/lib/mongo'
import { templateSchema, type Template } from './page-schema'

/** Falls back to an empty list so the builder still opens if Mongo is down. */
export async function loadTemplates(): Promise<Template[]> {
	try {
		const db = await getDb()
		const docs = await db
			.collection('templates')
			.find({}, { projection: { _id: 0 } })
			.sort({ order: 1, name: 1 })
			.toArray()

		return docs.flatMap((doc) => {
			const parsed = templateSchema.safeParse(doc)
			return parsed.success ? [parsed.data] : []
		})
	} catch {
		return []
	}
}
