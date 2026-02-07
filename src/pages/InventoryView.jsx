import React, { useState, useEffect } from 'react';
import { Search, Package, Map, Edit2, X, Plus, RefreshCw } from 'lucide-react';
import { useRemoveBoat } from '../hooks/useRemoveBoat';
import { InventoryBoatDetailsModal } from '../components/modals/InventoryBoatDetailsModal';
import { InventoryBoatCard } from '../components/InventoryBoatCard';
import { findBoatLocationData, useBoatLocation } from '../components/BoatComponents';

export function InventoryView({ inventoryBoats, boats = [], locations, sites = [], users = [], lastSync, onSyncNow, dockmasterConfig, onUpdateInventoryBoats, onUpdateSingleBoat, onMoveBoat }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingBoat, setViewingBoat] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterYear, setFilterYear] = useState('all');
  const [filterMake, setFilterMake] = useState('all');
  const [filterModel, setFilterModel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriceRange, setFilterPriceRange] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Price range options for filtering
  const PRICE_RANGES = [
    { value: 'all', label: 'All Prices' },
    { value: '0-50000', label: 'Under $50K', min: 0, max: 50000 },
    { value: '50000-100000', label: '$50K - $100K', min: 50000, max: 100000 },
    { value: '100000-200000', label: '$100K - $200K', min: 100000, max: 200000 },
    { value: '200000-500000', label: '$200K - $500K', min: 200000, max: 500000 },
    { value: '500000+', label: '$500K+', min: 500000, max: Infinity },
  ];

  // Type options (New vs Used/Brokerage combined)
  const TYPE_OPTIONS = [
    { value: 'all', label: 'All Types' },
    { value: 'NEW', label: 'New' },
    { value: 'USED_BROKERAGE', label: 'Used/Brokerage' },
  ];

  // Use unified remove boat hook
  const { removeBoat } = useRemoveBoat({
    onMoveBoat,
    onSuccess: () => setViewingBoat(null)
  });

  // Keep viewingBoat in sync with inventoryBoats when they update from database
  useEffect(() => {
    if (viewingBoat && viewingBoat.id) {
      const updatedBoat = inventoryBoats.find(b => b.id === viewingBoat.id);
      if (updatedBoat) {
        setViewingBoat(prev => ({
          ...updatedBoat,
          currentLocation: prev?.currentLocation,
          currentSlot: prev?.currentSlot
        }));
      }
    }
  }, [inventoryBoats]);

  // Extract unique values for filters with cascading/progressive filtering
  // Years are always shown from all boats
  const years = [...new Set(inventoryBoats.map(b => b.year).filter(Boolean))].sort((a, b) => b - a);

  // Makes are filtered by selected year
  const makes = React.useMemo(() => {
    const filtered = inventoryBoats.filter(b =>
      filterYear === 'all' || String(b.year) === filterYear
    );
    return [...new Set(filtered.map(b => b.make).filter(Boolean))].sort();
  }, [inventoryBoats, filterYear]);

  // Models are filtered by selected year AND make
  const models = React.useMemo(() => {
    const filtered = inventoryBoats.filter(b =>
      (filterYear === 'all' || String(b.year) === filterYear) &&
      (filterMake === 'all' || b.make === filterMake)
    );
    return [...new Set(filtered.map(b => b.model).filter(Boolean))].sort();
  }, [inventoryBoats, filterYear, filterMake]);

  // Statuses are filtered by year, make, AND model
  const statuses = React.useMemo(() => {
    const filtered = inventoryBoats.filter(b =>
      (filterYear === 'all' || String(b.year) === filterYear) &&
      (filterMake === 'all' || b.make === filterMake) &&
      (filterModel === 'all' || b.model === filterModel)
    );
    return [...new Set(filtered.map(b => b.salesStatus).filter(Boolean))].sort();
  }, [inventoryBoats, filterYear, filterMake, filterModel]);

  // Reset downstream filters when upstream filter changes and current selection is no longer valid
  useEffect(() => {
    if (filterMake !== 'all' && !makes.includes(filterMake)) {
      setFilterMake('all');
    }
  }, [filterYear, makes, filterMake]);

  useEffect(() => {
    if (filterModel !== 'all' && !models.includes(filterModel)) {
      setFilterModel('all');
    }
  }, [filterYear, filterMake, models, filterModel]);

  useEffect(() => {
    if (filterStatus !== 'all' && !statuses.includes(filterStatus)) {
      setFilterStatus('all');
    }
  }, [filterYear, filterMake, filterModel, statuses, filterStatus]);

  const filteredBoats = inventoryBoats.filter(boat => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = boat.name?.toLowerCase().includes(searchLower) ||
                         boat.model?.toLowerCase().includes(searchLower) ||
                         boat.owner?.toLowerCase().includes(searchLower) ||
                         boat.hullId?.toLowerCase().includes(searchLower) ||
                         boat.hull_id?.toLowerCase().includes(searchLower) ||
                         boat.dockmasterId?.toLowerCase().includes(searchLower) ||
                         boat.dockmaster_id?.toLowerCase().includes(searchLower);
    const matchesYear = filterYear === 'all' || String(boat.year) === filterYear;
    const matchesMake = filterMake === 'all' || boat.make === filterMake;
    const matchesModel = filterModel === 'all' || boat.model === filterModel;
    const matchesStatus = filterStatus === 'all' || boat.salesStatus === filterStatus;

    // Price range filter
    const price = boat.list_price || boat.listPrice || 0;
    const priceNum = typeof price === 'string' ? parseFloat(price) : price;
    const matchesPriceRange = filterPriceRange === 'all' || (() => {
      const range = PRICE_RANGES.find(r => r.value === filterPriceRange);
      if (!range) return true;
      return priceNum >= range.min && priceNum < range.max;
    })();

    // Type filter (New vs Used/Brokerage)
    const rawData = boat.rawData || boat.raw_data || {};
    const boatType = (rawData.type || 'NEW').toUpperCase();
    const matchesType = filterType === 'all' ||
      (filterType === 'NEW' && boatType === 'NEW') ||
      (filterType === 'USED_BROKERAGE' && (boatType === 'USED' || boatType === 'BROKERAGE'));

    return matchesSearch && matchesYear && matchesMake && matchesModel && matchesStatus && matchesPriceRange && matchesType;
  });

  const handleSyncNow = async () => {
    setIsSyncing(true);
    await onSyncNow(true); // Full sync (3 years back) when manually triggered
    setIsSyncing(false);
  };

  const handleViewBoat = (boat) => {
    // Modal will handle finding location data - just pass the boat
    setViewingBoat(boat);
  };

  const handleUpdateBoatFromModal = async (updatedBoat) => {
    // Update the modal state immediately for responsiveness
    setViewingBoat(updatedBoat);

    // Extract only changed fields to send to database
    if (onUpdateSingleBoat) {
      const oldBoat = inventoryBoats.find(b => b.id === updatedBoat.id);
      if (oldBoat) {
        // Send only the changed fields
        const changes = {};
        for (const key in updatedBoat) {
          if (JSON.stringify(updatedBoat[key]) !== JSON.stringify(oldBoat[key])) {
            changes[key] = updatedBoat[key];
          }
        }
        if (Object.keys(changes).length > 0) {
          await onUpdateSingleBoat(updatedBoat.id, changes);
        }
      }
    }
  };

  // Use the proper move callback from AppContainer which handles both tables correctly
  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    if (onMoveBoat) {
      // Use AppContainer's handleMoveBoat which properly updates both inventory_boats and locations tables
      await onMoveBoat(boat.id, targetLocation?.id || null, targetSlot || null, true);
      
      // Update viewing boat state
      if (targetLocation) {
        setViewingBoat({
          ...boat,
          location: targetLocation.name,
          slot: targetSlot,
          currentLocation: targetLocation,
          currentSlot: targetSlot
        });
      } else {
        setViewingBoat({
          ...boat,
          location: null,
          slot: null,
          currentLocation: null,
          currentSlot: null
        });
      }
    }
  };

  const isConfigured = dockmasterConfig && dockmasterConfig.username;
  const timeSinceSync = lastSync ? Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000) : null;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Inventory Boats</h2>
          <p className="text-slate-600">Auto-synced from Dockmaster API</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors shadow-md"
          >
            {isSyncing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Configuration Warning - Only show if no boats and not configured */}
      {!isConfigured && inventoryBoats.length === 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-orange-900 mb-2">Dockmaster API Not Configured</h3>
              <p className="text-orange-800 mb-4">
                To sync inventory boats, you need to configure your Dockmaster API credentials in Settings.
              </p>
              <button
                onClick={() => window.location.hash = 'settings'}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
              >
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Status */}
      {inventoryBoats.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-blue-900">
                  Auto-Sync: Every 30 minutes
                </p>
                <p className="text-sm text-blue-700">
                  {lastSync 
                    ? `Last synced ${timeSinceSync} minute${timeSinceSync !== 1 ? 's' : ''} ago`
                    : 'Never synced - waiting for first sync'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-900">{inventoryBoats.length}</p>
              <p className="text-sm text-blue-700">Inventory Boats</p>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      {inventoryBoats.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, model, or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Year</label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">All Years</option>
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Make</label>
                <select
                  value={filterMake}
                  onChange={(e) => setFilterMake(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">All Makes</option>
                  {makes.map(make => (
                    <option key={make} value={make}>{make}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Model</label>
                <select
                  value={filterModel}
                  onChange={(e) => setFilterModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">All Models</option>
                  {models.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sales Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">All Statuses</option>
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Price Range</label>
                <select
                  value={filterPriceRange}
                  onChange={(e) => setFilterPriceRange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {PRICE_RANGES.map(range => (
                    <option key={range.value} value={range.value}>{range.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {TYPE_OPTIONS.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Filters Display */}
            {(filterYear !== 'all' || filterMake !== 'all' || filterModel !== 'all' || filterStatus !== 'all' || filterPriceRange !== 'all' || filterType !== 'all' || searchQuery) && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">
                    Showing {filteredBoats.length} of {inventoryBoats.length} boats
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFilterYear('all');
                    setFilterMake('all');
                    setFilterModel('all');
                    setFilterStatus('all');
                    setFilterPriceRange('all');
                    setFilterType('all');
                    setSearchQuery('');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-3">How Inventory Sync Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-blue-600">1</span>
            </div>
            <div>
              <p className="font-semibold text-slate-900 mb-1">API Call</p>
              <p className="text-slate-600">Calls Dockmaster /api/v1/UnitSales/RetrieveOtherInventory every 30 minutes</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-green-600">2</span>
            </div>
            <div>
              <p className="font-semibold text-slate-900 mb-1">Sales Status Filter</p>
              <p className="text-slate-600">Only boats with approved Sales Status codes appear (HA, HS, OA, OS, FA, FS, S, R, FP)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-purple-600">3</span>
            </div>
            <div>
              <p className="font-semibold text-slate-900 mb-1">Auto Update</p>
              <p className="text-slate-600">SD (Sold Delivered) boats are automatically removed from view</p>
            </div>
          </div>
        </div>
        
        {/* Sales Status Legend */}
        <div className="pt-4 border-t border-slate-300">
          <p className="text-xs font-semibold text-slate-700 mb-2">Sales Status Codes:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-blue-600">HA</span>
              <span className="text-slate-600">On Hand Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-blue-600">HS</span>
              <span className="text-slate-600">On Hand Sold</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-green-600">OA</span>
              <span className="text-slate-600">On Order Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-green-600">OS</span>
              <span className="text-slate-600">On Order Sold</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-purple-600">FA</span>
              <span className="text-slate-600">Future Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-purple-600">FS</span>
              <span className="text-slate-600">Future Sold</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-orange-600">S</span>
              <span className="text-slate-600">Sold</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-yellow-600">R</span>
              <span className="text-slate-600">Reserved</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-indigo-600">FP</span>
              <span className="text-slate-600">Floor Planned</span>
            </div>
            <div className="flex items-center gap-2 col-span-2 md:col-span-1">
              <span className="font-mono font-bold text-red-600 line-through">SD</span>
              <span className="text-slate-500 italic">Sold Delivered (hidden)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      {inventoryBoats.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, model, or hull ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Boats Grid */}
      {filteredBoats.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          {inventoryBoats.length === 0 ? (
            <>
              <p className="text-slate-500 mb-2">No inventory boats synced yet</p>
              <p className="text-sm text-slate-400 mb-4">
                Click "Sync Now" to sync inventory boats from Dockmaster
              </p>
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-500 mb-2">No boats match your search</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Clear search
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBoats.map(boat => (
            <InventoryBoatCard
              key={boat.id}
              boat={boat}
              onView={() => handleViewBoat(boat)}
              locations={locations}
            />
          ))}
        </div>
      )}

      {/* Inventory Boat Details Modal */}
      {viewingBoat && (
        <InventoryBoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          boats={boats.filter(b => !b.isInventory)}
          inventoryBoats={inventoryBoats}
          users={users}
          onMoveBoat={handleMoveBoat}
          onUpdateBoat={handleUpdateBoatFromModal}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}


export default InventoryView;
