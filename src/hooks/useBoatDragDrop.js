import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for boat drag-and-drop functionality
 * Manages dragging state and delegates moves to AppContainer's handleMoveBoat
 * Supports both mouse drag-and-drop and touch devices
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

  // Track touch position for drop target detection on touch devices
  const touchPositionRef = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback((e, boat, location, slotId) => {
    // Guard against touch devices where dataTransfer may not exist
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', boat.id);
    }
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
    // Guard against touch devices where preventDefault may not exist
    if (e?.preventDefault) {
      e.preventDefault();
    }
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

  // ============================================================================
  // TOUCH EVENT HANDLERS (for touch devices like Vibe Board)
  // ============================================================================

  const handleTouchStart = useCallback((e, boat, location, slotId) => {
    // Get initial touch position
    const touch = e.touches[0];
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };

    setDraggingBoat(boat);
    setDraggingFrom({ location, slotId });
    setIsDragging(true);
    console.log('[useBoatDragDrop] Touch drag started:', { boatId: boat.id, location: location?.name, slotId });
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!draggingBoat) return;
    // Track touch position continuously
    const touch = e.touches[0];
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };
  }, [draggingBoat]);

  const handleTouchEnd = useCallback(async (e, locations) => {
    if (!draggingBoat || isProcessing) {
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsDragging(false);
      return;
    }

    const { x, y } = touchPositionRef.current;
    console.log('[useBoatDragDrop] Touch ended at:', { x, y });

    // Find which element is at the touch position
    const element = document.elementFromPoint(x, y);

    // Check for grid slot drop target
    const slotElement = element?.closest('[data-slot-id]');
    if (slotElement) {
      const slotId = slotElement.dataset.slotId;
      const locationId = slotElement.dataset.locationId;
      const [row, col] = slotId.split('-').map(Number);

      const targetLocation = locations?.find(loc => loc.id === locationId);

      if (targetLocation) {
        console.log('[useBoatDragDrop] Touch drop on grid:', { slotId, locationId, row, col });
        // Create a synthetic event object for handleGridDrop
        await handleGridDrop(null, targetLocation, row, col);
        return;
      }
    }

    // Check for pool drop target
    const poolElement = element?.closest('[data-pool-id]');
    if (poolElement) {
      const poolId = poolElement.dataset.poolId;
      console.log('[useBoatDragDrop] Touch drop on pool:', { poolId });
      await handlePoolDrop(poolId);
      return;
    }

    // No valid drop target - cancel the drag
    console.log('[useBoatDragDrop] Touch ended outside drop target - canceling');
    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsDragging(false);
  }, [draggingBoat, isProcessing, handleGridDrop, handlePoolDrop]);

  return {
    draggingBoat,
    draggingFrom,
    isDragging,
    isProcessing,
    handleDragStart,
    handleDragEnd,
    handleGridDrop,
    handlePoolDrop,
    // Touch handlers
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    touchPositionRef,
  };
}
