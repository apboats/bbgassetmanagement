import { getActiveSeason, getDisplayStatus } from './seasonHelpers';

/**
 * Centralized boat filtering utilities
 * Handles both regular boats and storage boats with seasonal work phases
 *
 * All filters automatically account for storage boats using active season logic
 */

/**
 * Filter boats by status
 * Accounts for storage boats by using their active season's status
 *
 * @param {Array} boats - Array of boat objects
 * @param {string} filterStatus - Status to filter by, or 'all' for no filter
 * @returns {Array} - Filtered boat array
 */
export function filterByStatus(boats, filterStatus) {
  if (filterStatus === 'all') return boats;

  const result = boats.filter(boat => {
    const displayStatus = getDisplayStatus(boat);
    const matches = displayStatus === filterStatus;

    // DEBUG: Log first few boats
    if (boats.indexOf(boat) < 3) {
      console.log('[filterByStatus]', {
        owner: boat.owner,
        storageBoat: boat.storageBoat,
        displayStatus,
        filterStatus,
        matches,
      });
    }

    return matches;
  });

  console.log(`[filterByStatus] Filtered ${boats.length} → ${result.length} boats with status="${filterStatus}"`);
  return result;
}

/**
 * Filter boats by work phase completion
 * Accounts for storage boats by checking their active season's work phases
 *
 * @param {Array} boats - Array of boat objects
 * @param {string} filterWorkPhase - Work phase to filter by ('mechanicals', 'clean', etc.), or 'all'
 * @returns {Array} - Filtered boat array (boats with incomplete specified phase)
 */
export function filterByWorkPhase(boats, filterWorkPhase) {
  if (filterWorkPhase === 'all') return boats;

  return boats.filter(boat => {
    if (boat.storageBoat) {
      // For storage boats, check active season's work phase
      const activeSeason = getActiveSeason(boat);
      const phaseKey = `${activeSeason}${filterWorkPhase.charAt(0).toUpperCase() + filterWorkPhase.slice(1)}Complete`;
      return !boat[phaseKey];
    }

    // Regular boats - check regular work phase
    const phaseKey = `${filterWorkPhase}Complete`;
    return !boat[phaseKey];
  });
}

/**
 * Filter boats by location
 *
 * @param {Array} boats - Array of boat objects
 * @param {Array} filterLocations - Array of location names to include
 * @returns {Array} - Filtered boat array
 */
export function filterByLocation(boats, filterLocations) {
  if (!filterLocations || filterLocations.length === 0) return boats;

  return boats.filter(boat => {
    if (!boat.location) return false;
    return filterLocations.includes(boat.location);
  });
}

/**
 * Filter boats by site
 *
 * @param {Array} boats - Array of boat objects
 * @param {Array} filterSites - Array of site IDs to include
 * @param {Array} locations - Array of location objects (needed to map boat location to site)
 * @returns {Array} - Filtered boat array
 */
export function filterBySite(boats, filterSites, locations) {
  if (!filterSites || filterSites.length === 0) return boats;

  return boats.filter(boat => {
    if (!boat.location) return false;
    const location = locations.find(l => l.name === boat.location);
    // Note: location uses snake_case site_id from database
    return location && filterSites.includes(location.site_id);
  });
}

/**
 * Filter boats by search query
 * Searches across: name, model, owner, hullId, dockmasterId, workOrderNumber
 *
 * @param {Array} boats - Array of boat objects
 * @param {string} searchQuery - Search string
 * @returns {Array} - Filtered boat array
 */
export function filterBySearch(boats, searchQuery) {
  if (!searchQuery || searchQuery.trim() === '') return boats;

  const query = searchQuery.toLowerCase().trim();

  return boats.filter(boat => {
    return (
      boat.name?.toLowerCase().includes(query) ||
      boat.model?.toLowerCase().includes(query) ||
      boat.owner?.toLowerCase().includes(query) ||
      boat.hullId?.toLowerCase().includes(query) ||
      boat.dockmasterId?.toLowerCase().includes(query) ||
      boat.workOrderNumber?.toLowerCase().includes(query)
    );
  });
}

/**
 * Apply all filters to a boat list
 * Consolidated filtering pipeline for easy use across all pages
 *
 * @param {Array} boats - Array of boat objects
 * @param {Object} filters - Object containing filter values
 * @param {string} filters.searchQuery - Search query string
 * @param {string} filters.status - Status filter value
 * @param {string} filters.workPhase - Work phase filter value
 * @param {Array} filters.locations - Location names to filter by
 * @param {Array} filters.sites - Site IDs to filter by
 * @param {Array} locations - Array of location objects (needed for site filtering)
 * @returns {Array} - Filtered boat array
 */
export function applyAllFilters(boats, filters, locations = []) {
  let filtered = boats;

  // Apply search filter
  if (filters.searchQuery) {
    filtered = filterBySearch(filtered, filters.searchQuery);
  }

  // Apply status filter
  if (filters.status) {
    filtered = filterByStatus(filtered, filters.status);
  }

  // Apply work phase filter
  if (filters.workPhase) {
    filtered = filterByWorkPhase(filtered, filters.workPhase);
  }

  // Apply location filter
  if (filters.locations) {
    filtered = filterByLocation(filtered, filters.locations);
  }

  // Apply site filter
  if (filters.sites) {
    filtered = filterBySite(filtered, filters.sites, locations);
  }

  return filtered;
}
