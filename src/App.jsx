import React, { useState, useEffect, useRef } from 'react';
import { Camera, Search, Plus, Trash2, Edit2, Save, X, LogOut, Users, User, Map, Package, Settings, Menu, Grid, ChevronRight, Home, Wrench, Sparkles, Layers, Shield, Maximize2, Minimize2, ChevronLeft, Pencil } from 'lucide-react';

// Touch drag polyfill - makes draggable work on touch devices
if (typeof window !== 'undefined') {
  let draggedElement = null;
  
  const handleTouchStart = (e) => {
    const target = e.target.closest('[draggable="true"]');
    if (target && !target.classList.contains('customizer-drag')) {
      draggedElement = target;
      target.style.opacity = '0.5';
      
      // Trigger dragstart
      const event = new Event('dragstart', { bubbles: true });
      target.dispatchEvent(event);
    }
  };
  
  const handleTouchMove = (e) => {
    if (!draggedElement) return;
    e.preventDefault();
  };
  
  const handleTouchEnd = (e) => {
    if (!draggedElement) return;
    
    draggedElement.style.opacity = '';
    
    const touch = e.changedTouches[0];
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropTarget = elementBelow?.closest('.location-slot');
    
    if (dropTarget && dropTarget !== draggedElement) {
      // Trigger drop
      const dropEvent = new Event('drop', { bubbles: true });
      dropTarget.dispatchEvent(dropEvent);
    }
    
    // Trigger dragend
    const dragendEvent = new Event('dragend', { bubbles: true });
    draggedElement.dispatchEvent(dragendEvent);
    
    draggedElement = null;
  };
  
  document.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);
}

