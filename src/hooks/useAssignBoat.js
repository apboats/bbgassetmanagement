import { useState, useCallback } from 'react';

/**
 * Custom hook for assigning boats to locations
 * Delegates to AppContainer's handleMoveBoat for consistency
 *
 * @param {Object} options
 * @param {Function} options.onMoveBoat - AppContainer's handleMoveBoat callback
 * @param {Function} options.onSuccess - Optional callback after successful assignment
 * @param {Function} options.onError - Optional error handler
 * @returns {Object} { assignBoat, isAssigning, error }
 */
export function useAssignBoat({ onMoveBoat, onSuccess, onError }) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState(null);

  const assignBoat = useCallback(
    async (boatId, locationId, slotId = null, isInventory = false) => {
      if (!boatId) {
        const err = new Error('Invalid boat ID');
        setError(err);
        if (onError) onError(err);
        return;
      }

      if (!locationId) {
        const err = new Error('Invalid location ID');
        setError(err);
        if (onError) onError(err);
        return;
      }

      if (!onMoveBoat) {
        const err = new Error('onMoveBoat callback not provided');
        setError(err);
        if (onError) onError(err);
        return;
      }

      setIsAssigning(true);
      setError(null);

      try {
        console.log('[useAssignBoat] Assigning boat:', {
          boatId,
          locationId,
          slotId,
          isInventory
        });

        // Delegate to AppContainer's handleMoveBoat
        // This will handle removing from old location if needed
        await onMoveBoat(boatId, locationId, slotId, isInventory);

        console.log('[useAssignBoat] Boat assigned successfully');

        if (onSuccess) {
          onSuccess({ boatId, locationId, slotId, isInventory });
        }
      } catch (err) {
        console.error('[useAssignBoat] Error assigning boat:', err);
        setError(err);

        if (onError) {
          onError(err);
        } else {
          // Default error handling if no onError callback
          alert(`Failed to assign boat: ${err.message}`);
        }
      } finally {
        setIsAssigning(false);
      }
    },
    [onMoveBoat, onSuccess, onError]
  );

  return {
    assignBoat,
    isAssigning,
    error,
  };
}
