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
