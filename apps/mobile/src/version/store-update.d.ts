/**
 * Shared type surface of the platform-split store-update module.
 * Metro picks `store-update.ios.ts` / `store-update.android.ts` at bundle
 * time; TypeScript checks importers against this declaration.
 *
 * Why split (logged in docs/platform-decisions.md): "go update the app"
 * is genuinely different per store — iOS is a plain App Store URL, Android
 * prefers the `market://` deep link and is the platform where the Play
 * in-app update API can take over. Branching inline with Platform.select
 * would tangle two unrelated flows; the split files keep each store's rules
 * self-contained at the cost of a little duplication.
 */

/** Opens the platform's store page so the user can update the app. */
export declare function openStore(storeUrl: string): Promise<void>;
