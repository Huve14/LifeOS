# Budget engine decision

Life OS adopts this package as its tested budget-model library. The live Shop & Save currency display imports the pure `convertAmountAtRate` primitive through `src/lifeos/prices.ts`; AED/ZAR rates still come from the server-side prices function and are never hardcoded in the browser.

`store.ts` remains a Node-only import/export adapter and is deliberately kept out of the browser bundle. The full package is inside TypeScript and ESLint coverage and its model, mutation, forecasting, currency, and persistence behavior stays covered by the existing tests.
