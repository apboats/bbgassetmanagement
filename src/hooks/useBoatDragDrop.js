import { useState, useCallback } from 'react';

/**
 * Custom hook for boat drag-and-drop functionality
 * Manages dragging state and delegates moves to AppContainer's handleMoveBoat
 *
 * @param {Object} options
 * @param {Function} options.onMoveBoat - AppContainer's handleMoveBoat callback
 * @param {Function} options.onSuccess - Optional callback after successful drop
 * @param {Function} options.onError - Optional error handler
 * @returns {Object} Drag-and-drop handlers and state
 */
export function useBoatDragDrop({ onMoveBoat, onSuccess, onError }) {
  const [draggingBoat, setDraggingBoat] = useState(null);
  const [draggingFrom, setDraggingFrom] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragStart = useCallback((e, boat, location, slotId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', boat.id);
    setDraggingBoat(boat);
    setDraggingFrom({ location, slotId });
    setIsDragging(true);
    console.log('[useBoatDragDrop] Drag started:', { boatId: boat.id, location: location?.name, slotId });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsDragging(false);
    console.log('[useBoatDragDrop] Drag ended');
  }, []);

  const handleGridDrop = useCallback(async (e, targetLocation, row, col) => {
    e.preventDefault();
    if (!draggingBoat || isProcessing) return;

    setIsProcessing(true);

    const newSlotId = `${row}-${col}`;

    // Check if target slot is already occupied
    if (targetLocation.boats && targetLocation.boats[newSlotId]) {
      alert('This slot is already occupied!');
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsDragging(false);
      setIsProcessing(false);
      return;
    }

    try {
      console.log('[useBoatDragDrop] Dropping boat on grid:', {
        boatId: draggingBoat.id,
        targetLocation: targetLocation.name,
        slot: newSlotId
      });

      // Delegate to AppContainer's handleMoveBoat
      await onMoveBoat(draggingBoat.id, targetLocation.id, newSlotId, draggingBoat.isInventory || false);

      console.log('[useBoatDragDrop] Grid drop successful');

      if (onSuccess) {
        onSuccess({ boat: draggingBoat, location: targetLocation, slot: newSlotId });
      }
    } catch (error) {
      console.error('[useBoatDragDrop] Error during grid drop:', error);

      if (onError) {
        onError(error);
      } else {
        alert(`Failed to move boat: ${error.message}`);
      }
    } finally {
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsDragging(false);
      setIsProcessing(false);
    }
  }, [draggingBoat, isProcessing, onMoveBoat, onSuccess, onError]);

  const handlePoolDrop = useCallback(async (poolId) => {
    if (!draggingBoat || isProcessing) return;

    setIsProcessing(true);

    try {
      console.log('[useBoatDragDrop] Dropping boat on pool:', {
        boatId: draggingBoat.id,
        poolId
      });

      // Delegate to AppContainer's handleMoveBoat
      // For pools, we use 'pool' as the slot identifier
      await onMoveBoat(draggingBoat.id, poolId, 'pool', draggingBoat.isInventory || false);

      console.log('[useBoatDragDrop] Pool drop successful');

      if (onSuccess) {
        onSuccess({ boat: draggingBoat, locationId: poolId, slot: 'pool' });
      }
    } catch (error) {
      console.error('[useBoatDragDrop] Error during pool drop:', error);

      if (onError) {
        onError(error);
      } else {
        alert(`Failed to move boat: ${error.message}`);
      }
    } finally {
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsDragging(false);
      setIsProcessing(false);
    }
  }, [draggingBoat, isProcessing, onMoveBoat, onSuccess, onError]);

  return {
    draggingBoat,
    draggingFrom,
    isDragging,
    isProcessing,
    handleDragStart,
    handleDragEnd,
    handleGridDrop,
    handlePoolDrop,
  };
}
