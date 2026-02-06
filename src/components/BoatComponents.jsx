// ============================================================================
// SHARED BOAT COMPONENTS
// ============================================================================
// Reusable components for displaying boats consistently across the app
// ============================================================================

import React from 'react';
import { Wrench, Sparkles, Layers, Shield, DollarSign } from 'lucide-react';
import { getActiveSeason } from '../utils/seasonHelpers';

// ============================================================================
// UTILITY: findBoatLocationData
// ============================================================================
// Centralized logic for finding boat location data
// Returns enriched boat object with location and slot information
export function findBoatLocationData(boat, locations = []) {
  let location = boat.location ? locations.find(l => l.name === boat.location) : null;
  let slotId = boat.slot;

  // If boat.location isn't set, search for it in all locations
  if (!location || !slotId) {
    for (const loc of locations) {
      // Check pool_boats array
      if (loc.type === 'pool' && loc.pool_boats?.includes(boat.id)) {
        location = loc;
        slotId = 'pool';
        break;
      }
      // Check boats object (grid slots)
      if (loc.boats) {
        const foundSlot = Object.keys(loc.boats).find(key => loc.boats[key] === boat.id);
        if (foundSlot) {
          location = loc;
          slotId = foundSlot;
          break;
        }
      }
    }
  } else if (location && !slotId) {
    // Location is known but slot isn't - find the slot
    if (location.type === 'pool' && location.pool_boats?.includes(boat.id)) {
      slotId = 'pool';
    } else if (location.boats) {
      slotId = Object.keys(location.boats).find(key => location.boats[key] === boat.id) || null;
    }
  }

  return {
    location,
    slotId,
    enrichedBoat: {
      ...boat,
      location: location?.name || boat.location,
      slot: slotId || boat.slot
    }
  };
}

// ============================================================================
// CUSTOM HOOK: useBoatLocation
// ============================================================================
// Returns formatted location information for a boat
export function useBoatLocation(boat, locations = []) {
  if (!boat.location) {
    return {
      location: null,
      isInPool: false,
      displayLocation: 'Unassigned',
      displaySlot: null,
    };
  }

  const location = locations.find(l => l.name === boat.location);
  const isInPool = location?.type === 'pool' || boat.slot === 'pool';

  // Convert slot to display format
  let displaySlot = boat.slot;
  if (isInPool) {
    displaySlot = 'Pool';
  } else if (boat.slot) {
    // Convert 0-indexed slot to 1-indexed for display (e.g., "0-2" → "1-3")
    const parts = boat.slot.split('-');
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      displaySlot = `${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`;
    }
  }

  return {
    location,
    isInPool,
    displayLocation: boat.location,
    displaySlot,
  };
}

// ============================================================================
// LOCATION BADGE
// ============================================================================
// Displays location and slot info for a boat
export function LocationBadge({ location, slot, className = '' }) {
  if (!location) {
    return (
      <div className={`text-xs text-slate-500 ${className}`}>
        Unassigned
      </div>
    );
  }

  const isPool = slot === 'Pool' || slot === 'pool';

  return (
    <div className={`text-xs ${className}`}>
      <span className="font-medium text-slate-700">{location}</span>
      {slot && (
        <>
          <span className="text-slate-400 mx-1">•</span>
          <span className={isPool ? 'text-teal-600' : 'text-slate-600'}>{slot}</span>
        </>
      )}
    </div>
  );
}

