/**
 * The pieces the AI builder's output schemas are made of (section 11.9). Every object
 * is closed and every property is required, so a schema has no optional and no
 * union-typed parameters (structured outputs allow at most 24 and 16 per request).
 * No bounds live here: lengths, counts and ranges are enforced in code after the
 * reply is read.
 *
 * The planner, outline and writer modules build their schemas from these once, as
 * module constants, so the JSON sent is byte-identical on every request and its
 * compiled grammar stays cached. Key order is part of that: `type` first, then the
 * rest exactly as below (section 11.12 is this output, minified).
 *
 * Pure: no directive and no Node built-ins, so the proofs, the server and the
 * browser can all load it.
 */

export const str = { type: 'string' } as const
export const int = { type: 'integer' } as const
export const bool = { type: 'boolean' } as const

export function enumOf(values: readonly string[]): { type: 'string'; enum: string[] } {
	return { type: 'string', enum: [...values] }
}

export function arr(items: object): { type: 'array'; items: object } {
	return { type: 'array', items }
}

export function obj(properties: Record<string, object>): {
	type: 'object'
	additionalProperties: false
	required: string[]
	properties: Record<string, object>
} {
	return {
		type: 'object',
		additionalProperties: false,
		// Every property required: zero optional parameters.
		required: Object.keys(properties),
		properties,
	}
}

/** sha256 of `JSON.stringify(schema)`, first 16 hex: the proofs pin each schema with it. */
export function schemaHash(schema: object): string {
	return sha256Hex(JSON.stringify(schema)).slice(0, 16)
}

/* -------------------------------------------------------------------------- */
/* SHA-256 (FIPS 180-4), small and synchronous so this module needs no crypto */
/* -------------------------------------------------------------------------- */

const ROUND = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** Hex SHA-256 of the UTF-8 bytes of `text`. */
function sha256Hex(text: string): string {
	const bytes = new TextEncoder().encode(text)
	// The message, a 1 bit, zeros, then the bit length as 64 bits: a whole number of 64-byte blocks.
	const padded = new Uint8Array((((bytes.length + 9 + 63) / 64) | 0) * 64)
	padded.set(bytes)
	padded[bytes.length] = 0x80
	const view = new DataView(padded.buffer)
	const bits = bytes.length * 8
	view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000))
	view.setUint32(padded.length - 4, bits >>> 0)

	const hash = Uint32Array.from(INITIAL)
	const w = new Uint32Array(64)
	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
		}
		let [a, b, c, d, e, f, g, h] = hash
		for (let i = 0; i < 64; i++) {
			const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + ROUND[i] + w[i]) >>> 0
			const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
			h = g
			g = f
			f = e
			e = (d + t1) >>> 0
			d = c
			c = b
			b = a
			a = (t1 + t2) >>> 0
		}
		hash[0] += a
		hash[1] += b
		hash[2] += c
		hash[3] += d
		hash[4] += e
		hash[5] += f
		hash[6] += g
		hash[7] += h
	}
	return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}
