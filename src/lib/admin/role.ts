import 'server-only'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongo'

/**
 * Platform role, not an account role. Account roles (`workspaceRoles`) decide what
 * someone may do inside one account; this decides who runs the platform itself.
 *
 * Kept free of auth imports so the workspace layer can use it without a cycle.
 * Read from the database on every check, never carried in the session token, so
 * removing someone's admin access takes effect on their next request.
 */
export async function isPlatformAdmin(userId: string) {
	if (!ObjectId.isValid(userId)) return false
	const db = await getDb()
	const user = await db
		.collection('users')
		.findOne({ _id: new ObjectId(userId) }, { projection: { role: 1 } })
	return user?.role === 'admin'
}
