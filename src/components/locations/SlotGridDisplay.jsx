import React, { useRef } from 'react';

/**
 * Slot Grid Display Component
 *
 * Renders location slots in a visual grid layout matching the actual location structure.
 * Supports both standard grid and U-shaped layouts with optional concise view.
 *
 * @param {object} location - Location object with rows, columns, layout, boats
 * @param {array} boats - Array of customer boats
 * @param {array} inventoryBoats - Array of inventory boats
 * @param {string} mode - 'display' or 'select' mode
 * @param {string} currentBoatId - ID of the boat being moved (to highlight)
 * @param {function} onSlotClick - Handler for slot clicks (select mode)
 * @param {string} viewMode - 'layout' or 'concise' for U-shaped locations
 * @param {boolean} showBoatNames - Show boat names in occupied slots
 * @param {boolean} interactive - Enable hover effects
 */
export function SlotGridDisplay({
  location,
  boats = [],
  inventoryBoats = [],
  mode = 'display',
  currentBoatId = null,
  onSlotClick,
  viewMode = 'layout',
  showBoatNames = true,
  interactive = true
}) {
  const isUShape = location.layout === 'u-shaped';

  // Track if a touch event just fired to prevent double-firing with click
  const touchHandledRef = useRef(false);

  // Helper function to render a single slot
  const renderSlot = (row, col) => {
    const slotId = `${row}-${col}`;
    const occupyingBoatId = location.boats?.[slotId];
    const occupyingBoat = occupyingBoatId
      ? boats.find(b => b.id === occupyingBoatId) || inventoryBoats.find(b => b.id === occupyingBoatId)
      : null;

    const isOccupied = !!occupyingBoatId;
    const isCurrentBoat = occupyingBoatId === currentBoatId;
    const isAvailable = !isOccupied || isCurrentBoat;

    // U-shaped: skip center slots in layout mode
    if (isUShape && viewMode === 'layout') {
      const isLeftEdge = col === 0;
      const isRightEdge = col === location.columns - 1;
      const isBottomRow = row === location.rows - 1;
      if (!isLeftEdge && !isRightEdge && !isBottomRow) {
        return <div key={slotId} className="aspect-square" />;
      }
    }

    // Handle touch events - set flag to prevent click from also firing
    const handleTouchEnd = (e) => {
      if (mode === 'select' && isAvailable && onSlotClick) {
        e.preventDefault();
        touchHandledRef.current = true;
        // Reset the flag after a short delay
        setTimeout(() => { touchHandledRef.current = false; }, 300);
        onSlotClick(slotId);
      }
    };

    // Handle click events - skip if touch already handled it
    const handleClick = (e) => {
      if (touchHandledRef.current) {
        // Touch already handled this interaction, skip
        return;
      }
      if (mode === 'select' && isAvailable && onSlotClick) {
        e.preventDefault();
        onSlotClick(slotId);
      }
    };

    return (
      <button
        key={slotId}
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
        disabled={mode === 'select' && !isAvailable}
        className={`
          relative aspect-square flex flex-col items-center justify-center rounded-lg border-2 shadow-sm
          touch-manipulation
          ${isCurrentBoat ? 'border-blue-500 bg-blue-100 shadow-md' : ''}
          ${isOccupied && !isCurrentBoat ? 'border-slate-300 bg-slate-100 opacity-60 cursor-not-allowed' : ''}
          ${isAvailable && mode === 'select' && interactive ? 'border-slate-300 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 cursor-pointer transition-colors' : ''}
          ${!isAvailable && mode === 'display' ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100' : ''}
        `}
      >
        {/* Slot label */}
        <span className={`text-xs font-medium ${isOccupied ? 'text-slate-600' : 'text-slate-400'}`}>
          {row + 1}-{col + 1}
        </span>

        {/* Boat name if occupied and showBoatNames is true */}
        {isOccupied && showBoatNames && occupyingBoat && (
          <span className="text-xs text-slate-700 font-semibold truncate max-w-full px-1">
            {occupyingBoat.name || occupyingBoat.hullId || occupyingBoat.hull_id}
          </span>
        )}
      </button>
    );
  };

  // Standard grid layout rendering (also used for U-shaped in layout mode)
  if (!isUShape || viewMode === 'layout') {
    return (
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${location.columns}, minmax(0, 1fr))`
        }}
      >
        {Array.from({ length: location.rows }).map((_, row) =>
          Array.from({ length: location.columns }).map((_, col) =>
            renderSlot(row, col)
          )
        )}
      </div>
    );
  }

  // U-shaped concise view rendering (split into arms)
  const leftArmSlots = [];
  const bottomSlots = [];
  const rightArmSlots = [];

  // Left arm: column 0, rows 0 to rows-2 (not including bottom row)
  for (let row = 0; row < location.rows - 1; row++) {
    leftArmSlots.push({ row, col: 0 });
  }

  // Bottom row: all columns in the last row
  for (let col = 0; col < location.columns; col++) {
    bottomSlots.push({ row: location.rows - 1, col });
  }

  // Right arm: last column, rows 0 to rows-2 (not including bottom row)
  for (let row = 0; row < location.rows - 1; row++) {
    rightArmSlots.push({ row, col: location.columns - 1 });
  }

  return (
    <div className="flex gap-4">
      {/* Left Arm */}
      <div className="flex-1">
        <h4 className="text-xs font-medium text-slate-600 mb-2">Left Arm</h4>
        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr' }}>
          {leftArmSlots.map(slot => renderSlot(slot.row, slot.col))}
        </div>
      </div>

      {/* Bottom */}
      <div className="flex-1">
        <h4 className="text-xs font-medium text-slate-600 mb-2">Bottom</h4>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${location.columns}, 1fr)` }}>
          {bottomSlots.map(slot => renderSlot(slot.row, slot.col))}
        </div>
      </div>

      {/* Right Arm */}
      <div className="flex-1">
        <h4 className="text-xs font-medium text-slate-600 mb-2">Right Arm</h4>
        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr' }}>
          {rightArmSlots.map(slot => renderSlot(slot.row, slot.col))}
        </div>
      </div>
    </div>
  );
}
