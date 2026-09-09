// Re-export the REAL fmt so the stub can never drift from the app's formatter,
// and override only the data hook so the page renders synchronously from a fixed payload.
export { fmt, harnessIndex } from '../../src/api.js'
export function useFetch() { return { data: globalThis.__PAYLOAD__, error: null, loading: false, reload: () => {} } }
