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

/**
 * Exception to the read-only rule: capabilities that ARE wired end-to-end
 * (checked from `user_capabilities` in `requireCapability` on the server and in
 * the client `can` helpers via CapabilityProvider), so a manual grant genuinely
 * takes effect. These can be granted/revoked from the Permissions UI even while
 * PERMISSIONS_READ_ONLY is true.
 *
 * `manage_equipment`: Lockup's Tech Lead (Gaurav) is not HR, so his access can
 * only come from an individual grant.
 */
export const MANUALLY_GRANTABLE_CAPABILITIES: string[] = ['manage_equipment']
