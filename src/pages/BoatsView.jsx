import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Package, Map, Edit2, Trash2, Users, Shield, Building2 } from 'lucide-react';
import { useRemoveBoat } from '../hooks/useRemoveBoat';
import { BoatDetailsModal } from '../components/modals/BoatDetailsModal';
import { BoatModal } from '../components/modals/BoatModal';
import { DockmasterImportModal } from '../components/modals/DockmasterImportModal';
import { boatLifecycleService } from '../services/supabaseService';
import { boatsService } from '../services/supabaseService';
import { findBoatLocationData, useBoatLocation } from '../components/BoatComponents';
import { CustomerBoatCard } from '../components/SharedComponents';
import { applyAllFilters } from '../utils/boatFilters';
import { getActiveSeason } from '../utils/seasonHelpers';

// Removed local component definitions - now imported from separate files
// - CustomerBoatCard: imported from ../components/SharedComponents
// - BoatModal: imported from ../components/modals/BoatModal
// - DockmasterImportModal: imported from ../components/modals/DockmasterImportModal

// Main BoatsView Component
export function BoatsView({ boats, locations, sites = [], onUpdateBoats, dockmasterConfig, onMoveBoat, currentUser }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWorkPhase, setFilterWorkPhase] = useState('all');
  const [filterLocations, setFilterLocations] = useState([]);
  const [filterSites, setFilterSites] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showAddBoat, setShowAddBoat] = useState(false);
  const [editingBoat, setEditingBoat] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const [showBoatTypeSelector, setShowBoatTypeSelector] = useState(false);

  const { removeBoat } = useRemoveBoat({
    onMoveBoat,
    onSuccess: () => {}
  });

  useEffect(() => {
    if (viewingBoat && viewingBoat.id) {
      const freshBoat = boats.find(b => b.id === viewingBoat.id);
      if (freshBoat) {
        const location = freshBoat.location ? locations.find(l => l.name === freshBoat.location) : null;
        const slotId = location ? Object.keys(location.boats || {}).find(key => location.boats[key] === freshBoat.id) : null;
        setViewingBoat({ ...freshBoat, currentLocation: location, currentSlot: slotId });
      }
    }
  }, [boats, locations]);

  const handleLocationToggle = (locationName) => {
    setFilterLocations(prev => prev.includes(locationName) ? prev.filter(l => l !== locationName) : [...prev, locationName]);
  };

  const handleSiteToggle = (siteId) => {
    const newFilterSites = filterSites.includes(siteId) ? filterSites.filter(s => s !== siteId) : [...filterSites, siteId];
    setFilterSites(newFilterSites);

    if (newFilterSites.includes(siteId)) {
      const siteLocationNames = siteId === 'unassigned' ? ['unassigned'] : locations.filter(l => l.site_id === siteId).map(l => l.name);
      setFilterLocations(prev => [...new Set([...prev, ...siteLocationNames])]);
    } else {
      const siteLocationNames = siteId === 'unassigned' ? ['unassigned'] : locations.filter(l => l.site_id === siteId).map(l => l.name);
      setFilterLocations(prev => prev.filter(locName => !siteLocationNames.includes(locName)));
    }
  };

  const handleClearSites = () => {
    setFilterSites([]);
    // Don't auto-clear location filters - let user manage them separately
  };

  // Apply archived filter first
  const nonArchivedFiltered = boats.filter(boat => {
    const isArchived = boat.status === 'archived';
    if (showArchived && !isArchived) return false;
    if (!showArchived && isArchived) return false;
    return true;
  });

  // Convert filterWorkPhase to match centralized filter format
  let workPhaseFilter = filterWorkPhase;
  if (filterWorkPhase === 'needs-mechanicals') workPhaseFilter = 'mechanicals';
  else if (filterWorkPhase === 'needs-clean') workPhaseFilter = 'clean';
  else if (filterWorkPhase === 'needs-fiberglass') workPhaseFilter = 'fiberglass';
  else if (filterWorkPhase === 'needs-warranty') workPhaseFilter = 'warranty';
  else if (filterWorkPhase === 'all-complete' || filterWorkPhase === 'all') workPhaseFilter = 'all';

  // Apply centralized filters
  const filteredBoats = applyAllFilters(nonArchivedFiltered, {
    searchQuery,
    status: filterStatus,
    workPhase: workPhaseFilter,
    locations: filterLocations.length > 0 ? filterLocations : null,
    sites: filterSites.length > 0 ? filterSites : null
  }, locations);

  const handleAddBoat = async (newBoat) => {
    try {
      const importedBoat = await boatLifecycleService.importOrUpdateBoat({
        name: newBoat.name, model: newBoat.model, make: newBoat.make, hullId: newBoat.hullId,
        dockmasterId: newBoat.dockmasterId, owner: newBoat.owner, customerId: newBoat.customerId,
        year: newBoat.year, length: newBoat.length, workOrderNumber: newBoat.workOrderNumber,
        qrCode: newBoat.qrCode, nfcTag: newBoat.nfcTag,
      }, { targetStatus: 'needs-approval', preserveLocation: false });

      const updatedBoats = await boatsService.getAll();
      onUpdateBoats(updatedBoats);
      setShowAddBoat(false);
    } catch (error) {
      console.error('Error adding/importing boat:', error);
      alert(`Failed to add boat: ${error.message}`);
    }
  };

  const handleDeleteBoat = (boatId) => {
    if (confirm('Are you sure you want to delete this boat?')) {
      onUpdateBoats(boats.filter(b => b.id !== boatId));
    }
  };

  const handleViewBoat = (boat) => {
    const location = boat.location ? locations.find(l => l.name === boat.location) : null;
    const slotId = location ? Object.keys(location.boats || {}).find(key => (location.boats || {})[key] === boat.id) : null;
    setViewingBoat({ ...boat, currentLocation: location, currentSlot: slotId });
  };

  const handleUpdateBoatFromModal = async (updatedBoat) => {
    setViewingBoat(updatedBoat);
    await onUpdateBoats(boats.map(b => b.id === updatedBoat.id ? updatedBoat : b));
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    if (onMoveBoat) {
      await onMoveBoat(boat.id, targetLocation?.id || null, targetSlot || null, boat.isInventory || false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Boats</h2>
          <p className="text-slate-600">{showArchived ? 'View archived boats' : 'Manage your boat inventory'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowArchived(!showArchived)} className={`flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors shadow-md ${showArchived ? 'bg-slate-600 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
            {showArchived ? 'Show Active' : 'Show Archived'}
          </button>
          {!showArchived && (
            <>
              <button onClick={() => setShowAddBoat(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md">
                <Plus className="w-5 h-5" />Add Boat
              </button>
              <button
                onClick={() => setShowBoatTypeSelector(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md"
              >
                <Package className="w-5 h-5" />Import
              </button>
            </>
          )}
        </div>
      </div>

      {/* Work Phase Stats */}
      {!showArchived && (
        <>
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Work Needed</h3>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setFilterWorkPhase(filterWorkPhase === 'needs-mechanicals' ? 'all' : 'needs-mechanicals')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  filterWorkPhase === 'needs-mechanicals'
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-slate-200 bg-white hover:border-orange-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600">Mechanicals</span>
                  <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {boats.filter(b => {
                    if (b.status === 'archived') return false;
                    if (b.storageBoat) {
                      const activeSeason = getActiveSeason(b);
                      return !b[`${activeSeason}MechanicalsComplete`];
                    }
                    return !b.mechanicalsComplete;
                  }).length}
                </p>
              </button>

              <button
                onClick={() => setFilterWorkPhase(filterWorkPhase === 'needs-clean' ? 'all' : 'needs-clean')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  filterWorkPhase === 'needs-clean'
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600">Clean</span>
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {boats.filter(b => {
                    if (b.status === 'archived') return false;
                    if (b.storageBoat) {
                      const activeSeason = getActiveSeason(b);
                      return !b[`${activeSeason}CleanComplete`];
                    }
                    return !b.cleanComplete;
                  }).length}
                </p>
              </button>

              <button
                onClick={() => setFilterWorkPhase(filterWorkPhase === 'needs-fiberglass' ? 'all' : 'needs-fiberglass')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  filterWorkPhase === 'needs-fiberglass'
                    ? 'border-purple-400 bg-purple-50'
                    : 'border-slate-200 bg-white hover:border-purple-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600">Fiberglass</span>
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {boats.filter(b => {
                    if (b.status === 'archived') return false;
                    if (b.storageBoat) {
                      const activeSeason = getActiveSeason(b);
                      return !b[`${activeSeason}FiberglassComplete`];
                    }
                    return !b.fiberglassComplete;
                  }).length}
                </p>
              </button>

              <button
                onClick={() => setFilterWorkPhase(filterWorkPhase === 'needs-warranty' ? 'all' : 'needs-warranty')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  filterWorkPhase === 'needs-warranty'
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 bg-white hover:border-teal-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600">Warranty</span>
                  <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                    <Shield className="w-4 h-4 text-teal-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {boats.filter(b => {
                    if (b.status === 'archived') return false;
                    if (b.storageBoat) {
                      const activeSeason = getActiveSeason(b);
                      return !b[`${activeSeason}WarrantyComplete`];
                    }
                    return !b.warrantyComplete;
                  }).length}
                </p>
              </button>
            </div>
          </div>

          {/* Site Filter */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Filter by Site
              </h3>
              {filterSites.length > 0 && (
                <button
                  onClick={handleClearSites}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  Clear sites
                </button>
              )}
            </div>

            {/* Active site filter tags */}
            {filterSites.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-slate-200">
                {filterSites.map(siteId => {
                  const site = siteId === 'unassigned'
                    ? { name: 'Unassigned' }
                    : sites.find(s => s.id === siteId);

                  return (
                    <span
                      key={siteId}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full"
                    >
                      {site?.name || 'Unknown'}
                      <button
                        onClick={() => handleSiteToggle(siteId)}
                        className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Site checkboxes grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Unassigned checkbox */}
              <label
                className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  filterSites.includes('unassigned')
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={filterSites.includes('unassigned')}
                  onChange={() => handleSiteToggle('unassigned')}
                  className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">Unassigned</p>
                  <p className="text-xs text-slate-500">
                    {locations.filter(l => !l.site_id).length} locations
                  </p>
                </div>
              </label>

              {/* Site checkboxes */}
              {sites
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                .map(site => {
                  const siteLocations = locations.filter(l => l.site_id === site.id);
                  const boatsInSite = boats.filter(b =>
                    b.location && siteLocations.some(l => l.name === b.location)
                  ).length;

                  return (
                    <label
                      key={site.id}
                      className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        filterSites.includes(site.id)
                          ? 'border-green-500 bg-green-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={filterSites.includes(site.id)}
                        onChange={() => handleSiteToggle(site.id)}
                        className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{site.name}</p>
                        <p className="text-xs text-slate-500">
                          {boatsInSite} boat{boatsInSite !== 1 ? 's' : ''} • {siteLocations.length} loc{siteLocations.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </label>
                  );
                })
              }
            </div>
          </div>

          {/* Location Filter */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Filter by Location</h3>
              {filterLocations.length > 0 && (
                <button
                  onClick={() => setFilterLocations([])}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear locations
                </button>
              )}
            </div>

            {/* Active location filter tags */}
            {filterLocations.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-slate-200">
                {filterLocations.map(locationName => (
                  <span
                    key={locationName}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full"
                  >
                    {locationName === 'unassigned' ? 'Unassigned' : locationName}
                    <button
                      onClick={() => handleLocationToggle(locationName)}
                      className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Unassigned boats */}
              <label className="flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all hover:border-slate-300 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={filterLocations.includes('unassigned')}
                  onChange={() => handleLocationToggle('unassigned')}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Unassigned</p>
                  <p className="text-xs text-slate-500">
                    {boats.filter(b => !b.location).length} boats
                  </p>
                </div>
              </label>

              {/* Rack Buildings */}
              {locations.filter(l => l.type === 'rack-building').map(location => (
                <label
                  key={location.id}
                  className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    filterLocations.includes(location.name)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={filterLocations.includes(location.name)}
                    onChange={() => handleLocationToggle(location.name)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{location.name}</p>
                    <p className="text-xs text-slate-500">
                      {boats.filter(b => b.location === location.name).length} boats
                    </p>
                  </div>
                </label>
              ))}

              {/* Parking Lots */}
              {locations.filter(l => l.type === 'parking-lot').map(location => (
                <label
                  key={location.id}
                  className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    filterLocations.includes(location.name)
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={filterLocations.includes(location.name)}
                    onChange={() => handleLocationToggle(location.name)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{location.name}</p>
                    <p className="text-xs text-slate-500">
                      {boats.filter(b => b.location === location.name).length} boats
                    </p>
                  </div>
                </label>
              ))}

              {/* Workshops */}
              {locations.filter(l => l.type === 'shop').map(location => (
                <label
                  key={location.id}
                  className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    filterLocations.includes(location.name)
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={filterLocations.includes(location.name)}
                    onChange={() => handleLocationToggle(location.name)}
                    className="w-4 h-4 text-orange-600 rounded focus:ring-2 focus:ring-orange-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{location.name}</p>
                    <p className="text-xs text-slate-500">
                      {boats.filter(b => b.location === location.name).length} boats
                    </p>
                  </div>
                </label>
              ))}

              {/* Pools */}
              {locations.filter(l => l.type === 'pool').map(location => (
                <label
                  key={location.id}
                  className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                    filterLocations.includes(location.name)
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={filterLocations.includes(location.name)}
                    onChange={() => handleLocationToggle(location.name)}
                    className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{location.name}</p>
                    <p className="text-xs text-slate-500">
                      Pool • {boats.filter(b => b.location === location.name).length} boats
                    </p>
                  </div>
                </label>
              ))}
            </div>
            {filterLocations.length === 0 && (
              <p className="text-xs text-slate-500 mt-3 text-center">
                💡 Tip: Select multiple locations to find boats across different areas
              </p>
            )}
          </div>

          {/* Search and Filter */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200">
            <div className="flex flex-col gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search boats by name, model, or owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="needs-approval">Needs Approval</option>
                  <option value="needs-parts">Needs Parts</option>
                  <option value="parts-kit-pulled">Parts Kit Pulled</option>
                  <option value="on-deck">On Deck</option>
                  <option value="all-work-complete">All Work Complete</option>
                </select>
                <select
                  value={filterWorkPhase}
                  onChange={(e) => setFilterWorkPhase(e.target.value)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Work Phases</option>
                  <option value="needs-mechanicals">Needs Mechanicals</option>
                  <option value="needs-clean">Needs Clean</option>
                  <option value="needs-fiberglass">Needs Fiberglass</option>
                  <option value="needs-warranty">Needs Warranty</option>
                  <option value="all-complete">All Phases Complete</option>
                </select>
              </div>
              {(filterStatus !== 'all' || filterWorkPhase !== 'all' || searchQuery || filterLocations.length > 0) && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    Showing <span className="font-semibold text-slate-900">{filteredBoats.length}</span> of <span className="font-semibold text-slate-900">{boats.length}</span> boats
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterStatus('all');
                      setFilterWorkPhase('all');
                      setFilterLocations([]);
                      setFilterSites([]);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Filters Summary */}
          {(filterStatus !== 'all' || filterWorkPhase !== 'all' || filterLocations.length > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 mb-1">Active Filters</h4>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {filterStatus !== 'all' && (
                      <span className="text-blue-800">
                        <strong>Status:</strong> {filterStatus.replace(/-/g, ' ')}
                      </span>
                    )}
                    {filterWorkPhase !== 'all' && (
                      <span className="text-blue-800">
                        {filterStatus !== 'all' && '•'} <strong>Work:</strong> {filterWorkPhase.replace(/-/g, ' ').replace('needs ', '')}
                      </span>
                    )}
                    {filterLocations.length > 0 && (
                      <span className="text-blue-800">
                        {(filterStatus !== 'all' || filterWorkPhase !== 'all') && '•'} <strong>Locations:</strong> {filterLocations.length} selected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Boats Grid */}
      {filteredBoats.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">{boats.length === 0 ? 'No boats found' : 'No boats match your filters'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBoats.map(boat => (
            <CustomerBoatCard key={boat.id} boat={boat} onEdit={() => handleViewBoat(boat)} onDelete={() => handleDeleteBoat(boat.id)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAddBoat && <BoatModal boat={null} locations={locations} onSave={handleAddBoat} onCancel={() => setShowAddBoat(false)} />}
      {showBoatTypeSelector && <DockmasterImportModal dockmasterConfig={dockmasterConfig} onImport={handleAddBoat} onCancel={() => setShowBoatTypeSelector(false)} />}
      {viewingBoat && (
        <BoatDetailsModal boat={viewingBoat} locations={locations} sites={sites} boats={boats} inventoryBoats={[]} onRemove={() => removeBoat(viewingBoat)} onUpdateBoat={handleUpdateBoatFromModal} onMoveBoat={handleMoveBoat} onClose={() => setViewingBoat(null)} currentUser={currentUser} />
      )}
    </div>
  );
}

export default BoatsView;
