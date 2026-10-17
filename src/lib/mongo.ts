import { type Db } from 'mongodb'
import { getMongoClient } from './mongo-client'

export async function getDb(): Promise<Db> {
	const client = await getMongoClient()
	return client.db()
}

export async function pingDb() {
	const client = await getMongoClient()
	const db = client.db()
	const info = await db.admin().serverInfo()
	return {
		ok: true as const,
		version: info.version,
		database: db.databaseName,
		// Which servers this process talks to, so a proof can refuse to drive a
		// dev server that is quietly pointed at a hosted cluster.
		hosts: client.options.hosts.map((host) => host.toString()),
	}
}
