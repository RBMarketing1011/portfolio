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
	// A connect that fails (Atlas cold start, DNS blip) must not stay cached: on a
	// serverless instance that promise would be handed to every later request and
	// turn one transient error into an instance that fails until it is recycled.
	globalForMongo._mongoClient ??= new MongoClient(uri, {
		serverSelectionTimeoutMS: 5000,
	})
		.connect()
		.catch((error: unknown) => {
			globalForMongo._mongoClient = undefined
			throw error
		})
	return globalForMongo._mongoClient
}
