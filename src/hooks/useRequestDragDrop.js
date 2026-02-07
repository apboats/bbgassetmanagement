import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for request kanban drag-and-drop with touch support
 *
 * Similar to useBoatDragDrop but simpler - designed for kanban columns
 * where requests are dragged between status columns (not grid slots).
 *
 * Uses "clone for drag" approach on touch devices:
 * - A cloned element follows the finger
 * - Original card stays in place (with placeholder styling)
 * - Drop detection uses elementFromPoint to find target column
 *
 * @param {Object} options
 * @param {Function} options.onStatusChange - Callback when request status changes (requestId, newStatus)
 * @returns {Object} Drag-and-drop handlers and state
 */
export function useRequestDragDrop({ onStatusChange }) {
  const [draggingRequest, setDraggingRequest] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Touch position tracking
  const touchPositionRef = useRef({ x: 0, y: 0 });
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const touchStartTimeRef = useRef(0);
  const pendingDragRef = useRef(null);

  // Clone for drag
  const originalElementRef = useRef(null);
  const originalRectRef = useRef(null);
  const dragCloneRef = useRef(null);

  // Gesture thresholds
  const DRAG_THRESHOLD = 10; // pixels - must move this far to start drag
  const DRAG_DELAY = 150; // ms - must hold this long before drag activates

  // Auto-scroll configuration
  const SCROLL_EDGE_THRESHOLD = 60;
  const SCROLL_SPEED = 8;

  // ============================================================================
  // CLONE MANAGEMENT
  // ============================================================================

  const createDragClone = useCallback((originalElement, touchX, touchY) => {
    if (!originalElement) return null;

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
    clone.style.overflow = 'hidden';
    clone.style.borderRadius = '0.75rem';
    clone.style.cursor = 'grabbing';
    clone.id = 'request-drag-clone';

    document.body.appendChild(clone);
    dragCloneRef.current = clone;
    originalRectRef.current = rect;

    return clone;
  }, []);

  const moveDragClone = useCallback((touchX, touchY) => {
    if (dragCloneRef.current && originalRectRef.current) {
      const rect = originalRectRef.current;
      dragCloneRef.current.style.transform = `translate(${touchX - rect.width / 2}px, ${touchY - rect.height / 2}px) scale(0.95)`;
    }
  }, []);

  const removeDragClone = useCallback(() => {
    if (dragCloneRef.current) {
      dragCloneRef.current.remove();
      dragCloneRef.current = null;
    }
    originalElementRef.current = null;
    originalRectRef.current = null;
  }, []);

  // Animate clone to target column before removing
  const animateDragCloneToTarget = useCallback((targetElement) => {
    const clone = dragCloneRef.current;
    if (!clone || !targetElement) {
      removeDragClone();
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const cloneRect = originalRectRef.current;

    if (!cloneRect) {
      removeDragClone();
      return;
    }

    // Calculate target position (center top of column)
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + 60; // Below the header

    // Phase 1: Quick move with settle easing
    clone.style.transition = 'transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1.1)';
    clone.style.transform = `translate(${targetCenterX - cloneRect.width / 2}px, ${targetY}px) scale(1)`;

    // Phase 2: Quick fade
    setTimeout(() => {
      if (dragCloneRef.current === clone) {
        clone.style.transition = 'opacity 100ms ease-out';
        clone.style.opacity = '0';
      }
    }, 120);

    // Remove after animation
    setTimeout(() => {
      if (dragCloneRef.current === clone) {
        removeDragClone();
      }
    }, 250);
  }, [removeDragClone]);

  // ============================================================================
  // AUTO-SCROLL
  // ============================================================================

  const handleAutoScroll = useCallback((touchX, touchY) => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let scrollX = 0;
    let scrollY = 0;

    if (touchY < SCROLL_EDGE_THRESHOLD) {
      scrollY = -SCROLL_SPEED * (1 - touchY / SCROLL_EDGE_THRESHOLD);
    } else if (touchY > viewportHeight - SCROLL_EDGE_THRESHOLD) {
      scrollY = SCROLL_SPEED * (1 - (viewportHeight - touchY) / SCROLL_EDGE_THRESHOLD);
    }

    if (touchX < SCROLL_EDGE_THRESHOLD) {
      scrollX = -SCROLL_SPEED * (1 - touchX / SCROLL_EDGE_THRESHOLD);
    } else if (touchX > viewportWidth - SCROLL_EDGE_THRESHOLD) {
      scrollX = SCROLL_SPEED * (1 - (viewportWidth - touchX) / SCROLL_EDGE_THRESHOLD);
    }

    if (scrollX !== 0 || scrollY !== 0) {
      window.scrollBy(scrollX, scrollY);
    }
  }, []);

  // ============================================================================
  // TOUCH HANDLERS
  // ============================================================================

  const handleTouchStart = useCallback((e, request) => {
    // Capture touch position
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };
    touchStartTimeRef.current = Date.now();

    // Store pending drag info (don't start drag yet)
    pendingDragRef.current = { request };

    // Capture the card element for cloning
    const cardElement = e.currentTarget.closest('.request-card') || e.currentTarget;
    originalElementRef.current = cardElement;

    console.log('[useRequestDragDrop] Touch started (pending):', { requestId: request.id });
  }, []);

  const handleTouchMove = useCallback((e) => {
    // Nothing to do if no pending drag and not already dragging
    if (!pendingDragRef.current && !draggingRequest) return;

    const touch = e.touches[0];
    touchPositionRef.current = { x: touch.clientX, y: touch.clientY };

    // Check if we should start dragging
    if (pendingDragRef.current && !draggingRequest) {
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const elapsed = Date.now() - touchStartTimeRef.current;

      // Fast movement before delay = scroll, not drag
      if (elapsed < DRAG_DELAY && distance > DRAG_THRESHOLD) {
        console.log('[useRequestDragDrop] Fast movement - treating as scroll');
        pendingDragRef.current = null;
        originalElementRef.current = null;
        return;
      }

      // Start drag if threshold AND delay both met
      if (distance > DRAG_THRESHOLD && elapsed >= DRAG_DELAY) {
        const { request } = pendingDragRef.current;

        // CRITICAL: Clear pending ref synchronously before async state updates
        pendingDragRef.current = null;

        setDraggingRequest(request);
        setIsDragging(true);

        // Create clone to follow finger
        if (originalElementRef.current) {
          createDragClone(originalElementRef.current, touch.clientX, touch.clientY);
        }

        console.log('[useRequestDragDrop] Touch drag started:', { requestId: request.id });
      }
    } else if (draggingRequest && dragCloneRef.current) {
      // Move the clone to follow finger
      moveDragClone(touch.clientX, touch.clientY);
      handleAutoScroll(touch.clientX, touch.clientY);
    }
  }, [draggingRequest, createDragClone, moveDragClone, handleAutoScroll]);

  const handleTouchEnd = useCallback(async () => {
    // Clear pending drag
    pendingDragRef.current = null;

    // If drag never started (was a tap), let click handler work
    if (!draggingRequest) {
      console.log('[useRequestDragDrop] Touch ended - was tap');
      removeDragClone();
      return;
    }

    const { x, y } = touchPositionRef.current;
    console.log('[useRequestDragDrop] Touch ended at:', { x, y });

    // Find the element at touch position (clone has pointerEvents: none)
    const element = document.elementFromPoint(x, y);

    // Find kanban column with data-status attribute
    const column = element?.closest('[data-status]');
    if (column) {
      const newStatus = column.dataset.status;
      console.log('[useRequestDragDrop] Touch drop on column:', { newStatus });

      if (newStatus !== draggingRequest.status) {
        // Animate clone to target column
        animateDragCloneToTarget(column);

        // Update status
        if (onStatusChange) {
          try {
            await onStatusChange(draggingRequest.id, newStatus);
          } catch (error) {
            console.error('[useRequestDragDrop] Error updating status:', error);
          }
        }
      } else {
        // Same column - just remove clone
        removeDragClone();
      }
    } else {
      // No valid drop target - cancel
      console.log('[useRequestDragDrop] Touch ended outside column - canceling');
      removeDragClone();
    }

    setDraggingRequest(null);
    setIsDragging(false);
  }, [draggingRequest, onStatusChange, animateDragCloneToTarget, removeDragClone]);

  // ============================================================================
  // HTML5 DRAG HANDLERS (for desktop)
  // ============================================================================

  const handleDragStart = useCallback((e, request) => {
    // On touch devices, skip HTML5 drag (touch handlers manage it)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', request.id);
    setDraggingRequest(request);
    setIsDragging(true);
    console.log('[useRequestDragDrop] HTML5 drag started:', { requestId: request.id });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingRequest(null);
    setIsDragging(false);
    console.log('[useRequestDragDrop] HTML5 drag ended');
  }, []);

  const handleDrop = useCallback(async (e, newStatus) => {
    e.preventDefault();
    const requestId = e.dataTransfer.getData('text/plain');

    if (!requestId || !draggingRequest) {
      setDraggingRequest(null);
      setIsDragging(false);
      return;
    }

    if (draggingRequest.status !== newStatus) {
      console.log('[useRequestDragDrop] HTML5 drop:', { requestId, newStatus });
      if (onStatusChange) {
        try {
          await onStatusChange(requestId, newStatus);
        } catch (error) {
          console.error('[useRequestDragDrop] Error updating status:', error);
        }
      }
    }

    setDraggingRequest(null);
    setIsDragging(false);
  }, [draggingRequest, onStatusChange]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return {
    draggingRequest,
    isDragging,
    // Touch handlers
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    // HTML5 drag handlers (desktop)
    handleDragStart,
    handleDragEnd,
    handleDrop,
    handleDragOver,
  };
}