// ============================================================================
// BOAT STATUS ICONS
// ============================================================================
// Shows completion status icons for customer boats
// For storage boats, shows active season's work phases
export function BoatStatusIcons({ boat, size = 'w-3 h-3', className = '' }) {
  // Only show for customer boats (not inventory)
  if (boat.isInventory) return null;

  // For storage boats, use active season's work phases
  if (boat.storageBoat) {
    const activeSeason = getActiveSeason(boat);
    const mechanicalsComplete = boat[`${activeSeason}MechanicalsComplete`];
    const cleanComplete = boat[`${activeSeason}CleanComplete`];
    const fiberglassComplete = boat[`${activeSeason}FiberglassComplete`];
    const warrantyComplete = boat[`${activeSeason}WarrantyComplete`];

    return (
      <div className={`flex gap-1 ${className}`}>
        <Wrench
          className={`${size} ${mechanicalsComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={mechanicalsComplete ? 2.5 : 1.5}
        />
        <Sparkles
          className={`${size} ${cleanComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={cleanComplete ? 2.5 : 1.5}
        />
        <Layers
          className={`${size} ${fiberglassComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={fiberglassComplete ? 2.5 : 1.5}
        />
        <Shield
          className={`${size} ${warrantyComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={warrantyComplete ? 2.5 : 1.5}
        />
      </div>
    );
  }

  // Regular boat - use regular work phases
  return (
    <div className={`flex gap-1 ${className}`}>
      <Wrench
        className={`${size} ${boat.mechanicalsComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.mechanicalsComplete ? 2.5 : 1.5}
      />
      <Sparkles
        className={`${size} ${boat.cleanComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.cleanComplete ? 2.5 : 1.5}
      />
      <Layers
        className={`${size} ${boat.fiberglassComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.fiberglassComplete ? 2.5 : 1.5}
      />
      <Shield
        className={`${size} ${boat.warrantyComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.warrantyComplete ? 2.5 : 1.5}
      />
    </div>
  );
}

// ============================================================================
// INVENTORY BADGE
// ============================================================================
// Shows inventory status badge for inventory boats
export function InventoryBadge({ boat, className = '' }) {
  if (!boat.isInventory) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">
        {boat.salesStatus || 'INV'}
      </span>
      <span className="text-xs text-slate-500">Inventory</span>
    </div>
  );
}

// ============================================================================
// BOAT CARD CONTENT
// ============================================================================
// Displays boat information (name, owner, details) without card wrapper
export function BoatCardContent({ boat, showLocation = false, locations = [] }) {
  const { displayLocation, displaySlot } = useBoatLocation(boat, locations);

  if (boat.isInventory) {
    return (
      <>
        <p className="font-semibold text-slate-900 text-sm truncate">{boat.name}</p>
        <p className="text-xs text-slate-600 truncate">{boat.year} {boat.model}</p>
        <InventoryBadge boat={boat} className="mt-2" />
        {showLocation && (
          <LocationBadge
            location={displayLocation}
            slot={displaySlot}
            className="mt-1"
          />
        )}
      </>
    );
  }

  // Customer boat
  return (
    <>
      <p className="font-semibold text-slate-900 text-sm truncate">{boat.owner}</p>
      <p className="text-xs text-slate-600 truncate">{boat.name}</p>
      {boat.workOrderNumber && (
        <p className="text-xs text-slate-500 font-mono mt-1">WO: {boat.workOrderNumber}</p>
      )}
      <BoatStatusIcons boat={boat} className="mt-2" />
      {showLocation && (
        <LocationBadge
          location={displayLocation}
          slot={displaySlot}
          className="mt-1"
        />
      )}
    </>
  );
}

// ============================================================================
// BOAT CARD
// ============================================================================
// Complete boat card with wrapper, click handler, and drag support
export function BoatCard({
  boat,
  onClick,
  showLocation = false,
  locations = [],
  draggable = false,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  className = '',
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={() => onClick && onClick(boat)}
      className={`p-3 bg-white rounded-lg border border-slate-200 hover:border-teal-400 hover:shadow-md cursor-pointer transition-all select-none ${className}`}
      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <BoatCardContent
        boat={boat}
        showLocation={showLocation}
        locations={locations}
      />
    </div>
  );
}

// ============================================================================
// BOAT LIST ITEM
// ============================================================================
// Compact boat display for lists (alternative to cards)
export function BoatListItem({
  boat,
  onClick,
  showLocation = false,
  locations = [],
  className = '',
}) {
  const { displayLocation, displaySlot } = useBoatLocation(boat, locations);

  return (
    <div
      onClick={() => onClick && onClick(boat)}
      className={`p-3 bg-white border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {boat.isInventory ? (
            <>
              <p className="font-semibold text-slate-900 text-sm truncate">{boat.name}</p>
              <p className="text-xs text-slate-600 truncate">{boat.year} {boat.model}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-900 text-sm truncate">{boat.owner}</p>
              <p className="text-xs text-slate-600 truncate">{boat.name}</p>
            </>
          )}
          {showLocation && (
            <LocationBadge
              location={displayLocation}
              slot={displaySlot}
              className="mt-1"
            />
          )}
        </div>
        <div className="flex items-center gap-2 ml-3">
          {boat.isInventory ? (
            <InventoryBadge boat={boat} />
          ) : (
            <BoatStatusIcons boat={boat} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SLOT CARD STYLING
// ============================================================================
// Get background styling for boat slot cards based on boat type/status
// Used by LocationGrid and DragPreview for consistent slot appearance
export function getBoatSlotStyle(boat) {
  if (!boat) return '';

  if (boat.isInventory) {
    const salesStatusColors = {
      'HA': 'bg-gradient-to-br from-green-500 to-green-600',
      'HS': 'bg-gradient-to-br from-emerald-600 to-emerald-700',
      'OA': 'bg-gradient-to-br from-blue-500 to-blue-600',
      'OS': 'bg-gradient-to-br from-blue-600 to-blue-700',
      'FA': 'bg-gradient-to-br from-amber-500 to-amber-600',
      'FS': 'bg-gradient-to-br from-amber-600 to-amber-700',
      'S': 'bg-gradient-to-br from-purple-500 to-purple-600',
      'R': 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      'FP': 'bg-gradient-to-br from-slate-500 to-slate-600',
    };
    return salesStatusColors[boat.salesStatus] || 'bg-gradient-to-br from-blue-500 to-blue-600';
  }

  return `status-${boat.status}`;
}

// ============================================================================
// SLOT CARD CONTENT
// ============================================================================
// Renders boat content for slot cards (colored backgrounds, white text)
// Used by LocationGrid slots and DragPreview for identical appearance
export function SlotCardContent({ boat }) {
  if (!boat) return null;

  // Inventory boat content
  if (boat.isInventory) {
    const salesStatusShort = {
      'HA': 'AVAIL', 'HS': 'SOLD', 'OA': 'ORDER', 'OS': 'ORD-S',
      'FA': 'FUTURE', 'FS': 'FUT-S', 'S': 'SOLD', 'R': 'RSVD', 'FP': 'FP'
    };
    return (
      <>
        <p className="text-white font-bold text-base leading-tight pointer-events-none truncate w-full px-1">
          {boat.name}
        </p>
        <p className="text-white/80 text-sm pointer-events-none truncate w-full">
          {boat.year} {boat.model}
        </p>
        <div className="flex items-center gap-1 mt-1 pointer-events-none">
          <span className="px-2 py-0.5 bg-white/20 rounded text-xs text-white font-bold">
            {salesStatusShort[boat.salesStatus] || boat.salesStatus || 'INV'}
          </span>
        </div>
      </>
    );
  }

  // Storage boat content - 3 vertical background stripes with dynamic widths
  if (boat.storageBoat) {
    const activeSeason = getActiveSeason(boat);
    const allComplete = boat.fallStatus === 'all-work-complete' &&
                       boat.winterStatus === 'all-work-complete' &&
                       boat.springStatus === 'all-work-complete';

    const fallWidth = allComplete ? 'flex-[1]' : (activeSeason === 'fall' ? 'flex-[2]' : 'flex-[1]');
    const winterWidth = allComplete ? 'flex-[1]' : (activeSeason === 'winter' ? 'flex-[2]' : 'flex-[1]');
    const springWidth = allComplete ? 'flex-[1]' : (activeSeason === 'spring' ? 'flex-[2]' : 'flex-[1]');

    const fallOpacity = (activeSeason !== 'fall' && !allComplete) ? 'opacity-70' : '';
    const winterOpacity = (activeSeason !== 'winter' && !allComplete) ? 'opacity-70' : '';
    const springOpacity = (activeSeason !== 'spring' && !allComplete) ? 'opacity-70' : '';

    return (
      <>
        {/* Background: 3 colored vertical stripes with dynamic widths */}
        <div className="absolute inset-0 flex rounded-xl overflow-hidden pointer-events-none">
          <div className={`${fallWidth} h-full status-${boat.fallStatus} ${fallOpacity} border-r border-white/20`}></div>
          <div className={`${winterWidth} h-full status-${boat.winterStatus} ${winterOpacity} border-r border-white/20`}></div>
          <div className={`${springWidth} h-full status-${boat.springStatus} ${springOpacity}`}></div>
        </div>

        {/* Foreground content */}
        <p className="text-white font-bold text-lg leading-tight pointer-events-none truncate w-full px-1 relative z-10">{boat.owner}</p>
        {boat.workOrderNumber && (
          <p className="text-white text-sm font-mono font-semibold pointer-events-none truncate w-full relative z-10">
            WO: {boat.workOrderNumber}
          </p>
        )}
        <div className="flex gap-1.5 mt-1 pointer-events-none relative z-10">
          <Wrench className={`w-5 h-5 ${boat[`${activeSeason}MechanicalsComplete`] ? 'text-white' : 'text-white/30'}`} title="Mechanicals" />
          <Sparkles className={`w-5 h-5 ${boat[`${activeSeason}CleanComplete`] ? 'text-white' : 'text-white/30'}`} title="Clean" />
          <Layers className={`w-5 h-5 ${boat[`${activeSeason}FiberglassComplete`] ? 'text-white' : 'text-white/30'}`} title="Fiberglass" />
          <Shield className={`w-5 h-5 ${boat[`${activeSeason}WarrantyComplete`] ? 'text-white' : 'text-white/30'}`} title="Warranty" />
          <DollarSign className={`w-5 h-5 ${boat[`${activeSeason}InvoicedComplete`] ? 'text-white' : 'text-white/30'}`} title="Invoiced" />
        </div>
        <p className="text-white text-xs opacity-75 pointer-events-none truncate w-full mt-1 relative z-10">{boat.name}</p>
      </>
    );
  }

  // Regular customer boat content
  return (
    <>
      <p className="text-white font-bold text-lg leading-tight pointer-events-none truncate w-full px-1">{boat.owner}</p>
      {boat.workOrderNumber && (
        <p className="text-white text-sm font-mono font-semibold pointer-events-none truncate w-full">
          WO: {boat.workOrderNumber}
        </p>
      )}
      <div className="flex gap-1.5 mt-1 pointer-events-none">
        <Wrench className={`w-5 h-5 ${boat.mechanicalsComplete ? 'text-white' : 'text-white/30'}`} title="Mechanicals" />
        <Sparkles className={`w-5 h-5 ${boat.cleanComplete ? 'text-white' : 'text-white/30'}`} title="Clean" />
        <Layers className={`w-5 h-5 ${boat.fiberglassComplete ? 'text-white' : 'text-white/30'}`} title="Fiberglass" />
        <Shield className={`w-5 h-5 ${boat.warrantyComplete ? 'text-white' : 'text-white/30'}`} title="Warranty" />
        <DollarSign className={`w-5 h-5 ${boat.invoicedComplete ? 'text-white' : 'text-white/30'}`} title="Invoiced" />
      </div>
      <p className="text-white text-xs opacity-75 pointer-events-none truncate w-full mt-1">{boat.name}</p>
    </>
  );
}

// ============================================================================
// DRAG PREVIEW
// ============================================================================
// Floating ghost preview shown during touch drag operations
// Uses SlotCardContent for identical appearance to location grid slots
export function DragPreview({ boat, position, isVisible }) {
  if (!isVisible || !boat || !position || position.x === 0) return null;

  const isStorageBoat = boat.storageBoat;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%) scale(0.9)',
        opacity: 0.85
      }}
    >
      <div className={`rounded-xl shadow-2xl min-w-[140px] min-h-[100px] p-3 flex flex-col items-center justify-center text-center ${
        isStorageBoat ? 'relative overflow-hidden' : getBoatSlotStyle(boat)
      }`}>
        <SlotCardContent boat={boat} />
      </div>
    </div>
  );
}
