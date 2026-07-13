/**
 * Device push tokens — registration contract for the push notification
 * pipeline (server facade: apps/server/src/push).
 *
 * The app registers its Expo/FCM/APNs token after boot; the server stores it
 * in `device_push_tokens` and the push sender fans out to the stored tokens.
 * Unregistering happens on logout / permission revocation.
 */
import { s, toValidator, type Infer } from '../validation';
import { PLATFORMS } from './platform';

/** Body of `POST /api/push-tokens`. Idempotent upsert by token. */
export const registerPushTokenValidator = toValidator(
  s.strictObject({
    /** Provider token, e.g. `ExponentPushToken[…]` — opaque to the server. */
    token: s.string().check(s.minLength(1), s.maxLength(4096)),
    platform: s.enum(PLATFORMS),
    /** App version at registration time — useful for pruning dead tokens. */
    appVersion: s.optional(s.string().check(s.minLength(1), s.maxLength(32))),
  }),
);
export type RegisterPushTokenInput = Infer<typeof registerPushTokenValidator>;

/** Body of `POST /api/push-tokens/unregister` (POST: tokens in bodies, not URLs). */
export const unregisterPushTokenValidator = toValidator(
  s.strictObject({
    token: s.string().check(s.minLength(1), s.maxLength(4096)),
  }),
);
