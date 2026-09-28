import { type Db } from 'mongodb'
import { getMongoClient } from './mongo-client'

export async function getDb(): Promise<Db> {
	const client = await getMongoClient()
	return client.db()
}

export async function pingDb() {
	const db = await getDb()
	const info = await db.admin().serverInfo()
	return { ok: true as const, version: info.version, database: db.databaseName }
}