// Main App Component
export default function BoatsByGeorgeAssetManager({
  // User
  currentUser,
  onSignOut,
  
  // Boats
  boats = [],
  onAddBoat,
  onUpdateBoat,
  onDeleteBoat,
  onAssignNfcTag,
  onReleaseNfcTag,
  
  // Inventory Boats
  inventoryBoats = [],
  onUpdateInventoryBoat,
  onSyncInventory,
  lastInventorySync,
  
  // Locations
  locations = [],
  onAddLocation,
  onUpdateLocation,
  onDeleteLocation,
  onAssignBoatToSlot,
  onRemoveBoatFromSlot,
  onMoveBoat,
  
  // User Preferences
  userPreferences = {},
  onSavePreferences,
  
  // Users
  users = [],
  
  // Dockmaster Config
  dockmasterConfig,
  onSaveDockmasterConfig,
}) {
  // UI State (keep these)
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Bypass auth for development
  const [currentView, setCurrentView] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [dockmasterToken, setDockmasterToken] = useState(null);

  // Data is now loaded by AppContainer - no need for local data loading

  // These wrapper functions bridge between the array-based pattern used by child components
  // and the operation-based callbacks expected by AppContainer
  const saveBoats = async (newBoats) => {
    // This is a compatibility layer - child components pass entire arrays,
    // but we need to figure out what changed and call the right callback
    
    // For now, we'll detect simple cases. In a full refactor, child components
    // would call onAddBoat, onUpdateBoat, onDeleteBoat directly
    
    const added = newBoats.filter(nb => !boats.find(b => b.id === nb.id));
    const removed = boats.filter(b => !newBoats.find(nb => nb.id === b.id));
    const updated = newBoats.filter(nb => {
      const oldBoat = boats.find(b => b.id === nb.id);
      return oldBoat && JSON.stringify(oldBoat) !== JSON.stringify(nb);
    });
    
    // Process additions
    for (const boat of added) {
      await onAddBoat(boat);
    }
    
    // Process deletions
    for (const boat of removed) {
      await onDeleteBoat(boat.id);
    }
    
    // Process updates
    for (const boat of updated) {
      const oldBoat = boats.find(b => b.id === boat.id);
      // Send only the changed fields
      const changes = {};
      for (const key in boat) {
        if (JSON.stringify(boat[key]) !== JSON.stringify(oldBoat?.[key])) {
          changes[key] = boat[key];
        }
      }
      if (Object.keys(changes).length > 0) {
        await onUpdateBoat(boat.id, changes);
      }
    }
  };

  const saveLocations = async (newLocations) => {
    // Compatibility layer for array-based updates
    const added = newLocations.filter(nl => !locations.find(l => l.id === nl.id));
    const removed = locations.filter(l => !newLocations.find(nl => nl.id === l.id));
    const updated = newLocations.filter(nl => {
      const oldLoc = locations.find(l => l.id === nl.id);
      return oldLoc && JSON.stringify(oldLoc) !== JSON.stringify(nl);
    });
    
    for (const loc of added) {
      await onAddLocation(loc);
    }
    
    for (const loc of removed) {
      await onDeleteLocation(loc.id);
    }
    
    for (const loc of updated) {
      const oldLoc = locations.find(l => l.id === loc.id);
      const changes = {};
      for (const key in loc) {
        if (JSON.stringify(loc[key]) !== JSON.stringify(oldLoc?.[key])) {
          changes[key] = loc[key];
        }
      }
      if (Object.keys(changes).length > 0) {
        await onUpdateLocation(loc.id, changes);
      }
    }
  };

  const saveInventoryBoats = async (newInventoryBoats, changedBoatId = null) => {
    // If a specific boat ID was changed, only update that one
    if (changedBoatId) {
      const changedBoat = newInventoryBoats.find(b => b.id === changedBoatId);
      if (changedBoat) {
        await onUpdateInventoryBoat(changedBoat.id, changedBoat);
      }
      return;
    }
    
    // Otherwise, compare and update all changed boats
    for (const newBoat of newInventoryBoats) {
      const oldBoat = inventoryBoats.find(b => b.id === newBoat.id);
      if (oldBoat && JSON.stringify(oldBoat) !== JSON.stringify(newBoat)) {
        await onUpdateInventoryBoat(newBoat.id, newBoat);
      }
    }
  };

  const saveUserPreferences = async (userId, preferences) => {
    try {
      await onSavePreferences(preferences);
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  };

  const loadUserPreferences = async (userId) => {
    // Preferences are now loaded by AppContainer and passed as props
    // This function is kept for compatibility but doesn't need to do anything
    console.log('loadUserPreferences called - preferences already loaded by AppContainer');
  };

  /**
   * DOCKMASTER API INTEGRATION - INVENTORY SYNC
   * ============================================
   * 
   * Purpose: Sync inventory boats from Dockmaster API
   * Endpoint: /api/v1/UnitSales/RetrieveOtherInventory
   * Sync Interval: Every 30 minutes
   * 
   * HOW IT WORKS:
   * 1. Makes authenticated call to Dockmaster API using credentials from Settings
   * 2. Retrieves boats and filters by Sales Status field
   * 3. Boats are added/updated when status is in approved list
   * 4. Boats with SD (Sold Delivered) status are removed/hidden
   * 
   * SALES STATUS VALUES (what shows in our system):
   * - HA = On Hand Available
   * - HS = On Hand Sold
   * - OA = On Order Available
   * - OS = On Order Sold
   * - FA = Future Available
   * - FS = Future Sold
   * - S  = Sold
   * - R  = Reserved
   * - FP = Floor Planned
   * 
   * EXCLUDED STATUS:
   * - SD = Sold Delivered (these boats should NOT appear in our system)
   * 
   * IMPORTANT FOR DATABASE MIGRATION:
   * - These inventory boats are READ-ONLY from Dockmaster (source of truth)
   * - We track them separately from customer boats (boats[])
   * - When building database: Create separate table `inventory_boats` with:
   *   - dockmaster_id (unique identifier from API)
   *   - sales_status (HA, HS, OA, OS, FA, FS, S, R, FP)
   *   - last_synced_at (timestamp)
   *   - all boat fields (name, model, owner, etc.)
   * - Sync process should:
   *   1. Fetch from Dockmaster API
   *   2. Filter boats where sales_status IN ('HA','HS','OA','OS','FA','FS','S','R','FP')
   *   3. Compare with local database
   *   4. Add new boats, update existing, mark SD boats as inactive
   * 
   * API AUTHENTICATION:
   * - Uses username/password from dockmasterConfig (stored in Settings)
   * - May need Bearer token - check API docs for auth method
   */
  const syncInventoryBoats = async (fullSync = false) => {
    // Check for credentials before syncing
    if (!dockmasterConfig || !dockmasterConfig.username || !dockmasterConfig.password) {
      console.log('Dockmaster credentials not configured. Skipping inventory sync.');
      return;
    }

    try {
      console.log(`Syncing inventory boats from Dockmaster API (${fullSync ? 'full' : 'incremental'})...`);
      
      // Call AppContainer's sync function which handles the API call
      const result = await onSyncInventory(fullSync);
      
      console.log(`Inventory sync completed. ${result?.count || 0} boats synced.`);
    } catch (error) {
      console.error('Error syncing inventory boats:', error);
    }
  };

  // Inventory data is now loaded by AppContainer - no need to load from storage

  // Set up 30-minute sync interval and run initial sync
  useEffect(() => {
    // Only sync if dockmasterConfig exists and has credentials
    if (!dockmasterConfig?.username || !dockmasterConfig?.password) {
      console.log('Skipping inventory sync - Dockmaster credentials not configured');
      return;
    }

    // Run initial sync immediately on mount (incremental - today's changes only)
    const runInitialSync = async () => {
      console.log('Running initial inventory sync (incremental)...');
      await syncInventoryBoats(false); // Incremental sync
    };
    
    runInitialSync();
    
    // Sync every 30 minutes (1800000 ms) - incremental sync (today's changes only)
    const syncInterval = setInterval(() => {
      console.log('Running scheduled inventory sync (incremental)...');
      syncInventoryBoats(false); // Incremental sync - only today's changes
    }, 1800000);
    
    return () => {
      console.log('Cleaning up inventory sync interval');
      clearInterval(syncInterval);
    };
  }, []); // Empty dependency array - only run once on mount

  const handleLogin = (user) => {
    setIsAuthenticated(true);
    // currentUser is now managed by AppContainer - don't set it here
    setCurrentView('dashboard');
    loadUserPreferences(user?.id || user?.username || 'default-user');
  };

  const handleLogout = async () => {
    setIsAuthenticated(false);
    await onSignOut(); // Call AppContainer's sign out function
    setCurrentView('dashboard');
    setShowMobileMenu(false);
  };

  if (!isAuthenticated) {
    return <LoginScreen users={users} onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
        
        * {
          font-family: 'Inter', sans-serif;
        }
        
        h1, h2, h3, h4, h5, h6 {
          font-family: 'Archivo', sans-serif;
        }

        .boat-card {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .boat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15);
        }

        .location-slot {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .location-slot:not([draggable="true"]):hover {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.3);
        }

        .location-slot[draggable="true"]:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .location-slot[draggable="true"] {
          cursor: grab;
          user-select: none;
        }

        .location-slot[draggable="true"]:active {
          cursor: grabbing;
        }

        .dragging {
          opacity: 0.4;
          transform: scale(0.95);
        }

        .drag-over {
          border-color: #3b82f6 !important;
          background: rgba(59, 130, 246, 0.15) !important;
          transform: scale(1.02);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
        }
        
        .unassigned-boat {
          user-select: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .unassigned-boat:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .unassigned-boat:active {
          transform: scale(0.98);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }

        .status-needs-approval { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .status-needs-parts { background: linear-gradient(135deg, #eab308, #ca8a04); }
        .status-parts-kit-pulled { background: linear-gradient(135deg, #f97316, #ea580c); }
        .status-on-deck { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .status-all-work-complete { background: linear-gradient(135deg, #10b981, #059669); }
        .status-archived { background: linear-gradient(135deg, #6b7280, #4b5563); }
      `}</style>

      {/* Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Boats By George</h1>
                <p className="text-xs text-slate-500 hidden sm:block">Asset Management System</p>
              </div>
            </div>

            {/* Main Navigation - Always visible */}
            <div className="flex items-center gap-2">
              <NavButton icon={Home} label="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
              <NavButton icon={User} label="My View" active={currentView === 'myview'} onClick={() => setCurrentView('myview')} />
              <NavButton icon={Map} label="Locations" active={currentView === 'locations'} onClick={() => setCurrentView('locations')} />
              <NavButton icon={Package} label="Boats" active={currentView === 'boats'} onClick={() => setCurrentView('boats')} />
              <NavButton icon={Package} label="Inventory" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />
              <NavButton icon={Camera} label="Scan" active={currentView === 'scan'} onClick={() => setCurrentView('scan')} />
              <NavButton icon={Settings} label="Settings" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
              <div className="flex items-center ml-2 pl-2 border-l border-slate-200">
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <DashboardView boats={boats} locations={locations} onNavigate={setCurrentView} onUpdateBoats={saveBoats} onUpdateLocations={saveLocations} />
        )}
        {currentView === 'locations' && (
          <LocationsView
            locations={locations}
            boats={(() => {
              // Combine boats and inventory boats, removing duplicates
              // If same ID exists in both, keep the inventory version
              const seen = {};
              const combined = [];
              
              // Add regular boats first
              boats.forEach(boat => {
                if (!seen[boat.id]) {
                  seen[boat.id] = true;
                  combined.push(boat);
                }
              });
              
              // Add inventory boats (will replace duplicates)
              inventoryBoats.forEach(boat => {
                if (!seen[boat.id]) {
                  seen[boat.id] = true;
                  combined.push(boat);
                } else {
                  // Replace regular boat with inventory boat if duplicate
                  const index = combined.findIndex(b => b.id === boat.id);
                  if (index !== -1) combined[index] = boat;
                }
              });
              
              return combined;
            })()}
            onUpdateLocations={saveLocations}
            onUpdateBoats={(updatedBoats) => {
              // Split boats and inventory boats when saving
              const regularBoats = updatedBoats.filter(b => !b.isInventory);
              const invBoats = updatedBoats.filter(b => b.isInventory);
              saveBoats(regularBoats);
              saveInventoryBoats(invBoats);
            }}
          />
        )}
        {currentView === 'boats' && (
          <BoatsView 
            boats={boats} 
            locations={locations} 
            onUpdateBoats={saveBoats}
            onUpdateLocations={saveLocations}
            dockmasterConfig={dockmasterConfig}
            dockmasterToken={dockmasterToken}
            setDockmasterToken={setDockmasterToken}
          />
        )}
        {currentView === 'scan' && (
          <ScanView 
            boats={boats}
            locations={locations}
            onUpdateBoats={saveBoats}
            onUpdateLocations={saveLocations}
          />
        )}
        {currentView === 'myview' && (
          <MyViewEditor
            locations={locations}
            boats={(() => {
              // Combine boats and inventory boats, removing duplicates
              const seen = {};
              const combined = [];
              boats.forEach(boat => {
                if (!seen[boat.id]) {
                  seen[boat.id] = true;
                  combined.push(boat);
                }
              });
              inventoryBoats.forEach(boat => {
                if (!seen[boat.id]) {
                  seen[boat.id] = true;
                  combined.push(boat);
                } else {
                  const index = combined.findIndex(b => b.id === boat.id);
                  if (index !== -1) combined[index] = boat;
                }
              });
              return combined;
            })()}
            userPreferences={userPreferences}
            currentUser={currentUser}
            onSavePreferences={(prefs) => saveUserPreferences(currentUser?.id || currentUser?.username || 'default-user', prefs)}
            onUpdateLocations={saveLocations}
            onUpdateBoats={(updatedBoats) => {
              // Split boats and inventory boats when saving
              const regularBoats = updatedBoats.filter(b => !b.isInventory);
              const invBoats = updatedBoats.filter(b => b.isInventory);
              saveBoats(regularBoats);
              saveInventoryBoats(invBoats);
            }}
          />
        )}
        {currentView === 'inventory' && (
          <InventoryView 
            inventoryBoats={inventoryBoats}
            locations={locations}
            lastSync={lastInventorySync}
            onSyncNow={syncInventoryBoats}
            onUpdateInventoryBoats={saveInventoryBoats}
            onUpdateSingleBoat={onUpdateInventoryBoat}
            dockmasterConfig={dockmasterConfig}
          />
        )}
        {currentView === 'settings' && (
          <SettingsView 
            dockmasterConfig={dockmasterConfig} 
            currentUser={currentUser}
            users={users}
            onSaveConfig={async (config) => {
              await onSaveDockmasterConfig(config);
              setDockmasterToken(null);
            }}
            onUpdateUsers={async (updatedUsers) => {
              // TODO: Users should be managed by AppContainer/authentication system
              console.log('User updates should be handled by authentication system');
            }}
          />
        )}
      </div>
    </div>
  );
}

// Login Screen Component
function LoginScreen({ users, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
      onLogin(user);
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Boats By George</h1>
          <p className="text-slate-600">Asset Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            Sign In
          </button>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <p className="font-semibold text-blue-900 mb-1">Demo Credentials:</p>
            <p className="text-blue-700">Username: <span className="font-mono">admin</span></p>
            <p className="text-blue-700">Password: <span className="font-mono">admin</span></p>
          </div>
        </form>
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? 'bg-blue-100 text-blue-700' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function DashboardView({ boats, locations, onNavigate, onUpdateBoats, onUpdateLocations }) {
  const [viewingBoat, setViewingBoat] = useState(null);

  const statusCounts = {
    needsApproval: boats.filter(b => b.status === 'needs-approval').length,
    needsParts: boats.filter(b => b.status === 'needs-parts').length,
    partsKitPulled: boats.filter(b => b.status === 'parts-kit-pulled').length,
    onDeck: boats.filter(b => b.status === 'on-deck').length,
    allWorkComplete: boats.filter(b => b.status === 'all-work-complete').length,
  };

  const totalBoats = boats.filter(b => b.status !== 'archived').length;
  const totalLocations = locations.length;
  
  // Calculate total capacity and occupancy
  const totalCapacity = locations.reduce((sum, loc) => {
    if (loc.type === 'pool') return sum; // Pools don't have fixed capacity
    const isUShape = loc.layout === 'u-shaped';
    return sum + (isUShape ? (loc.rows * 2) + loc.columns : loc.rows * loc.columns);
  }, 0);
  
  const totalOccupiedSlots = locations.reduce((acc, loc) => {
    if (loc.type === 'pool') {
      return acc + (loc.pool_boats || loc.poolBoats || []).length;
    }
    return acc + Object.keys(loc.boats || {}).length;
  }, 0);
  const occupancyRate = totalCapacity > 0 ? Math.round((totalOccupiedSlots / totalCapacity) * 100) : 0;

  const handleViewBoat = (boat) => {
    // Find the location if boat is assigned
    const location = boat.location ? locations.find(l => l.name === boat.location) : null;
    const slotId = location ? Object.keys(location.boats || {}).find(key => location.boats[key] === boat.id) : null;
    
    setViewingBoat({
      ...boat,
      currentLocation: location,
      currentSlot: slotId || (location?.type === 'pool' ? 'pool' : null)
    });
  };

  const handleUpdateBoatFromModal = (updatedBoat) => {
    onUpdateBoats(boats.map(b => b.id === updatedBoat.id ? updatedBoat : b));
    setViewingBoat(updatedBoat);
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    let updatedLocations = [...locations];
    
    // Remove from current location
    if (boat.location) {
      const currentLoc = locations.find(l => l.name === boat.location);
      if (currentLoc) {
        if (currentLoc.type === 'pool') {
          const poolBoats = currentLoc.pool_boats || currentLoc.poolBoats || [];
          const updatedLoc = {
            ...currentLoc,
            pool_boats: poolBoats.filter(id => id !== boat.id),
          };
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        } else {
          const updatedLoc = { ...currentLoc, boats: { ...currentLoc.boats } };
          const slotKey = Object.keys(updatedLoc.boats).find(k => updatedLoc.boats[k] === boat.id);
          if (slotKey) delete updatedLoc.boats[slotKey];
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        }
      }
    }
    
    // Add to new location
    let updatedBoat = { ...boat };
    if (targetLocation) {
      if (targetLocation.type === 'pool') {
        const poolBoats = targetLocation.pool_boats || targetLocation.poolBoats || [];
        const updatedLoc = {
          ...targetLocation,
          pool_boats: [...poolBoats, boat.id],
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = 'pool';
      } else {
        const currentTargetLoc = updatedLocations.find(l => l.id === targetLocation.id);
        const updatedLoc = {
          ...currentTargetLoc,
          boats: { ...currentTargetLoc.boats, [targetSlot]: boat.id }
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        const [row, col] = targetSlot.split('-').map(Number);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = `${row + 1}-${col + 1}`;
      }
    } else {
      updatedBoat.location = null;
      updatedBoat.slot = null;
    }
    
    await onUpdateLocations(updatedLocations);
    onUpdateBoats(boats.map(b => b.id === boat.id ? updatedBoat : b));
    
    // Update viewing boat with new location info
    const newLocation = targetLocation ? updatedLocations.find(l => l.id === targetLocation.id) : null;
    setViewingBoat({
      ...updatedBoat,
      currentLocation: newLocation,
      currentSlot: targetSlot
    });
  };

  const handleRemoveBoatFromLocation = () => {
    if (!viewingBoat) return;
    
    const updatedBoat = {
      ...viewingBoat,
      location: null,
      slot: null
    };
    onUpdateBoats(boats.map(b => b.id === viewingBoat.id ? updatedBoat : b));
    setViewingBoat(null);
  };

  return (
    <div className="space-y-8 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h2>
        <p className="text-slate-600">Overview of your boat management system</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard 
          title="Total Boats" 
          value={totalBoats} 
          icon={Package} 
          color="blue"
          onClick={() => onNavigate('boats')}
        />
        <SummaryCard 
          title="Storage Locations" 
          value={totalLocations} 
          icon={Map} 
          color="purple"
          onClick={() => onNavigate('locations')}
        />
        <SummaryCard 
          title="Occupancy Rate" 
          value={`${occupancyRate}%`}
          subtitle={`${totalOccupiedSlots} / ${totalCapacity} slots`}
          icon={Grid} 
          color="orange"
          onClick={() => onNavigate('locations')}
        />
        <SummaryCard 
          title="Work Complete" 
          value={statusCounts.allWorkComplete} 
          icon={Package} 
          color="green"
        />
      </div>

      {/* Status Overview */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Boat Status Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatusCard status="needs-approval" count={statusCounts.needsApproval} label="Needs Approval" />
          <StatusCard status="needs-parts" count={statusCounts.needsParts} label="Needs Parts" />
          <StatusCard status="parts-kit-pulled" count={statusCounts.partsKitPulled} label="Parts Kit Pulled" />
          <StatusCard status="on-deck" count={statusCounts.onDeck} label="On Deck" />
          <StatusCard status="all-work-complete" count={statusCounts.allWorkComplete} label="All Work Complete" />
        </div>
      </div>

      {/* Recent Boats */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">Recent Boats</h3>
          <button
            onClick={() => onNavigate('boats')}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boats.slice(0, 6).map(boat => (
            <div key={boat.id} onClick={() => handleViewBoat(boat)} className="cursor-pointer hover:scale-[1.02] transition-transform">
              <BoatCard boat={boat} onEdit={() => {}} onDelete={() => {}} compact={true} />
            </div>
          ))}
        </div>
      </div>

      {/* Boat Details Modal */}
      {viewingBoat && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          onRemove={handleRemoveBoatFromLocation}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ title, value, subtitle, icon: Icon, color, onClick }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    green: 'from-green-500 to-green-600'
  };

  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl shadow-md p-6 border border-slate-200 ${onClick ? 'cursor-pointer hover:shadow-lg transition-all' : ''}`}
    >
      <div className={`w-12 h-12 bg-gradient-to-br ${colors[color]} rounded-lg flex items-center justify-center mb-4`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <p className="text-slate-600 text-sm font-medium mb-1">{title}</p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {subtitle && (
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function StatusCard({ status, count, label }) {
  return (
    <div className="text-center">
      <div className={`status-${status} h-24 rounded-lg flex items-center justify-center mb-2 shadow-sm`}>
        <span className="text-4xl font-bold text-white">{count}</span>
      </div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
    </div>
  );
}

function BoatsView({ boats, locations, onUpdateBoats, onUpdateLocations, dockmasterConfig, dockmasterToken, setDockmasterToken }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWorkPhase, setFilterWorkPhase] = useState('all');
  const [filterLocations, setFilterLocations] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showAddBoat, setShowAddBoat] = useState(false);
  const [editingBoat, setEditingBoat] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const [showBoatTypeSelector, setShowBoatTypeSelector] = useState(false);
  const [showDockmasterSearch, setShowDockmasterSearch] = useState(false);

  // Sync viewingBoat with fresh data when boats array updates
  useEffect(() => {
    if (viewingBoat && viewingBoat.id) {
      const freshBoat = boats.find(b => b.id === viewingBoat.id);
      if (freshBoat) {
        // Re-add location info
        const location = freshBoat.location ? locations.find(l => l.name === freshBoat.location) : null;
        const slotId = location ? Object.keys(location.boats || {}).find(key => location.boats[key] === freshBoat.id) : null;
        
        setViewingBoat({
          ...freshBoat,
          currentLocation: location,
          currentSlot: slotId
        });
      }
    }
  }, [boats, locations]);

  const handleLocationToggle = (locationName) => {
    setFilterLocations(prev => 
      prev.includes(locationName)
        ? prev.filter(l => l !== locationName)
        : [...prev, locationName]
    );
  };

  const filteredBoats = boats.filter(boat => {
    // Filter archived vs active boats
    const isArchived = boat.status === 'archived';
    if (showArchived && !isArchived) return false;
    if (!showArchived && isArchived) return false;
    
    const matchesSearch = boat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.owner.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || boat.status === filterStatus;
    
    let matchesWorkPhase = true;
    if (filterWorkPhase === 'needs-mechanicals') {
      matchesWorkPhase = !boat.mechanicalsComplete;
    } else if (filterWorkPhase === 'needs-clean') {
      matchesWorkPhase = !boat.cleanComplete;
    } else if (filterWorkPhase === 'needs-fiberglass') {
      matchesWorkPhase = !boat.fiberglassComplete;
    } else if (filterWorkPhase === 'needs-warranty') {
      matchesWorkPhase = !boat.warrantyComplete;
    } else if (filterWorkPhase === 'all-complete') {
      matchesWorkPhase = boat.mechanicalsComplete && boat.cleanComplete && boat.fiberglassComplete && boat.warrantyComplete;
    }
    
    let matchesLocation = true;
    if (filterLocations.length > 0) {
      if (filterLocations.includes('unassigned')) {
        matchesLocation = !boat.location || filterLocations.includes(boat.location);
      } else {
        matchesLocation = boat.location && filterLocations.includes(boat.location);
      }
    }
    
    return matchesSearch && matchesStatus && matchesWorkPhase && matchesLocation;
  });

  const handleAddBoatClick = () => {
    setShowAddBoat(true);
  };

  const handleImportFromDockmaster = () => {
    if (!dockmasterConfig || !dockmasterConfig.username) {
      alert('Please configure Dockmaster API credentials in Settings first.');
      return;
    }
    setShowBoatTypeSelector(true);
  };

  const handleAddBoat = (newBoat) => {
    // Check if an archived boat with the same Dockmaster ID exists
    // This is more reliable than name+owner since owners can change
    let existingArchivedBoat = null;
    
    if (newBoat.dockmasterId) {
      // Primary match: Dockmaster ID (most reliable)
      existingArchivedBoat = boats.find(b => 
        b.status === 'archived' && 
        b.dockmasterId && 
        b.dockmasterId === newBoat.dockmasterId
      );
    }
    
    if (!existingArchivedBoat && newBoat.hullId) {
      // Fallback match: Hull ID (HIN is permanent to the boat)
      existingArchivedBoat = boats.find(b => 
        b.status === 'archived' && 
        b.hullId && 
        b.hullId === newBoat.hullId
      );
    }

    if (existingArchivedBoat) {
      // Unarchive the existing boat and update it with new data
      const unarchivedBoat = {
        ...existingArchivedBoat,
        ...newBoat,
        // Keep the existing ID, QR code, and NFC tag
        id: existingArchivedBoat.id,
        qrCode: existingArchivedBoat.qrCode,
        nfcTag: existingArchivedBoat.nfcTag,
        // Set status to needs-approval
        status: 'needs-approval',
        // Clear archived date
        archivedDate: null,
        // Clear location if it had one
        location: null,
        slot: null
      };
      
      onUpdateBoats(boats.map(b => b.id === existingArchivedBoat.id ? unarchivedBoat : b));
      setShowAddBoat(false);
      
      // Show a message to the user
      alert(`Boat "${newBoat.name}" has been restored from the archive with updated information.`);
    } else {
      // No archived boat found, create a new one
      const boat = {
        // Don't include id - let the database auto-generate it
        qrCode: `QR-${Date.now()}`,
        nfcTag: null, // NFC tag will be assigned on first scan
        ...newBoat,
        location: null,
        slot: null
      };
      onUpdateBoats([...boats, boat]);
      setShowAddBoat(false);
    }
  };

  const handleUpdateBoat = (updatedBoat) => {
    const updatedBoats = boats.map(b => b.id === updatedBoat.id ? updatedBoat : b);
    onUpdateBoats(updatedBoats);
    setEditingBoat(null);
  };

  const handleDeleteBoat = (boatId) => {
    if (confirm('Are you sure you want to delete this boat?')) {
      onUpdateBoats(boats.filter(b => b.id !== boatId));
    }
  };

  const handleViewBoat = (boat) => {
    // Find the location if boat is assigned
    const location = boat.location ? locations.find(l => l.name === boat.location) : null;
    const slotId = location ? Object.keys(location.boats).find(key => location.boats[key] === boat.id) : null;
    
    setViewingBoat({
      ...boat,
      currentLocation: location,
      currentSlot: slotId
    });
  };

  const handleUpdateBoatFromModal = async (updatedBoat) => {
    // Immediately update the modal to show the user's changes
    setViewingBoat(updatedBoat);
    
    // Save to database in the background
    await onUpdateBoats(boats.map(b => b.id === updatedBoat.id ? updatedBoat : b));
  };

  const handleRemoveBoatFromLocation = async () => {
    if (!viewingBoat || !viewingBoat.currentLocation) return;

    // Remove boat from location
    const updatedLocation = {
      ...viewingBoat.currentLocation,
      boats: { ...viewingBoat.currentLocation.boats }
    };
    delete updatedLocation.boats[viewingBoat.currentSlot];
    
    // Update boat to have no location
    const updatedBoat = {
      ...viewingBoat,
      location: null,
      slot: null
    };
    
    // Update both locations and boats
    if (onUpdateLocations) {
      await onUpdateLocations(locations.map(l => l.id === viewingBoat.currentLocation.id ? updatedLocation : l));
    }
    await onUpdateBoats(boats.map(b => b.id === viewingBoat.id ? updatedBoat : b));
    
    // Don't close modal here - let the caller decide
    // This allows handleReleaseBoat to remove from location, then archive, then close
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    let updatedLocations = [...locations];
    
    // Remove from current location
    if (boat.location) {
      const currentLoc = locations.find(l => l.name === boat.location);
      if (currentLoc) {
        if (currentLoc.type === 'pool') {
          const poolBoats = currentLoc.pool_boats || currentLoc.poolBoats || [];
          const updatedLoc = {
            ...currentLoc,
            pool_boats: poolBoats.filter(id => id !== boat.id),
          };
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        } else {
          const updatedLoc = { ...currentLoc, boats: { ...currentLoc.boats } };
          const slotKey = Object.keys(updatedLoc.boats).find(k => updatedLoc.boats[k] === boat.id);
          if (slotKey) delete updatedLoc.boats[slotKey];
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        }
      }
    }
    
    // Add to new location
    let updatedBoat = { ...boat };
    if (targetLocation) {
      if (targetLocation.type === 'pool') {
        const poolBoats = targetLocation.pool_boats || targetLocation.poolBoats || [];
        const updatedLoc = {
          ...targetLocation,
          pool_boats: [...poolBoats, boat.id],
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = 'pool';
      } else {
        const currentTargetLoc = updatedLocations.find(l => l.id === targetLocation.id);
        const updatedLoc = {
          ...currentTargetLoc,
          boats: { ...currentTargetLoc.boats, [targetSlot]: boat.id }
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        const [row, col] = targetSlot.split('-').map(Number);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = `${row + 1}-${col + 1}`;
      }
    } else {
      updatedBoat.location = null;
      updatedBoat.slot = null;
    }
    
    await onUpdateLocations(updatedLocations);
    await onUpdateBoats(boats.map(b => b.id === boat.id ? updatedBoat : b));
    
    // Update viewing boat with new location info
    const newLocation = targetLocation ? updatedLocations.find(l => l.id === targetLocation.id) : null;
    setViewingBoat({
      ...updatedBoat,
      currentLocation: newLocation,
      currentSlot: targetSlot
    });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Boats</h2>
          <p className="text-slate-600">
            {showArchived ? 'View archived boats' : 'Manage your boat inventory'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors shadow-md ${
              showArchived
                ? 'bg-slate-600 hover:bg-slate-700 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            {showArchived ? 'Show Active' : 'Show Archived'}
          </button>
          {!showArchived && (
            <>
              <button
                onClick={handleAddBoatClick}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
              >
                <Plus className="w-5 h-5" />
                Add Boat
              </button>
              <button
                onClick={handleImportFromDockmaster}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md"
              >
                <Package className="w-5 h-5" />
                Import
              </button>
            </>
          )}
        </div>
      </div>

      {!showArchived && (
        <>
          {/* Work Phase Stats */}
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
              {boats.filter(b => !b.mechanicalsComplete).length}
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
              {boats.filter(b => !b.cleanComplete).length}
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
              {boats.filter(b => !b.fiberglassComplete).length}
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
              {boats.filter(b => !b.warrantyComplete).length}
            </p>
          </button>
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

      {/* Archived Boats Info */}
      {showArchived && (
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Archived Boats</h3>
              <p className="text-slate-600 text-sm">
                These boats have been released back to their owners and are no longer in active management. 
                This archive maintains a historical record of boats you've serviced.
              </p>
              <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg">
                <p className="text-sm font-medium text-slate-700">
                  Total Archived: <span className="text-slate-900 font-bold">{boats.filter(b => b.status === 'archived').length}</span> boats
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Boats Grid */}
      {filteredBoats.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          {boats.length === 0 ? (
            <>
              <p className="text-slate-500 mb-4">No boats found</p>
              <button
                onClick={handleAddBoatClick}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Add Your First Boat
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-500 mb-2">No boats match your filters</p>
              <p className="text-sm text-slate-400 mb-4">
                Try adjusting your search terms, status, work phase, or location filters
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                  setFilterWorkPhase('all');
                  setFilterLocations([]);
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Clear All Filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBoats.map(boat => (
            <BoatCard 
              key={boat.id} 
              boat={boat} 
              onEdit={() => handleViewBoat(boat)}
              onDelete={() => handleDeleteBoat(boat.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAddBoat && (
        <BoatModal
          boat={null}
          locations={locations}
          onSave={handleAddBoat}
          onCancel={() => setShowAddBoat(false)}
        />
      )}
      {showBoatTypeSelector && (
        <DockmasterImportModal
          dockmasterConfig={dockmasterConfig}
          onImport={handleAddBoat}
          onCancel={() => setShowBoatTypeSelector(false)}
        />
      )}
      {viewingBoat && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          onRemove={handleRemoveBoatFromLocation}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

function BoatCard({ boat, onEdit, onDelete, compact }) {
  const statusLabels = {
    'needs-approval': 'Needs Approval',
    'needs-parts': 'Needs Parts',
    'parts-kit-pulled': 'Parts Kit Pulled',
    'on-deck': 'On Deck',
    'all-work-complete': 'All Work Complete',
    'archived': 'Released'
  };

  return (
    <div className="boat-card bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      <div className={`status-${boat.status} p-3`}>
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold text-sm">{statusLabels[boat.status]}</span>
          <span className="text-white text-xs opacity-90">{boat.qrCode}</span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">{boat.name}</h3>
        <p className="text-slate-600 text-sm mb-3">{boat.model}</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <Users className="w-4 h-4" />
            <span>{boat.owner}</span>
          </div>
          {boat.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <Map className="w-4 h-4" />
              <span>{boat.location} ({boat.slot})</span>
            </div>
          )}
          {boat.nfcTag && (
            <div className="flex items-center gap-2 text-purple-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="font-mono font-semibold">{boat.nfcTag}</span>
            </div>
          )}
        </div>

        {/* Work Phase Checkboxes */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={boat.mechanicalsComplete || false}
                readOnly
                className="w-3 h-3 rounded pointer-events-none"
              />
              <span className={boat.mechanicalsComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                Mech
              </span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={boat.cleanComplete || false}
                readOnly
                className="w-3 h-3 rounded pointer-events-none"
              />
              <span className={boat.cleanComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                Clean
              </span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={boat.fiberglassComplete || false}
                readOnly
                className="w-3 h-3 rounded pointer-events-none"
              />
              <span className={boat.fiberglassComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                Fiber
              </span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={boat.warrantyComplete || false}
                readOnly
                className="w-3 h-3 rounded pointer-events-none"
              />
              <span className={boat.warrantyComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                Warr
              </span>
            </label>
          </div>
          {/* Pending work badges */}
          {(!boat.mechanicalsComplete || !boat.cleanComplete || !boat.fiberglassComplete || !boat.warrantyComplete) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {!boat.mechanicalsComplete && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-medium rounded-full">
                  Needs Mech
                </span>
              )}
              {!boat.cleanComplete && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full">
                  Needs Clean
                </span>
              )}
              {!boat.fiberglassComplete && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-medium rounded-full">
                  Needs Fiber
                </span>
              )}
              {!boat.warrantyComplete && (
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-medium rounded-full">
                  Needs Warr
                </span>
              )}
            </div>
          )}
        </div>

        {!compact && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
            <button
              onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              View Details
            </button>
            <button
              onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BoatModal({ boat, locations, onSave, onCancel }) {
  // ====================================================================
  // PRODUCTION TODO: ADD YEAR FIELD TO CUSTOMER BOATS
  // ====================================================================
  // When converting to full app, add 'year' field to this form:
  // 1. Add to formData initial state (above)
  // 2. Add input field in form (below, after model field)
  // 3. Add to boat creation in BoatsView
  // 4. This allows customer boats to also be filtered by year
  // 5. Store in database: bbg:boats collection
  // Example field:
  //   <div>
  //     <label className="block text-sm font-medium text-slate-700 mb-1">
  //       Year
  //     </label>
  //     <input
  //       type="number"
  //       value={formData.year || ''}
  //       onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
  //       className="w-full px-3 py-2 border border-slate-300 rounded-lg"
  //       placeholder="2024"
  //       min="1900"
  //       max="2099"
  //     />
  //   </div>
  // ====================================================================
  
  const [formData, setFormData] = useState(boat || {
    name: '',
    model: '',
    owner: '',
    status: 'needs-approval',
    location: '',
    slot: '',
    workOrderNumber: '',
    mechanicalsComplete: false,
    cleanComplete: false,
    fiberglassComplete: false,
    warrantyComplete: false
  });

  const allWorkPhasesComplete = formData.mechanicalsComplete && formData.cleanComplete && formData.fiberglassComplete && formData.warrantyComplete;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate: can't set to complete without all phases done
    if (formData.status === 'all-work-complete' && !allWorkPhasesComplete) {
      alert('Cannot mark as complete! All work phases (Mechanicals, Clean, Fiberglass, Warranty) must be completed first.');
      return;
    }
    
    onSave(formData);
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === 'all-work-complete' && !allWorkPhasesComplete) {
      alert('Cannot mark as complete! All work phases (Mechanicals, Clean, Fiberglass) must be completed first.');
      return;
    }
    setFormData({ ...formData, status: newStatus });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">{boat ? 'Edit Boat' : 'Add New Boat'}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Boat Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Sea Ray Sundancer"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Model</label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 320 Sundancer"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Owner</label>
            <input
              type="text"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Owner name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Work Order Number</label>
            <input
              type="text"
              value={formData.workOrderNumber || ''}
              onChange={(e) => setFormData({ ...formData, workOrderNumber: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., WO-12345"
            />
            <p className="text-xs text-slate-500 mt-1">Optional: Track work order associated with this boat</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="needs-approval">Needs Approval</option>
              <option value="needs-parts">Needs Parts</option>
              <option value="parts-kit-pulled">Parts Kit Pulled</option>
              <option value="on-deck">On Deck</option>
              <option value="all-work-complete" disabled={!allWorkPhasesComplete}>
                All Work Complete {!allWorkPhasesComplete ? '(requires all phases)' : ''}
              </option>
            </select>
            {!allWorkPhasesComplete && (
              <p className="text-xs text-orange-600 mt-1">
                Complete all work phases to enable "All Work Complete" status
              </p>
            )}
          </div>

          {/* Work Phase Checkboxes */}
          <div className="border-t border-slate-200 pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Work Phases</label>
            <p className="text-xs text-slate-500 mb-3">Check phases that are complete or not needed. All phases must be verified and billed before marking status as complete.</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.mechanicalsComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, mechanicalsComplete: e.target.checked };
                    // Auto-downgrade status if unchecking and currently complete
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Mechanicals Complete</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.cleanComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, cleanComplete: e.target.checked };
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Clean Complete</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.fiberglassComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, fiberglassComplete: e.target.checked };
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Fiberglass Complete</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.warrantyComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, warrantyComplete: e.target.checked };
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Warranty Complete</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              {boat ? 'Save Changes' : 'Add Boat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DockmasterImportModal({ dockmasterConfig, onImport, onCancel }) {
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

  const handleImportBoat = async (boatId, ownerName) => {
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
        owner: (ownerName || 'Unknown').trim(), // Trim whitespace from owner name
        status: 'needs-approval',
        mechanicalsComplete: false,
        cleanComplete: false,
        fiberglassComplete: false,
        warrantyComplete: false,
        workOrderNumber: '', // Dockmaster doesn't provide this for customer boats
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
                  onClick={() => handleImportBoat(boat.boatId, boat.ownerName)}
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

function LocationsView({ locations, boats, onUpdateLocations, onUpdateBoats }) {
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [draggingBoat, setDraggingBoat] = useState(null);
  const [draggingFrom, setDraggingFrom] = useState(null);
  const [showBoatAssignModal, setShowBoatAssignModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const [maximizedLocation, setMaximizedLocation] = useState(null);
  const mouseYRef = useRef(0);

  // Track mouse position continuously
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseYRef.current = e.clientY;
    };
    
    const handleTouchMove = (e) => {
      if (e.touches?.[0]) {
        mouseYRef.current = e.touches[0].clientY;
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // Auto-scroll when dragging
  useEffect(() => {
    if (!isDraggingActive) return;
    
    console.log('Auto-scroll started - isDraggingActive:', isDraggingActive);
    
    const interval = setInterval(() => {
      const mouseY = mouseYRef.current;
      const windowHeight = window.innerHeight;
      const threshold = 100;
      const speed = 15;
      
      console.log('Checking scroll - mouseY:', mouseY, 'windowHeight:', windowHeight);
      
      if (mouseY < threshold) {
        console.log('Scrolling UP');
        window.scrollBy({ top: -speed, behavior: 'auto' });
      } else if (mouseY > windowHeight - threshold) {
        console.log('Scrolling DOWN');
        window.scrollBy({ top: speed, behavior: 'auto' });
      }
    }, 16); // ~60fps
    
    return () => {
      console.log('Auto-scroll stopped');
      clearInterval(interval);
    };
  }, [isDraggingActive]);

  const handleAddLocation = (newLocation) => {
    const location = {
      ...newLocation,
      boats: {}
    };
    
    // Only add pool_boats for pool type locations
    if (newLocation.type === 'pool') {
      location.pool_boats = [];
    }
    
    // Remove fields that shouldn't be sent to database
    delete location.poolBoats;
    delete location.id; // Let database auto-generate UUID
    
    onUpdateLocations([...locations, location]);
    setShowAddLocation(false);
  };

  const handleUpdateLocation = (updatedLocation) => {
    const updated = locations.map(l => l.id === updatedLocation.id ? updatedLocation : l);
    onUpdateLocations(updated);
    setEditingLocation(null);
  };

  const handleDeleteLocation = (locationId) => {
    if (confirm('Are you sure you want to delete this location?')) {
      // Remove boats from this location
      const location = locations.find(l => l.id === locationId);
      if (location && Object.keys(location.boats).length > 0) {
        const updatedBoats = boats.map(b => {
          if (b.location === location.name) {
            return { ...b, location: null, slot: null };
          }
          return b;
        });
        onUpdateBoats(updatedBoats);
      }
      onUpdateLocations(locations.filter(l => l.id !== locationId));
    }
  };

  const handleDragStart = (e, boat, location, slotId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', boat.id);
    setDraggingBoat(boat);
    setDraggingFrom({ location, slotId });
    setIsDraggingActive(true);
  };

  const handleDragEnd = () => {
    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsDraggingActive(false);
  };

  const handleDrop = async (e, targetLocation, row, col) => {
    e.preventDefault();
    if (!draggingBoat || isProcessing) return;

    setIsProcessing(true);

    const newSlotId = `${row}-${col}`;
    
    // Check if target slot is already occupied
    if (targetLocation.boats[newSlotId]) {
      alert('This slot is already occupied!');
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsProcessing(false);
      return;
    }

    let updatedLocations = [...locations];

    // ALWAYS remove boat from old location if it's currently assigned somewhere
    // This handles both dragging from within a location AND dragging from elsewhere
    if (draggingBoat.location) {
      const oldLocation = locations.find(l => l.name === draggingBoat.location);
      if (oldLocation) {
        const updatedOldLocation = {
          ...oldLocation,
          boats: { ...oldLocation.boats }
        };
        // Find and remove the boat from its current slot
        const oldSlotId = Object.keys(updatedOldLocation.boats).find(
          key => updatedOldLocation.boats[key] === draggingBoat.id
        );
        if (oldSlotId) {
          delete updatedOldLocation.boats[oldSlotId];
        }
        
        updatedLocations = updatedLocations.map(l => 
          l.id === oldLocation.id ? updatedOldLocation : l
        );
      }
    }

    // Add boat to new location - use the already updated locations array
    const currentTargetLocation = updatedLocations.find(l => l.id === targetLocation.id);
    const updatedNewLocation = {
      ...currentTargetLocation,
      boats: { ...currentTargetLocation.boats, [newSlotId]: draggingBoat.id }
    };
    updatedLocations = updatedLocations.map(l => 
      l.id === targetLocation.id ? updatedNewLocation : l
    );

    // Update boat's location (display format with +1)
    const updatedBoat = {
      ...draggingBoat,
      location: targetLocation.name,
      slot: newSlotId // Store as-is for consistency
    };
    const updatedBoats = boats.map(b => b.id === draggingBoat.id ? updatedBoat : b);

    // Update both locations and boats
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(updatedBoats);
    } catch (error) {
      console.error('Error updating boat location:', error);
      alert('Failed to update boat location. Please try again.');
    }

    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsProcessing(false);
  };

  // Handle dropping boat into a pool location
  const handlePoolDrop = async (poolId, slotType) => {
    if (!draggingBoat || isProcessing) return;

    setIsProcessing(true);

    const targetPool = locations.find(l => l.id === poolId);
    if (!targetPool) {
      setIsProcessing(false);
      return;
    }

    let updatedLocations = [...locations];

    // Remove from old location if it had one
    if (draggingBoat.location) {
      const oldLocation = locations.find(l => l.name === draggingBoat.location);
      if (oldLocation) {
        if (oldLocation.type === 'pool') {
          // Remove from old pool
          const oldPoolBoats = oldLocation.pool_boats || oldLocation.poolBoats || [];
          const updatedOldPool = {
            ...oldLocation,
            pool_boats: oldPoolBoats.filter(id => id !== draggingBoat.id),
          };
          updatedLocations = updatedLocations.map(l => 
            l.id === oldLocation.id ? updatedOldPool : l
          );
        } else {
          // Remove from old grid slot
          const updatedOldLocation = { ...oldLocation, boats: { ...oldLocation.boats } };
          const oldSlotId = Object.keys(oldLocation.boats).find(
            key => oldLocation.boats[key] === draggingBoat.id
          );
          if (oldSlotId) {
            delete updatedOldLocation.boats[oldSlotId];
          }
          updatedLocations = updatedLocations.map(l => 
            l.id === oldLocation.id ? updatedOldLocation : l
          );
        }
      }
    }

    // Add to new pool
    const currentPool = updatedLocations.find(l => l.id === poolId);
    const currentPoolBoats = currentPool.pool_boats || currentPool.poolBoats || [];
    
    // Don't add if already in this pool
    if (!currentPoolBoats.includes(draggingBoat.id)) {
      const updatedPool = {
        ...currentPool,
        pool_boats: [...currentPoolBoats, draggingBoat.id],
      };
      updatedLocations = updatedLocations.map(l => 
        l.id === poolId ? updatedPool : l
      );
    }

    // Update boat's location reference
    const updatedBoat = {
      ...draggingBoat,
      location: targetPool.name,
      slot: 'pool'
    };
    const updatedBoats = boats.map(b => b.id === draggingBoat.id ? updatedBoat : b);

    // Save changes
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(updatedBoats);
    } catch (error) {
      console.error('Error updating boat location:', error);
      alert('Failed to update boat location. Please try again.');
    }

    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsProcessing(false);
  };

  const handleSlotClick = (location, row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats[slotId];
    
    if (boatId) {
      // Occupied slot - show boat details
      const boat = boats.find(b => b.id === boatId);
      if (boat) {
        setViewingBoat({ ...boat, currentLocation: location, currentSlot: slotId });
      }
    } else {
      // Empty slot - open assignment modal
      setSelectedLocation(location);
      setSelectedSlot({ row, col, slotId });
      setShowBoatAssignModal(true);
    }
  };

  // Create a new boat from the assignment modal and return it for immediate assignment
  const handleCreateBoatFromAssignModal = async (newBoatData) => {
    const newBoat = {
      ...newBoatData,
      id: `boat-${Date.now()}`,
      qrCode: `BBG-${Date.now().toString(36).toUpperCase()}`,
      status: newBoatData.status || 'needs-approval',
      mechanicalsComplete: false,
      cleanComplete: false,
      fiberglassComplete: false,
      warrantyComplete: false
    };
    
    const updatedBoats = [...boats, newBoat];
    await onUpdateBoats(updatedBoats);
    
    return newBoat;
  };

  // Import a boat from Dockmaster and return it for immediate assignment
  const handleImportBoatFromAssignModal = async (importedBoatData) => {
    const newBoat = {
      ...importedBoatData,
      id: `boat-${Date.now()}`,
      qrCode: importedBoatData.qrCode || `BBG-${Date.now().toString(36).toUpperCase()}`,
      status: importedBoatData.status || 'needs-approval',
      mechanicalsComplete: false,
      cleanComplete: false,
      fiberglassComplete: false,
      warrantyComplete: false
    };
    
    const updatedBoats = [...boats, newBoat];
    await onUpdateBoats(updatedBoats);
    
    return newBoat;
  };

  const handleAssignBoat = async (boatId) => {
    if (!selectedLocation || isProcessing) return;

    setIsProcessing(true);

    let updatedLocations;
    let updatedBoat;
    const boat = boats.find(b => b.id === boatId);
    
    if (!boat) {
      setIsProcessing(false);
      return;
    }

    // Check if this is a pool location
    if (selectedLocation.type === 'pool') {
      // Add to pool
      const currentPoolBoats = selectedLocation.pool_boats || selectedLocation.poolBoats || [];
      const updatedLocation = {
        ...selectedLocation,
        pool_boats: [...currentPoolBoats, boatId],
      };
      updatedLocations = locations.map(l => l.id === selectedLocation.id ? updatedLocation : l);
      
      updatedBoat = {
        ...boat,
        location: selectedLocation.name,
        slot: 'pool'
      };
    } else {
      // Grid assignment (existing logic)
      if (!selectedSlot) {
        setIsProcessing(false);
        return;
      }
      
      const updatedLocation = {
        ...selectedLocation,
        boats: { ...selectedLocation.boats, [selectedSlot.slotId]: boatId }
      };
      updatedLocations = locations.map(l => l.id === selectedLocation.id ? updatedLocation : l);
      
      updatedBoat = {
        ...boat,
        location: selectedLocation.name,
        slot: `${selectedSlot.row + 1}-${selectedSlot.col + 1}`
      };
    }

    const updatedBoats = boats.map(b => b.id === boatId ? updatedBoat : b);

    // Await both updates
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(updatedBoats);
    } catch (error) {
      console.error('Error assigning boat:', error);
      alert('Failed to assign boat. Please try again.');
      setIsProcessing(false);
      return;
    }

    setShowBoatAssignModal(false);
    setSelectedLocation(null);
    setSelectedSlot(null);
    setIsProcessing(false);
  };

  const handleRemoveBoatFromLocation = async () => {
    if (!viewingBoat || !viewingBoat.currentLocation || isProcessing) return;

    setIsProcessing(true);

    // Remove boat from location
    // Check if this is a pool location
    const isPool = viewingBoat.currentLocation.type === 'pool';
    
    let updatedLocation;
    if (isPool) {
      // Remove from pool_boats array
      const currentPoolBoats = viewingBoat.currentLocation.pool_boats || viewingBoat.currentLocation.poolBoats || [];
      updatedLocation = {
        ...viewingBoat.currentLocation,
        pool_boats: currentPoolBoats.filter(id => id !== viewingBoat.id),
      };
    } else {
      // Remove from grid slot
      updatedLocation = {
        ...viewingBoat.currentLocation,
        boats: { ...viewingBoat.currentLocation.boats }
      };
      delete updatedLocation.boats[viewingBoat.currentSlot];
    }
    
    const updatedLocations = locations.map(l => l.id === viewingBoat.currentLocation.id ? updatedLocation : l);

    // Update boat to have no location
    const updatedBoat = {
      ...viewingBoat,
      location: null,
      slot: null
    };
    const updatedBoats = boats.map(b => b.id === viewingBoat.id ? updatedBoat : b);

    // Await both updates
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(updatedBoats);
    } catch (error) {
      console.error('Error removing boat:', error);
      alert('Failed to remove boat. Please try again.');
      setIsProcessing(false);
      return;
    }

    setViewingBoat(null);
    setIsProcessing(false);
  };

  const handleUpdateBoatFromModal = (updatedBoat) => {
    onUpdateBoats(boats.map(b => b.id === updatedBoat.id ? updatedBoat : b));
    setViewingBoat(updatedBoat);
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    setIsProcessing(true);
    let updatedLocations = [...locations];
    
    // Remove from current location
    if (boat.location) {
      const currentLoc = locations.find(l => l.name === boat.location);
      if (currentLoc) {
        if (currentLoc.type === 'pool') {
          const poolBoats = currentLoc.pool_boats || currentLoc.poolBoats || [];
          const updatedLoc = {
            ...currentLoc,
            pool_boats: poolBoats.filter(id => id !== boat.id),
          };
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        } else {
          const updatedLoc = { ...currentLoc, boats: { ...currentLoc.boats } };
          const slotKey = Object.keys(updatedLoc.boats).find(k => updatedLoc.boats[k] === boat.id);
          if (slotKey) delete updatedLoc.boats[slotKey];
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        }
      }
    }
    
    // Add to new location
    let updatedBoat = { ...boat };
    if (targetLocation) {
      if (targetLocation.type === 'pool') {
        const poolBoats = targetLocation.pool_boats || targetLocation.poolBoats || [];
        const updatedLoc = {
          ...targetLocation,
          pool_boats: [...poolBoats, boat.id],
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = 'pool';
      } else {
        const currentTargetLoc = updatedLocations.find(l => l.id === targetLocation.id);
        const updatedLoc = {
          ...currentTargetLoc,
          boats: { ...currentTargetLoc.boats, [targetSlot]: boat.id }
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        const [row, col] = targetSlot.split('-').map(Number);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = `${row + 1}-${col + 1}`;
      }
    } else {
      updatedBoat.location = null;
      updatedBoat.slot = null;
    }
    
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(boats.map(b => b.id === boat.id ? updatedBoat : b));
      
      // Update viewing boat with new location info
      const newLocation = targetLocation ? updatedLocations.find(l => l.id === targetLocation.id) : null;
      setViewingBoat({
        ...updatedBoat,
        currentLocation: newLocation,
        currentSlot: targetSlot
      });
    } catch (error) {
      console.error('Error moving boat:', error);
      alert('Failed to move boat. Please try again.');
    }
    
    setIsProcessing(false);
  };

  // Get unassigned boats (include both grid slots and pool boats)
  const assignedBoatIds = new Set();
  locations.forEach(loc => {
    // Grid-based locations
    Object.values(loc.boats || {}).forEach(boatId => assignedBoatIds.add(boatId));
    // Pool-based locations
    (loc.pool_boats || loc.poolBoats || []).forEach(boatId => assignedBoatIds.add(boatId));
  });
  const unassignedBoats = boats.filter(b => b.status !== 'archived' && !assignedBoatIds.has(b.id));

  // Group locations by type
  const racks = locations.filter(l => l.type === 'rack-building');
  const parking = locations.filter(l => l.type === 'parking-lot');
  const workshops = locations.filter(l => l.type === 'shop');
  const pools = locations.filter(l => l.type === 'pool');

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-40">
          <div className="bg-white rounded-xl shadow-2xl p-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="font-medium text-slate-900">Updating boat location...</span>
          </div>
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Storage Locations</h2>
          <p className="text-slate-600">Manage boat storage facilities and assignments</p>
        </div>
        <button
          onClick={() => setShowAddLocation(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md"
        >
          <Plus className="w-5 h-5" />
          Add Location
        </button>
      </div>

      {/* Instructions Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-1">How to use:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Drag & Drop:</strong> Drag boats from unassigned or between slots to organize</li>
              <li>• <strong>Click Boats:</strong> Click on any boat to view details and remove from location</li>
              <li>• <strong>Click Empty Slots:</strong> Click empty slots to assign a boat</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Locations by Type */}
      {racks.length > 0 && (
        <LocationSection
          title="Rack Buildings"
          icon={Grid}
          color="blue"
          locations={racks}
          boats={boats}
          onSlotClick={handleSlotClick}
          onEdit={setEditingLocation}
          onDelete={handleDeleteLocation}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          isDragging={!!draggingBoat}
          onMaximize={setMaximizedLocation}
        />
      )}

      {parking.length > 0 && (
        <LocationSection
          title="Parking Lots"
          icon={Map}
          color="purple"
          locations={parking}
          boats={boats}
          onSlotClick={handleSlotClick}
          onEdit={setEditingLocation}
          onDelete={handleDeleteLocation}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          isDragging={!!draggingBoat}
          onMaximize={setMaximizedLocation}
        />
      )}

      {workshops.length > 0 && (
        <LocationSection
          title="Service Workshops"
          icon={Settings}
          color="orange"
          locations={workshops}
          boats={boats}
          onSlotClick={handleSlotClick}
          onEdit={setEditingLocation}
          onDelete={handleDeleteLocation}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          isDragging={!!draggingBoat}
          onMaximize={setMaximizedLocation}
        />
      )}

      {/* Pool Locations */}
      {pools.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">Pools</h3>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {pools.map(pool => (
              <PoolLocation
                key={pool.id}
                location={pool}
                boats={boats}
                onEdit={() => setEditingLocation(pool)}
                onDelete={() => handleDeleteLocation(pool.id)}
                onDragStart={handleDragStart}
                onDrop={handlePoolDrop}
                onDragEnd={handleDragEnd}
                isDragging={!!draggingBoat}
                onBoatClick={(boat) => {
                  const poolBoatIds = pool.pool_boats || pool.poolBoats || [];
                  setViewingBoat({
                    ...boat,
                    currentLocation: pool,
                    currentSlot: 'pool',
                    location: pool.name
                  });
                }}
                onAddBoat={() => {
                  setSelectedLocation(pool);
                  setSelectedSlot('pool');
                  setShowBoatAssignModal(true);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {locations.length === 0 && (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Map className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">No storage locations yet</p>
          <button
            onClick={() => setShowAddLocation(true)}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
          >
            Create First Location
          </button>
        </div>
      )}

      {/* Modals */}
      {showAddLocation && (
        <EditLocationModal
          location={null}
          onSave={handleAddLocation}
          onCancel={() => setShowAddLocation(false)}
        />
      )}
      {editingLocation && (
        <EditLocationModal
          location={editingLocation}
          onSave={handleUpdateLocation}
          onCancel={() => setEditingLocation(null)}
        />
      )}
      {showBoatAssignModal && (
        <BoatAssignmentModal
          boats={unassignedBoats}
          allBoats={boats}
          locations={locations}
          onAssign={handleAssignBoat}
          onCreateBoat={handleCreateBoatFromAssignModal}
          onImportBoat={handleImportBoatFromAssignModal}
          onCancel={() => {
            setShowBoatAssignModal(false);
            setSelectedLocation(null);
            setSelectedSlot(null);
          }}
        />
      )}
      {viewingBoat && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          onRemove={handleRemoveBoatFromLocation}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
      
      {/* Maximized Location Modal */}
      {maximizedLocation && (
        <MaximizedLocationModal
          location={maximizedLocation}
          boats={boats}
          onSlotClick={handleSlotClick}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          isDragging={!!draggingBoat}
          onClose={() => setMaximizedLocation(null)}
        />
      )}
    </div>
  );
}

function LocationSection({ title, icon: Icon, color, locations, boats, onSlotClick, onEdit, onDelete, onDragStart, onDrop, onDragEnd, isDragging, onMaximize }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600'
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 bg-gradient-to-br ${colors[color]} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900">{title}</h3>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {locations.map(location => (
          <LocationGrid
            key={location.id}
            location={location}
            boats={boats}
            onSlotClick={onSlotClick}
            onEdit={() => onEdit(location)}
            onDelete={() => onDelete(location.id)}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            isDragging={isDragging}
            onMaximize={() => onMaximize(location)}
          />
        ))}
      </div>
    </div>
  );
}

function LocationGrid({ location, boats, onSlotClick, onEdit, onDelete, onDragStart, onDrop, onDragEnd, isDragging, onMaximize }) {
  const isUShape = location.layout === 'u-shaped';
  const totalSlots = isUShape 
    ? (location.rows * 2) + location.columns 
    : location.rows * location.columns;
  const occupiedSlots = Object.keys(location.boats).length;
  const occupancyRate = Math.round((occupiedSlots / totalSlots) * 100);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Render U-shaped layout
  const renderUShapedGrid = () => {
    const slots = [];
    
    // For U-shaped: we render left side, bottom, right side
    // Left side (column 0, rows 0 to rows-1)
    // Bottom (row rows-1, columns 0 to columns-1)
    // Right side (column columns-1, rows 0 to rows-1)
    
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
        const boatId = location.boats[slotId];
        const boat = boats.find(b => b.id === boatId);

        slots.push(
          <div
            key={slotId}
            draggable={!!boat}
            title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
            onDragStart={(e) => {
              if (boat) {
                onDragStart(e, boat, location, slotId);
              }
            }}
            onDragEnd={onDragEnd}
            onDragOver={handleDragOver}
            onDrop={(e) => onDrop(e, location, row, col)}
            onClick={(e) => {
              if (!isDragging) {
                onSlotClick(location, row, col);
              }
            }}
            className={`location-slot aspect-square border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center transition-all ${
              boat 
                ? `status-${boat.status} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105` 
                : isDragging 
                  ? 'border-blue-400 bg-blue-50 cursor-pointer' 
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
            }`}
          >
            {boat ? (
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
            ) : (
              <div className="text-slate-400 pointer-events-none">
                <div className="text-[clamp(1.25rem,2.5vw,2rem)] mb-0.5">+</div>
                <p className="text-[clamp(0.6rem,1.2vw,0.75rem)] leading-tight">{row + 1}-{col + 1}</p>
              </div>
            )}
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
        const boatId = location.boats[slotId];
        const boat = boats.find(b => b.id === boatId);

        return (
          <div
            key={slotId}
            draggable={!!boat}
            title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
            onDragStart={(e) => {
              if (boat) {
                onDragStart(e, boat, location, slotId);
              }
            }}
            onDragEnd={onDragEnd}
            onDragOver={handleDragOver}
            onDrop={(e) => onDrop(e, location, row, col)}
            onClick={(e) => {
              if (!isDragging) {
                onSlotClick(location, row, col);
              }
            }}
            className={`location-slot aspect-square border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center transition-all ${
              boat 
                ? `status-${boat.status} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105` 
                : isDragging 
                  ? 'border-blue-400 bg-blue-50 cursor-pointer' 
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
            }`}
          >
            {boat ? (
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
            ) : (
              <div className="text-slate-400 pointer-events-none">
                <div className="text-[clamp(1.25rem,2.5vw,2rem)] mb-0.5">+</div>
                <p className="text-[clamp(0.6rem,1.2vw,0.75rem)] leading-tight">{row + 1}-{col + 1}</p>
              </div>
            )}
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
            <button
              onClick={onMaximize}
              className="p-1.5 hover:bg-white rounded-lg transition-colors"
              title="Expand view"
            >
              <Maximize2 className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 hover:bg-white rounded-lg transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-600 capitalize">
            {location.type} • {location.rows} × {location.columns}
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

// Maximized Location Modal - Full screen view of a single location
function MaximizedLocationModal({ location, boats, onSlotClick, onDragStart, onDrop, onDragEnd, isDragging, onClose }) {
  const isUShape = location.layout === 'u-shaped';
  const totalSlots = isUShape 
    ? (location.rows * 2) + location.columns 
    : location.rows * location.columns;
  const occupiedSlots = Object.keys(location.boats || {}).length;
  const occupancyRate = Math.round((occupiedSlots / totalSlots) * 100);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const renderSlot = (row, col, isPerimeter = true) => {
    if (!isPerimeter && isUShape) {
      return <div key={`${row}-${col}`} className="aspect-square"></div>;
    }

    const slotId = `${row}-${col}`;
    const boatId = location.boats?.[slotId];
    const boat = boats.find(b => b.id === boatId);

    return (
      <div
        key={slotId}
        draggable={!!boat}
        title={boat ? 'Drag to move • Click for details' : 'Click to assign boat'}
        onDragStart={(e) => {
          if (boat) {
            onDragStart(e, boat, location, slotId);
          }
        }}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => onDrop(e, location, row, col)}
        onClick={(e) => {
          if (!isDragging) {
            onSlotClick(location, row, col);
          }
        }}
        className={`aspect-square border-2 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all ${
          boat 
            ? `status-${boat.status} border-transparent shadow-md cursor-grab active:cursor-grabbing hover:scale-[1.02]` 
            : isDragging 
              ? 'border-blue-400 bg-blue-50 cursor-pointer' 
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
        }`}
      >
        {boat ? (
          <>
            <p className="text-white font-bold text-lg leading-tight pointer-events-none truncate w-full">{boat.owner}</p>
            {boat.workOrderNumber && (
              <p className="text-white text-sm font-mono font-semibold pointer-events-none truncate w-full mt-1">
                WO: {boat.workOrderNumber}
              </p>
            )}
            <div className="flex gap-1.5 mt-2 pointer-events-none">
              <Wrench className={`w-4 h-4 ${boat.mechanicalsComplete ? 'text-white' : 'text-white/30'}`} />
              <Sparkles className={`w-4 h-4 ${boat.cleanComplete ? 'text-white' : 'text-white/30'}`} />
              <Layers className={`w-4 h-4 ${boat.fiberglassComplete ? 'text-white' : 'text-white/30'}`} />
              <Shield className={`w-4 h-4 ${boat.warrantyComplete ? 'text-white' : 'text-white/30'}`} />
            </div>
            <p className="text-white text-xs opacity-75 pointer-events-none truncate w-full mt-1">{boat.name}</p>
          </>
        ) : (
          <div className="text-slate-400 pointer-events-none">
            <div className="text-3xl mb-1">+</div>
            <p className="text-sm">{row + 1}-{col + 1}</p>
          </div>
        )}
      </div>
    );
  };

  const renderGrid = () => {
    const slots = [];
    for (let row = 0; row < location.rows; row++) {
      for (let col = 0; col < location.columns; col++) {
        if (isUShape) {
          const isLeftEdge = col === 0;
          const isRightEdge = col === location.columns - 1;
          const isBottomRow = row === location.rows - 1;
          const isPerimeter = isLeftEdge || isRightEdge || isBottomRow;
          slots.push(renderSlot(row, col, isPerimeter));
        } else {
          slots.push(renderSlot(row, col));
        }
      }
    }
    return slots;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] max-h-[95vh] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 md:p-6 bg-gradient-to-r from-slate-700 to-slate-800 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl md:text-2xl font-bold text-white">{location.name}</h3>
              <p className="text-slate-300 text-sm mt-1">
                {location.type?.replace('-', ' ')} • {occupiedSlots}/{totalSlots} slots ({occupancyRate}%)
                {isUShape && ' • U-Shaped Layout'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              title="Close"
            >
              <Minimize2 className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-100">
          <div className="inline-block min-w-full">
            <div 
              className="grid gap-3" 
              style={{ 
                gridTemplateColumns: `repeat(${location.columns}, minmax(120px, 150px))` 
              }}
            >
              {renderGrid()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl flex-shrink-0">
          <p className="text-sm text-slate-500 text-center">
            💡 Click slots to assign boats • Drag boats to move them
          </p>
        </div>
      </div>
    </div>
  );
}

// Pool Location Component - flexible container without grid slots
function PoolLocation({ location, boats, onEdit, onDelete, onDragStart, onDrop, onDragEnd, isDragging, onBoatClick, onAddBoat }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get boats in this pool
  const poolBoatIds = location.pool_boats || location.poolBoats || [];
  const poolBoats = poolBoatIds.map(id => boats.find(b => b.id === id)).filter(Boolean);
  
  // Filter by search
  const filteredBoats = poolBoats.filter(boat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return boat.name?.toLowerCase().includes(query) ||
           boat.model?.toLowerCase().includes(query) ||
           boat.owner?.toLowerCase().includes(query);
  });

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnPool = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop(location.id, 'pool');
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden border-2 border-slate-200 hover:border-teal-400 transition-colors">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-teal-500 to-teal-600">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-white text-lg">{location.name}</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="p-1.5 hover:bg-white/20 rounded transition-colors"
              title="Edit location"
            >
              <Pencil className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-white/20 rounded transition-colors"
              title="Delete location"
            >
              <Trash2 className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <p className="text-teal-100">Pool • Flexible Layout</p>
          <p className="text-white font-medium">{poolBoats.length} boat{poolBoats.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      {poolBoats.length > 5 && (
        <div className="p-3 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search boats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      )}

      {/* Drop Zone / Boat List */}
      <div 
        className={`p-4 min-h-[150px] ${isDragging ? 'bg-teal-50 border-2 border-dashed border-teal-400' : 'bg-slate-50'}`}
        onDragOver={handleDragOver}
        onDrop={handleDropOnPool}
      >
        {filteredBoats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <Package className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">
              {isDragging ? 'Drop boat here' : poolBoats.length === 0 ? 'No boats in pool' : 'No matches'}
            </p>
            {!isDragging && poolBoats.length === 0 && (
              <button
                onClick={onAddBoat}
                className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                + Add boat
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredBoats.map(boat => (
              <div
                key={boat.id}
                draggable
                onDragStart={(e) => onDragStart(e, boat, location.name)}
                onDragEnd={onDragEnd}
                onClick={() => onBoatClick(boat)}
                className="p-3 bg-white rounded-lg border border-slate-200 hover:border-teal-400 hover:shadow-md cursor-pointer transition-all"
              >
                <p className="font-semibold text-slate-900 text-sm truncate">{boat.owner}</p>
                <p className="text-xs text-slate-600 truncate">{boat.name}</p>
                {boat.workOrderNumber && (
                  <p className="text-xs text-slate-500 font-mono mt-1">WO: {boat.workOrderNumber}</p>
                )}
                <div className="flex gap-1 mt-2">
                  <Wrench className={`w-3 h-3 ${boat.mechanicalsComplete ? 'text-green-500' : 'text-slate-300'}`} />
                  <Sparkles className={`w-3 h-3 ${boat.cleanComplete ? 'text-green-500' : 'text-slate-300'}`} />
                  <Layers className={`w-3 h-3 ${boat.fiberglassComplete ? 'text-green-500' : 'text-slate-300'}`} />
                  <Shield className={`w-3 h-3 ${boat.warrantyComplete ? 'text-green-500' : 'text-slate-300'}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-100 border-t border-slate-200">
        <p className="text-xs text-slate-500 text-center">
          💡 Drag boats in or out of this pool
        </p>
      </div>
    </div>
  );
}

function BoatAssignmentModal({ boats, allBoats, onAssign, onCancel, onCreateBoat, onImportBoat, locations }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateBoat, setShowCreateBoat] = useState(false);
  const [showImportBoat, setShowImportBoat] = useState(false);

  const filteredBoats = boats.filter(boat => {
    const matchesSearch = boat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.owner.toLowerCase().includes(searchQuery.toLowerCase());
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
              placeholder="Search boats by name, model, or owner..."
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
                      {boat.location && (
                        <p className="text-xs text-orange-600 mt-1">
                          Currently at: {boat.location} ({boat.slot})
                        </p>
                      )}
                    </div>
                    <div className={`px-2.5 py-1 status-${boat.status} rounded-full text-xs font-medium text-white flex-shrink-0`}>
                      {boat.status.replace(/-/g, ' ').substring(0, 12)}
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

function BoatDetailsModal({ boat, onRemove, onClose, onUpdateBoat, onUpdateLocations, locations = [], onMoveBoat }) {
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedMoveLocation, setSelectedMoveLocation] = useState(null);
  const [selectedMoveSlot, setSelectedMoveSlot] = useState(null);
  
  const statusLabels = {
    'needs-approval': 'Needs Approval',
    'needs-parts': 'Needs Parts',
    'parts-kit-pulled': 'Parts Kit Pulled',
    'on-deck': 'On Deck',
    'all-work-complete': 'All Work Complete',
    'archived': 'Released'
  };

  // Sales Status labels for inventory boats
  const salesStatusLabels = {
    'HA': 'On Hand Available',
    'HS': 'On Hand Sold',
    'OA': 'On Order Available',
    'OS': 'On Order Sold',
    'FA': 'Future Available',
    'FS': 'Future Sold',
    'S': 'Sold',
    'R': 'Reserved',
    'FP': 'Floor Planned'
  };

  const allWorkPhasesComplete = boat.mechanicalsComplete && boat.cleanComplete && boat.fiberglassComplete && boat.warrantyComplete;
  const isArchived = boat.status === 'archived';
  const isInventory = boat.isInventory === true; // Check if this is an inventory boat

  const handleWorkPhaseToggle = (phase) => {
    if (isArchived) return; // Can't modify archived boats
    
    const updatedBoat = { ...boat, [phase]: !boat[phase] };
    
    // If unchecking a phase and status is complete, change status
    if (!updatedBoat[phase] && boat.status === 'all-work-complete') {
      updatedBoat.status = 'on-deck';
    }
    
    onUpdateBoat(updatedBoat);
  };

  const handleStatusUpdate = (newStatus) => {
    if (isArchived) return; // Can't modify archived boats
    
    // Validate: can't set to complete without all phases done
    if (newStatus === 'all-work-complete' && !allWorkPhasesComplete) {
      alert('Cannot mark as complete! All work phases (Mechanicals, Clean, Fiberglass, Warranty) must be completed first.');
      return;
    }
    
    const updatedBoat = { ...boat, status: newStatus };
    onUpdateBoat(updatedBoat);
  };

  const handleReleaseBoat = async () => {
    if (confirm(`Release ${boat.name} back to owner?\n\nThis will archive the boat and remove it from active management. The boat will be moved to the archived boats list.`)) {
      // If boat is in a location, remove it first
      if (boat.currentLocation && boat.currentSlot) {
        await onRemove(); // This removes from location but doesn't close modal
      }
      
      // Archive the boat
      const updatedBoat = { 
        ...boat, 
        status: 'archived',
        archivedDate: new Date().toISOString(),
        location: null,
        slot: null
      };
      onUpdateBoat(updatedBoat);
      
      // Close modal
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col animate-slide-in">
        {/* Fixed Header */}
        <div className={`status-${boat.status} p-4 md:p-6 rounded-t-xl flex-shrink-0`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg md:text-xl font-bold text-white mb-0.5 truncate">{boat.name}</h3>
                <p className="text-xs md:text-sm text-white/90 truncate">{boat.model} • {boat.qrCode}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 md:p-6 space-y-4 md:space-y-5 overflow-y-auto flex-1">
          <div>
            <h4 className="text-base md:text-lg font-bold text-slate-900 mb-3">Boat Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Owner</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{boat.owner}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Status</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{statusLabels[boat.status]}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg col-span-1 sm:col-span-2">
                <p className="text-xs text-slate-600 mb-0.5">Work Order Number</p>
                <input
                  type="text"
                  value={boat.workOrderNumber || ''}
                  onChange={(e) => onUpdateBoat({ ...boat, workOrderNumber: e.target.value })}
                  disabled={isArchived}
                  className={`w-full text-sm font-semibold text-slate-900 bg-transparent border-0 border-b-2 ${
                    isArchived ? 'border-slate-200' : 'border-slate-300 focus:border-blue-500'
                  } px-0 py-1 focus:outline-none focus:ring-0`}
                  placeholder={isArchived ? 'N/A' : 'Enter work order number'}
                />
              </div>
              
              {/* Sales Status - Only shown for inventory boats */}
              {isInventory && boat.salesStatus && (
                <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg col-span-1 sm:col-span-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <svg className="w-3 h-3 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <p className="text-xs text-blue-700 font-medium">Sales Status (Inventory)</p>
                  </div>
                  <p className="text-sm font-bold text-blue-900">
                    {boat.salesStatus} - {salesStatusLabels[boat.salesStatus] || boat.salesStatus}
                  </p>
                </div>
              )}
              
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Current Location</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {boat.location || 'Unassigned'}
                  </p>
                  {!isArchived && locations.length > 0 && (
                    <button
                      onClick={() => setShowLocationPicker(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                    >
                      {boat.location ? 'Move...' : 'Assign...'}
                    </button>
                  )}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Slot</p>
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {boat.slot === 'pool' ? 'Pool' : boat.slot || 'N/A'}
                </p>
              </div>
              
              {/* NFC Tag Management */}
              <div className="p-3 bg-purple-50 border-2 border-purple-200 rounded-lg col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <p className="text-xs text-purple-700 font-medium">NFC Tag</p>
                  </div>
                  {boat.nfcTag && !isArchived && (
                    <button
                      onClick={() => {
                        if (confirm('Release this NFC tag? It can be reassigned to another boat.')) {
                          onUpdateBoat({ ...boat, nfcTag: null });
                        }
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium underline"
                    >
                      Release Tag
                    </button>
                  )}
                </div>
                {boat.nfcTag ? (
                  <p className="text-sm font-bold text-purple-900 font-mono">{boat.nfcTag}</p>
                ) : (
                  <p className="text-xs text-purple-600">
                    No NFC tag assigned • Tag will auto-assign on first scan
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-base md:text-lg font-bold text-slate-900 mb-1">Work Phases</h4>
            <p className="text-xs text-slate-500 mb-3">Check phases that are complete or not needed. All phases must be verified and billed before marking status as complete.</p>
            <div className="space-y-2">
              <button
                onClick={() => handleWorkPhaseToggle('mechanicalsComplete')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                    boat.mechanicalsComplete ? 'bg-green-100' : 'bg-slate-200'
                  }`}>
                    {boat.mechanicalsComplete ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <X className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-900 truncate">Mechanicals</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  boat.mechanicalsComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {boat.mechanicalsComplete ? '✓' : '○'}
                </span>
              </button>

              <button
                onClick={() => handleWorkPhaseToggle('cleanComplete')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                    boat.cleanComplete ? 'bg-green-100' : 'bg-slate-200'
                  }`}>
                    {boat.cleanComplete ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <X className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-900 truncate">Clean</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  boat.cleanComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {boat.cleanComplete ? '✓' : '○'}
                </span>
              </button>

              <button
                onClick={() => handleWorkPhaseToggle('fiberglassComplete')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                    boat.fiberglassComplete ? 'bg-green-100' : 'bg-slate-200'
                  }`}>
                    {boat.fiberglassComplete ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <X className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-900 truncate">Fiberglass</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  boat.fiberglassComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {boat.fiberglassComplete ? '✓' : '○'}
                </span>
              </button>

              <button
                onClick={() => handleWorkPhaseToggle('warrantyComplete')}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                    boat.warrantyComplete ? 'bg-green-100' : 'bg-slate-200'
                  }`}>
                    {boat.warrantyComplete ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <X className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-900 truncate">Warranty</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  boat.warrantyComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {boat.warrantyComplete ? '✓' : '○'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-bold text-slate-900 mb-4">Update Status</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatusButton
                status="needs-approval"
                label="Needs Approval"
                active={boat.status === 'needs-approval'}
                onClick={() => handleStatusUpdate('needs-approval')}
              />
              <StatusButton
                status="needs-parts"
                label="Needs Parts"
                active={boat.status === 'needs-parts'}
                onClick={() => handleStatusUpdate('needs-parts')}
              />
              <StatusButton
                status="parts-kit-pulled"
                label="Parts Pulled"
                active={boat.status === 'parts-kit-pulled'}
                onClick={() => handleStatusUpdate('parts-kit-pulled')}
              />
              <StatusButton
                status="on-deck"
                label="On Deck"
                active={boat.status === 'on-deck'}
                onClick={() => handleStatusUpdate('on-deck')}
              />
              <button
                onClick={() => handleStatusUpdate('all-work-complete')}
                disabled={!allWorkPhasesComplete}
                className={`p-4 rounded-lg border-2 transition-all ${
                  boat.status === 'all-work-complete'
                    ? 'status-all-work-complete border-transparent text-white font-semibold shadow-md' 
                    : allWorkPhasesComplete
                      ? 'border-slate-300 bg-white hover:border-slate-400 text-slate-700'
                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={!allWorkPhasesComplete ? 'Complete all work phases first' : ''}
              >
                Complete
              </button>
            </div>
            {!allWorkPhasesComplete && (
              <p className="text-sm text-orange-600 mt-2">
                ⚠️ All work phases must be completed before marking as complete
              </p>
            )}
          </div>

          {isArchived ? (
            /* Archived Boat View - Read Only */
            <div className="space-y-4">
              {boat.archivedDate && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Released On</p>
                  <p className="font-semibold text-slate-900">
                    {new Date(boat.archivedDate).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Active Boat View - Editable */
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={handleReleaseBoat}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-lg transition-all shadow-md"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Release Boat to Owner
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onRemove}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  Remove from Location
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col animate-slide-in">
            <div className="p-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-bold text-slate-900">
                  {selectedMoveLocation ? 'Select Slot' : 'Move to Location'}
                </h4>
                <button
                  onClick={() => {
                    setShowLocationPicker(false);
                    setSelectedMoveLocation(null);
                    setSelectedMoveSlot(null);
                  }}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              {!selectedMoveLocation ? (
                // Step 1: Select location
                <div className="space-y-2">
                  {/* Unassigned option */}
                  {boat.location && (
                    <button
                      onClick={async () => {
                        if (onMoveBoat) {
                          await onMoveBoat(boat, null, null);
                          setShowLocationPicker(false);
                        }
                      }}
                      className="w-full p-3 text-left rounded-lg border-2 border-slate-200 hover:border-red-300 hover:bg-red-50 transition-colors"
                    >
                      <p className="font-semibold text-slate-900">Unassigned</p>
                      <p className="text-xs text-slate-500">Remove from current location</p>
                    </button>
                  )}
                  
                  {/* Pool locations */}
                  {locations.filter(l => l.type === 'pool').map(loc => (
                    <button
                      key={loc.id}
                      onClick={async () => {
                        if (onMoveBoat) {
                          await onMoveBoat(boat, loc, 'pool');
                          setShowLocationPicker(false);
                        }
                      }}
                      className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                        boat.location === loc.name
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-teal-500" />
                        <p className="font-semibold text-slate-900">{loc.name}</p>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Pool • {(loc.pool_boats || loc.poolBoats || []).length} boats
                      </p>
                    </button>
                  ))}
                  
                  {/* Grid locations */}
                  {locations.filter(l => l.type !== 'pool').map(loc => {
                    const totalSlots = loc.layout === 'u-shaped' 
                      ? (loc.rows * 2) + loc.columns 
                      : loc.rows * loc.columns;
                    const occupiedSlots = Object.keys(loc.boats || {}).length;
                    const availableSlots = totalSlots - occupiedSlots;
                    
                    return (
                      <button
                        key={loc.id}
                        onClick={() => setSelectedMoveLocation(loc)}
                        disabled={availableSlots === 0 && boat.location !== loc.name}
                        className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                          boat.location === loc.name
                            ? 'border-blue-500 bg-blue-50'
                            : availableSlots === 0
                            ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            loc.type === 'rack-building' ? 'bg-blue-500' :
                            loc.type === 'parking-lot' ? 'bg-purple-500' : 'bg-orange-500'
                          }`} />
                          <p className="font-semibold text-slate-900">{loc.name}</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {loc.type.replace('-', ' ')} • {availableSlots} slots available
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Step 2: Select slot for grid location
                <div>
                  <button
                    onClick={() => setSelectedMoveLocation(null)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-3"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back to locations
                  </button>
                  <p className="text-sm text-slate-600 mb-3">
                    Select a slot in <strong>{selectedMoveLocation.name}</strong>:
                  </p>
                  <div 
                    className="grid gap-1.5 max-h-[300px] overflow-y-auto"
                    style={{ 
                      gridTemplateColumns: `repeat(${Math.min(selectedMoveLocation.columns, 6)}, minmax(50px, 1fr))` 
                    }}
                  >
                    {Array.from({ length: selectedMoveLocation.rows }).map((_, row) =>
                      Array.from({ length: selectedMoveLocation.columns }).map((_, col) => {
                        const slotId = `${row}-${col}`;
                        const isOccupied = selectedMoveLocation.boats?.[slotId];
                        const isCurrentBoat = isOccupied === boat.id;
                        const displaySlot = `${row + 1}-${col + 1}`;
                        
                        // Skip non-perimeter slots for U-shaped
                        if (selectedMoveLocation.layout === 'u-shaped') {
                          const isLeftEdge = col === 0;
                          const isRightEdge = col === selectedMoveLocation.columns - 1;
                          const isBottomRow = row === selectedMoveLocation.rows - 1;
                          if (!isLeftEdge && !isRightEdge && !isBottomRow) {
                            return null;
                          }
                        }
                        
                        return (
                          <button
                            key={slotId}
                            onClick={async () => {
                              if (!isOccupied && onMoveBoat) {
                                await onMoveBoat(boat, selectedMoveLocation, slotId);
                                setShowLocationPicker(false);
                                setSelectedMoveLocation(null);
                              }
                            }}
                            disabled={isOccupied && !isCurrentBoat}
                            className={`p-2 text-xs font-medium rounded transition-colors ${
                              isCurrentBoat
                                ? 'bg-blue-500 text-white'
                                : isOccupied
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-blue-100 text-slate-700'
                            }`}
                          >
                            {displaySlot}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditLocationModal({ location, onSave, onCancel }) {
  const [formData, setFormData] = useState(location || {
    name: '',
    type: 'rack-building',
    layout: 'grid',
    rows: 4,
    columns: 8
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Clean up the data before saving
    const dataToSave = {
      name: formData.name,
      type: formData.type,
      layout: formData.type === 'pool' ? 'grid' : (formData.layout || 'grid'),
      rows: formData.type === 'pool' ? 1 : formData.rows,
      columns: formData.type === 'pool' ? 1 : formData.columns,
    };
    
    // Preserve id if editing existing location
    if (formData.id) {
      dataToSave.id = formData.id;
    }
    
    // Preserve boats data if it exists
    if (formData.boats) {
      dataToSave.boats = formData.boats;
    }
    
    onSave(dataToSave);
  };

  const totalSlots = formData.layout === 'u-shaped' 
    ? (formData.rows * 2) + formData.columns
    : formData.rows * formData.columns;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">{location ? 'Edit Location' : 'Add New Location'}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Location Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Rack Building A"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) => {
                const newType = e.target.value;
                setFormData({ 
                  ...formData, 
                  type: newType
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="rack-building">Rack Building</option>
              <option value="parking-lot">Parking Lot</option>
              <option value="shop">Shop</option>
              <option value="pool">Pool (No Grid)</option>
            </select>
            {formData.type === 'pool' && (
              <p className="text-xs text-slate-500 mt-1">
                A flexible container for boats without assigned slots. Great for boat shows, transit, or temporary staging.
              </p>
            )}
          </div>

          {formData.type !== 'pool' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Layout Style</label>
                <select
                  value={formData.layout || 'grid'}
                  onChange={(e) => setFormData({ ...formData, layout: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="grid">Grid (Full)</option>
                  <option value="u-shaped">U-Shaped (Perimeter)</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {formData.layout === 'u-shaped' 
                    ? 'Boats placed along three edges (left, right, bottom)'
                    : 'Boats fill entire rectangular area'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {formData.layout === 'u-shaped' ? 'Unit Depth' : 'Rows'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={formData.rows}
                    onChange={(e) => setFormData({ ...formData, rows: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {formData.layout === 'u-shaped' && (
                    <p className="text-xs text-slate-500 mt-1">Height of U</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {formData.layout === 'u-shaped' ? 'Unit Width' : 'Columns'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={formData.columns}
                    onChange={(e) => setFormData({ ...formData, columns: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {formData.layout === 'u-shaped' && (
                    <p className="text-xs text-slate-500 mt-1">Width of U</p>
                  )}
                </div>
              </div>

              {/* Preview */}
              <div className="border-2 border-slate-200 rounded-lg p-3 bg-slate-50">
                <p className="text-xs font-medium text-slate-700 mb-2">Preview:</p>
                <div className="text-xs text-slate-600 space-y-1">
                  {formData.layout === 'u-shaped' ? (
                    <>
                      <p>• Left side: {formData.rows} slots</p>
                      <p>• Bottom: {formData.columns} slots</p>
                      <p>• Right side: {formData.rows} slots</p>
                      <p className="font-semibold mt-2 pt-2 border-t border-slate-300">Total: {totalSlots} slots</p>
                    </>
                  ) : (
                    <>
                      <p>• Grid: {formData.rows} rows × {formData.columns} columns</p>
                      <p className="font-semibold mt-2 pt-2 border-t border-slate-300">Total: {totalSlots} slots</p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              {location ? 'Save Changes' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScanView({ boats, locations, onUpdateBoats, onUpdateLocations }) {
  const [scannedCode, setScannedCode] = useState('');
  const [foundBoat, setFoundBoat] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [showAssignTag, setShowAssignTag] = useState(false);
  const [scannedTag, setScannedTag] = useState('');

  // NFC URL parameter detection
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const nfcId = urlParams.get('id');
    
    if (nfcId) {
      // Clean URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
      
      // Check if this tag is already assigned to a boat
      const boatWithTag = boats.find(b => b.nfcTag === nfcId);
      
      if (boatWithTag) {
        // Tag is assigned - load the boat
        setScannedCode(nfcId);
        setFoundBoat(boatWithTag);
      } else {
        // Tag is not assigned - show assignment modal
        setScannedTag(nfcId);
        setShowAssignTag(true);
      }
    }
  }, [boats]);

  const handleScan = () => {
    const boat = boats.find(b => b.qrCode === scannedCode || b.nfcTag === scannedCode);
    if (boat) {
      setFoundBoat(boat);
    } else {
      alert('No boat found with this code. If this is an NFC tag, you need to assign it to a boat first.');
      setScannedCode('');
    }
  };

  const handleAssignTag = (boatId) => {
    const boat = boats.find(b => b.id === boatId);
    if (!boat) return;

    // Check if tag is already assigned to another boat
    const existingBoat = boats.find(b => b.nfcTag === scannedTag);
    if (existingBoat && existingBoat.id !== boatId) {
      alert(`This tag is already assigned to ${existingBoat.name}. Please release it first.`);
      return;
    }

    // Assign tag to boat
    const updatedBoat = { ...boat, nfcTag: scannedTag };
    onUpdateBoats(boats.map(b => b.id === boatId ? updatedBoat : b));
    
    // Load the boat
    setFoundBoat(updatedBoat);
    setShowAssignTag(false);
    setScannedTag('');
  };

  const handleLocationMove = async () => {
    if (!foundBoat || !selectedLocation) {
      alert('Please select a location');
      return;
    }

    const location = locations.find(l => l.name === selectedLocation);
    if (!location) return;

    // Remove from old location if exists
    if (foundBoat.location) {
      const oldLocation = locations.find(l => l.name === foundBoat.location);
      if (oldLocation && foundBoat.slot) {
        const updatedOldLocation = {
          ...oldLocation,
          boats: { ...oldLocation.boats }
        };
        delete updatedOldLocation.boats[foundBoat.slot];
        await onUpdateLocations(locations.map(l => l.id === oldLocation.id ? updatedOldLocation : l));
      }
    }

    // Assign to new location
    let finalSlot = selectedSlot;
    
    // If no slot selected, find first available
    if (!finalSlot) {
      const isUShape = location.layout === 'u-shaped';
      let foundSlot = null;
      
      for (let row = 0; row < location.rows && !foundSlot; row++) {
        for (let col = 0; col < location.columns && !foundSlot; col++) {
          const slotId = `${row}-${col}`;
          
          // Check if slot is valid for U-shaped
          if (isUShape) {
            const isLeftEdge = col === 0;
            const isRightEdge = col === location.columns - 1;
            const isBottomRow = row === location.rows - 1;
            const isPerimeter = isLeftEdge || isRightEdge || isBottomRow;
            
            if (!isPerimeter) continue;
          }
          
          if (!location.boats[slotId]) {
            foundSlot = slotId;
          }
        }
      }
      
      if (foundSlot) {
        finalSlot = foundSlot;
      } else {
        alert('No available slots in this location');
        return;
      }
    }

    // Update location with boat
    const updatedLocation = {
      ...location,
      boats: {
        ...location.boats,
        [finalSlot]: foundBoat.id
      }
    };

    // Update boat with new location
    const updatedBoat = {
      ...foundBoat,
      location: location.name,
      slot: finalSlot
    };

    await onUpdateLocations(locations.map(l => l.id === location.id ? updatedLocation : l));
    onUpdateBoats(boats.map(b => b.id === foundBoat.id ? updatedBoat : b));

    // Show success and reset
    alert(`✓ ${foundBoat.name} moved to ${location.name} (${finalSlot})`);
    handleReset();
  };

  const handleReset = () => {
    setScannedCode('');
    setFoundBoat(null);
    setSelectedLocation('');
    setSelectedSlot('');
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Scan & Move Boats</h2>
        <p className="text-slate-600">For boat movers: Tap NFC tag and update location</p>
      </div>

      {/* NFC Tag Assignment Modal */}
      {showAssignTag && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-slide-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Assign NFC Tag to Boat</h3>
                <p className="text-sm text-slate-600 mt-1">Tag ID: <span className="font-mono font-bold text-purple-600">{scannedTag}</span></p>
              </div>
              <button
                onClick={() => {
                  setShowAssignTag(false);
                  setScannedTag('');
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-purple-800">
                <strong>First-time tag detected!</strong> This NFC tag hasn't been assigned to a boat yet. 
                Select which boat this tag belongs to.
              </p>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {boats.filter(b => b.status !== 'archived').map(boat => (
                <button
                  key={boat.id}
                  onClick={() => handleAssignTag(boat.id)}
                  className="w-full p-4 border-2 border-slate-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{boat.name}</p>
                      <p className="text-sm text-slate-600">{boat.model} • {boat.owner}</p>
                      {boat.nfcTag && (
                        <p className="text-xs text-orange-600 mt-1">
                          ⚠️ Already has tag: {boat.nfcTag}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!foundBoat ? (
        <div className="bg-white rounded-xl shadow-md p-8 border border-slate-200">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Tap NFC Tag on Boat</h3>
              <p className="text-slate-600">Tap your phone to the NFC tag on the boat's transom</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>📱 How it works:</strong> Just tap your iPhone or Android phone to the NFC tag. 
                  Your phone will automatically open this page with the boat loaded.
                </p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">Or enter manually</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">NFC Tag ID</label>
                <input
                  type="text"
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-lg font-mono uppercase"
                  placeholder="BBG-0001"
                  autoFocus
                />
              </div>

              <button
                onClick={handleScan}
                disabled={!scannedCode}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors shadow-md"
              >
                Find Boat
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">Quick Access (Testing)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-lg">
                {boats.filter(b => b.status !== 'archived' && b.nfcTag).map(boat => (
                  <button
                    key={boat.id}
                    onClick={() => {
                      setScannedCode(boat.nfcTag);
                      setTimeout(() => handleScan(), 100);
                    }}
                    className="p-2 bg-white border border-slate-200 rounded hover:border-purple-500 hover:bg-purple-50 transition-colors text-left"
                  >
                    <p className="font-mono text-sm font-semibold text-purple-900">{boat.nfcTag}</p>
                    <p className="text-xs text-slate-600 truncate">{boat.name}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <div className={`status-${foundBoat.status} p-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                  <Package className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">{foundBoat.name}</h3>
                  <p className="text-white/90">
                    {foundBoat.model}
                    {foundBoat.nfcTag && (
                      <> • <span className="font-mono">{foundBoat.nfcTag}</span></>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="p-3 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h4 className="text-lg font-bold text-slate-900 mb-4">Current Location</h4>
              <div className="p-4 bg-slate-50 rounded-lg border-2 border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Currently At</p>
                <p className="text-xl font-bold text-slate-900">
                  {foundBoat.location ? (
                    <>{foundBoat.location} <span className="text-slate-600">• Slot {foundBoat.slot}</span></>
                  ) : (
                    <span className="text-orange-600">Not Assigned</span>
                  )}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-bold text-slate-900 mb-4">Move To New Location</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select Location</label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => {
                      setSelectedLocation(e.target.value);
                      setSelectedSlot(''); // Reset slot when location changes
                    }}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                  >
                    <option value="">Choose a location...</option>
                    {locations.map(loc => {
                      const occupiedSlots = Object.keys(loc.boats).length;
                      const totalSlots = loc.layout === 'u-shaped' 
                        ? (loc.rows * 2) + loc.columns 
                        : loc.rows * loc.columns;
                      const available = totalSlots - occupiedSlots;
                      
                      return (
                        <option key={loc.id} value={loc.name}>
                          {loc.name} ({available} slots available)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedLocation && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Tip:</strong> Leave slot empty to auto-assign to first available slot, or you can assign in the Locations tab later.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleLocationMove}
                  disabled={!selectedLocation}
                  className="w-full px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg transition-colors shadow-md"
                >
                  ✓ Confirm Move to {selectedLocation || 'Location'}
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Boat Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-600">Owner</p>
                  <p className="font-semibold text-slate-900">{foundBoat.owner}</p>
                </div>
                <div>
                  <p className="text-slate-600">Status</p>
                  <p className="font-semibold text-slate-900 capitalize">{foundBoat.status.replace(/-/g, ' ')}</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
            >
              Scan Another Boat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusButton({ status, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all ${
        active 
          ? `status-${status} border-transparent text-white font-semibold shadow-md` 
          : 'border-slate-300 bg-white hover:border-slate-400 text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

function WorkPhaseToggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
      <span className="font-medium text-slate-900">{label}</span>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-14 h-7 bg-slate-300 rounded-full peer peer-checked:bg-green-500 transition-colors"></div>
        <div className={`absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-7' : ''}`}></div>
      </div>
    </label>
  );
}

/**
 * MY VIEW EDITOR COMPONENT
 * ========================
 * 
 * Allows users to customize their location view by:
 * - Selecting which locations to show
 * - Reordering locations via drag and drop
 * - Preferences are saved per user
 */
function MyViewEditor({ locations, boats, userPreferences, currentUser, onSavePreferences, onUpdateLocations, onUpdateBoats }) {
  const [selectedLocations, setSelectedLocations] = useState(
    userPreferences.selectedLocations || locations.map(l => l.id)
  );
  const [locationOrder, setLocationOrder] = useState(
    userPreferences.locationOrder || locations.map(l => l.id)
  );
  const [draggedItem, setDraggedItem] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  
  // Drag and drop state for boats
  const [draggingBoat, setDraggingBoat] = useState(null);
  const [draggingFrom, setDraggingFrom] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Boat assignment modal state
  const [showBoatAssignModal, setShowBoatAssignModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const mouseYRef = useRef(0);

  // Track mouse position continuously
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseYRef.current = e.clientY;
    };
    
    const handleTouchMove = (e) => {
      if (e.touches?.[0]) {
        mouseYRef.current = e.touches[0].clientY;
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // Auto-scroll when dragging
  useEffect(() => {
    if (!isDragging) return;
    
    console.log('MyView auto-scroll started - isDragging:', isDragging);
    
    const interval = setInterval(() => {
      const mouseY = mouseYRef.current;
      const windowHeight = window.innerHeight;
      const threshold = 100;
      const speed = 15;
      
      console.log('MyView checking scroll - mouseY:', mouseY, 'windowHeight:', windowHeight);
      
      if (mouseY < threshold) {
        console.log('MyView scrolling UP');
        window.scrollBy({ top: -speed, behavior: 'auto' });
      } else if (mouseY > windowHeight - threshold) {
        console.log('MyView scrolling DOWN');
        window.scrollBy({ top: speed, behavior: 'auto' });
      }
    }, 16); // ~60fps
    
    return () => {
      console.log('MyView auto-scroll stopped');
      clearInterval(interval);
    };
  }, [isDragging]);

  // Update state when locations or preferences change
  useEffect(() => {
    if (userPreferences.selectedLocations) {
      setSelectedLocations(userPreferences.selectedLocations);
    } else if (locations.length > 0) {
      setSelectedLocations(locations.map(l => l.id));
    }
    
    if (userPreferences.locationOrder && userPreferences.locationOrder.length > 0) {
      // Make sure all current location IDs are in the order
      const existingIds = new Set(userPreferences.locationOrder);
      const allIds = [...userPreferences.locationOrder];
      
      // Add any new locations that aren't in the saved order
      locations.forEach(loc => {
        if (!existingIds.has(loc.id)) {
          allIds.push(loc.id);
        }
      });
      
      setLocationOrder(allIds);
    } else if (locations.length > 0) {
      setLocationOrder(locations.map(l => l.id));
    }
  }, [locations, userPreferences]);

  const handleToggleLocation = (locationId) => {
    const newSelected = selectedLocations.includes(locationId)
      ? selectedLocations.filter(id => id !== locationId)
      : [...selectedLocations, locationId];
    
    setSelectedLocations(newSelected);
    setHasChanges(true);
  };

  const handleDragStart = (e, locationId) => {
    setDraggedItem(locationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropLocationId) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === dropLocationId) return;

    const newOrder = [...locationOrder];
    const draggedIndex = newOrder.indexOf(draggedItem);
    const dropIndex = newOrder.indexOf(dropLocationId);

    // Remove dragged item
    newOrder.splice(draggedIndex, 1);
    // Insert at drop position
    newOrder.splice(dropIndex, 0, draggedItem);

    setLocationOrder(newOrder);
    setDraggedItem(null);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSavePreferences({
      selectedLocations,
      locationOrder
    });
    setHasChanges(false);
    setShowCustomizer(false); // Close customizer after saving
  };

  const handleReset = () => {
    const defaultSelected = locations.map(l => l.id);
    const defaultOrder = locations.map(l => l.id);
    setSelectedLocations(defaultSelected);
    setLocationOrder(defaultOrder);
    setHasChanges(true);
  };

  // Boat drag and drop handlers
  const handleBoatDragStart = (e, boat, location, slotId) => {
    e.stopPropagation(); // Prevent location drag
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', boat.id);
    setDraggingBoat(boat);
    setDraggingFrom({ location, slotId });
    setIsDragging(true);
  };

  const handleBoatDragEnd = () => {
    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsDragging(false);
  };

  const handleSlotClick = (location, row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats[slotId];
    
    if (boatId) {
      // Occupied slot - show boat details
      const boat = boats.find(b => b.id === boatId);
      if (boat) {
        setViewingBoat({ ...boat, currentLocation: location, currentSlot: slotId });
      }
    } else {
      // Empty slot - open assignment modal
      setSelectedLocation(location);
      setSelectedSlot({ row, col, slotId });
      setShowBoatAssignModal(true);
    }
  };

  // Create a new boat from the assignment modal and return it for immediate assignment
  const handleCreateBoatFromAssignModal = async (newBoatData) => {
    const newBoat = {
      ...newBoatData,
      id: `boat-${Date.now()}`,
      qrCode: `BBG-${Date.now().toString(36).toUpperCase()}`,
      status: newBoatData.status || 'needs-approval',
      mechanicalsComplete: false,
      cleanComplete: false,
      fiberglassComplete: false,
      warrantyComplete: false
    };
    
    const updatedBoats = [...boats, newBoat];
    await onUpdateBoats(updatedBoats);
    
    return newBoat;
  };

  // Import a boat from Dockmaster and return it for immediate assignment
  const handleImportBoatFromAssignModal = async (importedBoatData) => {
    const newBoat = {
      ...importedBoatData,
      id: `boat-${Date.now()}`,
      qrCode: importedBoatData.qrCode || `BBG-${Date.now().toString(36).toUpperCase()}`,
      status: importedBoatData.status || 'needs-approval',
      mechanicalsComplete: false,
      cleanComplete: false,
      fiberglassComplete: false,
      warrantyComplete: false
    };
    
    const updatedBoats = [...boats, newBoat];
    await onUpdateBoats(updatedBoats);
    
    return newBoat;
  };

  const handleAssignBoat = async (boatId) => {
    if (!selectedLocation || !selectedSlot || isProcessing) return;

    setIsProcessing(true);

    // Find the boat - could be in any location
    const boat = boats.find(b => b.id === boatId);
    if (!boat) {
      setIsProcessing(false);
      return;
    }

    let updatedLocations = [...locations];

    // Remove boat from old location if it has one
    if (boat.location) {
      const oldLocation = locations.find(l => l.name === boat.location);
      if (oldLocation && boat.slot) {
        const updatedOldLocation = {
          ...oldLocation,
          boats: { ...oldLocation.boats }
        };
        delete updatedOldLocation.boats[boat.slot];
        updatedLocations = updatedLocations.map(l => 
          l.id === oldLocation.id ? updatedOldLocation : l
        );
      }
    }

    // Add boat to new location
    const currentSelectedLocation = updatedLocations.find(l => l.id === selectedLocation.id);
    const updatedLocation = {
      ...currentSelectedLocation,
      boats: { ...currentSelectedLocation.boats, [selectedSlot.slotId]: boatId }
    };
    updatedLocations = updatedLocations.map(l => l.id === selectedLocation.id ? updatedLocation : l);

    // Update boat
    const updatedBoat = {
      ...boat,
      location: selectedLocation.name,
      slot: selectedSlot.slotId
    };
    const updatedBoats = boats.map(b => b.id === boatId ? updatedBoat : b);

    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(updatedBoats);
      setShowBoatAssignModal(false);
      setSelectedLocation(null);
      setSelectedSlot(null);
    } catch (error) {
      console.error('Error assigning boat:', error);
      alert('Failed to assign boat. Please try again.');
    }

    setIsProcessing(false);
  };

  const handleRemoveBoatFromLocation = async () => {
    if (!viewingBoat || !viewingBoat.currentLocation) return;

    const location = viewingBoat.currentLocation;
    const slotId = viewingBoat.currentSlot;

    // Remove from location
    const updatedLocation = {
      ...location,
      boats: { ...location.boats }
    };
    delete updatedLocation.boats[slotId];

    const updatedLocations = locations.map(l => l.id === location.id ? updatedLocation : l);

    // Update boat
    const updatedBoat = { ...viewingBoat, location: null, slot: null };
    const updatedBoats = boats.map(b => b.id === viewingBoat.id ? updatedBoat : b);

    await onUpdateLocations(updatedLocations);
    await onUpdateBoats(updatedBoats);
    setViewingBoat(null);
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    setIsProcessing(true);
    let updatedLocations = [...locations];
    
    // Remove from current location
    if (boat.location) {
      const currentLoc = locations.find(l => l.name === boat.location);
      if (currentLoc) {
        if (currentLoc.type === 'pool') {
          const poolBoats = currentLoc.pool_boats || currentLoc.poolBoats || [];
          const updatedLoc = {
            ...currentLoc,
            pool_boats: poolBoats.filter(id => id !== boat.id),
          };
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        } else {
          const updatedLoc = { ...currentLoc, boats: { ...currentLoc.boats } };
          const slotKey = Object.keys(updatedLoc.boats).find(k => updatedLoc.boats[k] === boat.id);
          if (slotKey) delete updatedLoc.boats[slotKey];
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        }
      }
    }
    
    // Add to new location
    let updatedBoat = { ...boat };
    if (targetLocation) {
      if (targetLocation.type === 'pool') {
        const poolBoats = targetLocation.pool_boats || targetLocation.poolBoats || [];
        const updatedLoc = {
          ...targetLocation,
          pool_boats: [...poolBoats, boat.id],
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = 'pool';
      } else {
        const currentTargetLoc = updatedLocations.find(l => l.id === targetLocation.id);
        const updatedLoc = {
          ...currentTargetLoc,
          boats: { ...currentTargetLoc.boats, [targetSlot]: boat.id }
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        const [row, col] = targetSlot.split('-').map(Number);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = `${row + 1}-${col + 1}`;
      }
    } else {
      updatedBoat.location = null;
      updatedBoat.slot = null;
    }
    
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(boats.map(b => b.id === boat.id ? updatedBoat : b));
      
      // Update viewing boat with new location info
      const newLocation = targetLocation ? updatedLocations.find(l => l.id === targetLocation.id) : null;
      setViewingBoat({
        ...updatedBoat,
        currentLocation: newLocation,
        currentSlot: targetSlot
      });
    } catch (error) {
      console.error('Error moving boat:', error);
      alert('Failed to move boat. Please try again.');
    }
    
    setIsProcessing(false);
  };

  const handleBoatDrop = async (e, targetLocation, row, col) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingBoat || isProcessing) return;

    setIsProcessing(true);

    const newSlotId = `${row}-${col}`;
    
    // Check if target slot is already occupied
    if (targetLocation.boats[newSlotId]) {
      alert('This slot is already occupied!');
      setDraggingBoat(null);
      setDraggingFrom(null);
      setIsDragging(false);
      setIsProcessing(false);
      return;
    }

    let updatedLocations = [...locations];

    // ALWAYS remove boat from old location if it's currently assigned somewhere
    // This handles both dragging from within a location AND dragging from elsewhere
    if (draggingBoat.location) {
      const oldLocation = locations.find(l => l.name === draggingBoat.location);
      if (oldLocation) {
        const updatedOldLocation = {
          ...oldLocation,
          boats: { ...oldLocation.boats }
        };
        // Find and remove the boat from its current slot
        const oldSlotId = Object.keys(updatedOldLocation.boats).find(
          key => updatedOldLocation.boats[key] === draggingBoat.id
        );
        if (oldSlotId) {
          delete updatedOldLocation.boats[oldSlotId];
        }
        
        updatedLocations = updatedLocations.map(l => 
          l.id === oldLocation.id ? updatedOldLocation : l
        );
      }
    }

    // Add boat to new location
    const currentTargetLocation = updatedLocations.find(l => l.id === targetLocation.id);
    const updatedNewLocation = {
      ...currentTargetLocation,
      boats: { ...currentTargetLocation.boats, [newSlotId]: draggingBoat.id }
    };
    updatedLocations = updatedLocations.map(l => 
      l.id === targetLocation.id ? updatedNewLocation : l
    );

    // Update boat's location
    const updatedBoat = {
      ...draggingBoat,
      location: targetLocation.name,
      slot: newSlotId
    };
    const updatedBoats = boats.map(b => b.id === draggingBoat.id ? updatedBoat : b);

    // Update both locations and boats
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(updatedBoats);
    } catch (error) {
      console.error('Error updating boat location:', error);
      alert('Failed to update boat location. Please try again.');
    }

    setDraggingBoat(null);
    setDraggingFrom(null);
    setIsDragging(false);
    setIsProcessing(false);
  };

  // Get unassigned boats (not in any location slot)
  const assignedBoatIds = new Set();
  locations.forEach(loc => {
    Object.values(loc.boats).forEach(boatId => assignedBoatIds.add(boatId));
  });
  const unassignedBoats = boats.filter(b => b.status !== 'archived' && !assignedBoatIds.has(b.id));

  // Build orderedLocations - show ALL locations in the specified order
  const orderedLocations = locationOrder
    .map(id => locations.find(l => l.id === id))
    .filter(Boolean); // Remove any IDs that don't have matching locations
  
  // Add any locations that aren't in the order yet (newly added locations)
  const idsInOrder = new Set(locationOrder);
  const newLocations = locations.filter(loc => !idsInOrder.has(loc.id));
  const allOrderedLocations = [...orderedLocations, ...newLocations];

  // Get only the selected locations for display
  const myViewLocations = allOrderedLocations.filter(loc => selectedLocations.includes(loc.id));

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">My View</h2>
          <p className="text-slate-600">Your personalized location dashboard</p>
        </div>
        <button
          onClick={() => setShowCustomizer(!showCustomizer)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
        >
          <Settings className="w-5 h-5" />
          {showCustomizer ? 'Hide Customizer' : 'Customize View'}
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">Personal Workspace</h3>
            <p className="text-sm text-blue-800">
              Showing {myViewLocations.length} of {locations.length} locations based on your preferences.
              Click "Customize View" to change which locations appear here.
            </p>
          </div>
        </div>
      </div>

      {/* Customization Panel */}
      {showCustomizer && (
        <div className="bg-white rounded-xl shadow-md border-2 border-blue-300 overflow-hidden animate-slide-in">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Customize Your View</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Check locations to show, uncheck to hide • Drag to reorder
                </p>
              </div>
              {hasChanges && (
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-white transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 space-y-2">
            {allOrderedLocations.map((location) => (
              <div
                key={location.id}
                draggable
                onDragStart={(e) => handleDragStart(e, location.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, location.id)}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-move ${
                  draggedItem === location.id
                    ? 'border-blue-400 bg-blue-50 opacity-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                {/* Drag Handle */}
                <div className="flex-shrink-0 text-slate-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                </div>

                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedLocations.includes(location.id)}
                  onChange={() => handleToggleLocation(location.id)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />

                {/* Location Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900">{location.name}</h4>
                  <p className="text-sm text-slate-600 capitalize">
                    {location.type} • {location.rows} × {location.columns}
                    {location.layout === 'u-shaped' && ' (U-shaped)'}
                  </p>
                </div>

                {/* Visibility Badge */}
                {selectedLocations.includes(location.id) ? (
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full flex-shrink-0">
                    Visible
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-medium rounded-full flex-shrink-0">
                    Hidden
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Locations Grid - Show selected locations with boats */}
      {myViewLocations.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-900">My Locations</h3>
            <p className="text-sm text-slate-600">
              Showing {myViewLocations.length} location{myViewLocations.length !== 1 ? 's' : ''}
            </p>
          </div>
          
          {myViewLocations.map(location => {
            const isUShape = location.layout === 'u-shaped';
            const totalSlots = isUShape 
              ? (location.rows * 2) + location.columns 
              : location.rows * location.columns;
            const occupiedSlots = Object.keys(location.boats).length;
            const occupancyRate = Math.round((occupiedSlots / totalSlots) * 100);

            // Render location grid
            const renderGrid = () => {
              const slots = [];
              
              for (let row = 0; row < location.rows; row++) {
                for (let col = 0; col < location.columns; col++) {
                  const isLeftEdge = col === 0;
                  const isRightEdge = col === location.columns - 1;
                  const isBottomRow = row === location.rows - 1;
                  const isPerimeter = isLeftEdge || isRightEdge || isBottomRow;
                  
                  if (!isPerimeter && isUShape) {
                    slots.push(<div key={`${row}-${col}`} className="aspect-square"></div>);
                    continue;
                  }
                  
                  const slotId = `${row}-${col}`;
                  const boatId = location.boats[slotId];
                  const boat = boats.find(b => b.id === boatId);

                  slots.push(
                    <div
                      key={slotId}
                      draggable={!!boat}
                      onClick={() => handleSlotClick(location, row, col)}
                      onDragStart={(e) => {
                        if (boat) {
                          handleBoatDragStart(e, boat, location, slotId);
                        }
                      }}
                      onDragEnd={handleBoatDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleBoatDrop(e, location, row, col)}
                      className={`location-slot aspect-square border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center transition-all ${
                        boat 
                          ? `status-${boat.status} border-transparent shadow-sm cursor-grab active:cursor-grabbing hover:scale-105` 
                          : isDragging
                            ? 'border-blue-400 bg-blue-50 cursor-pointer'
                            : 'border-slate-300 bg-white hover:border-blue-400 cursor-pointer'
                      }`}
                    >
                      {boat ? (
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
                      ) : (
                        <div className="text-slate-400 pointer-events-none">
                          <div className="text-[clamp(1.25rem,2.5vw,2rem)] mb-0.5">+</div>
                          <p className="text-[clamp(0.6rem,1.2vw,0.75rem)] leading-tight">{row + 1}-{col + 1}</p>
                        </div>
                      )}
                    </div>
                  );
                }
              }
              
              return slots;
            };

            return (
              <div key={location.id} className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{location.name}</h4>
                      {location.layout === 'u-shaped' && <span className="text-xs text-blue-600 font-medium">U-Shaped Layout</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-slate-600 capitalize">
                      {location.type} • {location.rows} × {location.columns}
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
                        {renderGrid()}
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
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Map className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">No locations in your view</p>
          <p className="text-sm text-slate-400 mb-4">
            Click "Customize View" to select locations to display
          </p>
          <button
            onClick={() => setShowCustomizer(true)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Customize View
          </button>
        </div>
      )}

      {/* Save Reminder */}
      {hasChanges && showCustomizer && (
        <div className="fixed bottom-6 right-6 bg-orange-500 text-white px-6 py-3 rounded-lg shadow-lg animate-slide-in">
          <p className="font-medium">You have unsaved changes</p>
          <p className="text-sm opacity-90">Click "Save Changes" to apply</p>
        </div>
      )}

      {/* Boat Assignment Modal */}
      {showBoatAssignModal && (
        <BoatAssignmentModal
          boats={unassignedBoats}
          allBoats={boats.filter(b => b.status !== 'archived')}
          locations={locations}
          onAssign={handleAssignBoat}
          onCreateBoat={handleCreateBoatFromAssignModal}
          onImportBoat={handleImportBoatFromAssignModal}
          onCancel={() => {
            setShowBoatAssignModal(false);
            setSelectedLocation(null);
            setSelectedSlot(null);
          }}
        />
      )}

      {/* Boat Details Modal */}
      {viewingBoat && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          onRemove={handleRemoveBoatFromLocation}
          onUpdateBoat={(updatedBoat) => {
            const updatedBoats = boats.map(b => b.id === updatedBoat.id ? updatedBoat : b);
            onUpdateBoats(updatedBoats);
            setViewingBoat(updatedBoat);
          }}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

/**
 * INVENTORY VIEW COMPONENT
 * ========================
 * 
 * Displays boats synced from Dockmaster API's "Other Inventory" endpoint
 * These are read-only boats that appear/disappear based on their Status in Dockmaster
 * 
 * KEY DIFFERENCES FROM CUSTOMER BOATS:
 * - Source: Dockmaster API (not manually added)
 * - Sync: Auto-syncs every 30 minutes
 * - Status-driven: Only visible when Dockmaster Status field indicates "in service"
 * - Read-only: Cannot manually add/edit/delete (managed by Dockmaster)
 * 
 * DATABASE MIGRATION NOTES:
 * - Create separate table from customer boats
 * - Track dockmaster_id for sync reconciliation
 * - Include last_synced_at timestamp
 * - Mark as active/inactive based on Status field rather than deleting
 */
function InventoryView({ inventoryBoats, locations, lastSync, onSyncNow, dockmasterConfig, onUpdateInventoryBoats, onUpdateSingleBoat }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingBoat, setViewingBoat] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterYear, setFilterYear] = useState('all');
  const [filterMake, setFilterMake] = useState('all');
  const [filterModel, setFilterModel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

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

  // Extract unique values for filters
  const years = [...new Set(inventoryBoats.map(b => b.year).filter(Boolean))].sort((a, b) => b - a);
  const makes = [...new Set(inventoryBoats.map(b => b.make).filter(Boolean))].sort();
  const models = [...new Set(inventoryBoats.map(b => b.model).filter(Boolean))].sort();
  const statuses = [...new Set(inventoryBoats.map(b => b.salesStatus).filter(Boolean))].sort();

  const filteredBoats = inventoryBoats.filter(boat => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = boat.name?.toLowerCase().includes(searchLower) ||
                         boat.model?.toLowerCase().includes(searchLower) ||
                         boat.owner?.toLowerCase().includes(searchLower) ||
                         boat.hullId?.toLowerCase().includes(searchLower) ||
                         boat.hull_id?.toLowerCase().includes(searchLower) ||
                         boat.dockmasterId?.toLowerCase().includes(searchLower) ||
                         boat.dockmaster_id?.toLowerCase().includes(searchLower);
    const matchesYear = filterYear === 'all' || boat.year === parseInt(filterYear);
    const matchesMake = filterMake === 'all' || boat.make === filterMake;
    const matchesModel = filterModel === 'all' || boat.model === filterModel;
    const matchesStatus = filterStatus === 'all' || boat.salesStatus === filterStatus;
    
    return matchesSearch && matchesYear && matchesMake && matchesModel && matchesStatus;
  });

  const handleSyncNow = async () => {
    setIsSyncing(true);
    await onSyncNow(true); // Full sync (3 years back) when manually triggered
    setIsSyncing(false);
  };

  const handleViewBoat = (boat) => {
    const location = boat.location ? locations.find(l => l.name === boat.location) : null;
    const slotId = location ? Object.keys(location.boats).find(key => location.boats[key] === boat.id) : null;
    
    setViewingBoat({
      ...boat,
      currentLocation: location,
      currentSlot: slotId
    });
  };

  const handleUpdateBoatFromModal = async (updatedBoat) => {
    // Update the modal state immediately for responsiveness
    setViewingBoat(updatedBoat);
    
    // Call direct update function to save to database
    if (onUpdateSingleBoat) {
      await onUpdateSingleBoat(updatedBoat.id, updatedBoat);
    }
  };

  const handleRemoveBoatFromLocation = async () => {
    if (!viewingBoat) return;
    
    const updatedBoat = {
      ...viewingBoat,
      location: null,
      slot: null
    };
    
    if (onUpdateSingleBoat) {
      await onUpdateSingleBoat(viewingBoat.id, updatedBoat);
    }
    setViewingBoat(null);
  };

  // Note: For inventory boats, we only update the boat's location reference
  // We don't update the locations array itself since inventory boats aren't stored there
  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    let updatedBoat = { ...boat };
    
    if (targetLocation) {
      if (targetLocation.type === 'pool') {
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = 'pool';
      } else {
        const [row, col] = targetSlot.split('-').map(Number);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = `${row + 1}-${col + 1}`;
      }
    } else {
      updatedBoat.location = null;
      updatedBoat.slot = null;
    }
    
    if (onUpdateSingleBoat) {
      await onUpdateSingleBoat(boat.id, updatedBoat);
    }
    
    setViewingBoat({
      ...updatedBoat,
      currentLocation: targetLocation,
      currentSlot: targetSlot
    });
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
        <button
          onClick={handleSyncNow}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            </div>

            {/* Active Filters Display */}
            {(filterYear !== 'all' || filterMake !== 'all' || filterModel !== 'all' || filterStatus !== 'all' || searchQuery) && (
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
            <div key={boat.id} onClick={() => handleViewBoat(boat)} className="cursor-pointer">
              <BoatCard 
                boat={boat} 
                onEdit={() => {}} 
                onDelete={() => {}} 
                compact={false}
              />
            </div>
          ))}
        </div>
      )}

      {/* Boat Details Modal */}
      {viewingBoat && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          onRemove={handleRemoveBoatFromLocation}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

function SettingsView({ dockmasterConfig, onSaveConfig, currentUser, users, onUpdateUsers }) {
  const [formData, setFormData] = useState(dockmasterConfig || {
    username: '',
    password: ''
  });
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const isAdmin = currentUser?.role === 'admin';

  const handleSave = async () => {
    await onSaveConfig(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleAddUser = (newUser) => {
    const user = {
      id: `user-${Date.now()}`,
      ...newUser
    };
    onUpdateUsers([...users, user]);
    setShowAddUser(false);
  };

  const handleUpdateUser = (updatedUser) => {
    onUpdateUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    setEditingUser(null);
  };

  const handleDeleteUser = (userId) => {
    if (userId === currentUser.id) {
      alert('You cannot delete your own account!');
      return;
    }
    if (confirm('Are you sure you want to delete this user?')) {
      onUpdateUsers(users.filter(u => u.id !== userId));
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Settings</h2>
        <p className="text-slate-600">Manage your system configuration</p>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 px-6 py-3 font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            My Profile
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('users')}
                className={`flex-1 px-6 py-3 font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                User Management
              </button>
              <button
                onClick={() => setActiveTab('dockmaster')}
                className={`flex-1 px-6 py-3 font-medium transition-colors ${
                  activeTab === 'dockmaster'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Dockmaster API
              </button>
            </>
          )}
        </div>

        <div className="p-6">
          {activeTab === 'profile' && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">My Profile</h3>
              <div className="space-y-4 max-w-2xl">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Name</p>
                  <p className="font-semibold text-slate-900">{currentUser.name}</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Username</p>
                  <p className="font-semibold text-slate-900">@{currentUser.username}</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Role</p>
                  <p className="font-semibold text-slate-900 capitalize">{currentUser.role}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && isAdmin && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">User Management</h3>
                <button
                  onClick={() => setShowAddUser(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add User
                </button>
              </div>

              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.id} className="p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                          <Users className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{user.name}</p>
                          <p className="text-sm text-slate-600">@{user.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role}
                        </span>
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          disabled={user.id === currentUser.id}
                        >
                          <Trash2 className={`w-4 h-4 ${user.id === currentUser.id ? 'text-slate-300' : 'text-red-600'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'dockmaster' && isAdmin && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">Dockmaster API Configuration</h3>
              
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Dockmaster username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Dockmaster password"
                  />
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSave}
                    className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                  >
                    Save Configuration
                  </button>
                </div>

                {isSaved && (
                  <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
                    ✓ Configuration saved successfully!
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-medium mb-2">About Dockmaster Integration:</p>
                  <p className="text-sm text-blue-800">
                    Enter your Dockmaster API credentials to enable importing customer and inventory boats directly into your system.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Modals */}
      {showAddUser && (
        <UserModal
          user={null}
          onSave={handleAddUser}
          onCancel={() => setShowAddUser(false)}
        />
      )}
      {editingUser && (
        <UserModal
          user={editingUser}
          onSave={handleUpdateUser}
          onCancel={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

function UserModal({ user, onSave, onCancel }) {
  const [formData, setFormData] = useState(user || {
    name: '',
    username: '',
    password: '',
    role: 'user'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">{user ? 'Edit User' : 'Add New User'}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Full name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {user ? 'Password (leave blank to keep current)' : 'Password'}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Password"
              required={!user}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              {user ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
