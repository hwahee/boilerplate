/**
 * UI-automation test-id registry — the single source of truth for every
 * `data-testid` in the application. See docs/ui-automation.md for the full
 * conventions (naming, stability guarantees, ARIA-first selector guidance).
 *
 * Rules:
 *   - Never write a `data-testid` string inline in a component; add it here.
 *   - Format: `{page}.{section}.{element}`, kebab-case segments.
 *   - Dynamic ids (per-entity elements) are factory functions taking the
 *     entity id, e.g. `TESTID.todos.item(todo.id)`.
 */
export const TESTID = {
  app: {
    header: 'app.header',
    navTodos: 'app.nav.todos',
    navRooms: 'app.nav.rooms',
    navDesignSystem: 'app.nav.design-system',
    themeToggle: 'app.controls.theme-toggle',
    designToggle: 'app.controls.design-toggle',
    localeSelect: 'app.controls.locale-select',
  },
  todos: {
    page: 'todos.page',
    createForm: 'todos.create.form',
    createInput: 'todos.create.input',
    createSubmit: 'todos.create.submit',
    filterStatus: 'todos.filter.status',
    sortBy: 'todos.sort.by',
    list: 'todos.list',
    item: (id: string) => `todos.item.${id}`,
    itemToggle: (id: string) => `todos.item.${id}.toggle`,
    itemDelete: (id: string) => `todos.item.${id}.delete`,
    loading: 'todos.loading',
    error: 'todos.error',
    errorRetry: 'todos.error.retry',
    empty: 'todos.empty',
    totalCount: 'todos.total-count',
    pagination: 'todos.pagination',
    paginationPrev: 'todos.pagination.prev',
    paginationNext: 'todos.pagination.next',
    paginationStatus: 'todos.pagination.status',
  },
  rooms: {
    page: 'rooms.page',
    nicknameInput: 'rooms.nickname.input',
    createForm: 'rooms.create.form',
    createNameInput: 'rooms.create.name-input',
    /** One radio-style button per ROOM_EMOJIS entry, keyed by index. */
    createEmoji: (index: number) => `rooms.create.emoji.${index}`,
    createSubmit: 'rooms.create.submit',
    list: 'rooms.list',
    card: (id: string) => `rooms.card.${id}`,
    cardJoin: (id: string) => `rooms.card.${id}.join`,
    loading: 'rooms.loading',
    error: 'rooms.error',
    errorRetry: 'rooms.error.retry',
    empty: 'rooms.empty',
  },
  room: {
    page: 'room.page',
    connecting: 'room.connecting',
    disconnected: 'room.disconnected',
    reconnect: 'room.reconnect',
    backToLobby: 'room.back-to-lobby',
    leave: 'room.leave',
    nicknameForm: 'room.nickname.form',
    nicknameInput: 'room.nickname.input',
    nicknameSubmit: 'room.nickname.submit',
    participants: 'room.participants',
    participant: (id: string) => `room.participant.${id}`,
    canvas: 'room.canvas',
    /** Color swatches keyed by hex value without the leading '#'. */
    color: (hex: string) => `room.canvas.color.${hex}`,
    brushSize: (name: string) => `room.canvas.size.${name}`,
    eraser: 'room.canvas.eraser',
    clear: 'room.canvas.clear',
    /** One button per REACTION_EMOJIS entry, keyed by index. */
    reaction: (index: number) => `room.reactions.${index}`,
    dice: (sides: number) => `room.dice.${sides}`,
    quizBanner: 'room.quiz.banner',
    quizStart: 'room.quiz.start',
    quizSkip: 'room.quiz.skip',
    scoreboard: 'room.quiz.scoreboard',
    chatLog: 'room.chat.log',
    chatInput: 'room.chat.input',
    chatSend: 'room.chat.send',
  },
  designSystem: {
    page: 'design-system.page',
    section: (name: string) => `design-system.section.${name}`,
  },
  notFound: {
    page: 'not-found.page',
    homeLink: 'not-found.home-link',
  },
} as const;
