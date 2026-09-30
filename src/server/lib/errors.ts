/** Domain-level errors thrown by services, mapped to HTTP by the route layer. */
export class NotFoundError extends Error {
  constructor(
    readonly resource: string,
    readonly id: string,
  ) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/** The operation needs a signed-in user and the request has none. */
export class UnauthorizedError extends Error {
  constructor() {
    super('authentication required');
    this.name = 'UnauthorizedError';
  }
}
