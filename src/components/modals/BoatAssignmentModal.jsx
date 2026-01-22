import React, { useState } from 'react';
import { Search, Plus, X, Anchor, Package } from 'lucide-react';
import { BoatModal } from './BoatModal';
import { DockmasterImportModal } from './DockmasterImportModal';

export function BoatAssignmentModal({ boats, allBoats, onAssign, onCancel, onCreateBoat, onImportBoat, locations }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateBoat, setShowCreateBoat] = useState(false);
  const [showImportBoat, setShowImportBoat] = useState(false);

  const filteredBoats = boats.filter(boat => {
    const matchesSearch = boat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (boat.hullId && boat.hullId.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (boat.dockmasterId && boat.dockmasterId.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const handleCreateBoat = async (newBoat) => {
    if (onCreateBoat) {
      const createdBoat = await onCreateBoat(newBoat);
      if (createdBoat && createdBoat.id) {
        // Auto-assign the newly created boat to the slot
        onAssign(createdBoat.id);
      }
    }
    setShowCreateBoat(false);
  };

  const handleImportBoat = async (importedBoat) => {
    if (onImportBoat) {
      const createdBoat = await onImportBoat(importedBoat);
      if (createdBoat && createdBoat.id) {
        // Auto-assign the newly imported boat to the slot
        onAssign(createdBoat.id);
      }
    }
    setShowImportBoat(false);
  };

  // If showing create or import modal, render those instead
  if (showCreateBoat) {
    return (
      <BoatModal
        boat={null}
        locations={locations || []}
        onSave={handleCreateBoat}
        onCancel={() => setShowCreateBoat(false)}
      />
    );
  }

  if (showImportBoat) {
    return (
      <DockmasterImportModal
        dockmasterConfig={{}}
        onImport={handleImportBoat}
        onCancel={() => setShowImportBoat(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col animate-slide-in">
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-slate-900">Assign Boat to Slot</h3>
            <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Create/Import buttons */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowCreateBoat(true)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New Boat
            </button>
            <button
              onClick={() => setShowImportBoat(true)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import from Dockmaster
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, model, owner, Hull ID, or Dockmaster ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {filteredBoats.length} boat{filteredBoats.length !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: '200px', maxHeight: 'calc(85vh - 200px)' }}>
          {filteredBoats.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">
                {searchQuery ? 'No boats match your search' : 'No boats available'}
              </p>
              <p className="text-sm text-slate-400">
                Create a new boat or import from Dockmaster above
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBoats.map(boat => (
                <button
                  key={boat.id}
                  onClick={() => onAssign(boat.id)}
                  className="w-full p-3 border-2 border-slate-200 hover:border-blue-500 rounded-lg text-left transition-all hover:shadow-md hover:bg-blue-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900 truncate">{boat.name}</p>
                        {boat.isInventory && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                            Inventory
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 truncate">{boat.model}</p>
                      <p className="text-xs text-slate-500 truncate">Owner: {boat.owner}</p>
                      <div className="flex gap-3 mt-1">
                        {boat.hullId && (
                          <p className="text-xs text-slate-600">
                            <span className="font-medium">Hull ID:</span> {boat.hullId}
                          </p>
                        )}
                        {boat.dockmasterId && (
                          <p className="text-xs text-slate-600">
                            <span className="font-medium">DM ID:</span> {boat.dockmasterId}
                          </p>
                        )}
                      </div>
                      {boat.location && (
                        <p className="text-xs text-orange-600 mt-1">
                          Currently at: {boat.location} ({boat.slot})
                        </p>
                      )}
                    </div>
                    {boat.isInventory ? (
                      <div className="px-2.5 py-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full text-xs font-medium text-white flex-shrink-0">
                        {boat.salesStatus || 'INV'}
                      </div>
                    ) : (
                      <div className={`px-2.5 py-1 status-${boat.status} rounded-full text-xs font-medium text-white flex-shrink-0`}>
                        {boat.status.replace(/-/g, ' ').substring(0, 12)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
