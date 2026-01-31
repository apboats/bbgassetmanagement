// ============================================================================
// LOCATION GRID COMPONENT
// ============================================================================
// Reusable component for rendering grid-based locations (rack, parking, workshop)
// Used in LocationsView and MyViewEditor
// ============================================================================

import React, { useState } from 'react';
import { Maximize2, Edit2, Trash2, Wrench, Sparkles, Layers, Shield, X, DollarSign, LayoutGrid, List } from 'lucide-react';
import { getActiveSeason } from '../../utils/seasonHelpers';

// ============================================================================
// MAXIMIZED LOCATION MODAL
// ============================================================================
// Full-screen modal for viewing a location in expanded view
// ============================================================================

export function MaximizedLocationModal({
  location,
  boats,
  inventoryBoats,
  onSlotClick,
  onBoatClick,
  draggingBoat,
  onDragStart,
  onDragEnd,
  onDrop,
  onClose
}) {
  // View mode state for U-shaped layouts: 'layout' (grid with hole) or 'concise' (three strips)
  const [viewMode, setViewMode] = useState('layout');

  // Combine boats and inventory boats
  const allBoats = [...(boats || []), ...(inventoryBoats || [])];

  const isUShape = location.layout === 'u-shaped';
  const totalSlots = isUShape
    ? (location.rows * 2) + location.columns
    : location.rows * location.columns;
  const occupiedSlots = Object.keys(location.boats || {}).length;
  const occupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Get slot styling based on boat type
  const getSlotStyle = (boat) => {
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
  };

  // Render slot content
  const renderSlotContent = (boat, row, col) => {
    if (!boat) {
      return (
        <div className="text-slate-400 pointer-events-none">
          <div className="text-3xl mb-1">+</div>
          <p className="text-sm">{row + 1}-{col + 1}</p>
        </div>
      );
    }

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

    // Storage boat - 3 vertical background stripes with dynamic widths based on active season
    if (boat.storageBoat) {
      const activeSeason = getActiveSeason(boat);
      const allComplete = boat.fallStatus === 'all-work-complete' &&
                         boat.winterStatus === 'all-work-complete' &&
                         boat.springStatus === 'all-work-complete';

      // Determine width classes based on active season
      const fallWidth = allComplete ? 'flex-[1]' : (activeSeason === 'fall' ? 'flex-[2]' : 'flex-[1]');
      const winterWidth = allComplete ? 'flex-[1]' : (activeSeason === 'winter' ? 'flex-[2]' : 'flex-[1]');
      const springWidth = allComplete ? 'flex-[1]' : (activeSeason === 'spring' ? 'flex-[2]' : 'flex-[1]');

      // Add opacity to inactive seasons
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

          {/* Foreground: Regular boat card content */}
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
  };

  // Render grid slot (for layout view)
  const renderSlot = (row, col, isPerimeterSlot = true) => {
    if (!isPerimeterSlot) {
      return <div key={`${row}-${col}`} className="aspect-square"></div>;
    }

    const slotId = `${row}-${col}`;
    const boatId = location.boats?.[slotId];
    const boat = allBoats.find(b => b.id === boatId);
    const isDragging = draggingBoat !== null;

    return (
      <div
        key={slotId}
        draggable={!!boat}
        title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
        onDragStart={(e) => {
          if (boat && onDragStart) {
            onDragStart(e, boat, location, slotId);
          }
        }}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => {
          if (onDrop) onDrop(e, location, row, col);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (boat && onBoatClick) {
            onBoatClick(boat);
          } else if (!boat && onSlotClick) {
            onSlotClick(location, row, col);
          }
        }}
        className={`aspect-square border-2 rounded-xl flex flex-col items-center justify-center text-center transition-all min-w-[140px] min-h-[140px] group ${
          boat
            ? boat.storageBoat
              ? 'border-transparent shadow-md cursor-grab active:cursor-grabbing hover:scale-105 p-0 relative'
              : `${getSlotStyle(boat)} border-transparent shadow-md cursor-grab active:cursor-grabbing hover:scale-105 p-3`
            : isDragging
              ? 'border-blue-400 bg-blue-50 cursor-pointer p-3'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer p-3'
        }`}
      >
        {renderSlotContent(boat, row, col)}
      </div>
    );
  };

  // Render slot for concise view (fixed dimensions)
  const renderConciseSlot = (row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats?.[slotId];
    const boat = allBoats.find(b => b.id === boatId);
    const isDragging = draggingBoat !== null;

    return (
      <div
        key={slotId}
        draggable={!!boat}
        title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
        onDragStart={(e) => {
          if (boat && onDragStart) {
            onDragStart(e, boat, location, slotId);
          }
        }}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => {
          if (onDrop) onDrop(e, location, row, col);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (boat && onBoatClick) {
            onBoatClick(boat);
          } else if (!boat && onSlotClick) {
            onSlotClick(location, row, col);
          }
        }}
        className={`border-2 rounded-xl flex flex-col items-center justify-center text-center transition-all overflow-hidden group ${
          boat
            ? boat.storageBoat
              ? 'border-transparent shadow-md cursor-grab active:cursor-grabbing hover:scale-105 p-0 relative'
              : `${getSlotStyle(boat)} border-transparent shadow-md cursor-grab active:cursor-grabbing hover:scale-105 p-2`
            : isDragging
              ? 'border-blue-400 bg-blue-50 cursor-pointer p-2'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer p-2'
        }`}
        style={{ width: '140px', height: '140px', flexShrink: 0 }}
      >
        {renderSlotContent(boat, row, col)}
      </div>
    );
  };

  // Render the grid (Layout View)
  const renderGrid = () => {
    const slots = [];
    for (let row = 0; row < location.rows; row++) {
      for (let col = 0; col < location.columns; col++) {
        if (isUShape) {
          const isLeftEdge = col === 0;
          const isRightEdge = col === location.columns - 1;
          const isBottomRow = row === location.rows - 1;
          const isPerimeter = isLeftEdge || isRightEdge || isBottomRow;
          slots.push(renderSlot(row, col, isPerimeter));
        } else {
          slots.push(renderSlot(row, col, true));
        }
      }
    }
    return slots;
  };

  // Render Concise View for U-shaped layouts (three horizontal strips)
  const renderConciseView = () => {
    // Collect slots for each section
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

    const renderSection = (title, slots) => (
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-600 mb-2 px-1">{title}</h4>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, 140px)' }}
        >
          {slots.map(({ row, col }) => renderConciseSlot(row, col))}
        </div>
      </div>
    );

    return (
      <div className="p-2">
        {renderSection(`Left Arm (${leftArmSlots.length} slots)`, leftArmSlots)}
        {renderSection(`Bottom (${bottomSlots.length} slots)`, bottomSlots)}
        {renderSection(`Right Arm (${rightArmSlots.length} slots)`, rightArmSlots)}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-100 to-slate-200 border-b border-slate-300 rounded-t-2xl flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">{location.name}</h3>
            <p className="text-sm text-slate-600">
              {location.type?.replace('-', ' ')} • {location.rows} × {location.columns}
              {isUShape && ' (U-shaped)'} • {occupiedSlots}/{totalSlots} slots ({occupancyRate}%)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View mode toggle - only for U-shaped layouts */}
            {isUShape && (
              <div className="flex bg-white rounded-lg shadow p-1 gap-1">
                <button
                  onClick={() => setViewMode('layout')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'layout'
                      ? 'bg-blue-500 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Layout
                </button>
                <button
                  onClick={() => setViewMode('concise')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'concise'
                      ? 'bg-blue-500 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <List className="w-4 h-4" />
                  Concise
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 bg-white hover:bg-slate-100 rounded-lg transition-colors shadow"
            >
              <X className="w-6 h-6 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Grid Content - extra padding and gap for mobile touch scrolling */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50">
          {/* Concise view for U-shaped layouts */}
          {isUShape && viewMode === 'concise' ? (
            renderConciseView()
          ) : (
            <>
              {/*
                For narrow grids (1-2 columns): center the content since it won't need horizontal scroll
                For wider grids: use inline-block to allow horizontal scrolling from the left edge
                Gap increased to gap-5 (20px) for easier touch scrolling on mobile
              */}
              {location.columns <= 2 ? (
                <div className="flex items-center justify-center min-h-full p-2">
                  <div
                    className="grid gap-5"
                    style={{
                      gridTemplateColumns: `repeat(${location.columns}, minmax(140px, 180px))`,
                      maxWidth: `${location.columns * 200}px`
                    }}
                  >
                    {renderGrid()}
                  </div>
                </div>
              ) : (
                <div className="inline-block min-w-full p-2">
                  <div
                    className="grid gap-5"
                    style={{
                      gridTemplateColumns: `repeat(${location.columns}, minmax(140px, 1fr))`
                    }}
                  >
                    {renderGrid()}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 rounded-b-2xl">
          <p className="text-sm text-slate-500 text-center">
            Drag boats to move them between slots • Click empty slots to assign boats
          </p>
        </div>
      </div>
    </div>
  );
}

export function LocationGrid({
  location,
  boats,
  inventoryBoats,
  onSlotClick,
  onBoatClick,
  draggingBoat,
  onDragStart,
  onDragEnd,
  onDrop,
  onMaximize,
  onEdit,
  onDelete,
  onRemove,
  canManageLocations
}) {
  // View mode state for U-shaped layouts: 'layout' (grid with hole) or 'concise' (three strips)
  const [viewMode, setViewMode] = useState('layout');

  // Combine boats and inventory boats
  const allBoats = [...(boats || []), ...(inventoryBoats || [])];

  const isUShape = location.layout === 'u-shaped';
  const totalSlots = isUShape
    ? (location.rows * 2) + location.columns
    : location.rows * location.columns;
  const occupiedSlots = Object.keys(location.boats || {}).length;
  const occupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Get slot styling based on boat type
  const getSlotStyle = (boat) => {
    if (!boat) return '';

    if (boat.isInventory) {
      // Inventory boats - gradient based on sales status
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

    // Regular boats - use status classes
    return `status-${boat.status}`;
  };

  // Render slot content based on boat type
  const renderSlotContent = (boat, row, col) => {
    if (!boat) {
      return (
        <div className="text-slate-400 pointer-events-none">
          <div className="text-[clamp(1.25rem,2.5vw,2rem)] mb-0.5">+</div>
          <p className="text-[clamp(0.6rem,1.2vw,0.75rem)] leading-tight">{row + 1}-{col + 1}</p>
        </div>
      );
    }

    if (boat.isInventory) {
      // Inventory boat display
      const salesStatusShort = {
        'HA': 'AVAIL', 'HS': 'SOLD', 'OA': 'ORDER', 'OS': 'ORD-S',
        'FA': 'FUTURE', 'FS': 'FUT-S', 'S': 'SOLD', 'R': 'RSVD', 'FP': 'FP'
      };
      return (
        <>
          <p className="text-white font-bold text-[clamp(0.65rem,1.5vw,0.875rem)] leading-tight pointer-events-none truncate w-full px-1">
            {boat.name}
          </p>
          <p className="text-white/80 text-[clamp(0.55rem,1.1vw,0.75rem)] pointer-events-none truncate w-full">
            {boat.year} {boat.model}
          </p>
          <div className="flex items-center gap-1 mt-1 pointer-events-none">
            <span className="px-1.5 py-0.5 bg-white/20 rounded text-[clamp(0.5rem,1vw,0.625rem)] text-white font-bold">
              {salesStatusShort[boat.salesStatus] || boat.salesStatus || 'INV'}
            </span>
          </div>
        </>
      );
    }

    // Storage boat - 3 vertical background stripes with dynamic widths based on active season
    if (boat.storageBoat) {
      const activeSeason = getActiveSeason(boat);
      const allComplete = boat.fallStatus === 'all-work-complete' &&
                         boat.winterStatus === 'all-work-complete' &&
                         boat.springStatus === 'all-work-complete';

      // Determine width classes based on active season
      const fallWidth = allComplete ? 'flex-[1]' : (activeSeason === 'fall' ? 'flex-[2]' : 'flex-[1]');
      const winterWidth = allComplete ? 'flex-[1]' : (activeSeason === 'winter' ? 'flex-[2]' : 'flex-[1]');
      const springWidth = allComplete ? 'flex-[1]' : (activeSeason === 'spring' ? 'flex-[2]' : 'flex-[1]');

      // Add opacity to inactive seasons
      const fallOpacity = (activeSeason !== 'fall' && !allComplete) ? 'opacity-70' : '';
      const winterOpacity = (activeSeason !== 'winter' && !allComplete) ? 'opacity-70' : '';
      const springOpacity = (activeSeason !== 'spring' && !allComplete) ? 'opacity-70' : '';

      return (
        <>
          {/* Background: 3 colored vertical stripes with dynamic widths */}
          <div className="absolute inset-0 flex rounded-lg overflow-hidden pointer-events-none">
            <div className={`${fallWidth} h-full status-${boat.fallStatus} ${fallOpacity} border-r border-white/20`}></div>
            <div className={`${winterWidth} h-full status-${boat.winterStatus} ${winterOpacity} border-r border-white/20`}></div>
            <div className={`${springWidth} h-full status-${boat.springStatus} ${springOpacity}`}></div>
          </div>

          {/* Foreground: Regular boat card content (responsive sizing) */}
          <p className="text-white font-bold text-[clamp(0.75rem,1.8vw,1.125rem)] leading-tight pointer-events-none truncate w-full px-1 relative z-10">{boat.owner}</p>
          {boat.workOrderNumber && (
            <p className="text-white text-[clamp(0.6rem,1.2vw,0.875rem)] font-mono font-semibold pointer-events-none truncate w-full relative z-10">
              WO: {boat.workOrderNumber}
            </p>
          )}
          <div className="flex gap-1 mt-1 pointer-events-none relative z-10">
            <Wrench className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat[`${activeSeason}MechanicalsComplete`] ? 'text-white' : 'text-white/30'}`} title="Mechanicals" />
            <Sparkles className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat[`${activeSeason}CleanComplete`] ? 'text-white' : 'text-white/30'}`} title="Clean" />
            <Layers className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat[`${activeSeason}FiberglassComplete`] ? 'text-white' : 'text-white/30'}`} title="Fiberglass" />
            <Shield className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat[`${activeSeason}WarrantyComplete`] ? 'text-white' : 'text-white/30'}`} title="Warranty" />
          </div>
          <p className="text-white text-[clamp(0.5rem,1vw,0.625rem)] opacity-75 pointer-events-none truncate w-full mt-0.5 relative z-10">{boat.name}</p>
        </>
      );
    }

    // Regular boat display
    return (
      <>
        <p className="text-white font-bold text-[clamp(0.75rem,1.8vw,1.125rem)] leading-tight pointer-events-none truncate w-full px-1">{boat.owner}</p>
        {boat.workOrderNumber && (
          <p className="text-white text-[clamp(0.6rem,1.2vw,0.875rem)] font-mono font-semibold pointer-events-none truncate w-full">
            WO: {boat.workOrderNumber}
          </p>
        )}
        <div className="flex gap-1 mt-1 pointer-events-none">
          <Wrench className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat.mechanicalsComplete ? 'text-white' : 'text-white/30'}`} title="Mechanicals" />
          <Sparkles className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat.cleanComplete ? 'text-white' : 'text-white/30'}`} title="Clean" />
          <Layers className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat.fiberglassComplete ? 'text-white' : 'text-white/30'}`} title="Fiberglass" />
          <Shield className={`w-[clamp(0.75rem,1.5vw,1.125rem)] h-[clamp(0.75rem,1.5vw,1.125rem)] ${boat.warrantyComplete ? 'text-white' : 'text-white/30'}`} title="Warranty" />
        </div>
        <p className="text-white text-[clamp(0.5rem,1vw,0.625rem)] opacity-75 pointer-events-none truncate w-full mt-0.5">{boat.name}</p>
      </>
    );
  };

  // Render U-shaped layout
  const renderUShapedGrid = () => {
    const slots = [];

    for (let row = 0; row < location.rows; row++) {
      for (let col = 0; col < location.columns; col++) {
        const isLeftEdge = col === 0;
        const isRightEdge = col === location.columns - 1;
        const isBottomRow = row === location.rows - 1;

        // Only render if on perimeter (U-shaped)
        const isPerimeter = isLeftEdge || isRightEdge || isBottomRow;

        if (!isPerimeter && isUShape) {
          // Empty space in center of U
          slots.push(
            <div key={`${row}-${col}`} className="aspect-square"></div>
          );
          continue;
        }

        const slotId = `${row}-${col}`;
        const boatId = location.boats?.[slotId];
        const boat = allBoats.find(b => b.id === boatId);
        const isDragging = draggingBoat !== null;

        slots.push(
          <div
            key={slotId}
            draggable={!!boat}
            title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
            onDragStart={(e) => {
              if (boat && onDragStart) {
                onDragStart(e, boat, location, slotId);
              }
            }}
            onDragEnd={onDragEnd}
            onDragOver={handleDragOver}
            onDrop={(e) => {
              if (onDrop) onDrop(e, location, row, col);
            }}
            onClick={(e) => {
              // Allow clicks even during drag operations on mobile
              e.stopPropagation();
              if (boat && onBoatClick) {
                onBoatClick(boat);
              } else if (!boat && onSlotClick) {
                onSlotClick(location, row, col);
              }
            }}
            className={`location-slot aspect-square border-2 rounded-lg flex flex-col items-center justify-center text-center transition-all group ${
              boat
                ? boat.storageBoat
                  ? 'border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105 p-0 relative'
                  : `${getSlotStyle(boat)} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105 p-2`
                : isDragging
                  ? 'border-blue-400 bg-blue-50 cursor-pointer p-2'
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer p-2'
            }`}
          >
            {renderSlotContent(boat, row, col)}
          </div>
        );
      }
    }

    return slots;
  };

  // Render standard grid layout
  const renderStandardGrid = () => {
    return Array.from({ length: location.rows }).map((_, row) =>
      Array.from({ length: location.columns }).map((_, col) => {
        const slotId = `${row}-${col}`;
        const boatId = location.boats?.[slotId];
        const boat = allBoats.find(b => b.id === boatId);
        const isDragging = draggingBoat !== null;

        return (
          <div
            key={slotId}
            draggable={!!boat}
            title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
            onDragStart={(e) => {
              if (boat && onDragStart) {
                onDragStart(e, boat, location, slotId);
              }
            }}
            onDragEnd={onDragEnd}
            onDragOver={handleDragOver}
            onDrop={(e) => {
              if (onDrop) onDrop(e, location, row, col);
            }}
            onClick={(e) => {
              // Allow clicks even during drag operations on mobile
              e.stopPropagation();
              if (boat && onBoatClick) {
                onBoatClick(boat);
              } else if (!boat && onSlotClick) {
                onSlotClick(location, row, col);
              }
            }}
            className={`location-slot aspect-square border-2 rounded-lg flex flex-col items-center justify-center text-center transition-all group ${
              boat
                ? boat.storageBoat
                  ? 'border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105 p-0 relative'
                  : `${getSlotStyle(boat)} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105 p-2`
                : isDragging
                  ? 'border-blue-400 bg-blue-50 cursor-pointer p-2'
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer p-2'
            }`}
          >
            {renderSlotContent(boat, row, col)}
          </div>
        );
      })
    );
  };

  // Render a single slot for concise view
  const renderConciseSlot = (row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats?.[slotId];
    const boat = allBoats.find(b => b.id === boatId);
    const isDragging = draggingBoat !== null;

    return (
      <div
        key={slotId}
        draggable={!!boat}
        title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
        onDragStart={(e) => {
          if (boat && onDragStart) {
            onDragStart(e, boat, location, slotId);
          }
        }}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => {
          if (onDrop) onDrop(e, location, row, col);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (boat && onBoatClick) {
            onBoatClick(boat);
          } else if (!boat && onSlotClick) {
            onSlotClick(location, row, col);
          }
        }}
        className={`location-slot border-2 rounded-lg flex flex-col items-center justify-center text-center transition-all overflow-hidden group ${
          boat
            ? boat.storageBoat
              ? 'border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105 p-0 relative'
              : `${getSlotStyle(boat)} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105 p-1.5`
            : isDragging
              ? 'border-blue-400 bg-blue-50 cursor-pointer p-1.5'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer p-1.5'
        }`}
        style={{ width: '100px', height: '100px', flexShrink: 0 }}
      >
        {renderSlotContent(boat, row, col)}
      </div>
    );
  };

  // Render Concise View for U-shaped layouts (three horizontal strips)
  const renderConciseView = () => {
    // Collect slots for each section
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

    const renderSection = (title, slots) => (
      <div className="mb-3">
        <p className="text-xs font-semibold text-slate-500 mb-1.5 px-0.5">{title}</p>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, 100px)' }}
        >
          {slots.map(({ row, col }) => renderConciseSlot(row, col))}
        </div>
      </div>
    );

    return (
      <div>
        {renderSection(`Left Arm (${leftArmSlots.length})`, leftArmSlots)}
        {renderSection(`Bottom (${bottomSlots.length})`, bottomSlots)}
        {renderSection(`Right Arm (${rightArmSlots.length})`, rightArmSlots)}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-lg font-bold text-slate-900">{location.name}</h4>
            {isUShape && <span className="text-xs text-blue-600 font-medium">U-Shaped Layout</span>}
          </div>
          <div className="flex gap-1">
            {onMaximize && (
              <button
                onClick={onMaximize}
                className="p-1.5 hover:bg-white rounded-lg transition-colors"
                title="Expand view"
              >
                <Maximize2 className="w-4 h-4 text-slate-600" />
              </button>
            )}
            {onEdit && canManageLocations && (
              <button
                onClick={onEdit}
                className="p-1.5 hover:bg-white rounded-lg transition-colors"
                title="Edit"
              >
                <Edit2 className="w-4 h-4 text-slate-600" />
              </button>
            )}
            {(onDelete || onRemove) && canManageLocations && (
              <button
                onClick={onDelete || onRemove}
                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-600 capitalize">
            {location.type?.replace('-', ' ')} • {location.rows} × {location.columns}
            {isUShape && ' (perimeter)'}
          </p>
          <p className="text-slate-700 font-medium">{occupiedSlots}/{totalSlots} ({occupancyRate}%)</p>
        </div>

        {/* View mode toggle for U-shaped layouts */}
        {isUShape && (
          <div className="flex mt-3 bg-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('layout')}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'layout'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              Layout
            </button>
            <button
              onClick={() => setViewMode('concise')}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'concise'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3 h-3" />
              Concise
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50">
        {/* Concise view for U-shaped layouts */}
        {isUShape && viewMode === 'concise' ? (
          <div className="overflow-x-auto">
            {renderConciseView()}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${location.columns}, minmax(100px, 100px))`
                }}
              >
                {isUShape ? renderUShapedGrid() : renderStandardGrid()}
              </div>
            </div>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-500 text-center">
            💡 Drag boats to move them between slots
          </p>
        </div>
      </div>
    </div>
  );
}
