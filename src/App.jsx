import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Search, Plus, Trash2, Edit2, Save, X, LogOut, Users, User, Map, Package, Settings, Menu, Grid, ChevronRight, Home, Wrench, Sparkles, Layers, Shield, Maximize2, Minimize2, ChevronLeft, Pencil, Anchor, RotateCw, RotateCcw, Printer, ZoomIn, ZoomOut, Move, Flower2, Armchair, Tent, Flag, Table, ArrowUp, ArrowDown, Copy, DollarSign, Download, Magnet } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { boatsService, inventoryBoatsService } from './services/supabaseService';
import { BoatCard, BoatCardContent, BoatListItem, LocationBadge, useBoatLocation, BoatStatusIcons, InventoryBadge, findBoatLocationData } from './components/BoatComponents';
import { PoolLocation } from './components/locations/PoolLocation';
import { LocationGrid, MaximizedLocationModal } from './components/locations/LocationGrid';
import { LocationSection } from './components/locations/LocationSection';
import { useRemoveBoat } from './hooks/useRemoveBoat';
import { useAssignBoat } from './hooks/useAssignBoat';
import { useBoatDragDrop } from './hooks/useBoatDragDrop';
import { BoatDetailsModal } from './components/modals/BoatDetailsModal';
import { InventoryBoatDetailsModal } from './components/modals/InventoryBoatDetailsModal';

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

  // Sites
  sites = [],
  onAddSite,
  onUpdateSite,
  onDeleteSite,
  onReorderSites,

  // User Preferences
  userPreferences = {},
  onSavePreferences,
  
  // Users
  users = [],
  onReloadUsers,
  
  // Dockmaster Config
  dockmasterConfig,
  onSaveDockmasterConfig,
}) {
  // UI State (keep these)
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Bypass auth for development

  // Hash-based routing for URL persistence
  const validViews = ['dashboard', 'myview', 'locations', 'boats', 'inventory', 'shows', 'scan', 'settings'];
  const getViewFromHash = () => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    return validViews.includes(hash) ? hash : 'dashboard';
  };
  const [currentView, setCurrentViewState] = useState(getViewFromHash);

  // Sync view state with URL hash
  const setCurrentView = (view) => {
    window.location.hash = `#/${view}`;
    setCurrentViewState(view);
  };

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentViewState(getViewFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

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
          <div className="flex justify-between items-center h-14 lg:h-16">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <img
                src="/images/favicon.png"
                alt="Boats by George"
                className="w-8 h-8 lg:w-10 lg:h-10 object-contain flex-shrink-0"
                onError={(e) => {
                  // Fallback to package icon if favicon not found
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center flex-shrink-0" style={{display: 'none'}}>
                <Package className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div className="hidden lg:block">
                <h1 className="text-xl font-bold text-slate-900">Boats By George</h1>
                <p className="text-xs text-slate-500">Asset Management System</p>
              </div>
            </div>

            {/* Desktop Navigation - Only show on large screens (1024px+) */}
            <div className="hidden lg:flex items-center gap-2">
              <NavButton icon={Home} label="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
              <NavButton icon={User} label="My View" active={currentView === 'myview'} onClick={() => setCurrentView('myview')} />
              <NavButton icon={Map} label="Locations" active={currentView === 'locations'} onClick={() => setCurrentView('locations')} />
              <NavButton icon={Package} label="Boats" active={currentView === 'boats'} onClick={() => setCurrentView('boats')} />
              <NavButton icon={Package} label="Inventory" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />
              <NavButton icon={Anchor} label="Shows" active={currentView === 'shows'} onClick={() => setCurrentView('shows')} />
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

            {/* Mobile/Tablet Menu Button - Show on all screens smaller than 1024px */}
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4 lg:w-5 lg:h-5 text-slate-600" />
              </button>
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                title="Menu"
              >
                <Menu className="w-5 h-5 lg:w-6 lg:h-6 text-slate-600" />
              </button>
            </div>
          </div>

          {/* Mobile/Tablet Navigation Menu - Show on screens smaller than 1024px */}
          {showMobileMenu && (
            <div className="lg:hidden border-t border-slate-200 py-2 bg-white">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { setCurrentView('dashboard'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Home className="w-5 h-5" />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => { setCurrentView('myview'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'myview' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-5 h-5" />
                  <span>My View</span>
                </button>
                <button
                  onClick={() => { setCurrentView('locations'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'locations' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Map className="w-5 h-5" />
                  <span>Locations</span>
                </button>
                <button
                  onClick={() => { setCurrentView('boats'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'boats' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Package className="w-5 h-5" />
                  <span>Boats</span>
                </button>
                <button
                  onClick={() => { setCurrentView('inventory'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'inventory' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Package className="w-5 h-5" />
                  <span>Inventory</span>
                </button>
                <button
                  onClick={() => { setCurrentView('shows'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'shows' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Anchor className="w-5 h-5" />
                  <span>Shows</span>
                </button>
                <button
                  onClick={() => { setCurrentView('scan'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'scan' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Camera className="w-5 h-5" />
                  <span>Scan</span>
                </button>
                <button
                  onClick={() => { setCurrentView('settings'); setShowMobileMenu(false); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    currentView === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Settings className="w-5 h-5" />
                  <span>Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <DashboardView boats={boats} locations={locations} sites={sites} onNavigate={setCurrentView} onUpdateBoats={saveBoats} onUpdateLocations={saveLocations} onMoveBoat={onMoveBoat} />
        )}
        {currentView === 'locations' && (
          <LocationsView
            locations={locations}
            sites={sites}
            onAddSite={onAddSite}
            onUpdateSite={onUpdateSite}
            onDeleteSite={onDeleteSite}
            onReorderSites={onReorderSites}
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
            onMoveBoat={onMoveBoat}
            currentUser={currentUser}
          />
        )}
        {currentView === 'boats' && (
          <BoatsView
            boats={boats}
            locations={locations}
            sites={sites}
            onUpdateBoats={saveBoats}
            onMoveBoat={onMoveBoat}
            dockmasterConfig={dockmasterConfig}
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
            sites={sites}
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
            onMoveBoat={onMoveBoat}
          />
        )}
        {currentView === 'inventory' && (
          <InventoryView
            inventoryBoats={inventoryBoats}
            locations={locations}
            sites={sites}
            lastSync={lastInventorySync}
            onSyncNow={syncInventoryBoats}
            onUpdateInventoryBoats={saveInventoryBoats}
            onUpdateSingleBoat={onUpdateInventoryBoat}
            onMoveBoat={onMoveBoat}
            dockmasterConfig={dockmasterConfig}
          />
        )}
        {currentView === 'shows' && (
          <BoatShowPlanner 
            inventoryBoats={inventoryBoats}
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
            onReloadUsers={onReloadUsers}
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

function DashboardView({ boats, locations, sites = [], onNavigate, onUpdateBoats, onUpdateLocations, onMoveBoat: onMoveBoatFromContainer }) {
  const [viewingBoat, setViewingBoat] = useState(null);

  // Use unified remove boat hook
  const { removeBoat } = useRemoveBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => setViewingBoat(null)
  });

  // Sync viewingBoat with boats array when it updates (real-time changes)
  useEffect(() => {
    if (viewingBoat) {
      const updatedBoat = boats.find(b => b.id === viewingBoat.id);
      if (updatedBoat && JSON.stringify(updatedBoat) !== JSON.stringify(viewingBoat)) {
        // Preserve the enriched properties (currentLocation, currentSlot)
        setViewingBoat({
          ...updatedBoat,
          currentLocation: viewingBoat.currentLocation,
          currentSlot: viewingBoat.currentSlot
        });
      }
    }
  }, [boats]);

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
    // For inventory boats, use AppContainer's handleMoveBoat directly
    if (boat.isInventory && onMoveBoatFromContainer) {
      try {
        await onMoveBoatFromContainer(boat.id, targetLocation?.id || null, targetSlot || null, true);
        
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
          setViewingBoat(null);
        }
      } catch (error) {
        console.error('Error moving inventory boat:', error);
        alert('Failed to move boat. Please try again.');
      }
      return;
    }
    
    // For regular boats, use the existing logic
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
              <CustomerBoatCard boat={boat} onEdit={() => {}} onDelete={() => {}} compact={true} />
            </div>
          ))}
        </div>
      </div>

      {/* Boat Details Modal - use appropriate modal based on boat type */}
      {viewingBoat && viewingBoat.isInventory && (
        <InventoryBoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
      {viewingBoat && !viewingBoat.isInventory && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          onRemove={() => removeBoat(viewingBoat)}
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

function BoatsView({ boats, locations, sites = [], onUpdateBoats, dockmasterConfig, onMoveBoat }) {
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

  // Use unified remove boat hook
  const { removeBoat } = useRemoveBoat({
    onMoveBoat,
    onSuccess: () => {
      // Keep modal open for chained operations (existing behavior)
    }
  });

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
    
    const matchesSearch = (boat.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (boat.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (boat.owner || '').toLowerCase().includes(searchQuery.toLowerCase());
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
    } else if (filterWorkPhase === 'needs-invoiced') {
      matchesWorkPhase = !boat.invoicedComplete;
    } else if (filterWorkPhase === 'all-complete') {
      matchesWorkPhase = boat.mechanicalsComplete && boat.cleanComplete && boat.fiberglassComplete && boat.warrantyComplete && boat.invoicedComplete;
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
    const slotId = location ? Object.keys(location.boats || {}).find(key => (location.boats || {})[key] === boat.id) : null;
    
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

  // Wrapper to convert BoatDetailsModal's signature (boat, location, slot)
  // to AppContainer's signature (boatId, locationId, slotId, isInventory)
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
              {boats.filter(b => b.status !== 'archived' && !b.mechanicalsComplete).length}
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
              {boats.filter(b => b.status !== 'archived' && !b.cleanComplete).length}
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
              {boats.filter(b => b.status !== 'archived' && !b.fiberglassComplete).length}
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
              {boats.filter(b => b.status !== 'archived' && !b.warrantyComplete).length}
            </p>
          </button>

          <button
            onClick={() => setFilterWorkPhase(filterWorkPhase === 'needs-invoiced' ? 'all' : 'needs-invoiced')}
            className={`p-3 rounded-lg border-2 transition-all ${
              filterWorkPhase === 'needs-invoiced'
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-200 bg-white hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-600">Invoiced</span>
              <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {boats.filter(b => b.status !== 'archived' && !b.invoicedComplete).length}
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
                {boats.filter(b => !b.location && b.status !== 'archived').length} boats
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
              <option value="needs-invoiced">Needs Invoiced</option>
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
            <CustomerBoatCard
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
          sites={sites}
          onRemove={() => removeBoat(viewingBoat)}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

function CustomerBoatCard({ boat, onEdit, onDelete, compact }) {
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
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={boat.invoicedComplete || false}
                readOnly
                className="w-3 h-3 rounded pointer-events-none"
              />
              <span className={boat.invoicedComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                Inv
              </span>
            </label>
          </div>
          {/* Pending work badges */}
          {(!boat.mechanicalsComplete || !boat.cleanComplete || !boat.fiberglassComplete || !boat.warrantyComplete || !boat.invoicedComplete) && (
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
              {!boat.invoicedComplete && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded-full">
                  Needs Inv
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

// ============================================================================
// INVENTORY BOAT CARD
// ============================================================================
// Card for inventory boats - shows sales status, no work phases
// ============================================================================

function InventoryBoatCard({ boat, onView, locations = [] }) {
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

  const statusInfo = salesStatusLabels[boat.salesStatus] || { label: boat.salesStatus || 'Unknown', color: 'bg-slate-400' };

  // Use centralized location finding logic
  const { enrichedBoat } = findBoatLocationData(boat, locations);
  const { displayLocation, displaySlot } = useBoatLocation(enrichedBoat, locations);

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      {/* Sales Status Header */}
      <div className={`${statusInfo.color} p-3`}>
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold text-sm">{statusInfo.label}</span>
          <span className="text-white text-xs opacity-90 font-mono">{boat.qrCode || `INV-${boat.dockmasterId}`}</span>
        </div>
      </div>
      
      <div className="p-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">{boat.name}</h3>
        <p className="text-slate-600 text-sm mb-3">{boat.year} {boat.model}</p>
        
        <div className="space-y-2 text-sm">
          {/* Make/Manufacturer */}
          <div className="flex items-center gap-2 text-slate-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span>{boat.make || 'Unknown Make'}</span>
          </div>
          
          {/* Location if assigned */}
          {enrichedBoat.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <Map className="w-4 h-4" />
              <span>
                {displayLocation}
                {displaySlot && ` • ${displaySlot}`}
              </span>
            </div>
          )}
          
          {/* Hull ID */}
          {boat.hullId && (
            <div className="flex items-center gap-2 text-slate-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <span className="font-mono text-xs">{boat.hullId}</span>
            </div>
          )}
        </div>

        {/* Inventory Badge */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              Inventory
            </span>
            {boat.length && (
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                {boat.length}
              </span>
            )}
            <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusInfo.color} text-white`}>
              {boat.salesStatus}
            </span>
          </div>
        </div>

        {/* View Details Button */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button
            onClick={onView}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            View Details
          </button>
        </div>
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
    warrantyComplete: false,
    invoicedComplete: false
  });

  const allWorkPhasesComplete = formData.mechanicalsComplete && formData.cleanComplete && formData.fiberglassComplete && formData.warrantyComplete && formData.invoicedComplete;

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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.invoicedComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, invoicedComplete: e.target.checked };
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Invoiced Complete</span>
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

function LocationsView({
  locations,
  sites = [],
  onAddSite,
  onUpdateSite,
  onDeleteSite,
  onReorderSites,
  boats,
  onUpdateLocations,
  onUpdateBoats,
  onMoveBoat: onMoveBoatFromContainer,
  currentUser
}) {
  // Role check for location management permissions
  const isManagerOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [showBoatAssignModal, setShowBoatAssignModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [maximizedLocation, setMaximizedLocation] = useState(null);
  const mouseYRef = useRef(0);

  // Use unified remove boat hook
  const { removeBoat, isRemoving } = useRemoveBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => setViewingBoat(null)
  });

  // Use unified assign boat hook
  const { assignBoat, isAssigning } = useAssignBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => {
      setShowBoatAssignModal(false);
      setSelectedLocation(null);
      setSelectedSlot(null);
      setIsProcessing(false);
    }
  });

  // Use unified drag-and-drop hook
  const {
    draggingBoat,
    draggingFrom,
    isDragging: isDraggingActive,
    handleDragStart,
    handleDragEnd,
    handleGridDrop,
    handlePoolDrop
  } = useBoatDragDrop({
    onMoveBoat: onMoveBoatFromContainer
  });

  // Sync viewingBoat with boats array when it updates (real-time changes)
  useEffect(() => {
    if (viewingBoat) {
      const updatedBoat = boats.find(b => b.id === viewingBoat.id);
      if (updatedBoat && JSON.stringify(updatedBoat) !== JSON.stringify(viewingBoat)) {
        // Preserve the enriched properties (currentLocation, currentSlot)
        setViewingBoat({
          ...updatedBoat,
          currentLocation: viewingBoat.currentLocation,
          currentSlot: viewingBoat.currentSlot
        });
      }
    }
  }, [boats]);

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

  // Site handlers
  const handleSaveSite = async (siteData) => {
    try {
      if (editingSite) {
        await onUpdateSite(editingSite.id, siteData);
        setEditingSite(null);
      } else {
        await onAddSite(siteData);
        setShowAddSite(false);
      }
    } catch (error) {
      console.error('Error saving site:', error);
      alert(error.message || 'Failed to save site');
    }
  };

  const handleDeleteSite = async (siteId) => {
    const siteLocations = locations.filter(l => l.site_id === siteId);
    if (siteLocations.length > 0) {
      alert('Cannot delete site with assigned locations. Please move or delete all locations from this site first.');
      return;
    }
    if (confirm('Are you sure you want to delete this site?')) {
      try {
        await onDeleteSite(siteId);
      } catch (error) {
        console.error('Error deleting site:', error);
        alert(error.message || 'Failed to delete site');
      }
    }
  };

  // Site drag reorder handlers
  const [draggedSite, setDraggedSite] = useState(null);

  const handleSiteDragStart = (e, site) => {
    setDraggedSite(site);
    e.dataTransfer.effectAllowed = 'move';

    // Create a small drag image instead of the entire element
    const dragImage = document.createElement('div');
    dragImage.textContent = site.name;
    dragImage.style.cssText = 'position: absolute; top: -1000px; left: -1000px; padding: 8px 16px; background: #6366f1; color: white; border-radius: 8px; font-weight: bold; font-size: 14px;';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);

    // Clean up the drag image after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };

  const handleSiteDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Auto-scroll when dragging near edges
    const scrollThreshold = 100; // pixels from edge to start scrolling
    const scrollSpeed = 15; // pixels per frame
    const mouseY = e.clientY;
    const windowHeight = window.innerHeight;

    if (mouseY < scrollThreshold) {
      // Near top - scroll up
      window.scrollBy(0, -scrollSpeed);
    } else if (mouseY > windowHeight - scrollThreshold) {
      // Near bottom - scroll down
      window.scrollBy(0, scrollSpeed);
    }
  };

  const handleSiteDrop = async (e, targetSite) => {
    e.preventDefault();
    if (!draggedSite || draggedSite.id === targetSite.id) {
      setDraggedSite(null);
      return;
    }

    // Reorder sites
    const currentOrder = sites.map(s => s.id);
    const dragIndex = currentOrder.indexOf(draggedSite.id);
    const targetIndex = currentOrder.indexOf(targetSite.id);

    currentOrder.splice(dragIndex, 1);
    currentOrder.splice(targetIndex, 0, draggedSite.id);

    try {
      await onReorderSites(currentOrder);
    } catch (error) {
      console.error('Error reordering sites:', error);
    }
    setDraggedSite(null);
  };

  const handleSlotClick = (location, row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats ? location.boats[slotId] : null;

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

    const boat = boats.find(b => b.id === boatId);
    if (!boat) {
      console.error('[Assign] Boat not found:', boatId);
      setIsProcessing(false);
      return;
    }

    // Determine slot ID based on location type
    let slotId = null;
    if (selectedLocation.type === 'pool') {
      slotId = 'pool';
    } else {
      if (!selectedSlot) {
        console.error('[Assign] No slot selected for grid assignment');
        setIsProcessing(false);
        return;
      }

      // Validate slot coordinates
      if (typeof selectedSlot.row !== 'number' || typeof selectedSlot.col !== 'number') {
        console.error('[Assign] Invalid slot coordinates:', selectedSlot);
        alert('Invalid slot selection. Please try again.');
        setIsProcessing(false);
        return;
      }

      slotId = selectedSlot.slotId;
    }

    // Use the unified hook to assign the boat
    await assignBoat(boatId, selectedLocation.id, slotId, boat.isInventory);
  };

  const handleUpdateBoatFromModal = (updatedBoat) => {
    onUpdateBoats(boats.map(b => b.id === updatedBoat.id ? updatedBoat : b));
    setViewingBoat(updatedBoat);
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    setIsProcessing(true);
    
    // For inventory boats, use AppContainer's handleMoveBoat directly
    if (boat.isInventory && onMoveBoatFromContainer) {
      try {
        await onMoveBoatFromContainer(boat.id, targetLocation?.id || null, targetSlot || null, true);
        
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
          setViewingBoat(null);
        }
      } catch (error) {
        console.error('Error moving inventory boat:', error);
        alert('Failed to move boat. Please try again.');
      }
      setIsProcessing(false);
      return;
    }
    
    // For regular boats, use the existing logic
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

  // Helper to get locations for a site
  const getLocationsForSite = (siteId) => {
    return locations.filter(l => l.site_id === siteId);
  };

  // Get locations without a site (for migration purposes)
  const unassignedLocations = locations.filter(l => !l.site_id);

  // Helper to render locations grouped by type within a site
  const renderLocationsByType = (siteLocations) => {
    const racks = siteLocations.filter(l => l.type === 'rack-building');
    const parking = siteLocations.filter(l => l.type === 'parking-lot');
    const workshops = siteLocations.filter(l => l.type === 'shop');
    const pools = siteLocations.filter(l => l.type === 'pool');

    return (
      <>
        {workshops.length > 0 && (
          <LocationSection
            title="Service Workshops"
            icon={Settings}
            color="orange"
            locations={workshops}
            boats={boats}
            onSlotClick={handleSlotClick}
            onBoatClick={(boat) => setViewingBoat(boat)}
            onEdit={isManagerOrAdmin ? setEditingLocation : undefined}
            onDelete={isManagerOrAdmin ? handleDeleteLocation : undefined}
            onDragStart={handleDragStart}
            onDrop={handleGridDrop}
            onDragEnd={handleDragEnd}
            draggingBoat={draggingBoat}
            onMaximize={setMaximizedLocation}
          />
        )}

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
                  onEdit={isManagerOrAdmin ? () => setEditingLocation(pool) : undefined}
                  onDelete={isManagerOrAdmin ? () => handleDeleteLocation(pool.id) : undefined}
                  onDragStart={handleDragStart}
                  onDrop={handlePoolDrop}
                  onDragEnd={handleDragEnd}
                  isDragging={!!draggingBoat}
                  onBoatClick={(boat) => setViewingBoat(boat)}
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

        {racks.length > 0 && (
          <LocationSection
            title="Rack Buildings"
            icon={Grid}
            color="blue"
            locations={racks}
            boats={boats}
            onSlotClick={handleSlotClick}
            onBoatClick={(boat) => setViewingBoat(boat)}
            onEdit={isManagerOrAdmin ? setEditingLocation : undefined}
            onDelete={isManagerOrAdmin ? handleDeleteLocation : undefined}
            onDragStart={handleDragStart}
            onDrop={handleGridDrop}
            onDragEnd={handleDragEnd}
            draggingBoat={draggingBoat}
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
            onBoatClick={(boat) => setViewingBoat(boat)}
            onEdit={isManagerOrAdmin ? setEditingLocation : undefined}
            onDelete={isManagerOrAdmin ? handleDeleteLocation : undefined}
            onDragStart={handleDragStart}
            onDrop={handleGridDrop}
            onDragEnd={handleDragEnd}
            draggingBoat={draggingBoat}
            onMaximize={setMaximizedLocation}
          />
        )}
      </>
    );
  };

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
        {isManagerOrAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddSite(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-md"
            >
              <Plus className="w-5 h-5" />
              Add Site
            </button>
            <button
              onClick={() => setShowAddLocation(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md"
            >
              <Plus className="w-5 h-5" />
              Add Location
            </button>
          </div>
        )}
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

      {/* Sites with their locations */}
      {sites.map(site => {
        const siteLocations = getLocationsForSite(site.id);
        if (siteLocations.length === 0) return null;

        return (
          <div
            key={site.id}
            className="space-y-4"
            onDragOver={handleSiteDragOver}
            onDrop={(e) => handleSiteDrop(e, site)}
          >
            {/* Site Header */}
            <div
              className={`bg-gradient-to-r from-indigo-50 to-indigo-100 border-2 border-indigo-200 rounded-xl p-4 ${draggedSite?.id === site.id ? 'opacity-50' : ''} ${isManagerOrAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
              draggable={isManagerOrAdmin}
              onDragStart={(e) => handleSiteDragStart(e, site)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isManagerOrAdmin && (
                    <div className="text-indigo-400 hover:text-indigo-600 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                  )}
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Map className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-indigo-900">{site.name}</h3>
                    <p className="text-sm text-indigo-600">{siteLocations.length} location{siteLocations.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {isManagerOrAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingSite(site)}
                      className="p-2 text-indigo-600 hover:bg-indigo-200 rounded-lg transition-colors"
                      title="Edit Site"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSite(site.id)}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Delete Site"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Site's locations grouped by type */}
            <div className="pl-4 border-l-4 border-indigo-200 space-y-6">
              {renderLocationsByType(siteLocations)}
            </div>
          </div>
        );
      })}

      {/* Unassigned locations (no site) - shown for migration purposes */}
      {unassignedLocations.length > 0 && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-2 border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-400 to-slate-500 rounded-lg flex items-center justify-center">
                <Map className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-700">Unassigned Locations</h3>
                <p className="text-sm text-slate-500">These locations need to be assigned to a site</p>
              </div>
            </div>
          </div>
          <div className="pl-4 border-l-4 border-slate-200 space-y-6">
            {renderLocationsByType(unassignedLocations)}
          </div>
        </div>
      )}

      {/* Empty state - no sites and no locations */}
      {sites.length === 0 && locations.length === 0 && (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Map className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">No sites or storage locations yet</p>
          {isManagerOrAdmin ? (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowAddSite(true)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                Create First Site
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Contact a manager to create sites and locations</p>
          )}
        </div>
      )}

      {/* Has sites but no locations */}
      {sites.length > 0 && locations.length === 0 && (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">Sites created, but no locations yet</p>
          {isManagerOrAdmin ? (
            <button
              onClick={() => setShowAddLocation(true)}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Add First Location
            </button>
          ) : (
            <p className="text-sm text-slate-400">Contact a manager to create locations</p>
          )}
        </div>
      )}

      {/* Modals */}
      {/* Site Modals */}
      {(showAddSite || editingSite) && (
        <EditSiteModal
          site={editingSite}
          onSave={handleSaveSite}
          onCancel={() => {
            setShowAddSite(false);
            setEditingSite(null);
          }}
        />
      )}

      {/* Location Modals */}
      {showAddLocation && (
        <EditLocationModal
          location={null}
          sites={sites}
          onSave={handleAddLocation}
          onCancel={() => setShowAddLocation(false)}
        />
      )}
      {editingLocation && (
        <EditLocationModal
          location={editingLocation}
          sites={sites}
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
      {viewingBoat && viewingBoat.isInventory && (
        <InventoryBoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
      {viewingBoat && !viewingBoat.isInventory && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          onRemove={() => removeBoat(viewingBoat)}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
          currentUser={currentUser}
        />
      )}

      {/* Maximized Location Modal */}
      {maximizedLocation && (
        <MaximizedLocationModal
          location={locations.find(l => l.id === maximizedLocation.id) || maximizedLocation}
          boats={boats}
          onSlotClick={handleSlotClick}
          onBoatClick={(boat) => setViewingBoat(boat)}
          onDragStart={handleDragStart}
          onDrop={handleGridDrop}
          onDragEnd={handleDragEnd}
          draggingBoat={draggingBoat}
          onClose={() => setMaximizedLocation(null)}
        />
      )}
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

// BoatDetailsModal and InventoryBoatDetailsModal have been extracted to separate files
// See: src/components/modals/BoatDetailsModal.jsx
// See: src/components/modals/InventoryBoatDetailsModal.jsx

// Edit Site Modal - Simple modal for creating/editing sites
function EditSiteModal({ site, onSave, onCancel }) {
  const [name, setName] = useState(site?.name || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({ name: name.trim() });
    } catch (error) {
      console.error('Error saving site:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">{site ? 'Edit Site' : 'Add New Site'}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., Main Marina, Overflow Yard"
              required
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">
              A site represents a physical location where storage areas are located.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:bg-indigo-400"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? 'Saving...' : (site ? 'Save Changes' : 'Add Site')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditLocationModal({ location, sites = [], onSave, onCancel }) {
  const [formData, setFormData] = useState(location || {
    name: '',
    type: 'rack-building',
    layout: 'grid',
    rows: 4,
    columns: 8,
    site_id: sites.length > 0 ? sites[0].id : null
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
      site_id: formData.site_id,
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

          {sites.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Site</label>
              <select
                value={formData.site_id || ''}
                onChange={(e) => setFormData({ ...formData, site_id: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a site...</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Which physical site/facility is this location at?
              </p>
            </div>
          )}

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
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Camera and OCR states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Manual search states
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [isSearchingDockmaster, setIsSearchingDockmaster] = useState(false);
  const [dockmasterSearchResults, setDockmasterSearchResults] = useState([]);

  // Refs for camera
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Effect to initialize camera when isCameraActive becomes true
  useEffect(() => {
    const initCamera = async () => {
      if (!isCameraActive || isCameraReady) return;

      console.log('[Camera] Initializing camera...');
      try {
        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert('Camera access is not supported on this browser. Please use a modern browser like Chrome, Safari, or Firefox.');
          setIsCameraActive(false);
          return;
        }

        console.log('[Camera] Requesting camera permission...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });

        console.log('[Camera] Stream obtained:', stream);
        console.log('[Camera] Video tracks:', stream.getVideoTracks());
        streamRef.current = stream;

        if (videoRef.current) {
          console.log('[Camera] Setting video source...');
          videoRef.current.srcObject = stream;

          // Wait for video to be ready
          videoRef.current.onloadedmetadata = () => {
            console.log('[Camera] Video metadata loaded, playing...');
            videoRef.current.play()
              .then(() => {
                console.log('[Camera] Video playing successfully');
                setIsCameraReady(true);
              })
              .catch(err => {
                console.error('[Camera] Video play error:', err);
                alert('Failed to start video playback: ' + err.message);
                setIsCameraActive(false);
              });
          };
        } else {
          console.error('[Camera] videoRef.current is null!');
          alert('Camera initialization error. Please try again.');
          setIsCameraActive(false);
        }
      } catch (error) {
        console.error('Camera access error:', error);
        setIsCameraActive(false);

        // Provide specific error messages based on error type
        let errorMessage = 'Camera access failed. ';

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage += 'Permission denied. Please allow camera access in your browser settings.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage += 'Camera is already in use by another application.';
        } else if (error.name === 'OverconstrainedError') {
          errorMessage += 'Camera does not meet the requirements.';
        } else if (error.name === 'NotSupportedError') {
          errorMessage += 'Camera access requires HTTPS connection.';
        } else {
          errorMessage += 'Please check your browser permissions and try again. Error: ' + error.message;
        }

        alert(errorMessage);
      }
    };

    initCamera();
  }, [isCameraActive, isCameraReady]);

  // Camera functions
  const startCamera = () => {
    console.log('[Camera] Start camera button clicked');
    setIsCameraActive(true);
  };

  const stopCamera = () => {
    console.log('[Camera] Stopping camera...');
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraReady(false);
  };

  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas) {
      const context = canvas.getContext('2d');

      // Video dimensions (actual resolution)
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      // Scan box region matches the overlay: 80% width, 20% height, starts at 40% from top
      // left: 10%, top: 40%, width: 80%, height: 20%
      const scanBoxX = videoWidth * 0.10;
      const scanBoxY = videoHeight * 0.40;
      const scanBoxWidth = videoWidth * 0.80;
      const scanBoxHeight = videoHeight * 0.20;

      // Set canvas to scan box dimensions only
      canvas.width = scanBoxWidth;
      canvas.height = scanBoxHeight;

      // Draw only the scan box region to the canvas
      context.drawImage(
        video,
        scanBoxX, scanBoxY, scanBoxWidth, scanBoxHeight,  // Source region
        0, 0, scanBoxWidth, scanBoxHeight                  // Destination
      );

      const imageDataUrl = canvas.toDataURL('image/png');
      setCapturedImage(imageDataUrl);
      stopCamera();
      processImage(imageDataUrl);
    }
  };

  // Image preprocessing utilities for better OCR on metallic/engraved surfaces
  const preprocessImage = (canvas, mode) => {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    if (mode === 'grayscale') {
      // Convert to grayscale
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
    } else if (mode === 'invert') {
      // Invert colors (helps with shiny metal where letters appear darker)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    } else if (mode === 'highContrast') {
      // High contrast with adaptive threshold
      // First convert to grayscale
      const grayValues = [];
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayValues.push(gray);
      }
      // Calculate mean for threshold
      const mean = grayValues.reduce((a, b) => a + b, 0) / grayValues.length;
      // Apply threshold with some tolerance
      for (let i = 0; i < data.length; i += 4) {
        const gray = grayValues[i / 4];
        const value = gray > mean - 20 ? 255 : 0; // Slight bias toward white
        data[i] = data[i + 1] = data[i + 2] = value;
      }
    } else if (mode === 'edgeEnhance') {
      // Edge enhancement for engraved text
      const width = canvas.width;
      const height = canvas.height;
      const copy = new Uint8ClampedArray(data);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          // Sobel-like edge detection
          const gx =
            -copy[idx - 4 - width * 4] + copy[idx + 4 - width * 4] +
            -2 * copy[idx - 4] + 2 * copy[idx + 4] +
            -copy[idx - 4 + width * 4] + copy[idx + 4 + width * 4];
          const gy =
            -copy[idx - width * 4 - 4] - 2 * copy[idx - width * 4] - copy[idx - width * 4 + 4] +
            copy[idx + width * 4 - 4] + 2 * copy[idx + width * 4] + copy[idx + width * 4 + 4];
          const edge = Math.min(255, Math.sqrt(gx * gx + gy * gy));
          // Combine original with edge
          const gray = 0.299 * copy[idx] + 0.587 * copy[idx + 1] + 0.114 * copy[idx + 2];
          const enhanced = Math.min(255, gray + edge * 0.5);
          data[idx] = data[idx + 1] = data[idx + 2] = enhanced > 128 ? 255 : 0;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  // OCR processing with multiple passes
  const processImage = async (imageDataUrl) => {
    setIsProcessing(true);
    setOcrResult('Processing...');

    try {
      // Create a canvas to work with the image
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageDataUrl;
      });

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tempCtx = tempCanvas.getContext('2d');

      // Define preprocessing modes to try
      const modes = [
        { name: 'original', process: false },
        { name: 'inverted', process: 'invert' },
        { name: 'highContrast', process: 'highContrast' },
        { name: 'edgeEnhance', process: 'edgeEnhance' },
      ];

      let bestResult = { text: '', confidence: 0, mode: '' };

      // Create a single worker to reuse
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            // Only log occasionally to avoid spam
            if (Math.round(m.progress * 100) % 25 === 0) {
              console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      });

      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
        tessedit_pageseg_mode: '7', // Treat image as single text line
      });

      // Try each preprocessing mode
      for (const mode of modes) {
        console.log(`[OCR] Trying ${mode.name} mode...`);
        setOcrResult(`Trying ${mode.name}...`);

        // Draw original image
        tempCtx.drawImage(img, 0, 0);

        // Apply preprocessing if needed
        let processedImage = imageDataUrl;
        if (mode.process) {
          processedImage = preprocessImage(tempCanvas, mode.process);
        }

        try {
          const { data } = await worker.recognize(processedImage);

          // Clean the result
          let cleanedText = data.text.toUpperCase().replace(/[^A-Z0-9]/g, '');

          // Strip "US" prefix if present
          if (cleanedText.startsWith('US')) {
            cleanedText = cleanedText.substring(2);
          }

          console.log(`[OCR] ${mode.name}: "${cleanedText}" (confidence: ${data.confidence}%)`);

          // Keep the best result (prioritize longer valid text with decent confidence)
          const isValidLength = cleanedText.length >= 8 && cleanedText.length <= 20;
          const currentBestValid = bestResult.text.length >= 8 && bestResult.text.length <= 20;

          if (isValidLength) {
            if (!currentBestValid || data.confidence > bestResult.confidence) {
              bestResult = { text: cleanedText, confidence: data.confidence, mode: mode.name };
              console.log(`[OCR] New best result from ${mode.name}: "${cleanedText}"`);
            }
          } else if (!currentBestValid && cleanedText.length > bestResult.text.length) {
            // If we don't have a valid result yet, keep the longest one
            bestResult = { text: cleanedText, confidence: data.confidence, mode: mode.name };
          }

          // If we get a high confidence valid result, stop early
          if (isValidLength && data.confidence > 80) {
            console.log(`[OCR] High confidence result found, stopping early`);
            break;
          }
        } catch (err) {
          console.error(`[OCR] Error with ${mode.name} mode:`, err);
        }
      }

      await worker.terminate();

      // Use the best result
      setOcrResult(bestResult.text || 'No text detected');
      setOcrConfidence(bestResult.confidence);

      console.log(`[OCR] Final result: "${bestResult.text}" from ${bestResult.mode} (confidence: ${bestResult.confidence}%)`);

      // Search for boat with this Hull ID
      if (bestResult.text.length >= 8) {
        await searchBoatByHullId(bestResult.text);
      } else {
        setShowManualSearch(true);
      }
    } catch (error) {
      console.error('OCR error:', error);
      alert('Failed to process image. Please try again or use manual entry.');
      setShowManualSearch(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // Search by Hull ID
  const searchBoatByHullId = async (hullId) => {
    try {
      setIsLoading(true);

      // Search in customer boats
      let foundBoat = await boatsService.getByHullId(hullId);

      // If not found, search in inventory boats
      if (!foundBoat) {
        foundBoat = await inventoryBoatsService.getByHullId(hullId);
      }

      if (foundBoat) {
        // Found boat - show location picker
        setSelectedBoat(foundBoat);
        setShowLocationPicker(true);
        setOcrResult(`✓ Found: ${foundBoat.name}`);
      } else {
        // Not found - show manual search
        alert(`No boat found with Hull ID: ${hullId}\nUse manual search below.`);
        setShowManualSearch(true);
        setSearchQuery(hullId);
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Error searching for boat. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Autocomplete - provides suggestions as user types
  const handleSearchInputChange = (value) => {
    setSearchQuery(value);
    setDockmasterSearchResults([]); // Clear Dockmaster results when typing

    if (value.length < 2) {
      setAutocompleteResults([]);
      return;
    }

    const query = value.toLowerCase().trim();

    // Search across all boats for autocomplete
    const matches = boats.filter(boat =>
      boat.name?.toLowerCase().includes(query) ||
      boat.owner?.toLowerCase().includes(query) ||
      boat.hullId?.toLowerCase().includes(query) ||
      boat.model?.toLowerCase().includes(query)
    ).slice(0, 5); // Limit to 5 suggestions

    setAutocompleteResults(matches);
  };

  // Manual search
  const searchBoatsManually = () => {
    const query = searchQuery.toLowerCase().trim();

    if (!query) {
      alert('Please enter a search term');
      return;
    }

    setAutocompleteResults([]); // Clear autocomplete when doing full search

    // Search across all boats
    const results = boats.filter(boat =>
      boat.name?.toLowerCase().includes(query) ||
      boat.owner?.toLowerCase().includes(query) ||
      boat.hullId?.toLowerCase().includes(query) ||
      boat.model?.toLowerCase().includes(query)
    );

    setSearchResults(results);
  };

  // Search Dockmaster for boats not yet imported
  const searchDockmaster = async () => {
    const query = searchQuery.trim();

    if (!query) {
      alert('Please enter a Hull ID to search Dockmaster');
      return;
    }

    setIsSearchingDockmaster(true);
    setDockmasterSearchResults([]);

    try {
      // Call the existing Dockmaster search edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/dockmaster-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ searchString: query }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      // Dockmaster returns an array of boats directly
      const boats = Array.isArray(data) ? data : (data.boats || []);

      if (boats.length > 0) {
        // Transform Dockmaster response to our format
        // Handle both raw Dockmaster API format and pre-transformed format
        const transformedBoats = boats.map((boat) => ({
          id: boat.id,
          name: boat.name || boat.description ||
                `${boat.boatModelInfo?.year || boat.year || ''} ${boat.boatModelInfo?.vendorName || boat.make || ''} ${boat.boatModelInfo?.modelNumber || boat.model || ''}`.trim() ||
                'Unknown',
          year: boat.boatModelInfo?.year || boat.year,
          make: boat.boatModelInfo?.vendorName || boat.make,
          model: boat.boatModelInfo?.modelNumber || boat.model,
          hullId: boat.serialNumber || boat.hin || boat.hullId,
          serialNumber: boat.serialNumber || boat.hin || boat.hullId,
          owner: boat.custName || boat.customerName || boat.owner,
          custId: boat.custId,
          custName: boat.custName,
          dockmasterId: boat.id,
          // Pass through the raw boat data for import
          boatModelInfo: boat.boatModelInfo,
        }));
        setDockmasterSearchResults(transformedBoats);
      } else {
        alert(`No boats found in Dockmaster matching: ${query}`);
      }
    } catch (error) {
      console.error('Dockmaster search error:', error);
      alert('Failed to search Dockmaster. Please try again.');
    } finally {
      setIsSearchingDockmaster(false);
    }
  };

  // Import a boat from Dockmaster search results
  const importFromDockmaster = async (dockmasterBoat) => {
    try {
      setIsLoading(true);

      // Import the boat using existing service
      const importedBoat = await boatsService.importFromDockmaster(dockmasterBoat);

      if (importedBoat) {
        // Add to local boats list and select it
        setSelectedBoat(importedBoat);
        setShowLocationPicker(true);
        setShowManualSearch(false);
        setDockmasterSearchResults([]);
        setSearchQuery('');

        // Refresh boats list
        if (onUpdateBoats) {
          const updatedBoats = [...boats, importedBoat];
          onUpdateBoats(updatedBoats);
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import boat from Dockmaster. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectBoatFromSearch = (boat) => {
    setSelectedBoat(boat);
    setShowLocationPicker(true);
    setShowManualSearch(false);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleLocationMove = async () => {
    if (!selectedBoat || !selectedLocation) {
      alert('Please select a location');
      return;
    }

    const location = locations.find(l => l.name === selectedLocation);
    if (!location) return;

    // Remove from old location if exists
    if (selectedBoat.location) {
      const oldLocation = locations.find(l => l.name === selectedBoat.location);
      if (oldLocation && selectedBoat.slot) {
        const updatedOldLocation = {
          ...oldLocation,
          boats: { ...oldLocation.boats }
        };
        delete updatedOldLocation.boats[selectedBoat.slot];
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

          if (!(location.boats && location.boats[slotId])) {
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
        [finalSlot]: selectedBoat.id
      }
    };

    // Update boat with new location
    const updatedBoat = {
      ...selectedBoat,
      location: location.name,
      slot: finalSlot
    };

    await onUpdateLocations(locations.map(l => l.id === location.id ? updatedLocation : l));
    onUpdateBoats(boats.map(b => b.id === selectedBoat.id ? updatedBoat : b));

    // Show success and reset
    alert(`✓ ${selectedBoat.name} moved to ${location.name} (${finalSlot})`);
    handleReset();
  };

  const handleReset = () => {
    stopCamera();
    setSelectedBoat(null);
    setSelectedLocation('');
    setSelectedSlot('');
    setShowLocationPicker(false);
    setCapturedImage(null);
    setOcrResult('');
    setOcrConfidence(0);
    setSearchResults([]);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Scan Hull ID Tag</h2>
        <p className="text-slate-600">Use your camera to scan the boat's Hull ID tag</p>
      </div>

      {!showLocationPicker && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
          {/* Camera View - Initial State */}
          {!capturedImage && !isCameraActive && (
            <div className="text-center py-8">
              <Camera className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <p className="text-slate-600 mb-6">
                Point your camera at the boat's Hull ID tag
              </p>
              <button
                onClick={startCamera}
                disabled={isLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
              >
                Open Camera
              </button>
            </div>
          )}

          {/* Active Camera with Scan Box Overlay */}
          {isCameraActive && (
            <div className="flex flex-col gap-4">
              <div className="relative inline-block">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-lg"
                />
                {/* Scan Box Overlay - only covers video */}
                <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden">
                  {/* Top dark area */}
                  <div className="absolute top-0 left-0 right-0 h-[40%] bg-black/50" />
                  {/* Bottom dark area */}
                  <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-black/50" />
                  {/* Left dark area (middle section) */}
                  <div className="absolute top-[40%] left-0 w-[10%] h-[20%] bg-black/50" />
                  {/* Right dark area (middle section) */}
                  <div className="absolute top-[40%] right-0 w-[10%] h-[20%] bg-black/50" />
                  {/* Scan box border */}
                  <div
                    className="absolute border-3 border-green-400 rounded-lg"
                    style={{
                      top: '40%',
                      left: '10%',
                      width: '80%',
                      height: '20%',
                      borderWidth: '3px'
                    }}
                  >
                    {/* Corner markers */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br" />
                  </div>
                  {/* Instructions */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-3 text-center">
                    <p className="text-white text-sm font-medium bg-black/60 px-3 py-1 rounded-full">
                      Position Hull ID inside the box
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={captureImage}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Capture Hull ID
                </button>
                <button
                  onClick={stopCamera}
                  className="px-6 py-3 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-600">Reading Hull ID...</p>
            </div>
          )}

          {/* Captured Image Preview with OCR Result */}
          {capturedImage && !isProcessing && (
            <div>
              <img src={capturedImage} alt="Captured" className="w-full rounded-lg mb-4" />
              {ocrResult && (
                <div className="bg-slate-50 p-4 rounded-lg mb-4">
                  <p className="text-sm text-slate-600">Detected Hull ID:</p>
                  <p className="text-2xl font-mono font-bold text-slate-900">{ocrResult}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Confidence: {Math.round(ocrConfidence)}%
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  setCapturedImage(null);
                  setOcrResult('');
                  startCamera();
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Scan Again
              </button>
            </div>
          )}

          {/* Manual Search Fallback */}
          {showManualSearch && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="text-lg font-semibold mb-3">Manual Search</h3>
              <div className="relative">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchInputChange(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchBoatsManually()}
                    placeholder="Search by name, owner, or Hull ID..."
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={searchBoatsManually}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Search
                  </button>
                </div>

                {/* Autocomplete dropdown */}
                {autocompleteResults.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {autocompleteResults.map(boat => (
                      <button
                        key={boat.id}
                        onClick={() => {
                          selectBoatFromSearch(boat);
                          setAutocompleteResults([]);
                        }}
                        className="w-full p-3 hover:bg-blue-50 transition-colors text-left border-b border-slate-100 last:border-b-0"
                      >
                        <p className="font-medium text-slate-900">{boat.name}</p>
                        <p className="text-xs text-slate-500">
                          {boat.model} {boat.hullId && <span className="font-mono">• {boat.hullId}</span>}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Local search results */}
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                  <p className="text-sm text-slate-500 mb-2">Found {searchResults.length} boat(s):</p>
                  {searchResults.map(boat => (
                    <button
                      key={boat.id}
                      onClick={() => selectBoatFromSearch(boat)}
                      className="w-full p-3 border border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                    >
                      <p className="font-bold text-slate-900">{boat.name}</p>
                      <p className="text-sm text-slate-600">{boat.model} • {boat.owner}</p>
                      {boat.hullId && (
                        <p className="text-xs text-slate-500 font-mono mt-1">Hull ID: {boat.hullId}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* No results - show Dockmaster search option */}
              {searchResults.length === 0 && searchQuery.length >= 3 && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 mb-3">
                    No boats found locally. Search Dockmaster for boats not yet imported?
                  </p>
                  <button
                    onClick={searchDockmaster}
                    disabled={isSearchingDockmaster}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-amber-400 transition-colors"
                  >
                    {isSearchingDockmaster ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Search Dockmaster
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Dockmaster search results */}
              {dockmasterSearchResults.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    Found in Dockmaster ({dockmasterSearchResults.length}):
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {dockmasterSearchResults.map((boat, idx) => (
                      <div
                        key={boat.id || idx}
                        className="p-3 border border-amber-200 bg-amber-50 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-slate-900">{boat.name || 'Unknown'}</p>
                            <p className="text-sm text-slate-600">
                              {boat.year} {boat.make} {boat.model}
                            </p>
                            {boat.hullId && (
                              <p className="text-xs text-slate-500 font-mono mt-1">Hull ID: {boat.hullId}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-1">Owner: {boat.owner || 'Unknown'}</p>
                          </div>
                          <button
                            onClick={() => importFromDockmaster(boat)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors"
                          >
                            {isLoading ? 'Importing...' : 'Import'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hidden canvas for image processing */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && selectedBoat && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <div className={`status-${selectedBoat.status} p-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                  <Package className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">{selectedBoat.name}</h3>
                  <p className="text-white/90">
                    {selectedBoat.model}
                    {selectedBoat.hullId && (
                      <> • <span className="font-mono text-sm">Hull: {selectedBoat.hullId}</span></>
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
                  {selectedBoat.location ? (
                    <>{selectedBoat.location} <span className="text-slate-600">• Slot {selectedBoat.slot}</span></>
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
                      setSelectedSlot('');
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
                      💡 <strong>Tip:</strong> Slot will be auto-assigned to first available position.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleLocationMove}
                  disabled={!selectedLocation || isLoading}
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
                  <p className="font-semibold text-slate-900">{selectedBoat.owner}</p>
                </div>
                <div>
                  <p className="text-slate-600">Status</p>
                  <p className="font-semibold text-slate-900 capitalize">{selectedBoat.status.replace(/-/g, ' ')}</p>
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
function MyViewEditor({ locations, sites = [], boats, userPreferences, currentUser, onSavePreferences, onUpdateLocations, onUpdateBoats, onMoveBoat: onMoveBoatFromContainer }) {
  const [selectedLocations, setSelectedLocations] = useState(
    userPreferences.selectedLocations || locations.map(l => l.id)
  );
  const [locationOrder, setLocationOrder] = useState(
    userPreferences.locationOrder || locations.map(l => l.id)
  );
  const [draggedItem, setDraggedItem] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);

  // Boat assignment modal state
  const [showBoatAssignModal, setShowBoatAssignModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const mouseYRef = useRef(0);

  // Use unified remove boat hook
  const { removeBoat } = useRemoveBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => setViewingBoat(null)
  });

  // Use unified assign boat hook
  const { assignBoat } = useAssignBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => {
      setShowBoatAssignModal(false);
      setSelectedLocation(null);
      setSelectedSlot(null);
      setIsProcessing(false);
    }
  });

  // Use unified drag-and-drop hook
  const {
    draggingBoat,
    draggingFrom,
    isDragging,
    handleDragStart: handleBoatDragStart,
    handleDragEnd: handleBoatDragEnd,
    handleGridDrop: handleBoatDrop,
    handlePoolDrop
  } = useBoatDragDrop({
    onMoveBoat: onMoveBoatFromContainer
  });

  // Sync viewingBoat with boats array when it updates (real-time changes)
  useEffect(() => {
    if (viewingBoat) {
      const updatedBoat = boats.find(b => b.id === viewingBoat.id);
      if (updatedBoat && JSON.stringify(updatedBoat) !== JSON.stringify(viewingBoat)) {
        // Preserve the enriched properties (currentLocation, currentSlot)
        setViewingBoat({
          ...updatedBoat,
          currentLocation: viewingBoat.currentLocation,
          currentSlot: viewingBoat.currentSlot
        });
      }
    }
  }, [boats]);

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

  const handleSlotClick = (location, row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats ? location.boats[slotId] : null;

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

    const boat = boats.find(b => b.id === boatId);
    if (!boat) {
      console.error('[Assign] Boat not found:', boatId);
      setIsProcessing(false);
      return;
    }

    // Determine slot ID based on location type
    let slotId = null;
    if (selectedLocation.type === 'pool') {
      slotId = 'pool';
    } else {
      if (!selectedSlot) {
        console.error('[Assign] No slot selected for grid assignment');
        setIsProcessing(false);
        return;
      }

      // Validate slot coordinates
      if (typeof selectedSlot.row !== 'number' || typeof selectedSlot.col !== 'number') {
        console.error('[MyView Assign] Invalid slot coordinates:', selectedSlot);
        alert('Invalid slot selection. Please try again.');
        setIsProcessing(false);
        return;
      }

      slotId = selectedSlot.slotId;
    }

    // Use the unified hook to assign the boat
    await assignBoat(boatId, selectedLocation.id, slotId, boat.isInventory);
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    setIsProcessing(true);
    
    // For inventory boats, use AppContainer's handleMoveBoat directly
    if (boat.isInventory && onMoveBoatFromContainer) {
      try {
        await onMoveBoatFromContainer(boat.id, targetLocation?.id || null, targetSlot || null, true);
        
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
          setViewingBoat(null);
        }
      } catch (error) {
        console.error('Error moving inventory boat:', error);
        alert('Failed to move boat. Please try again.');
      }
      setIsProcessing(false);
      return;
    }
    
    // For regular boats, use the existing logic
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

          <div className="p-4 space-y-4">
            {/* Group locations by site */}
            {sites.map(site => {
              const siteLocations = allOrderedLocations.filter(l => l.site_id === site.id);
              if (siteLocations.length === 0) return null;

              return (
                <div key={site.id} className="space-y-2">
                  {/* Site Header (non-draggable) */}
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Map className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-semibold text-indigo-700">{site.name}</span>
                    <div className="flex-1 border-t border-indigo-200 ml-2" />
                  </div>

                  {/* Site's locations */}
                  {siteLocations.map((location) => (
                    <div
                      key={location.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, location.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, location.id)}
                      className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-move ml-4 ${
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
              );
            })}

            {/* Unassigned locations (no site) */}
            {(() => {
              const unassignedLocs = allOrderedLocations.filter(l => !l.site_id);
              if (unassignedLocs.length === 0) return null;

              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Map className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-500">Unassigned</span>
                    <div className="flex-1 border-t border-slate-200 ml-2" />
                  </div>

                  {unassignedLocs.map((location) => (
                    <div
                      key={location.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, location.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, location.id)}
                      className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-move ml-4 ${
                        draggedItem === location.id
                          ? 'border-blue-400 bg-blue-50 opacity-50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex-shrink-0 text-slate-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedLocations.includes(location.id)}
                        onChange={() => handleToggleLocation(location.id)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900">{location.name}</h4>
                        <p className="text-sm text-slate-600 capitalize">
                          {location.type} • {location.rows} × {location.columns}
                          {location.layout === 'u-shaped' && ' (U-shaped)'}
                        </p>
                      </div>
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
              );
            })()}
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
            // Handle pool-type locations
            if (location.type === 'pool') {
              const poolBoats = (location.pool_boats || [])
                .map(id => boats.find(b => b.id === id))
                .filter(Boolean);

              return (
                <PoolLocation
                  key={location.id}
                  location={location}
                  boats={poolBoats}
                  onBoatClick={(boat) => {
                    // Enrich boat with location data for pool boats
                    setViewingBoat({ ...boat, currentLocation: location, currentSlot: 'pool' });
                  }}
                  onAddBoat={() => {
                    setSelectedLocation(location);
                    setSelectedSlot('pool');
                    setShowBoatAssignModal(true);
                  }}
                  isDragging={isDragging}
                  onDragStart={(e, boat) => handleBoatDragStart(e, boat, location, 'pool')}
                  onDragEnd={handleBoatDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handlePoolDrop(location.id)}
                />
              );
            }

            // Grid-type locations
            return (
              <LocationGrid
                key={location.id}
                location={location}
                boats={boats.filter(b => !b.isInventory)}
                inventoryBoats={boats.filter(b => b.isInventory)}
                onSlotClick={(loc, row, col) => {
                  const slotId = `${row}-${col}`;
                  setSelectedLocation(location);
                  setSelectedSlot({ row, col, slotId });
                  setShowBoatAssignModal(true);
                }}
                onBoatClick={(boat) => {
                  // Find which slot in THIS location contains this boat
                  const boatSlot = Object.keys(location.boats || {}).find(slot => location.boats[slot] === boat.id);
                  setViewingBoat({
                    ...boat,
                    currentLocation: location,  // Use the location object we already have
                    currentSlot: boatSlot        // The actual slot ID from location.boats
                  });
                }}
                draggingBoat={draggingBoat}
                onDragStart={(e, boat, loc, slotId) => handleBoatDragStart(e, boat, location, slotId)}
                onDragEnd={handleBoatDragEnd}
                onDrop={(e, loc, row, col) => handleBoatDrop(e, location, row, col)}
                onMaximize={null}
              />
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

      {/* Boat Details Modal - use appropriate modal based on boat type */}
      {viewingBoat && viewingBoat.isInventory && (
        <InventoryBoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
      {viewingBoat && !viewingBoat.isInventory && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          onRemove={() => removeBoat(viewingBoat)}
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
function InventoryView({ inventoryBoats, locations, sites = [], lastSync, onSyncNow, dockmasterConfig, onUpdateInventoryBoats, onUpdateSingleBoat, onMoveBoat }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingBoat, setViewingBoat] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterYear, setFilterYear] = useState('all');
  const [filterMake, setFilterMake] = useState('all');
  const [filterModel, setFilterModel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Work order sync state
  const [isSyncingWorkOrders, setIsSyncingWorkOrders] = useState(false);
  const [woSyncProgress, setWoSyncProgress] = useState(null);

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
    // Modal will handle finding location data - just pass the boat
    setViewingBoat(boat);
  };

  const handleUpdateBoatFromModal = async (updatedBoat) => {
    // Update the modal state immediately for responsiveness
    setViewingBoat(updatedBoat);
    
    // Call direct update function to save to database
    if (onUpdateSingleBoat) {
      await onUpdateSingleBoat(updatedBoat.id, updatedBoat);
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

  // Sync all internal work orders (rigging WOs)
  const handleSyncAllWorkOrders = async () => {
    setIsSyncingWorkOrders(true);
    setWoSyncProgress({ status: 'Syncing all rigging work orders...', synced: 0, total: 0 });

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/dockmaster-internal-workorders-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ forceRefresh: true }),
      });

      const result = await response.json();

      if (result.success) {
        setWoSyncProgress({
          status: 'complete',
          synced: result.synced,
          total: result.total,
          duration: result.duration,
        });
      } else {
        setWoSyncProgress({
          status: 'error',
          error: result.error || 'Sync failed',
        });
      }
    } catch (error) {
      console.error('Work order sync error:', error);
      setWoSyncProgress({
        status: 'error',
        error: error.message || 'Sync failed',
      });
    } finally {
      setIsSyncingWorkOrders(false);
      // Clear progress after 5 seconds
      setTimeout(() => setWoSyncProgress(null), 5000);
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
        <div className="flex items-center gap-2">
          {/* Sync Work Orders Button */}
          <button
            onClick={handleSyncAllWorkOrders}
            disabled={isSyncingWorkOrders}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors shadow-md disabled:bg-purple-400"
            title="Sync all internal rigging work orders from Dockmaster"
          >
            {isSyncingWorkOrders ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Syncing WOs...
              </>
            ) : (
              <>
                <Wrench className="w-5 h-5" />
                Sync Rigging WOs
              </>
            )}
          </button>
          {/* Sync Inventory Button */}
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
                Sync Inventory
              </>
            )}
          </button>
        </div>
      </div>

      {/* Work Order Sync Progress/Status */}
      {woSyncProgress && (
        <div className={`rounded-xl p-4 border ${
          woSyncProgress.status === 'error'
            ? 'bg-red-50 border-red-200'
            : woSyncProgress.status === 'complete'
              ? 'bg-green-50 border-green-200'
              : 'bg-purple-50 border-purple-200'
        }`}>
          <div className="flex items-center gap-3">
            {woSyncProgress.status === 'error' ? (
              <>
                <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                  <X className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-red-900">Work Order Sync Failed</p>
                  <p className="text-sm text-red-700">{woSyncProgress.error}</p>
                </div>
              </>
            ) : woSyncProgress.status === 'complete' ? (
              <>
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-green-900">Work Orders Synced Successfully</p>
                  <p className="text-sm text-green-700">
                    Synced {woSyncProgress.synced} of {woSyncProgress.total} work orders in {woSyncProgress.duration}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <div>
                  <p className="font-semibold text-purple-900">Syncing Work Orders</p>
                  <p className="text-sm text-purple-700">{woSyncProgress.status}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

function SettingsView({ dockmasterConfig, onSaveConfig, currentUser, users, onUpdateUsers, onReloadUsers }) {
  const [formData, setFormData] = useState(dockmasterConfig || {
    username: '',
    password: ''
  });
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const { updatePassword } = useAuth();

  const handleSave = async () => {
    await onSaveConfig(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleAddUser = async (newUser) => {
    // User was created via edge function, reload the users list
    if (onReloadUsers) {
      await onReloadUsers();
    }
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

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    try {
      const { error } = await updatePassword(newPassword);
      if (error) {
        setPasswordError(error.message || 'Failed to update password');
      } else {
        setPasswordSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowChangePassword(false);
          setPasswordSuccess(false);
        }, 2000);
      }
    } catch (error) {
      setPasswordError('An error occurred while updating password');
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

                {/* Password Change Section */}
                <div className="mt-8 pt-8 border-t border-slate-200">
                  <h4 className="text-lg font-bold text-slate-900 mb-4">Change Password</h4>

                  {!showChangePassword ? (
                    <button
                      onClick={() => setShowChangePassword(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                    >
                      Change Password
                    </button>
                  ) : (
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter new password"
                          required
                          minLength={6}
                          disabled={passwordSuccess}
                        />
                        <p className="text-xs text-slate-500 mt-1">Minimum 6 characters</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Confirm Password
                        </label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Confirm new password"
                          required
                          minLength={6}
                          disabled={passwordSuccess}
                        />
                      </div>

                      {passwordError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700">{passwordError}</p>
                        </div>
                      )}

                      {passwordSuccess && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-700">Password updated successfully!</p>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={passwordSuccess}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Update Password
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowChangePassword(false);
                            setNewPassword('');
                            setConfirmPassword('');
                            setPasswordError('');
                            setPasswordSuccess(false);
                          }}
                          disabled={passwordSuccess}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
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
  const [formData, setFormData] = useState(user ? {
    ...user,
    password: ''
  } : {
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'user'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!user) {
        // Creating new user - need to create auth user first
        if (!formData.email) {
          throw new Error('Email is required');
        }
        if (!formData.password || formData.password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }

        // Import supabase for auth
        const { supabase } = await import('./supabaseClient');

        // Create auth user with Supabase Admin API via edge function
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            name: formData.name,
            username: formData.username,
            role: formData.role,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create user');
        }

        const result = await response.json();
        console.log('User created:', result);
        
        onSave(result.user);
      } else {
        // Updating existing user
        onSave(formData);
      }
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

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
              disabled={loading}
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
              disabled={loading}
            />
          </div>

          {!user && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@boatsbygeorge.com"
                required
                disabled={loading}
              />
              <p className="text-xs text-slate-500 mt-1">Must be a @boatsbygeorge.com email</p>
            </div>
          )}

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
              minLength={6}
              disabled={loading}
            />
            {!user && <p className="text-xs text-slate-500 mt-1">Minimum 6 characters</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {user ? 'Saving...' : 'Creating...'}
                </span>
              ) : (
                user ? 'Save Changes' : 'Create User'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// BOAT SHOW LAYOUT PLANNER COMPONENT
// ============================================================================

// Supabase-based boat shows service
const boatShowsService = {
  async getAll() {
    const { data, error } = await supabase
      .from('boat_shows')
      .select('*')
      .order('show_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data || [];
  },
  async create(show) {
    const { data, error } = await supabase
      .from('boat_shows')
      .insert([{
        name: show.name,
        venue: show.venue || null,
        show_date: show.showDate || null,
        width_ft: show.widthFt || 100,
        height_ft: show.heightFt || 80,
        notes: show.notes || null,
      }])
      .select()
      .single();
    if (error) throw error;
    return { ...data, widthFt: data.width_ft, heightFt: data.height_ft, showDate: data.show_date };
  },
  async update(id, updates) {
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.venue !== undefined) dbUpdates.venue = updates.venue;
    if (updates.showDate !== undefined) dbUpdates.show_date = updates.showDate;
    if (updates.widthFt !== undefined) dbUpdates.width_ft = updates.widthFt;
    if (updates.heightFt !== undefined) dbUpdates.height_ft = updates.heightFt;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    const { data, error } = await supabase
      .from('boat_shows')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ...data, widthFt: data.width_ft, heightFt: data.height_ft, showDate: data.show_date };
  },
  async delete(id) {
    const { error } = await supabase.from('boat_shows').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
  async getItems(showId) {
    const { data, error } = await supabase
      .from('boat_show_items')
      .select('*, inventory_boat:inventory_boats(*)')
      .eq('show_id', showId)
      .order('z_index', { ascending: true });
    if (error) throw error;
    return (data || []).map(item => ({
      ...item,
      widthFt: item.width_ft,
      heightFt: item.height_ft,
      itemType: item.item_type,
      inventoryBoatId: item.inventory_boat_id,
      zIndex: item.z_index,
      boat: item.inventory_boat ? {
        ...item.inventory_boat,
        length: item.inventory_boat.length,
        beam: item.inventory_boat.beam,
      } : null,
    }));
  },
  async addItem(showId, item) {
    const { data, error } = await supabase
      .from('boat_show_items')
      .insert([{
        show_id: showId,
        item_type: item.itemType,
        inventory_boat_id: item.inventoryBoatId || null,
        x: item.x || 0,
        y: item.y || 0,
        rotation: item.rotation || 0,
        width_ft: item.widthFt || null,
        height_ft: item.heightFt || null,
        label: item.label || null,
        color: item.color || null,
        z_index: item.zIndex || 0,
      }])
      .select('*, inventory_boat:inventory_boats(*)')
      .single();
    if (error) throw error;
    return {
      ...data,
      widthFt: data.width_ft,
      heightFt: data.height_ft,
      itemType: data.item_type,
      inventoryBoatId: data.inventory_boat_id,
      zIndex: data.z_index,
      boat: data.inventory_boat,
    };
  },
  async updateItem(itemId, updates) {
    const dbUpdates = {};
    if (updates.x !== undefined) dbUpdates.x = updates.x;
    if (updates.y !== undefined) dbUpdates.y = updates.y;
    if (updates.rotation !== undefined) dbUpdates.rotation = updates.rotation;
    if (updates.widthFt !== undefined) dbUpdates.width_ft = updates.widthFt;
    if (updates.heightFt !== undefined) dbUpdates.height_ft = updates.heightFt;
    if (updates.label !== undefined) dbUpdates.label = updates.label;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.zIndex !== undefined) dbUpdates.z_index = updates.zIndex;
    const { data, error } = await supabase
      .from('boat_show_items')
      .update(dbUpdates)
      .eq('id', itemId)
      .select('*, inventory_boat:inventory_boats(*)')
      .single();
    if (error) throw error;
    return {
      ...data,
      widthFt: data.width_ft,
      heightFt: data.height_ft,
      itemType: data.item_type,
      inventoryBoatId: data.inventory_boat_id,
      zIndex: data.z_index,
      boat: data.inventory_boat,
    };
  },
  async removeItem(itemId) {
    const { error } = await supabase.from('boat_show_items').delete().eq('id', itemId);
    if (error) throw error;
    return true;
  }
};

const SHOW_ITEM_TYPES = {
  boat: { label: 'Boat', icon: Anchor, color: '#3b82f6' },
  dock: { label: 'Dock', icon: Layers, color: '#8b5cf6', defaultWidth: 20, defaultHeight: 6 },
  steps: { label: 'Steps', icon: Package, color: '#f59e0b', defaultWidth: 3, defaultHeight: 4 },
  plant: { label: 'Plant', icon: Flower2, color: '#22c55e', defaultWidth: 3, defaultHeight: 3 },
  furniture: { label: 'Furniture', icon: Armchair, color: '#ec4899', defaultWidth: 4, defaultHeight: 4 },
  tent: { label: 'Tent/Canopy', icon: Tent, color: '#06b6d4', defaultWidth: 10, defaultHeight: 10 },
  banner: { label: 'Banner/Sign', icon: Flag, color: '#ef4444', defaultWidth: 8, defaultHeight: 2 },
  table: { label: 'Table', icon: Table, color: '#6366f1', defaultWidth: 6, defaultHeight: 3 },
};

function BoatShowPlanner({ inventoryBoats = [] }) {
  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showGridLines, setShowGridLines] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('boats');
  const [boatSearch, setBoatSearch] = useState('');
  const [dragItem, setDragItem] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const PIXELS_PER_FOOT = 10;
  const SNAP_SIZE = 5; // Snap to 5 foot grid

  useEffect(() => { loadShows(); }, []);
  useEffect(() => { if (selectedShow) loadItems(selectedShow.id); else setItems([]); }, [selectedShow?.id]);

  const loadShows = async () => {
    try {
      setLoading(true);
      const data = await boatShowsService.getAll();
      setShows(data);
      if (data.length > 0 && !selectedShow) setSelectedShow(data[0]);
    } catch (error) { console.error('Error loading shows:', error); }
    finally { setLoading(false); }
  };

  const loadItems = async (showId) => {
    try { const data = await boatShowsService.getItems(showId); setItems(data); }
    catch (error) { console.error('Error loading items:', error); }
  };

  const createShow = async (showData) => {
    try {
      setSaving(true);
      const newShow = await boatShowsService.create(showData);
      setShows([...shows, newShow]);
      setSelectedShow(newShow);
      setShowCreateModal(false);
    } catch (error) { console.error('Error creating show:', error); alert('Failed to create show'); }
    finally { setSaving(false); }
  };

  const updateShow = async (showData) => {
    try {
      setSaving(true);
      const updated = await boatShowsService.update(selectedShow.id, showData);
      setShows(shows.map(s => s.id === updated.id ? updated : s));
      setSelectedShow(updated);
      setShowEditModal(false);
    } catch (error) { console.error('Error updating show:', error); alert('Failed to update show'); }
    finally { setSaving(false); }
  };

  const deleteShow = async (showId) => {
    if (!confirm('Delete this boat show and all its items?')) return;
    try {
      await boatShowsService.delete(showId);
      const remaining = shows.filter(s => s.id !== showId);
      setShows(remaining);
      if (selectedShow?.id === showId) setSelectedShow(remaining[0] || null);
    } catch (error) { console.error('Error deleting show:', error); alert('Failed to delete show'); }
  };

  const addBoatToShow = async (boat) => {
    if (!selectedShow) return;
    if (items.some(item => item.inventoryBoatId === boat.id)) { alert('This boat is already in the show layout'); return; }
    try {
      const newItem = await boatShowsService.addItem(selectedShow.id, {
        itemType: 'boat', inventoryBoatId: boat.id, x: 10, y: 10, rotation: 0,
        widthFt: parseFloat(boat.beam) || 10, heightFt: parseFloat(boat.length) || 25, label: boat.name, zIndex: items.length,
      });
      setItems([...items, newItem]);
      setSelectedItem(newItem);
    } catch (error) { console.error('Error adding boat:', error); alert('Failed to add boat to layout'); }
  };

  const addDecorativeItem = async (itemType) => {
    if (!selectedShow) return;
    const typeConfig = SHOW_ITEM_TYPES[itemType];
    try {
      const newItem = await boatShowsService.addItem(selectedShow.id, {
        itemType, x: 10, y: 10, rotation: 0, widthFt: typeConfig.defaultWidth, heightFt: typeConfig.defaultHeight,
        label: typeConfig.label, color: typeConfig.color, zIndex: items.length,
      });
      setItems([...items, newItem]);
      setSelectedItem(newItem);
    } catch (error) { console.error('Error adding item:', error); alert('Failed to add item to layout'); }
  };

  const updateItemPosition = async (itemId, x, y) => {
    try { const updated = await boatShowsService.updateItem(itemId, { x, y }); setItems(items.map(i => i.id === itemId ? updated : i)); if (selectedItem?.id === itemId) setSelectedItem(updated); }
    catch (error) { console.error('Error updating position:', error); }
  };

  const updateItemRotation = async (itemId, rotation) => {
    try { const updated = await boatShowsService.updateItem(itemId, { rotation }); setItems(items.map(i => i.id === itemId ? updated : i)); if (selectedItem?.id === itemId) setSelectedItem(updated); }
    catch (error) { console.error('Error updating rotation:', error); }
  };

  const updateItemSize = async (itemId, widthFt, heightFt) => {
    try { const updated = await boatShowsService.updateItem(itemId, { widthFt, heightFt }); setItems(items.map(i => i.id === itemId ? updated : i)); if (selectedItem?.id === itemId) setSelectedItem(updated); }
    catch (error) { console.error('Error updating size:', error); }
  };

  const deleteItem = async (itemId) => {
    try { await boatShowsService.removeItem(itemId); setItems(items.filter(i => i.id !== itemId)); if (selectedItem?.id === itemId) setSelectedItem(null); }
    catch (error) { console.error('Error deleting item:', error); }
  };

  const duplicateItem = async (item) => {
    if (item.itemType === 'boat') return;
    try {
      const newItem = await boatShowsService.addItem(selectedShow.id, {
        itemType: item.itemType, x: item.x + 5, y: item.y + 5, rotation: item.rotation,
        widthFt: item.widthFt, heightFt: item.heightFt, label: item.label + ' (copy)', color: item.color, zIndex: items.length,
      });
      setItems([...items, newItem]);
      setSelectedItem(newItem);
    } catch (error) { console.error('Error duplicating:', error); }
  };

  const bringToFront = async (item) => {
    const maxZ = Math.max(...items.map(i => i.zIndex || 0));
    try { const updated = await boatShowsService.updateItem(item.id, { zIndex: maxZ + 1 }); setItems(items.map(i => i.id === item.id ? updated : i)); if (selectedItem?.id === item.id) setSelectedItem(updated); }
    catch (error) { console.error('Error updating z-index:', error); }
  };

  const sendToBack = async (item) => {
    const minZ = Math.min(...items.map(i => i.zIndex || 0));
    try { const updated = await boatShowsService.updateItem(item.id, { zIndex: minZ - 1 }); setItems(items.map(i => i.id === item.id ? updated : i)); if (selectedItem?.id === item.id) setSelectedItem(updated); }
    catch (error) { console.error('Error updating z-index:', error); }
  };

  const getCanvasSize = () => selectedShow ? { width: selectedShow.widthFt * PIXELS_PER_FOOT, height: selectedShow.heightFt * PIXELS_PER_FOOT } : { width: 1000, height: 800 };

  const screenToCanvas = (screenX, screenY) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return { x: (screenX - rect.left - panOffset.x) / zoom / PIXELS_PER_FOOT, y: (screenY - rect.top - panOffset.y) / zoom / PIXELS_PER_FOOT };
  };

  const handleItemMouseDown = (e, item) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedItem(item);
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setDragOffset({ x: canvasPos.x - item.x, y: canvasPos.y - item.y });
    setDragItem(item);
    setIsDragging(true);
  };

  // Touch support for mobile/tablet
  const handleItemTouchStart = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    setSelectedItem(item);
    const canvasPos = screenToCanvas(touch.clientX, touch.clientY);
    setDragOffset({ x: canvasPos.x - item.x, y: canvasPos.y - item.y });
    setDragItem(item);
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e) => {
    if (isDragging && dragItem && selectedShow) {
      // Get position from mouse or touch
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const canvasPos = screenToCanvas(clientX, clientY);
      let newX = canvasPos.x - dragOffset.x;
      let newY = canvasPos.y - dragOffset.y;

      // Apply snap-to-grid if enabled
      if (snapToGrid) {
        newX = Math.round(newX / SNAP_SIZE) * SNAP_SIZE;
        newY = Math.round(newY / SNAP_SIZE) * SNAP_SIZE;
      } else {
        newX = Math.round(newX);
        newY = Math.round(newY);
      }

      // Constrain to canvas bounds
      newX = Math.max(0, Math.min(newX, selectedShow.widthFt - (dragItem.widthFt || 10)));
      newY = Math.max(0, Math.min(newY, selectedShow.heightFt - (dragItem.heightFt || 10)));
      setItems(items.map(i => i.id === dragItem.id ? { ...i, x: newX, y: newY } : i));
      if (selectedItem?.id === dragItem.id) setSelectedItem({ ...selectedItem, x: newX, y: newY });
    } else if (isPanning) {
      setPanOffset({ x: panOffset.x + e.movementX, y: panOffset.y + e.movementY });
    }
  }, [isDragging, dragItem, dragOffset, isPanning, panOffset, items, selectedItem, selectedShow, snapToGrid]);

  const handleMouseUp = useCallback(async () => {
    if (isDragging && dragItem) {
      const item = items.find(i => i.id === dragItem.id);
      if (item) await updateItemPosition(item.id, item.x, item.y);
    }
    setIsDragging(false);
    setDragItem(null);
    setIsPanning(false);
  }, [isDragging, dragItem, items]);

  useEffect(() => {
    if (isDragging || isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, isPanning, handleMouseMove, handleMouseUp]);

  const handlePrint = () => {
    const printContent = canvasRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>${selectedShow?.name || 'Boat Show Layout'}</title><style>body{margin:0;padding:20px;font-family:sans-serif}.header{text-align:center;margin-bottom:20px}.canvas-container{display:flex;justify-content:center}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="header"><h1>${selectedShow?.name || 'Boat Show Layout'}</h1>${selectedShow?.venue ? `<p>Venue: ${selectedShow.venue}</p>` : ''}${selectedShow?.showDate ? `<p>Date: ${new Date(selectedShow.showDate).toLocaleDateString()}</p>` : ''}<p>Dimensions: ${selectedShow?.widthFt}' × ${selectedShow?.heightFt}'</p></div><div class="canvas-container">${printContent.outerHTML}</div></body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handleExportPNG = () => {
    const svg = canvasRef.current;
    if (!svg) return;

    // Get SVG dimensions
    const svgWidth = svg.getAttribute('width');
    const svgHeight = svg.getAttribute('height');

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = parseInt(svgWidth) * 2; // 2x for better quality
    canvas.height = parseInt(svgHeight) * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      // Draw white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Draw SVG
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      // Download
      const link = document.createElement('a');
      link.download = `${selectedShow?.name || 'boat-show-layout'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.onerror = () => {
      console.error('Failed to load SVG for export');
      alert('Failed to export PNG. Please try Print instead.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const filteredBoats = inventoryBoats.filter(boat => !boatSearch || boat.name?.toLowerCase().includes(boatSearch.toLowerCase()) || boat.model?.toLowerCase().includes(boatSearch.toLowerCase()) || boat.make?.toLowerCase().includes(boatSearch.toLowerCase()));
  const boatsInLayout = new Set(items.filter(i => i.inventoryBoatId).map(i => i.inventoryBoatId));

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col animate-slide-in">
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-2xl font-bold text-slate-900">Boat Show Planner</h2><p className="text-slate-600">Design your boat show layout with drag and drop</p></div>
        <div className="flex items-center gap-2">
          {selectedShow && (
            <>
              <button onClick={handleExportPNG} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors" title="Export as PNG">
                <Download className="w-4 h-4" />Export
              </button>
              <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors">
                <Printer className="w-4 h-4" />Print
              </button>
              <button onClick={() => setShowEditModal(true)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors">
                <Edit2 className="w-4 h-4" />Edit
              </button>
            </>
          )}
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"><Plus className="w-4 h-4" />New Show</button>
        </div>
      </div>

      {shows.length > 0 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          {shows.map(show => (
            <button key={show.id} onClick={() => setSelectedShow(show)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all whitespace-nowrap ${selectedShow?.id === show.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white hover:border-blue-300 text-slate-700'}`}>
              <span className="font-medium">{show.name}</span>
              {show.showDate && <span className="text-xs text-slate-500">{new Date(show.showDate).toLocaleDateString()}</span>}
              <button onClick={(e) => { e.stopPropagation(); deleteShow(show.id); }} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
            </button>
          ))}
        </div>
      )}

      {selectedShow ? (
        <div className="flex flex-1 gap-4 min-h-0">
          <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden relative">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white rounded-lg shadow-md p-1">
              <button onClick={() => setZoom(Math.min(zoom + 0.1, 2))} className="p-2 hover:bg-slate-100 rounded" title="Zoom in"><ZoomIn className="w-4 h-4" /></button>
              <span className="text-sm font-medium text-slate-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(Math.max(zoom - 0.1, 0.3))} className="p-2 hover:bg-slate-100 rounded" title="Zoom out"><ZoomOut className="w-4 h-4" /></button>
              <div className="w-px h-6 bg-slate-200" />
              <button onClick={() => setShowGridLines(!showGridLines)} className={`p-2 rounded ${showGridLines ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100'}`} title="Toggle grid"><Grid className="w-4 h-4" /></button>
              <button onClick={() => setSnapToGrid(!snapToGrid)} className={`p-2 rounded ${snapToGrid ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100'}`} title={`Snap to grid (${SNAP_SIZE}ft)`}><Magnet className="w-4 h-4" /></button>
              <button onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }} className="p-2 hover:bg-slate-100 rounded" title="Reset view"><Move className="w-4 h-4" /></button>
            </div>
            <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-md px-3 py-2"><p className="text-sm font-medium text-slate-700">{selectedShow.widthFt}' × {selectedShow.heightFt}'</p></div>
            <div ref={containerRef} className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing" onMouseDown={(e) => { if (e.target === containerRef.current || e.target === canvasRef.current) { setIsPanning(true); setSelectedItem(null); } }}>
              <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`, transformOrigin: '0 0', padding: '40px' }}>
                <svg ref={canvasRef} width={getCanvasSize().width} height={getCanvasSize().height} className="bg-white shadow-lg" style={{ border: '2px solid #cbd5e1' }}>
                  {showGridLines && (<g><defs><pattern id="minorGrid" width={PIXELS_PER_FOOT} height={PIXELS_PER_FOOT} patternUnits="userSpaceOnUse"><path d={`M ${PIXELS_PER_FOOT} 0 L 0 0 0 ${PIXELS_PER_FOOT}`} fill="none" stroke="#e2e8f0" strokeWidth="0.5" /></pattern><pattern id="majorGrid" width={PIXELS_PER_FOOT * 10} height={PIXELS_PER_FOOT * 10} patternUnits="userSpaceOnUse"><rect width={PIXELS_PER_FOOT * 10} height={PIXELS_PER_FOOT * 10} fill="url(#minorGrid)" /><path d={`M ${PIXELS_PER_FOOT * 10} 0 L 0 0 0 ${PIXELS_PER_FOOT * 10}`} fill="none" stroke="#cbd5e1" strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill="url(#majorGrid)" /></g>)}
                  {items.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map(item => {
                    const width = (item.widthFt || 10) * PIXELS_PER_FOOT;
                    const height = (item.heightFt || 10) * PIXELS_PER_FOOT;
                    const x = item.x * PIXELS_PER_FOOT;
                    const y = item.y * PIXELS_PER_FOOT;
                    const isSelected = selectedItem?.id === item.id;
                    const isBeingDragged = isDragging && dragItem?.id === item.id;
                    const typeConfig = SHOW_ITEM_TYPES[item.itemType] || SHOW_ITEM_TYPES.furniture;
                    const boat = item.boat;
                    const displayName = boat ? `${boat.year || ''} ${boat.name}`.trim() : item.label;
                    const bgColor = item.itemType === 'boat' ? '#3b82f6' : (item.color || typeConfig.color);

                    // More realistic boat hull shape with curved bow and stern
                    const boatPath = `
                      M ${width * 0.12} ${height * 0.15}
                      Q ${width * 0.02} ${height * 0.15}, ${width * 0.02} ${height * 0.5}
                      Q ${width * 0.02} ${height * 0.85}, ${width * 0.12} ${height * 0.85}
                      L ${width * 0.75} ${height * 0.85}
                      Q ${width * 0.95} ${height * 0.85}, ${width * 0.98} ${height * 0.5}
                      Q ${width * 0.95} ${height * 0.15}, ${width * 0.75} ${height * 0.15}
                      Z
                    `;

                    return (
                      <g
                        key={item.id}
                        transform={`translate(${x + width/2}, ${y + height/2}) rotate(${item.rotation || 0}) translate(${-width/2}, ${-height/2})`}
                        onMouseDown={(e) => handleItemMouseDown(e, item)}
                        onTouchStart={(e) => handleItemTouchStart(e, item)}
                        style={{ cursor: 'move', touchAction: 'none' }}
                      >
                        {/* Drag feedback - dashed border */}
                        {isBeingDragged && (
                          <rect
                            x={-3} y={-3}
                            width={width + 6} height={height + 6}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            rx={8}
                          />
                        )}

                        {/* Item shape */}
                        {item.itemType === 'boat' ? (
                          <path
                            d={boatPath}
                            fill={bgColor}
                            stroke={isSelected ? '#1d4ed8' : '#2563eb'}
                            strokeWidth={isSelected ? 3 : 1.5}
                            style={{ filter: isBeingDragged ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' : 'none' }}
                          />
                        ) : (
                          <rect
                            width={width} height={height}
                            fill={bgColor}
                            stroke={isSelected ? '#1d4ed8' : 'rgba(0,0,0,0.2)'}
                            strokeWidth={isSelected ? 3 : 1}
                            rx={item.itemType === 'plant' ? width/2 : 4}
                            ry={item.itemType === 'plant' ? height/2 : 4}
                            style={{ filter: isBeingDragged ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' : 'none' }}
                          />
                        )}

                        {/* Labels */}
                        <text x={width / 2} y={height / 2 - 5} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={Math.max(10, Math.min(width, height) * 0.14)} fontWeight="bold" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                          {displayName?.substring(0, 18)}
                        </text>
                        <text x={width / 2} y={height / 2 + Math.min(width, height) * 0.18} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.9)" fontSize={Math.max(8, Math.min(width, height) * 0.1)} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                          {item.widthFt}' × {item.heightFt}'
                        </text>

                        {/* Selection handles */}
                        {isSelected && !isBeingDragged && (
                          <>
                            <rect x={-5} y={-5} width={10} height={10} fill="#1d4ed8" rx={2} />
                            <rect x={width-5} y={-5} width={10} height={10} fill="#1d4ed8" rx={2} />
                            <rect x={-5} y={height-5} width={10} height={10} fill="#1d4ed8" rx={2} />
                            <rect x={width-5} y={height-5} width={10} height={10} fill="#1d4ed8" rx={2} />
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          <div className="w-80 bg-white rounded-xl shadow-md border border-slate-200 flex flex-col overflow-hidden">
            <div className="flex border-b border-slate-200">
              <button onClick={() => setSidebarTab('boats')} className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${sidebarTab === 'boats' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>Boats</button>
              <button onClick={() => setSidebarTab('items')} className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${sidebarTab === 'items' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>Items</button>
              <button onClick={() => setSidebarTab('selected')} className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${sidebarTab === 'selected' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>Selected</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {sidebarTab === 'boats' && (
                <div className="space-y-3">
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search boats..." value={boatSearch} onChange={(e) => setBoatSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div className="space-y-2">
                    {filteredBoats.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No boats found</p> : filteredBoats.map(boat => {
                      const inLayout = boatsInLayout.has(boat.id);
                      return (<button key={boat.id} onClick={() => !inLayout && addBoatToShow(boat)} disabled={inLayout} className={`w-full p-3 rounded-lg border text-left transition-all ${inLayout ? 'border-green-200 bg-green-50 opacity-60' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm'}`}><p className="font-medium text-slate-900 text-sm truncate">{boat.name}</p><p className="text-xs text-slate-500 truncate">{boat.year} {boat.make} {boat.model}</p><div className="flex items-center gap-2 mt-1"><span className="text-xs text-slate-400">{boat.length || '?'}' × {boat.beam || '?'}'</span>{inLayout && <span className="text-xs text-green-600 font-medium">✓ In layout</span>}</div></button>);
                    })}
                  </div>
                </div>
              )}
              {sidebarTab === 'items' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">Click to add to layout</p>
                  {Object.entries(SHOW_ITEM_TYPES).filter(([key]) => key !== 'boat').map(([key, config]) => { const Icon = config.icon; return (<button key={key} onClick={() => addDecorativeItem(key)} className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all"><div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: config.color }}><Icon className="w-5 h-5 text-white" /></div><div className="text-left"><p className="font-medium text-slate-900 text-sm">{config.label}</p><p className="text-xs text-slate-500">{config.defaultWidth}' × {config.defaultHeight}'</p></div></button>); })}
                </div>
              )}
              {sidebarTab === 'selected' && (
                <div>
                  {selectedItem ? (
                    <div className="space-y-4">
                      <div className="p-3 bg-slate-50 rounded-lg"><p className="font-medium text-slate-900">{selectedItem.boat?.name || selectedItem.label || SHOW_ITEM_TYPES[selectedItem.itemType]?.label}</p><p className="text-xs text-slate-500 capitalize">{selectedItem.itemType}</p></div>
                      <div><label className="text-xs font-medium text-slate-700 mb-1 block">Position</label><div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-slate-500">X (ft)</label><input type="number" value={Math.round(selectedItem.x)} onChange={(e) => updateItemPosition(selectedItem.id, parseFloat(e.target.value) || 0, selectedItem.y)} className="w-full px-2 py-1 border border-slate-300 rounded text-sm" /></div><div><label className="text-xs text-slate-500">Y (ft)</label><input type="number" value={Math.round(selectedItem.y)} onChange={(e) => updateItemPosition(selectedItem.id, selectedItem.x, parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-300 rounded text-sm" /></div></div></div>
                      <div><label className="text-xs font-medium text-slate-700 mb-1 block">Size</label><div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-slate-500">Width (ft)</label><input type="number" value={selectedItem.widthFt || ''} onChange={(e) => updateItemSize(selectedItem.id, parseFloat(e.target.value) || 1, selectedItem.heightFt)} className="w-full px-2 py-1 border border-slate-300 rounded text-sm" /></div><div><label className="text-xs text-slate-500">Height (ft)</label><input type="number" value={selectedItem.heightFt || ''} onChange={(e) => updateItemSize(selectedItem.id, selectedItem.widthFt, parseFloat(e.target.value) || 1)} className="w-full px-2 py-1 border border-slate-300 rounded text-sm" /></div></div></div>
                      <div><label className="text-xs font-medium text-slate-700 mb-1 block">Rotation</label><div className="flex items-center gap-2"><button onClick={() => updateItemRotation(selectedItem.id, (selectedItem.rotation || 0) - 15)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg"><RotateCcw className="w-4 h-4" /></button><input type="number" value={selectedItem.rotation || 0} onChange={(e) => updateItemRotation(selectedItem.id, parseFloat(e.target.value) || 0)} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm text-center" /><span className="text-sm text-slate-500">°</span><button onClick={() => updateItemRotation(selectedItem.id, (selectedItem.rotation || 0) + 15)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg"><RotateCw className="w-4 h-4" /></button></div><div className="flex gap-1 mt-2">{[0, 45, 90, 135, 180, 270].map(angle => (<button key={angle} onClick={() => updateItemRotation(selectedItem.id, angle)} className={`flex-1 py-1 text-xs rounded ${selectedItem.rotation === angle ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>{angle}°</button>))}</div></div>
                      <div><label className="text-xs font-medium text-slate-700 mb-1 block">Layer</label><div className="flex gap-2"><button onClick={() => bringToFront(selectedItem)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"><ArrowUp className="w-4 h-4" />Front</button><button onClick={() => sendToBack(selectedItem)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"><ArrowDown className="w-4 h-4" />Back</button></div></div>
                      <div className="flex gap-2 pt-2 border-t border-slate-200">{selectedItem.itemType !== 'boat' && <button onClick={() => duplicateItem(selectedItem)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm"><Copy className="w-4 h-4" />Duplicate</button>}<button onClick={() => deleteItem(selectedItem.id)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"><Trash2 className="w-4 h-4" />Remove</button></div>
                    </div>
                  ) : <div className="text-center py-8 text-slate-500"><Move className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Click an item on the canvas to select it</p></div>}
                </div>
              )}
            </div>
            {sidebarTab !== 'selected' && items.length > 0 && (<div className="border-t border-slate-200 p-4"><p className="text-xs font-medium text-slate-700 mb-2">In Layout ({items.length})</p><div className="flex flex-wrap gap-1">{items.slice(0, 10).map(item => (<button key={item.id} onClick={() => { setSelectedItem(item); setSidebarTab('selected'); }} className={`px-2 py-1 text-xs rounded-full ${selectedItem?.id === item.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item.boat?.name?.substring(0, 10) || item.label?.substring(0, 10) || item.itemType}</button>))}{items.length > 10 && <span className="px-2 py-1 text-xs text-slate-400">+{items.length - 10} more</span>}</div></div>)}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-xl"><div className="text-center"><Anchor className="w-16 h-16 mx-auto mb-4 text-slate-300" /><h3 className="text-xl font-semibold text-slate-700 mb-2">No Boat Shows Yet</h3><p className="text-slate-500 mb-4">Create your first boat show layout to get started</p><button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"><Plus className="w-5 h-5" />Create Boat Show</button></div></div>
      )}

      {showCreateModal && <BoatShowModal title="Create New Boat Show" onSave={createShow} onCancel={() => setShowCreateModal(false)} saving={saving} />}
      {showEditModal && selectedShow && <BoatShowModal title="Edit Boat Show" show={selectedShow} onSave={updateShow} onCancel={() => setShowEditModal(false)} saving={saving} />}
    </div>
  );
}

function BoatShowModal({ title, show, onSave, onCancel, saving }) {
  const [formData, setFormData] = useState({ name: show?.name || 'New Boat Show', venue: show?.venue || '', showDate: show?.showDate || '', widthFt: show?.widthFt || 100, heightFt: show?.heightFt || 80, notes: show?.notes || '' });
  const handleSubmit = (e) => { e.preventDefault(); if (!formData.name.trim()) { alert('Please enter a show name'); return; } onSave(formData); };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200"><h3 className="text-xl font-bold text-slate-900">{title}</h3></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Show Name *</label><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., Miami Boat Show 2026" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Venue</label><input type="text" value={formData.venue} onChange={(e) => setFormData({ ...formData, venue: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., Convention Center" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Show Date</label><input type="date" value={formData.showDate} onChange={(e) => setFormData({ ...formData, showDate: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">Width (feet)</label><input type="number" value={formData.widthFt} onChange={(e) => setFormData({ ...formData, widthFt: parseFloat(e.target.value) || 100 })} min="10" max="1000" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label className="block text-sm font-medium text-slate-700 mb-1">Height (feet)</label><input type="number" value={formData.heightFt} onChange={(e) => setFormData({ ...formData, heightFt: parseFloat(e.target.value) || 100 })} min="10" max="1000" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Any additional notes..." /></div>
          <div className="flex gap-3 pt-4"><button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button><button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button></div>
        </form>
      </div>
    </div>
  );
}
