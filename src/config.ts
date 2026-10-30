// App-wide settings that aren't secrets.

/**
 * iCloud link to the shared "Crisp Sync" Apple Shortcut (spec §3.7, issue #27).
 * Kay builds the Shortcut (see docs/SHORTCUT.md), shares it, and pastes the iCloud link here
 * — or sets VITE_SHORTCUT_URL in Netlify environment variables.
 */
export const SHORTCUT_URL: string = import.meta.env.VITE_SHORTCUT_URL || 'https://www.icloud.com/shortcuts/18eead8602d74f36af17066f18bf314c'
