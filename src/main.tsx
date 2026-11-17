import { createRoot } from 'react-dom/client'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './tokens.css'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
