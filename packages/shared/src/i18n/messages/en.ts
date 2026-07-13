/**
 * English message catalog — the source of truth for message keys.
 * Every other locale must provide exactly the same keys (enforced by the
 * `Record<MessageKey, string>` annotation on the other catalogs).
 *
 * Used on BOTH sides: the app renders UI strings, the server localizes API
 * error messages via `Accept-Language` negotiation.
 *
 * Interpolation uses `{name}` placeholders, resolved by `translate()`.
 */
export const en = {
  'app.title': 'Mobile Boilerplate',

  'tab.todos': 'Todos',
  'tab.settings': 'Settings',

  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.add': 'Add',

  'offline.banner': 'You are offline. Showing the last saved data.',

  'boot.preparing': 'Getting things ready…',
  'boot.ad.label': 'Advertisement',
  'boot.ad.skip': 'Skip ad',

  'maintenance.title': 'Under maintenance',
  'maintenance.defaultMessage':
    'The service is temporarily unavailable while we perform maintenance. Please try again soon.',

  'update.force.title': 'Update required',
  'update.force.body': 'This version of the app is no longer supported. Please update to continue.',
  'update.optional.title': 'Update available',
  'update.ota.body':
    'A new version ({version}) is ready. It only takes a moment — no store visit needed.',
  'update.store.body': 'A new version ({version}) is available on the store.',
  'update.action.ota': 'Update & restart',
  'update.action.store': 'Open store',
  'update.action.later': 'Later',
  'update.downloading': 'Downloading update…',

  'todos.title': 'Todos',
  'todos.createPlaceholder': 'What needs to be done?',
  'todos.createSubmit': 'Add todo',
  'todos.createLabel': 'New todo title',
  'todos.empty': 'Nothing here yet. Add your first todo above.',
  'todos.loadFailed': 'Could not load todos.',
  'todos.filterLabel': 'Filter by status',
  'todos.filter.all': 'All',
  'todos.filter.open': 'Open',
  'todos.filter.done': 'Done',
  'todos.status.open': 'Open',
  'todos.status.done': 'Done',
  'todos.toggleStatus': 'Mark "{title}" as {status}',
  'todos.deleteTodo': 'Delete "{title}"',
  'todos.endReached': 'You have reached the end.',
  'todos.loadingMore': 'Loading more…',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.language.system': 'Device language',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.theme.system': 'Follow device',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.design': 'Design',
  'settings.design.a': 'Design A (aesthetic)',
  'settings.design.b': 'Design B (high visibility)',
  'settings.developer': 'Developer',
  'settings.designSystem': 'Design system gallery',
  'settings.about': 'About',
  'settings.appVersion': 'App version',
  'settings.environment': 'Environment',
  'settings.checkUpdate': 'Check for updates',
  'settings.upToDate': 'You are on the latest version.',

  'designSystem.title': 'Design System',
  'designSystem.description':
    'Every token and component in one place. Toggle theme, design variant and language in Settings.',
  'designSystem.colors': 'Color tokens',
  'designSystem.typography': 'Typography',
  'designSystem.buttons': 'Buttons',
  'designSystem.formFields': 'Form fields',
  'designSystem.feedback': 'Feedback',
  'designSystem.dataDisplay': 'Data display',

  'error.validation': 'The request contains invalid data.',
  'error.notFound': 'The requested resource was not found.',
  'error.unauthorized': 'You are not allowed to perform this action.',
  'error.upgradeRequired': 'This app version is no longer supported. Please update the app.',
  'error.internal': 'An unexpected error occurred. Please try again.',
  'error.network': 'Network error. Check your connection and try again.',
} as const;

export type MessageKey = keyof typeof en;
