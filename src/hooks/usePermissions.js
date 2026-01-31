// ============================================================================
// PERMISSIONS HOOK
// ============================================================================
// Centralized permission checking for role-based access control
// Any component can use this hook to check user permissions consistently
// ============================================================================

import { useAuth } from '../AuthProvider';

export function usePermissions() {
  const { user } = useAuth();

  const role = user?.role || 'user';

  return {
    // The current user object
    currentUser: user,

    // Role checks
    isAdmin: role === 'admin',
    isManager: role === 'manager',
    isUser: role === 'user',

    // Permission checks (admin OR manager)
    canManageLocations: role === 'admin' || role === 'manager',
    canEditUsers: role === 'admin',
    canSeeCost: role === 'admin' || role === 'manager',
    canDeleteBoats: role === 'admin' || role === 'manager',

    // Helper to check if user has any of the specified roles
    hasRole: (...roles) => roles.includes(role),
  };
}

export default usePermissions;
