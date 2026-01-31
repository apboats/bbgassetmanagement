// ============================================================================
// PERMISSIONS HOOK
// ============================================================================
// Centralized permission checking for role-based access control
// Any component can use this hook to check user permissions consistently
//
// Performance: Permissions are memoized in AuthProvider and computed only
// when user.role changes. This hook simply returns the pre-computed values.
// ============================================================================

import { useAuth } from '../AuthProvider';

export function usePermissions() {
  const { user, permissions } = useAuth();

  return {
    // The current user object
    currentUser: user,
    // Spread the memoized permissions from AuthProvider
    ...permissions,
  };
}

export default usePermissions;
