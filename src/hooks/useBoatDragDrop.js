import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for boat drag-and-drop functionality
 * Manages dragging state and delegates moves to AppContainer's handleMoveBoat
 * Supports both mouse drag-and-drop and touch devices
 *
 * Touch devices use "lift original" approach - the actual DOM element is lifted
 * and moved with the finger for a more tactile experience.
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

  // Gesture differentiation: track start position and pending drag
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const pendingDragRef = useRef(null);
  const DRAG_THRESHOLD = 10; // pixels - must move this far to start a drag

  // Lift Original: track the actual DOM element being dragged
  const draggedElementRef = useRef(null);
  const originalRectRef = useRef(null);
  const originalStylesRef = useRef({});
  const isLiftModeRef = useRef(false);

  const handleDragStart = useCallback((e, boat, location, slotId) => {
    // If touch handlers are managing this interaction, don't interfere
    // On touch devices, both touchStart and dragStart can fire - we want touch to win
    if (pendingDragRef.current) {
      console.log('[useBoatDragDrop] Drag started but touch is pending - deferring to touch handlers');
      e.preventDefault();
      return;
    }

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
  // LIFT ORIGINAL HELPERS
  // ============================================================================

  // Reset the lifted element back to its original state
  const resetLiftedElement = useCallback(() => {
    if (draggedElementRef.current && isLiftModeRef.current) {
      const el = draggedElementRef.current;
      // Restore original styles
      Object.keys(originalStylesRef.current).forEach(key => {
        el.style[key] = originalStylesRef.current[key] || '';
      });
      el.classList.remove('dragging-lifted');
    }
    draggedElementRef.current = null;
    originalRectRef.current = null;
    originalStylesRef.current = {};
    isLiftModeRef.current = false;
  }, []);

  // ============================================================================
  // TOUCH EVENT HANDLERS (for touch devices like Vibe Board)
  // ============================================================================

  const handleTouchStart = useCallback((e, boat, location, slotId) => {
    // Prevent iOS text selection behavior during drag
    e.preventDefault();

    // Get initial touch position
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };

    // DON'T start dragging yet - store pending drag info
    // Drag will only start if finger moves beyond threshold
    pendingDragRef.current = { boat, location, slotId };

    // LIFT ORIGINAL: Capture the slot element for lifting
    const slotElement = e.currentTarget.closest('[data-slot-id]') || e.currentTarget;
    if (slotElement) {
      draggedElementRef.current = slotElement;
      originalRectRef.current = slotElement.getBoundingClientRect();
      // Store original inline styles to restore later
      originalStylesRef.current = {
        transform: slotElement.style.transform,
        transition: slotElement.style.transition,
        zIndex: slotElement.style.zIndex,
        position: slotElement.style.position,
        boxShadow: slotElement.style.boxShadow,
        opacity: slotElement.style.opacity,
        width: slotElement.style.width,
        height: slotElement.style.height,
        left: slotElement.style.left,
        top: slotElement.style.top,
      };
    }
    isLiftModeRef.current = true;

    console.log('[useBoatDragDrop] Touch started (pending):', { boatId: boat.id });
  }, []);

  const handleTouchMove = useCallback((e) => {
    // Nothing to do if no pending drag and not already dragging
    if (!pendingDragRef.current && !draggingBoat) return;

    // Track touch position continuously
    const touch = e.touches[0];
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };

    // Check if we should start dragging (threshold exceeded)
    if (pendingDragRef.current && !draggingBoat) {
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > DRAG_THRESHOLD) {
        // Threshold exceeded - now actually start the drag
        const { boat, location, slotId } = pendingDragRef.current;
        setDraggingBoat(boat);
        setDraggingFrom({ location, slotId });
        setIsDragging(true);

        // LIFT ORIGINAL: Apply "lifted" styles to the actual element
        if (draggedElementRef.current && isLiftModeRef.current && originalRectRef.current) {
          const el = draggedElementRef.current;
          const rect = originalRectRef.current;
          el.style.position = 'fixed';
          el.style.zIndex = '1000';
          el.style.transition = 'none';
          el.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
          el.style.width = `${rect.width}px`;
          el.style.height = `${rect.height}px`;
          el.style.left = '0';
          el.style.top = '0';
          el.style.transform = `translate(${touch.clientX - rect.width/2}px, ${touch.clientY - rect.height/2}px) scale(0.95)`;
          el.classList.add('dragging-lifted');
        }

        console.log('[useBoatDragDrop] Touch drag started (threshold exceeded):', { boatId: boat.id });
      }
    } else if (draggingBoat && draggedElementRef.current && isLiftModeRef.current && originalRectRef.current) {
      // LIFT ORIGINAL: Move the lifted element to follow the finger
      const el = draggedElementRef.current;
      const rect = originalRectRef.current;
      el.style.transform = `translate(${touch.clientX - rect.width/2}px, ${touch.clientY - rect.height/2}px) scale(0.95)`;
    }
  }, [draggingBoat]);

  const handleTouchEnd = useCallback(async (e, locations) => {
    // Clear pending drag info
    pendingDragRef.current = null;

    // If drag never started (was a tap, not a drag), let click handler work
    if (!draggingBoat) {
      console.log('[useBoatDragDrop] Touch ended - was tap, letting click handler work');
      resetLiftedElement();
      return;
    }

    // If already processing, clean up and exit
    if (isProcessing) {
      resetLiftedElement();
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsDragging(false);
      return;
    }

    const { x, y } = touchPositionRef.current;
    console.log('[useBoatDragDrop] Touch ended at:', { x, y });

    // LIFT ORIGINAL: Temporarily hide the lifted element so elementFromPoint sees what's underneath
    const liftedEl = draggedElementRef.current;
    if (liftedEl) {
      liftedEl.style.pointerEvents = 'none';
      liftedEl.style.visibility = 'hidden';
    }

    // Find which element is at the touch position
    const element = document.elementFromPoint(x, y);

    // Restore visibility for animation
    if (liftedEl) {
      liftedEl.style.visibility = 'visible';
    }

    // Check for grid slot drop target
    const slotElement = element?.closest('[data-slot-id]');
    if (slotElement) {
      const slotId = slotElement.dataset.slotId;
      const locationId = slotElement.dataset.locationId;
      const [row, col] = slotId.split('-').map(Number);

      const targetLocation = locations?.find(loc => loc.id === locationId);

      if (targetLocation) {
        console.log('[useBoatDragDrop] Touch drop on grid:', { slotId, locationId, row, col });
        // Reset lifted element before drop processing
        resetLiftedElement();
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
      // Reset lifted element before drop processing
      resetLiftedElement();
      await handlePoolDrop(poolId);
      return;
    }

    // No valid drop target - cancel the drag
    console.log('[useBoatDragDrop] Touch ended outside drop target - canceling');
    resetLiftedElement();
    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsDragging(false);
  }, [draggingBoat, isProcessing, handleGridDrop, handlePoolDrop, resetLiftedElement]);

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
