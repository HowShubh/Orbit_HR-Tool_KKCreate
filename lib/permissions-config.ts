/**
 * When true, the Permissions tab is READ-ONLY: founders can view every capability
 * grant (who has what, source, scope) but cannot grant / revoke / apply bundles.
 * Access is managed entirely via roles (HR Console → Users → change role).
 *
 * Why: manual per-capability grants are not enforced by the app today (the app
 * authorizes by role; grants are only honored by RLS, which server reads bypass).
 * Rather than imply a power the app doesn't deliver, manual management is locked.
 *
 * To re-enable manual grants (Option A): set this to false AND wire
 * `user_capabilities` into `requireCapability` (server) and the client `can`
 * (CapabilityProvider) so grants actually take effect. See docs/MAINTENANCE_NOTES.md.
 */
export const PERMISSIONS_READ_ONLY = true
