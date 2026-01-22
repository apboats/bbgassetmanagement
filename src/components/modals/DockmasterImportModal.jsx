import React, { useState } from 'react';
import { Search, X, Package } from 'lucide-react';

export function DockmasterImportModal({ dockmasterConfig, onImport, onCancel }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError('');

    try {
      // Call our Supabase Edge Function (which proxies to Dockmaster API)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

      console.log('Environment check:');
      console.log('- VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
      console.log('- supabaseUrl:', supabaseUrl);
      console.log('- Has anon key:', !!supabaseAnonKey);

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase environment variables not configured. Check your .env file.');
      }

      const url = `${supabaseUrl}/functions/v1/dockmaster-search`;

      console.log('Searching via Edge Function:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          searchString: searchQuery,
        }),
      });

      console.log('Search response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Search error response:', errorData);
        throw new Error(errorData.error || `Search failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Search results:', data);

      // Handle both array and single object responses
      const results = Array.isArray(data) ? data : (data ? [data] : []);
      console.log('Processed results:', results);

      setSearchResults(results);
    } catch (err) {
      console.error('Error searching boats:', err);
      setError(err.message || 'Failed to search boats. Please check your credentials and try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportBoat = async (boatId, ownerName, ownerId) => {
    setIsImporting(true);
    setError('');

    try {
      // Call our Supabase Edge Function (which proxies to Dockmaster API)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

      const url = `${supabaseUrl}/functions/v1/dockmaster-retrieve`;

      console.log('Retrieving boat via Edge Function:', boatId);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          boatId: boatId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Retrieve error response:', errorData);
        throw new Error(errorData.error || `Failed to retrieve boat: ${response.status}`);
      }

      const boatData = await response.json();
      console.log('Retrieved boat data:', boatData);

      // Convert Dockmaster boat data to our boat format
      const importedBoat = {
        name: boatData.name || 'Unknown',
        model: boatData.model || '',
        make: boatData.make || '',
        year: boatData.year || '',
        owner: (ownerName || 'Unknown').trim(),
        // Store Dockmaster IDs for syncing and work order lookups
        dockmasterId: boatId, // The 10-digit boat ID
        customerId: ownerId || boatData.ownerId || '', // The 10-digit customer ID
        hullId: boatData.hin || '', // Hull Identification Number
        status: 'needs-approval',
        mechanicalsComplete: false,
        cleanComplete: false,
        fiberglassComplete: false,
        warrantyComplete: false,
        workOrderNumber: '',
      };

      onImport(importedBoat);
      onCancel();
    } catch (err) {
      console.error('Error importing boat:', err);
      setError(err.message || 'Failed to import boat. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col animate-slide-in">
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-slate-900">Import Boat from Dockmaster</h3>
            <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by boat name, owner, or HIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-24 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              disabled={isSearching}
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-medium rounded transition-colors"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: '200px', maxHeight: 'calc(85vh - 140px)' }}>
          {searchResults.length === 0 && !isSearching ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">
                {searchQuery ? 'No boats found. Try a different search.' : 'Enter a search term to find boats in Dockmaster'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map((boat) => (
                <button
                  key={boat.boatId}
                  onClick={() => handleImportBoat(boat.boatId, boat.ownerName, boat.ownerId)}
                  disabled={isImporting}
                  className="w-full p-3 border-2 border-slate-200 hover:border-green-500 rounded-lg text-left transition-all hover:shadow-md hover:bg-green-50 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {boat.boatName || 'Unknown Boat'}
                      </p>
                      <p className="text-sm text-slate-600 truncate">
                        Owner: {boat.ownerName || 'Unknown'}
                      </p>
                      {boat.hin && (
                        <p className="text-xs text-slate-500 truncate">
                          HIN: {boat.hin}
                        </p>
                      )}
                      {(boat.arrivalDate || boat.departureDate) && (
                        <p className="text-xs text-blue-600 mt-1">
                          {boat.arrivalDate && `Arrival: ${boat.arrivalDate}`}
                          {boat.arrivalDate && boat.departureDate && ' • '}
                          {boat.departureDate && `Departure: ${boat.departureDate}`}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        Import
                      </div>
                    </div>
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
