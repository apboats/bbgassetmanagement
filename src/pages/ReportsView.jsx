import React, { useState, useEffect } from 'react';
import { FileText, Calendar, DollarSign, Package, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SummaryCard } from '../components/SharedComponents';

// Helper: Get the most recent labor activity date for a work order
// Only considers last_worked_at from operations (actual labor punches)
// Ignores last_mod_date/time since that updates for non-labor changes (parts, etc.)
const getLastLaborDate = (wo) => {
  let latestOpDate = null;
  for (const op of (wo.operations || [])) {
    if (op.last_worked_at) {
      const opDate = new Date(op.last_worked_at);
      if (!isNaN(opDate.getTime()) && (!latestOpDate || opDate > latestOpDate)) {
        latestOpDate = opDate;
      }
    }
  }
  return latestOpDate;
};

// Helper: Check if boat is in a shop location
const isBoatInShop = (wo, locations, inventoryBoats) => {
  let boatLocation = null;

  if (wo.boat?.location) {
    // Customer boat - use boat.location
    boatLocation = wo.boat.location;
  } else if (wo.rigging_id) {
    // Internal work order - find inventory boat by rigging_id
    const invBoat = inventoryBoats.find(b => b.dockmaster_id === wo.rigging_id);
    boatLocation = invBoat?.location;
  }

  if (!boatLocation) return false;

  const location = locations.find(l => l.name === boatLocation);
  return location?.type === 'shop' || location?.type === 'workshop';
};

