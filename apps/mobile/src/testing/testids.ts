/**
 * Central testID registry — the ONLY source of testID strings
 * (docs/ui-automation.md documents the full convention).
 *
 * Rules:
 *   - Interactive design-system components REQUIRE a `testID` prop; the
 *     value must come from here, never an inline string.
 *   - Naming: `{screen}.{section}.{element}`, kebab-case.
 *   - Per-entity elements are factory functions: `TESTID.todos.item(id)`.
 *   - Maestro flows import nothing (YAML), so keep these strings stable —
 *     they are the automation contract.
 */
export const TESTID = {
  boot: {
    screen: 'boot.screen',
    adSlot: 'boot.ad.slot',
    adSkip: 'boot.ad.skip',
  },
  maintenance: {
    screen: 'maintenance.screen',
    retry: 'maintenance.retry',
  },
  update: {
    forceScreen: 'update.force.screen',
    forceStoreButton: 'update.force.store-button',
    promptSheet: 'update.prompt.sheet',
    promptAction: 'update.prompt.action',
    promptLater: 'update.prompt.later',
  },
  tabs: {
    todos: 'tabs.todos',
    settings: 'tabs.settings',
  },
  offline: {
    banner: 'offline.banner',
  },
  notice: {
    banner: 'notice.banner',
  },
  todos: {
    screen: 'todos.screen',
    createInput: 'todos.create.input',
    createSubmit: 'todos.create.submit',
    list: 'todos.list',
    loading: 'todos.loading',
    error: 'todos.error',
    errorRetry: 'todos.error.retry',
    empty: 'todos.empty',
    footerLoading: 'todos.footer.loading',
    filter: (status: 'all' | 'open' | 'done') => `todos.filter.${status}`,
    item: (id: string) => `todos.item.${id}`,
    itemToggle: (id: string) => `todos.item.${id}.toggle`,
    itemDelete: (id: string) => `todos.item.${id}.delete`,
  },
  settings: {
    screen: 'settings.screen',
    locale: (value: 'system' | 'en' | 'ko') => `settings.locale.${value}`,
    themeMode: (value: 'system' | 'light' | 'dark') => `settings.theme.${value}`,
    design: (value: 'a' | 'b') => `settings.design.${value}`,
    designSystemLink: 'settings.design-system-link',
    checkUpdate: 'settings.check-update',
  },
  designSystem: {
    screen: 'design-system.screen',
    section: (name: string) => `design-system.section.${name}`,
  },
} as const;
