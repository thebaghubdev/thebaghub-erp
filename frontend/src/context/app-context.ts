import { createContext } from 'react'

export type Theme = 'light' | 'dark'

export type AppContextValue = {
  theme: Theme
  toggleTheme: () => void
}

export const AppContext = createContext<AppContextValue | null>(null)
