// ============================================================================
// LOCATION UTILITIES
// ============================================================================
// Shared utility functions for location operations across all views
// ============================================================================

// Get boats in a specific location
export function getBoatsInLocation(location, boats, inventoryBoats) {
  const allBoats = [...boats, ...inventoryBoats];

  if (location.type === 'pool') {
    const poolBoatIds = location.pool_boats || location.poolBoats || [];
    return allBoats.filter(b => poolBoatIds.includes(b.id));
  }

  // Grid-based location
  const boatIds = Object.values(location.boats || {});
  return allBoats.filter(b => boatIds.includes(b.id));
}

// Calculate location occupancy
export function calculateOccupancy(location) {
  if (location.type === 'pool') {
    const boatCount = (location.pool_boats || location.poolBoats || []).length;
    return { occupied: boatCount, total: '∞', percentage: 100 };
  }

  const totalSlots = location.layout === 'u-shaped'
    ? (location.rows * 2) + location.columns
    : location.rows * location.columns;

  const occupiedSlots = Object.keys(location.boats || {}).length;
  const percentage = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

  return { occupied: occupiedSlots, total: totalSlots, percentage };
}

// Check if slot is in U-shaped perimeter
export function isInUShapedPerimeter(row, col, location) {
  if (location.layout !== 'u-shaped') return true;

  const isLeftEdge = col === 0;
  const isRightEdge = col === location.columns - 1;
  const isBottomRow = row === location.rows - 1;

  return isLeftEdge || isRightEdge || isBottomRow;
}

// Get boat in specific slot
export function getBoatInSlot(slotId, location, boats, inventoryBoats) {
  const boatId = location.boats?.[slotId];
  if (!boatId) return null;

  return [...boats, ...inventoryBoats].find(b => b.id === boatId);
}
