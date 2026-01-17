// ============================================================================
// LOCATION CONSTANTS
// ============================================================================
// Shared constants for location rendering across all views
// ============================================================================

// Sales status colors for inventory boats
export const SALES_STATUS_COLORS = {
  'HA': 'bg-green-100 border-green-300 text-green-800',
  'HS': 'bg-blue-100 border-blue-300 text-blue-800',
  'OA': 'bg-yellow-100 border-yellow-300 text-yellow-800',
  'OS': 'bg-orange-100 border-orange-300 text-orange-800',
  'FA': 'bg-purple-100 border-purple-300 text-purple-800',
  'FS': 'bg-pink-100 border-pink-300 text-pink-800',
  'S': 'bg-red-100 border-red-300 text-red-800',
  'R': 'bg-indigo-100 border-indigo-300 text-indigo-800',
  'FP': 'bg-teal-100 border-teal-300 text-teal-800',
};

export const SALES_STATUS_LABELS = {
  'HA': 'On Hand Available',
  'HS': 'On Hand Sold',
  'OA': 'On Order Available',
  'OS': 'On Order Sold',
  'FA': 'Future Available',
  'FS': 'Future Sold',
  'S': 'Sold',
  'R': 'Reserved',
  'FP': 'Floor Planned',
};

// Location type colors
export const LOCATION_TYPE_COLORS = {
  'rack-building': 'blue',
  'parking-lot': 'purple',
  'workshop': 'orange',
  'shop': 'orange',
  'pool': 'teal',
};

// Location type labels
export const LOCATION_TYPE_LABELS = {
  'rack-building': 'Rack Building',
  'parking-lot': 'Parking Lot',
  'workshop': 'Workshop',
  'shop': 'Shop',
  'pool': 'Pool',
};
