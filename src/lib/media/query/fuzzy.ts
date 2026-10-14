/**
 * Typo tolerance and prefix expansion against a workspace's vocabulary. Pure.
 *
 * The distance is "optimal string alignment": insert, delete, substitute and an
 * adjacent swap, where a swapped pair is never edited again. It differs from the
 * unrestricted Damerau-Levenshtein only for strings like `ca` -> `abc` (3, not 2),
 * which no typo looks like. The restriction is what makes the early exit below sound.
 */
import { stem } from '../text'

const NO_LIMIT = Number.MAX_SAFE_INTEGER

/** Code points, so a letter outside the BMP is one symbol and never two halves. */
function codes(text: string): number[] {
	const out: number[] = []
	for (let i = 0; i < text.length; ) {
		const code = text.codePointAt(i) as number
		out.push(code)
		i += code > 0xffff ? 2 : 1
	}
	return out
}

/**
 * Damerau-Levenshtein distance (insert, delete, substitute, adjacent swap), with
 * an early exit: returns `max + 1` as soon as the distance is certainly above
 * `max`. `kithcen` vs `kitchen` is 1 (a swap).
 */
export function editDistance(a: string, b: string, max: number): number {
	const left = typeof a === 'string' ? a : ''
	const right = typeof b === 'string' ? b : ''
	const cap =
		typeof max === 'number' && max > 0 ? (max === Infinity ? NO_LIMIT : Math.floor(max)) : 0
	if (left === right) return 0

	const s = codes(left)
	const t = codes(right)
	const n = s.length
	const m = t.length
	// Every edit changes the length by at most one, so a bigger gap is already too far.
	if (Math.abs(n - m) > cap) return cap + 1
	if (n === 0 || m === 0) return Math.max(n, m)

	let beforePrevious = new Array<number>(m + 1)
	let previous = new Array<number>(m + 1)
	let current = new Array<number>(m + 1)
	for (let j = 0; j <= m; j++) previous[j] = j

	for (let i = 1; i <= n; i++) {
		current[0] = i
		let rowMin = i
		for (let j = 1; j <= m; j++) {
			let value = previous[j] + 1
			const insert = current[j - 1] + 1
			if (insert < value) value = insert
			const substitute = previous[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
			if (substitute < value) value = substitute
			if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
				const swap = beforePrevious[j - 2] + 1
				if (swap < value) value = swap
			}
			current[j] = value
			if (value < rowMin) rowMin = value
		}
		// A row's cheapest cell is never below the cheapest one of the row above it (even a swap,
		// which reaches two rows up, costs one, and a row is at most one dearer than the row before),
		// so a row that is over the limit everywhere has already lost.
		if (rowMin > cap) return cap + 1
		const spare = beforePrevious
		beforePrevious = previous
		previous = current
		current = spare
	}
	const distance = previous[m]
	return distance > cap ? cap + 1 : distance
}

/** How many edits a word of this length may be off by: 0 under 4 letters, 1 for 4-6, 2 for 7+. */
export function allowedEdits(length: number): number {
	if (typeof length !== 'number' || !(length >= 4)) return 0
	return length <= 6 ? 1 : 2
}

export type Expansion = {
	/** Vocabulary words at distance 0..allowed from the query word or its stem, best first. */
	fuzzy: string[]
}

/** The number of code points, which is what a person counts as letters. */
const lengthOf = (text: string): number => {
	let count = 0
	for (let i = 0; i < text.length; i++) {
		const unit = text.charCodeAt(i)
		// A high surrogate is the first half of a pair: count the pair once.
		if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) i++
		count++
	}
	return count
}

const firstOf = (text: string): number => text.codePointAt(0) ?? -1

/**
 * Words from `vocabulary` that could be what a person meant by `word`: within
 * `allowedEdits` of `word`, sharing its first letter (typos rarely hit the first
 * character, and it cuts the search space), best (lowest distance, then most
 * documents) first, at most `limit`. Excludes `word` itself and any word held by no
 * asset. [] if the word is too short for tolerance or nothing is close.
 */
export function fuzzyCandidates(
	word: string,
	vocabulary: ReadonlyMap<string, number>,
	limit = 3,
): string[] {
	const query = typeof word === 'string' ? word : ''
	const allowed = allowedEdits(lengthOf(query))
	const take = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 0
	if (!allowed || !take || !vocabulary || typeof vocabulary.entries !== 'function') return []

	const first = firstOf(query)
	const found: { word: string; distance: number; count: number }[] = []
	for (const [candidate, count] of vocabulary) {
		if (candidate === query || typeof candidate !== 'string') continue
		// A word with no asset behind it is not one a person could have meant: the rule `inVocabulary` has.
		if (typeof count !== 'number' || !(count > 0)) continue
		if (firstOf(candidate) !== first) continue
		// Each edit moves the UTF-16 length by at most two (an astral letter), so a
		// gap beyond twice the allowance cannot be within it. Cheap, and never wrong.
		if (Math.abs(candidate.length - query.length) > 2 * allowed) continue
		const distance = editDistance(query, candidate, allowed)
		if (distance > allowed) continue
		found.push({ word: candidate, distance, count })
	}
	found.sort(
		(x, y) =>
			x.distance - y.distance ||
			y.count - x.count ||
			// Plain `<`, never localeCompare: the order must not depend on the server's locale.
			(x.word < y.word ? -1 : x.word > y.word ? 1 : 0),
	)
	return found.slice(0, take).map((entry) => entry.word)
}

/** A word counts as present only with at least one asset behind it. */
const present = (vocabulary: ReadonlyMap<string, number>, key: string): boolean =>
	(vocabulary.get(key) ?? 0) > 0

/** True if any vocabulary word equals `word`, equals its stem, or starts with it (when `prefix`). */
export function inVocabulary(
	word: string,
	vocabulary: ReadonlyMap<string, number>,
	prefix: boolean,
): boolean {
	const query = typeof word === 'string' ? word : ''
	if (!query || !vocabulary || typeof vocabulary.get !== 'function') return false
	if (present(vocabulary, query)) return true
	const root = stem(query)
	if (root !== query && present(vocabulary, root)) return true
	if (prefix) {
		for (const [key, count] of vocabulary) {
			if (count > 0 && key.startsWith(query)) return true
		}
	}
	return false
}
