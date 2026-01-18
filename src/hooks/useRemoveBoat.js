import { useState, useCallback } from 'react';

/**
 * Custom hook for removing boats from locations
 * Delegates to AppContainer's handleMoveBoat for consistency
 *
 * @param {Object} options
 * @param {Function} options.onMoveBoat - AppContainer's handleMoveBoat callback
 * @param {Function} options.onSuccess - Optional callback after successful removal
 * @param {Function} options.onError - Optional error handler
 * @returns {Object} { removeBoat, isRemoving, error }
 */
export function useRemoveBoat({ onMoveBoat, onSuccess, onError }) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState(null);

  const removeBoat = useCallback(
    async (boat) => {
      if (!boat || !boat.id) {
        const err = new Error('Invalid boat object');
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

      setIsRemoving(true);
      setError(null);

      try {
        console.log('[useRemoveBoat] Removing boat:', boat.id, 'isInventory:', boat.isInventory);

        // Delegate to AppContainer's handleMoveBoat
        // Passing null location = removal
        await onMoveBoat(boat.id, null, null, boat.isInventory || false);

        console.log('[useRemoveBoat] Boat removed successfully');

        if (onSuccess) {
          onSuccess(boat);
        }
      } catch (err) {
        console.error('[useRemoveBoat] Error removing boat:', err);
        setError(err);

        if (onError) {
          onError(err);
        } else {
          // Default error handling if no onError callback
          alert(`Failed to remove boat: ${err.message}`);
        }
      } finally {
        setIsRemoving(false);
      }
    },
    [onMoveBoat, onSuccess, onError]
  );

  return {
    removeBoat,
    isRemoving,
    error,
  };
}
