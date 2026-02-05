// ============================================================================
// REQUEST MODAL
// ============================================================================
// Modal for creating new service requests
// Sales Managers select inventory boat, type, and describe the request
// ============================================================================

import { useState, useMemo } from 'react';
import { X, Search, Ship } from 'lucide-react';

// Sales status labels and colors (matches InventoryBoatCard)
const salesStatusLabels = {
  'HA': { label: 'On Hand Available', color: 'bg-green-500' },
  'HS': { label: 'On Hand Sold', color: 'bg-emerald-600' },
  'OA': { label: 'On Order Available', color: 'bg-blue-500' },
  'OS': { label: 'On Order Sold', color: 'bg-blue-600' },
  'FA': { label: 'Future Available', color: 'bg-amber-500' },
  'FS': { label: 'Future Sold', color: 'bg-amber-600' },
  'S': { label: 'Sold', color: 'bg-purple-500' },
  'R': { label: 'Reserved', color: 'bg-indigo-500' },
  'FP': { label: 'Floor Planned', color: 'bg-slate-500' }
};

export function RequestModal({ inventoryBoats = [], onSave, onClose }) {
  const [type, setType] = useState('rigging');
  const [selectedBoatId, setSelectedBoatId] = useState('');
  const [description, setDescription] = useState('');
  const [boatSearch, setBoatSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filter boats by search
  const filteredBoats = useMemo(() => {
    if (!boatSearch.trim()) return inventoryBoats;

    const search = boatSearch.toLowerCase();
    return inventoryBoats.filter(boat => {
      const name = (boat.name || '').toLowerCase();
      const model = (boat.model || '').toLowerCase();
      const make = (boat.make || '').toLowerCase();
      const stockNumber = (boat.stock_number || boat.stockNumber || '').toLowerCase();
      const hullId = (boat.hull_id || boat.hullId || '').toLowerCase();

      return (
        name.includes(search) ||
        model.includes(search) ||
        make.includes(search) ||
        stockNumber.includes(search) ||
        hullId.includes(search)
      );
    });
  }, [inventoryBoats, boatSearch]);

  // Get selected boat for display
  const selectedBoat = useMemo(() => {
    return inventoryBoats.find(b => b.id === selectedBoatId);
  }, [inventoryBoats, selectedBoatId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedBoatId) {
      setError('Please select an inventory boat');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a description of the request');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        type,
        inventory_boat_id: selectedBoatId,
        description: description.trim(),
      });
    } catch (err) {
      console.error('Error creating request:', err);
      setError(err.message || 'Failed to create request');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">New Service Request</h3>
            <button onClick={onClose} className="p-1 hover:bg-blue-500 rounded transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-blue-100 text-sm mt-1">Create a request for service team</p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Request Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Request Type</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setType('rigging')}
                className={`flex-1 p-3 rounded-lg border-2 font-medium transition-all ${
                  type === 'rigging'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                Rigging
              </button>
              <button
                type="button"
                onClick={() => setType('prep')}
                className={`flex-1 p-3 rounded-lg border-2 font-medium transition-all ${
                  type === 'prep'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                Prep
              </button>
            </div>
          </div>

          {/* Inventory Boat Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Inventory Boat
            </label>

            {/* Selected boat display */}
            {selectedBoat && (
              <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Ship className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {selectedBoat.year} {selectedBoat.make} {selectedBoat.model}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedBoat.stock_number && `Stock #${selectedBoat.stock_number}`}
                        {selectedBoat.hull_id && ` | HIN: ${selectedBoat.hull_id}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {selectedBoat.salesStatus && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded text-white ${
                            salesStatusLabels[selectedBoat.salesStatus]?.color || 'bg-slate-400'
                          }`}>
                            {salesStatusLabels[selectedBoat.salesStatus]?.label || selectedBoat.salesStatus}
                          </span>
                        )}
                        {selectedBoat.dockmasterId && (
                          <span className="px-2 py-0.5 text-xs font-mono bg-slate-200 text-slate-600 rounded">
                            DM: {selectedBoat.dockmasterId}
                          </span>
                        )}
                        {selectedBoat.length && (
                          <span className="text-xs text-slate-500">{selectedBoat.length}'</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedBoatId('')}
                    className="p-1 text-slate-400 hover:text-slate-600 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, model, stock #, or HIN..."
                value={boatSearch}
                onChange={(e) => setBoatSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Boat list */}
            <div className="mt-2 max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
              {filteredBoats.length === 0 ? (
                <p className="p-4 text-sm text-slate-500 text-center">No boats found</p>
              ) : (
                filteredBoats.slice(0, 20).map(boat => (
                  <button
                    key={boat.id}
                    type="button"
                    onClick={() => {
                      setSelectedBoatId(boat.id);
                      setBoatSearch('');
                    }}
                    className={`w-full p-3 text-left border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${
                      selectedBoatId === boat.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <p className="font-medium text-slate-900 text-sm">
                      {boat.year} {boat.make} {boat.model}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      {boat.stock_number && <span>Stock #{boat.stock_number}</span>}
                      {boat.hull_id && <span>HIN: {boat.hull_id}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {boat.salesStatus && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded text-white ${
                          salesStatusLabels[boat.salesStatus]?.color || 'bg-slate-400'
                        }`}>
                          {salesStatusLabels[boat.salesStatus]?.label || boat.salesStatus}
                        </span>
                      )}
                      {boat.dockmasterId && (
                        <span className="px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-600 rounded">
                          DM: {boat.dockmasterId}
                        </span>
                      )}
                      {boat.length && (
                        <span className="text-xs text-slate-500">{boat.length}'</span>
                      )}
                    </div>
                  </button>
                ))
              )}
              {filteredBoats.length > 20 && (
                <p className="p-2 text-xs text-slate-500 text-center bg-slate-50">
                  {filteredBoats.length - 20} more boats - refine search
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Request Details
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what needs to be done..."
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              required
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !selectedBoatId || !description.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {saving ? 'Creating...' : 'Create Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequestModal;
