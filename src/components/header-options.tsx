'use client'

import { createContext, useContext } from 'react'

/** Preview-only switches. The live site never provides these, so it gets the defaults. */
export type HeaderOptions = {
	megaMenu: boolean
}

const HeaderOptionsContext = createContext<HeaderOptions>({ megaMenu: true })

export const useHeaderOptions = () => useContext(HeaderOptionsContext)

export function HeaderOptionsProvider({
	value,
	children,
}: {
	value: HeaderOptions
	children: React.ReactNode
}) {
	return (
		<HeaderOptionsContext.Provider value={value}>
			{children}
		</HeaderOptionsContext.Provider>
	)
}