export function ReportsView({ currentUser }) {
  const [unbilledData, setUnbilledData] = useState({ workOrders: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [daysBack, setDaysBack] = useState(7);
  const [expandedWOs, setExpandedWOs] = useState(new Set());

  useEffect(() => {
    loadUnbilledWork();
  }, [daysBack]);

  const loadUnbilledWork = async () => {
    setIsLoading(true);
    setError('');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      cutoffDate.setHours(0, 0, 0, 0); // Start of day for fair comparison

      // Fetch locations to check if boats are in shop
      const { data: locations } = await supabase
        .from('locations')
        .select('id, name, type');

      // Fetch inventory boats for internal work order matching
      const { data: inventoryBoats } = await supabase
        .from('inventory_boats')
        .select('id, dockmaster_id, location');

      // Query work orders with charges and status='O'
      // Note: Don't sort by last_mod_date in DB - it's stored as text (MM/DD/YYYY)
      // which sorts alphabetically, not chronologically
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select(`
          *,
          operations:work_order_operations(*),
          boat:boats!boat_id(id, name, owner, dockmaster_id, work_order_number, location)
        `)
        .eq('status', 'O')
        .gt('total_charges', 0)
        .limit(10000);

      if (woError) throw woError;

      // Debug: Check why 554750 isn't showing
      const wo554750 = (workOrders || []).find(wo => wo.id === '554750');
      if (wo554750) {
        console.log('WO 554750 found in raw data:', {
          status: wo554750.status,
          total_charges: wo554750.total_charges,
          operations: wo554750.operations?.map(op => ({
            opcode: op.opcode,
            last_worked_at: op.last_worked_at
          })),
          boat: wo554750.boat,
          rigging_id: wo554750.rigging_id
        });

        const lastLaborDate = getLastLaborDate(wo554750);
        console.log('Last labor date:', lastLaborDate);
        console.log('Cutoff date:', cutoffDate);
        console.log('Is in shop:', isBoatInShop(wo554750, locations || [], inventoryBoats || []));
      } else {
        console.log('WO 554750 NOT in raw data - filtered at DB level (status != O or total_charges <= 0)');
      }

      // Filter work orders client-side based on labor date and shop location
      const filteredWorkOrders = (workOrders || []).filter(wo => {
        // 1. Must have a labor punch (last_worked_at on operations)
        const lastLaborDate = getLastLaborDate(wo);
        if (!lastLaborDate) return false;

        // 2. Labor date must be within the selected range
        if (lastLaborDate < cutoffDate) return false;

        // 3. Boat must not be in a shop location
        if (isBoatInShop(wo, locations || [], inventoryBoats || [])) return false;

        return true;
      });

      // Sort by last labor date (most recent first)
      filteredWorkOrders.sort((a, b) => {
        const dateA = getLastLaborDate(a);
        const dateB = getLastLaborDate(b);
        return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
      });

      setUnbilledData({ workOrders: filteredWorkOrders });
    } catch (err) {
      console.error('Error loading unbilled work:', err);
      setError(err.message || 'Failed to load unbilled work');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleWorkOrder = (woId) => {
    const newExpanded = new Set(expandedWOs);
    if (newExpanded.has(woId)) {
      newExpanded.delete(woId);
    } else {
      newExpanded.add(woId);
    }
    setExpandedWOs(newExpanded);
  };

  // Calculate totals
  const totalWorkOrders = unbilledData.workOrders.length;
  const totalOperations = unbilledData.workOrders.reduce((sum, wo) => sum + (wo.operations?.length || 0), 0);
  const totalCharges = unbilledData.workOrders.reduce((sum, wo) => sum + (wo.total_charges || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports</h1>
        <p className="text-slate-600">View unbilled work orders and operations with recent updates</p>
      </div>

      {/* Filter Controls */}
      <div className="mb-6 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Calendar className="w-4 h-4" />
          Last Updated:
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="px-3 py-1 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
          </select>
        </label>
        <button
          onClick={loadUnbilledWork}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Unbilled Work Orders"
          value={totalWorkOrders}
          subtitle="With active charges"
          icon={FileText}
          color="blue"
        />
        <SummaryCard
          title="Total Operations"
          value={totalOperations}
          subtitle="Across all work orders"
          icon={Package}
          color="purple"
        />
        <SummaryCard
          title="Total Charges"
          value={`$${totalCharges.toFixed(2)}`}
          subtitle="Unbilled amount"
          icon={DollarSign}
          color="green"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Error loading unbilled work</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-3 text-slate-600">Loading unbilled work...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && unbilledData.workOrders.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No unbilled work found</h3>
          <p className="text-slate-600">
            No open work orders with charges updated in the last {daysBack} days
          </p>
        </div>
      )}

      {/* Work Orders Table */}
      {!isLoading && unbilledData.workOrders.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Work Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Boat / Owner
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Charges
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Last Labor
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Operations
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {unbilledData.workOrders.map((wo) => {
                const isExpanded = expandedWOs.has(wo.id);
                const boat = wo.boat || {};
                const operations = wo.operations || [];

                return (
                  <React.Fragment key={wo.id}>
                    {/* Work Order Row */}
                    <tr
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => toggleWorkOrder(wo.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="font-mono font-semibold text-slate-900">{wo.id}</span>
                        </div>
                        {wo.title && (
                          <p className="text-xs text-slate-600 mt-1 ml-6">{wo.title}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{boat.name || 'Unknown Boat'}</p>
                        <p className="text-sm text-slate-600">{boat.owner || 'Unknown Owner'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          {wo.category || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">
                          ${(wo.total_charges || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const activityDate = getLastLaborDate(wo);
                          return activityDate ? (
                            <>
                              <p className="text-sm text-slate-700">
                                {activityDate.toLocaleDateString()}
                              </p>
                              <p className="text-xs text-slate-500">
                                {activityDate.toLocaleTimeString()}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-slate-500">Unknown</p>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                          {operations.length} ops
                        </span>
                      </td>
                    </tr>

                    {/* Expanded Operations */}
                    {isExpanded && operations.length > 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-2 bg-slate-50">
                          <div className="pl-6">
                            <p className="text-xs font-semibold text-slate-700 uppercase mb-2">Operations</p>
                            <div className="space-y-1">
                              {operations.map((op, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 bg-white rounded border border-slate-200"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs font-semibold text-slate-700">
                                      {op.opcode}
                                    </span>
                                    <span className="text-sm text-slate-600">
                                      {op.opcode_desc || 'No description'}
                                    </span>
                                    {op.flag_labor_finished && (
                                      <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded uppercase">
                                        Unbilled
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-semibold text-slate-900">
                                    ${(op.total_charges || 0).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
