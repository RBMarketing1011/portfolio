import { MongoClient, type Db } from 'mongodb'

const uri = process.env.MONGODB_URI

// Cached across HMR reloads so dev does not open a new pool on every edit.
const globalForMongo = globalThis as typeof globalThis & {
	_mongoClient?: Promise<MongoClient>
}

function connect(): Promise<MongoClient> {
	if (!uri) {
		throw new Error(
			'MONGODB_URI is not set. Run `pnpm db:up` to start the local database.',
		)
	}
	globalForMongo._mongoClient ??= new MongoClient(uri, {
		serverSelectionTimeoutMS: 5000,
	}).connect()
	return globalForMongo._mongoClient
}

export async function getDb(): Promise<Db> {
	const client = await connect()
	return client.db()
}

export async function pingDb() {
	const db = await getDb()
	const info = await db.admin().serverInfo()
	return { ok: true as const, version: info.version, database: db.databaseName }
}
