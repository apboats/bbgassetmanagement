/**
 * Seasonal work phase utilities for storage boats
 * Priority order: Fall → Winter → Spring
 *
 * Active season logic:
 * - Fall is active if not complete
 * - Winter is active if Fall is complete but Winter is not
 * - Spring is active if both Fall and Winter are complete
 */

export const SEASONS = ['fall', 'winter', 'spring'];

export const SEASON_LABELS = {
  fall: 'Fall',
  winter: 'Winter',
  spring: 'Spring'
};

/**
 * Get the active season for a storage boat
 * Returns the first incomplete season in priority order (Fall → Winter → Spring)
 *
 * @param {Object} boat - The boat object
 * @returns {string|null} - 'fall', 'winter', 'spring', or null if not a storage boat
 */
export function getActiveSeason(boat) {
  if (!boat.storageBoat) return null;

  // Check Fall - if not complete, Fall is active
  if (boat.fallStatus !== 'all-work-complete') {
    return 'fall';
  }

  // Fall is complete, check Winter
  if (boat.winterStatus !== 'all-work-complete') {
    return 'winter';
  }

  // Both Fall and Winter complete, Spring is active
  return 'spring';
}

/**
 * Get the display status for a boat
 * For storage boats, returns the active season's status
 * For regular boats, returns the regular status field
 *
 * This is used for filtering and display throughout the app
 *
 * @param {Object} boat - The boat object
 * @returns {string} - The status to display/filter by
 */
export function getDisplayStatus(boat) {
  if (!boat.storageBoat) {
    return boat.status;
  }

  const activeSeason = getActiveSeason(boat);
  return boat[`${activeSeason}Status`];
}

/**
 * Get work phases for a specific season
 *
 * @param {Object} boat - The boat object
 * @param {string} season - 'fall', 'winter', or 'spring'
 * @returns {Object} - Object with all work phase completion statuses
 */
export function getSeasonWorkPhases(boat, season) {
  return {
    mechanicalsComplete: boat[`${season}MechanicalsComplete`],
    cleanComplete: boat[`${season}CleanComplete`],
    fiberglassComplete: boat[`${season}FiberglassComplete`],
    warrantyComplete: boat[`${season}WarrantyComplete`],
    invoicedComplete: boat[`${season}InvoicedComplete`],
  };
}

/**
 * Get status for a specific season
 *
 * @param {Object} boat - The boat object
 * @param {string} season - 'fall', 'winter', or 'spring'
 * @returns {string} - The status for that season
 */
export function getSeasonStatus(boat, season) {
  return boat[`${season}Status`];
}

/**
 * Check if all work phases are complete for a season
 *
 * @param {Object} boat - The boat object
 * @param {string} season - 'fall', 'winter', or 'spring'
 * @returns {boolean} - True if all work phases for the season are complete
 */
export function isSeasonComplete(boat, season) {
  const phases = getSeasonWorkPhases(boat, season);
  return Object.values(phases).every(complete => complete === true);
}

/**
 * Get a specific work phase value for a season
 *
 * @param {Object} boat - The boat object
 * @param {string} season - 'fall', 'winter', or 'spring'
 * @param {string} phase - 'mechanicals', 'clean', 'fiberglass', 'warranty', or 'invoiced'
 * @returns {boolean} - True if the work phase is complete
 */
export function getSeasonWorkPhase(boat, season, phase) {
  const capitalizedPhase = phase.charAt(0).toUpperCase() + phase.slice(1);
  return boat[`${season}${capitalizedPhase}Complete`];
}
