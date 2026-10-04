/**
 * A failure with a status a route can answer with and a message fit to show a
 * person. Kept in its own tiny module so a route that only lists folders does not
 * drag the image pipeline (sharp, the AI client) into its bundle just to map an error.
 */
export class MediaError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 503,
	) {
		super(message)
		this.name = 'MediaError'
	}
}
