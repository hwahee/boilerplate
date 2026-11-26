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

/** The caller is known, and this is not theirs to do. */
export class ForbiddenError extends Error {
  constructor() {
    super('not allowed');
    this.name = 'ForbiddenError';
  }
}

/** The request body is larger than the server accepts. */
export class PayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`payload larger than ${maxBytes} bytes`);
    this.name = 'PayloadTooLargeError';
  }
}
