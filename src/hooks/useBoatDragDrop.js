import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for boat drag-and-drop functionality
 * Manages dragging state and delegates moves to AppContainer's handleMoveBoat
 * Supports both mouse drag-and-drop and touch devices
 *
 * Touch devices use "clone for drag" approach - a cloned element follows the finger
 * while the original stays in place (styled as placeholder) to preserve grid layout.
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
  const touchStartTimeRef = useRef(0);
  const pendingDragRef = useRef(null);
  const DRAG_THRESHOLD = 10; // pixels - must move this far to start a drag
  const DRAG_DELAY = 150; // ms - must hold this long before drag can activate

  // Clone for Drag: track the original element (for dimensions) and the cloned drag element
  const originalElementRef = useRef(null);
  const originalRectRef = useRef(null);
  const dragCloneRef = useRef(null);

  // Auto-scroll configuration
  const scrollAnimationRef = useRef(null);
  const SCROLL_EDGE_THRESHOLD = 60; // pixels from edge to trigger scroll
  const SCROLL_SPEED = 10; // pixels per frame

  const handleDragStart = useCallback((e, boat, location, slotId) => {
    // If touch handlers are managing this interaction, don't interfere
    // On touch devices, both touchStart and dragStart can fire - we want touch to win
    if (pendingDragRef.current) {
      console.log('[useBoatDragDrop] Drag started but touch is pending - deferring to touch handlers');
      e.preventDefault();
      return;
    }

    // On touch-capable devices, skip HTML5 drag entirely - our touch system handles it
    // This prevents the persistent ghost issue on Chromium touch devices (Vibe Board)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      console.log('[useBoatDragDrop] Touch device detected - skipping HTML5 drag');
      e.preventDefault();
      return;
    }

    // Create a custom drag image from the slot element
    const slotElement = e.currentTarget;
    if (slotElement && e.dataTransfer) {
      // Use a wrapper container to enforce exact dimensions
      // This prevents flex children (like storage boat stripes) from expanding
      const wrapper = document.createElement('div');
      wrapper.style.width = `${slotElement.offsetWidth}px`;
      wrapper.style.height = `${slotElement.offsetHeight}px`;
      wrapper.style.overflow = 'hidden';
      wrapper.style.position = 'absolute';
      wrapper.style.top = '-9999px';
      wrapper.style.left = '-9999px';
      wrapper.style.borderRadius = '0.75rem';
      wrapper.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
      wrapper.style.transform = 'scale(0.95)';
      wrapper.style.opacity = '0.9';

      // Clone the element for the drag image
      const dragImage = slotElement.cloneNode(true);
      dragImage.style.width = '100%';
      dragImage.style.height = '100%';
      dragImage.style.margin = '0';
      dragImage.style.position = 'relative';
      dragImage.classList.add('dragging-lifted');

      wrapper.appendChild(dragImage);
      document.body.appendChild(wrapper);

      // Set custom drag image, centered on cursor
      e.dataTransfer.setDragImage(
        wrapper,
        slotElement.offsetWidth / 2,
        slotElement.offsetHeight / 2
      );

      // Remove the wrapper after drag starts (browser captures it)
      setTimeout(() => wrapper.remove(), 0);
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
  // CLONE FOR DRAG HELPERS
  // ============================================================================

  // Create a clone of the element to use as the drag visual
  const createDragClone = useCallback((originalElement, touchX, touchY) => {
    const rect = originalElement.getBoundingClientRect();

    // Clone the element
    const clone = originalElement.cloneNode(true);

    // Style the clone as a floating drag element
    clone.style.position = 'fixed';
    clone.style.zIndex = '9999';
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.transform = `translate(${touchX - rect.width / 2}px, ${touchY - rect.height / 2}px) scale(0.95)`;
    clone.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.95';
    clone.style.transition = 'none';
    clone.classList.add('dragging-lifted');
    clone.id = 'drag-clone';

    // Remove any data attributes that might interfere with drop detection
    clone.removeAttribute('data-slot-id');
    clone.removeAttribute('data-location-id');

    document.body.appendChild(clone);
    dragCloneRef.current = clone;

    return clone;
  }, []);

  // Move the drag clone to follow the finger
  const moveDragClone = useCallback((touchX, touchY) => {
    if (dragCloneRef.current && originalRectRef.current) {
      const rect = originalRectRef.current;
      dragCloneRef.current.style.transform = `translate(${touchX - rect.width / 2}px, ${touchY - rect.height / 2}px) scale(0.95)`;
    }
  }, []);

  // Remove the drag clone from the DOM
  const removeDragClone = useCallback(() => {
    if (dragCloneRef.current) {
      dragCloneRef.current.remove();
      dragCloneRef.current = null;
    }
    originalElementRef.current = null;
    originalRectRef.current = null;

    // Stop any ongoing auto-scroll
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  }, []);

  // Animate the drag clone to the target position before removing (smooth drop)
  const animateDragCloneToTarget = useCallback((targetElement) => {
    const clone = dragCloneRef.current;
    if (!clone || !targetElement) {
      removeDragClone();
      return;
    }

    // Get target position
    const targetRect = targetElement.getBoundingClientRect();
    const cloneRect = originalRectRef.current;

    if (!cloneRect) {
      removeDragClone();
      return;
    }

    // Calculate center of target slot
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    // Enable transition for smooth animation
    clone.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';

    // Animate to target position with scale down and fade
    clone.style.transform = `translate(${targetCenterX - cloneRect.width / 2}px, ${targetCenterY - cloneRect.height / 2}px) scale(0.9)`;
    clone.style.opacity = '0';

    // Remove clone after animation completes
    const handleTransitionEnd = () => {
      clone.removeEventListener('transitionend', handleTransitionEnd);
      removeDragClone();
    };

    clone.addEventListener('transitionend', handleTransitionEnd);

    // Fallback timeout in case transitionend doesn't fire
    setTimeout(() => {
      if (dragCloneRef.current === clone) {
        removeDragClone();
      }
    }, 250);
  }, [removeDragClone]);

  // ============================================================================
  // AUTO-SCROLL HELPERS
  // ============================================================================

  // Handle auto-scrolling when dragging near viewport edges
  const handleAutoScroll = useCallback((touchX, touchY) => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let scrollX = 0;
    let scrollY = 0;

    // Check vertical edges
    if (touchY < SCROLL_EDGE_THRESHOLD) {
      // Near top - scroll up
      scrollY = -SCROLL_SPEED * (1 - touchY / SCROLL_EDGE_THRESHOLD);
    } else if (touchY > viewportHeight - SCROLL_EDGE_THRESHOLD) {
      // Near bottom - scroll down
      scrollY = SCROLL_SPEED * (1 - (viewportHeight - touchY) / SCROLL_EDGE_THRESHOLD);
    }

    // Check horizontal edges
    if (touchX < SCROLL_EDGE_THRESHOLD) {
      // Near left - scroll left
      scrollX = -SCROLL_SPEED * (1 - touchX / SCROLL_EDGE_THRESHOLD);
    } else if (touchX > viewportWidth - SCROLL_EDGE_THRESHOLD) {
      // Near right - scroll right
      scrollX = SCROLL_SPEED * (1 - (viewportWidth - touchX) / SCROLL_EDGE_THRESHOLD);
    }

    if (scrollX !== 0 || scrollY !== 0) {
      window.scrollBy(scrollX, scrollY);
    }
  }, []);

  // ============================================================================
  // TOUCH EVENT HANDLERS (for touch devices like Vibe Board)
  // ============================================================================

  const handleTouchStart = useCallback((e, boat, location, slotId) => {
    // Prevent iOS text selection behavior during drag
    e.preventDefault();

    // Get initial touch position and timestamp
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };
    touchStartTimeRef.current = Date.now();

    // DON'T start dragging yet - store pending drag info
    // Drag will only start if finger moves beyond threshold AND delay has passed
    pendingDragRef.current = { boat, location, slotId };

    // CLONE FOR DRAG: Capture the slot element for cloning later
    const slotElement = e.currentTarget.closest('[data-slot-id]') || e.currentTarget;
    if (slotElement) {
      originalElementRef.current = slotElement;
      originalRectRef.current = slotElement.getBoundingClientRect();
    }

    console.log('[useBoatDragDrop] Touch started (pending):', { boatId: boat.id });
  }, []);

  const handleTouchMove = useCallback((e) => {
    // Nothing to do if no pending drag and not already dragging
    if (!pendingDragRef.current && !draggingBoat) return;

    // Track touch position continuously
    const touch = e.touches[0];
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };

    // Check if we should start dragging (threshold and delay exceeded)
    if (pendingDragRef.current && !draggingBoat) {
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - touchStartTimeRef.current;

      // If moving fast before delay elapsed, this is probably a scroll gesture
      // Cancel the pending drag and let native scroll happen
      if (elapsed < DRAG_DELAY && distance > DRAG_THRESHOLD) {
        console.log('[useBoatDragDrop] Fast movement before delay - treating as scroll');
        pendingDragRef.current = null;
        originalElementRef.current = null;
        originalRectRef.current = null;
        return;
      }

      // Only start drag if both threshold AND delay are met
      if (distance > DRAG_THRESHOLD && elapsed >= DRAG_DELAY) {
        // Threshold exceeded - now actually start the drag
        const { boat, location, slotId } = pendingDragRef.current;
        setDraggingBoat(boat);
        setDraggingFrom({ location, slotId });
        setIsDragging(true);

        // CLONE FOR DRAG: Create a clone to follow the finger
        // Original element stays in place (gets placeholder styling via React)
        if (originalElementRef.current) {
          createDragClone(originalElementRef.current, touch.clientX, touch.clientY);
        }

        console.log('[useBoatDragDrop] Touch drag started (threshold and delay exceeded):', { boatId: boat.id });
      }
    } else if (draggingBoat && dragCloneRef.current) {
      // Move the clone to follow the finger
      moveDragClone(touch.clientX, touch.clientY);

      // Handle auto-scroll when near edges
      handleAutoScroll(touch.clientX, touch.clientY);
    }
  }, [draggingBoat, createDragClone, moveDragClone, handleAutoScroll]);

  const handleTouchEnd = useCallback(async (e, locations) => {
    // Clear pending drag info
    pendingDragRef.current = null;

    // If drag never started (was a tap, not a drag), let click handler work
    if (!draggingBoat) {
      console.log('[useBoatDragDrop] Touch ended - was tap, letting click handler work');
      removeDragClone();
      return;
    }

    // If already processing, clean up and exit
    if (isProcessing) {
      removeDragClone();
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsDragging(false);
      return;
    }

    const { x, y } = touchPositionRef.current;
    console.log('[useBoatDragDrop] Touch ended at:', { x, y });

    // The clone has pointerEvents: none, so elementFromPoint will see through it
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
        // Animate clone to target slot for smooth drop effect
        animateDragCloneToTarget(slotElement);
        // Process drop (optimistic update happens during animation)
        await handleGridDrop(null, targetLocation, row, col);
        return;
      }
    }

    // Check for pool drop target
    const poolElement = element?.closest('[data-pool-id]');
    if (poolElement) {
      const poolId = poolElement.dataset.poolId;
      console.log('[useBoatDragDrop] Touch drop on pool:', { poolId });
      // Animate clone to pool for smooth drop effect
      animateDragCloneToTarget(poolElement);
      await handlePoolDrop(poolId);
      return;
    }

    // No valid drop target - cancel the drag (instant removal, no animation)
    console.log('[useBoatDragDrop] Touch ended outside drop target - canceling');
    removeDragClone();
    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsDragging(false);
  }, [draggingBoat, isProcessing, handleGridDrop, handlePoolDrop, removeDragClone, animateDragCloneToTarget]);

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
