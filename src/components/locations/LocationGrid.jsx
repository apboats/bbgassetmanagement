// ============================================================================
// LOCATION GRID COMPONENT
// ============================================================================
// Reusable component for rendering grid-based locations (rack, parking, workshop)
// Used in LocationsView and MyViewEditor
// ============================================================================

import React from 'react';
import { Maximize2, Edit2, Trash2, Wrench, Sparkles, Layers, Shield } from 'lucide-react';

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
  onRemove
}) {
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
                onSlotClick(slotId);
              }
            }}
            className={`location-slot aspect-square border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center transition-all ${
              boat
                ? `${getSlotStyle(boat)} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105`
                : isDragging
                  ? 'border-blue-400 bg-blue-50 cursor-pointer'
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
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
                onSlotClick(slotId);
              }
            }}
            className={`location-slot aspect-square border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center transition-all ${
              boat
                ? `${getSlotStyle(boat)} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105`
                : isDragging
                  ? 'border-blue-400 bg-blue-50 cursor-pointer'
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
            }`}
          >
            {renderSlotContent(boat, row, col)}
          </div>
        );
      })
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
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 hover:bg-white rounded-lg transition-colors"
                title="Edit"
              >
                <Edit2 className="w-4 h-4 text-slate-600" />
              </button>
            )}
            {(onDelete || onRemove) && (
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
      </div>

      <div className="p-4 bg-slate-50">
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
        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-500 text-center">
            💡 Drag boats to move them between slots
          </p>
        </div>
      </div>
    </div>
  );
}
