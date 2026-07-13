/** Domain-level errors thrown by services, mapped to HTTP by the route layer. */
import type { UpgradeRequiredDetails } from '@app/shared/api/errors';

export class NotFoundError extends Error {
  constructor(
    readonly resource: string,
    readonly id: string,
  ) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/** Missing/invalid credentials for a protected (admin) endpoint → HTTP 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/** Calling app build is below `minSupportedVersion` → HTTP 426. */
export class UpgradeRequiredError extends Error {
  constructor(readonly details: UpgradeRequiredDetails) {
    super(`App version ${details.clientVersion} is below ${details.minSupportedVersion}`);
    this.name = 'UpgradeRequiredError';
  }
}
