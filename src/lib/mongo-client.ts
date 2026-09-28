import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI

// The adapter wants the client itself, while the rest of the app wants a Db. Both
// share this one cached promise so dev never opens a second pool across HMR reloads.
const globalForMongo = globalThis as typeof globalThis & {
	_mongoClient?: Promise<MongoClient>
}

export function getMongoClient(): Promise<MongoClient> {
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
