/**
 * A tiny arithmetic evaluator for builder-authored formulas. Supports + - * / %,
 * parentheses, numbers and bare input ids. Written by hand rather than reaching for
 * `eval`, so an authored string can never execute anything.
 */

type Token = { kind: 'num' | 'id' | 'op' | 'paren'; value: string }

const OPERATORS = new Set(['+', '-', '*', '/', '%'])

function tokenize(input: string): Token[] {
	const tokens: Token[] = []
	let i = 0
	while (i < input.length) {
		const char = input[i]
		if (/\s/.test(char)) {
			i++
			continue
		}
		if (/[0-9.]/.test(char)) {
			let value = ''
			while (i < input.length && /[0-9.]/.test(input[i])) value += input[i++]
			tokens.push({ kind: 'num', value })
			continue
		}
		if (/[A-Za-z_]/.test(char)) {
			let value = ''
			while (i < input.length && /[A-Za-z0-9_]/.test(input[i]))
				value += input[i++]
			tokens.push({ kind: 'id', value })
			continue
		}
		if (OPERATORS.has(char)) {
			tokens.push({ kind: 'op', value: char })
			i++
			continue
		}
		if (char === '(' || char === ')') {
			tokens.push({ kind: 'paren', value: char })
			i++
			continue
		}
		// Anything else is not arithmetic, so the whole formula is unusable.
		return []
	}
	return tokens
}

/** Recursive descent: expression -> term -> factor. */
function parse(tokens: Token[], vars: Record<string, number>) {
	let pos = 0

	const peek = () => tokens[pos]

	const factor = (): number => {
		const token = peek()
		if (!token) return NaN
		if (token.kind === 'op' && (token.value === '-' || token.value === '+')) {
			pos++
			const sign = token.value === '-' ? -1 : 1
			return sign * factor()
		}
		if (token.kind === 'paren' && token.value === '(') {
			pos++
			const value = expression()
			if (peek()?.value === ')') pos++
			return value
		}
		if (token.kind === 'num') {
			pos++
			return Number(token.value)
		}
		if (token.kind === 'id') {
			pos++
			return vars[token.value] ?? NaN
		}
		return NaN
	}

	const term = (): number => {
		let value = factor()
		while (peek()?.kind === 'op' && ['*', '/', '%'].includes(peek()!.value)) {
			const op = tokens[pos++].value
			const right = factor()
			if (op === '*') value *= right
			else if (op === '/') value = right === 0 ? NaN : value / right
			else value = right === 0 ? NaN : value % right
		}
		return value
	}

	const expression = (): number => {
		let value = term()
		while (peek()?.kind === 'op' && ['+', '-'].includes(peek()!.value)) {
			const op = tokens[pos++].value
			const right = term()
			value = op === '+' ? value + right : value - right
		}
		return value
	}

	const result = expression()
	// Trailing junk means the author mistyped, so report nothing rather than a wrong number.
	return pos === tokens.length ? result : NaN
}

export function evaluateFormula(
	formula: string | undefined,
	vars: Record<string, number>,
): number | null {
	if (!formula?.trim()) return null
	const value = parse(tokenize(formula), vars)
	return Number.isFinite(value) ? value : null
}

const currency = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 0,
})

export function formatValue(
	value: number,
	format: 'number' | 'currency' | 'percent' | 'hours' = 'number',
	decimals = 0,
) {
	if (format === 'currency') return currency.format(value)
	if (format === 'percent') return `${value.toFixed(decimals)}%`
	const rounded = Number(value.toFixed(decimals))
	const text = rounded.toLocaleString(undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	})
	return format === 'hours' ? `${text} hours` : text
}

/**
 * Replaces `{{ expression }}` in authored copy with the calculated number, so a
 * caption can read "Roughly {{ hours * 0.7 }} hours a year".
 */
export function interpolate(
	text: string | undefined,
	vars: Record<string, number>,
	format: 'number' | 'currency' | 'percent' | 'hours' = 'number',
	decimals = 0,
) {
	if (!text) return ''
	return text.replace(/\{\{([^}]+)\}\}/g, (match, expression: string) => {
		const value = evaluateFormula(expression, vars)
		return value === null ? match : formatValue(value, format, decimals)
	})
}
