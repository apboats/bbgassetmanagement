// ============================================================================
// APP CONTAINER - DATA LAYER
// ============================================================================
// This component handles all Supabase data loading and state management
// It wraps the UI layer (App.jsx) and passes data + callbacks as props
// ============================================================================

import React, { useState, useEffect } from 'react'
import { useAuth } from './AuthProvider'
import supabaseService, { getAllBoatsCombined } from './services/supabaseService'
import App from './App'

const {
  boats: boatsService,
  inventoryBoats: inventoryBoatsService,
  locations: locationsService,
  sites: sitesService,
  preferences: preferencesService,
  dockmaster: dockmasterService,
  users: usersService,
  boatMovements: boatMovementsService,
} = supabaseService

function AppContainer() {
  const { user, signOut } = useAuth()

  // State
  const [boats, setBoats] = useState([])
  const [inventoryBoats, setInventoryBoats] = useState([])
  const [locations, setLocations] = useState([])
  const [sites, setSites] = useState([])
  const [userPreferences, setUserPreferences] = useState({})
  const [users, setUsers] = useState([])
  const [dockmasterConfig, setDockmasterConfig] = useState(null)
  const [lastInventorySync, setLastInventorySync] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load all data on mount
  useEffect(() => {
    if (user) {
      loadAllData()
    }
  }, [user])

  // Subscribe to real-time updates (optional but recommended)
  useEffect(() => {
    if (!user) return

    console.log('Setting up real-time subscriptions...')
    
    try {
      // Subscribe to boats changes
      const boatsChannel = supabaseService.subscriptions.subscribeToBoats(() => {
        console.log('Real-time update: boats changed')
        loadBoats()
      })

      // Subscribe to locations changes
      const locationsChannel = supabaseService.subscriptions.subscribeToLocations(() => {
        console.log('Real-time update: locations changed')
        loadLocations()
      })

      // Subscribe to inventory boats changes
      const inventoryChannel = supabaseService.subscriptions.subscribeToInventoryBoats(() => {
        console.log('Real-time update: inventory boats changed')
        loadInventoryBoats()
      })

      console.log('Real-time subscriptions active')

      return () => {
        console.log('Cleaning up real-time subscriptions...')
        supabaseService.subscriptions.unsubscribe(boatsChannel)
        supabaseService.subscriptions.unsubscribe(locationsChannel)
        supabaseService.subscriptions.unsubscribe(inventoryChannel)
      }
    } catch (error) {
      console.error('Error setting up real-time subscriptions:', error)
    }
  }, [user])

  // Load all data
  const loadAllData = async () => {
    setLoading(true)
    console.log('Starting to load all data...')
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Data loading timeout after 10 seconds')), 10000)
      )
      
      await Promise.race([
        Promise.all([
          loadBoats().then(() => console.log('✓ Boats loaded')),
          loadInventoryBoats().then(() => console.log('✓ Inventory boats loaded')),
          loadLocations().then(() => console.log('✓ Locations loaded')),
          loadSites().then(() => console.log('✓ Sites loaded')),
          loadUserPreferences().then(() => console.log('✓ User preferences loaded')),
          loadUsers().then(() => console.log('✓ Users loaded')),
          loadDockmasterConfig().then(() => console.log('✓ Dockmaster config loaded')),
        ]),
        timeoutPromise
      ])
      console.log('All data loaded successfully!')
    } catch (error) {
      console.error('Error loading data:', error)
      alert('Failed to load data. Please refresh the page or contact support.')
    } finally {
      setLoading(false)
    }
  }

  // Load boats
  const loadBoats = async () => {
    try {
      const data = await boatsService.getAll()
      
      // Transform snake_case DB fields to camelCase for UI
      const transformedData = data.map(boat => ({
        ...boat,
        qrCode: boat.qr_code,
        nfcTag: boat.nfc_tag,
        workOrderNumber: boat.work_order_number,
        mechanicalsComplete: boat.mechanicals_complete ?? false,
        cleanComplete: boat.clean_complete ?? false,
        fiberglassComplete: boat.fiberglass_complete ?? false,
        warrantyComplete: boat.warranty_complete ?? false,
        invoicedComplete: boat.invoiced_complete ?? false,
        archivedDate: boat.archived_date,
        dockmasterId: boat.dockmaster_id,
        customerId: boat.customer_id,
        hullId: boat.hull_id,
      }))

      setBoats(transformedData)
    } catch (error) {
      console.error('Error loading boats:', error)
    }
  }

  // Load inventory boats
  const loadInventoryBoats = async () => {
    try {
      const data = await inventoryBoatsService.getAll()
      
      // Transform snake_case DB fields to camelCase for UI
      const transformedData = data.map(boat => ({
        ...boat,
        qrCode: boat.qr_code,
        nfcTag: boat.nfc_tag,
        workOrderNumber: boat.work_order_number,
        mechanicalsComplete: boat.mechanicals_complete ?? false,
        cleanComplete: boat.clean_complete ?? false,
        fiberglassComplete: boat.fiberglass_complete ?? false,
        warrantyComplete: boat.warranty_complete ?? false,
        invoicedComplete: boat.invoiced_complete ?? false,
        archivedDate: boat.archived_date,
        dockmasterId: boat.dockmaster_id,
        hullId: boat.hull_id,
        salesStatus: boat.sales_status,
        lastSynced: boat.last_synced,
        isInventory: true, // Mark as inventory boat
      }))
      
      setInventoryBoats(transformedData)
    } catch (error) {
      console.error('Error loading inventory boats:', error)
    }
  }

  // Load locations
  const loadLocations = async () => {
    try {
      const data = await locationsService.getAll()
      setLocations(data)
    } catch (error) {
      console.error('Error loading locations:', error)
    }
  }

  // Load sites (and ensure default site exists)
  const loadSites = async () => {
    try {
      // Ensure at least one site exists
      await sitesService.ensureDefaultSite()
      const data = await sitesService.getAll()
      setSites(data)
    } catch (error) {
      console.error('Error loading sites:', error)
    }
  }

  // Load user preferences
  const loadUserPreferences = async () => {
    try {
      if (!user || !user.id) {
        console.warn('Cannot load preferences: user or user.id is missing')
        return
      }
      const data = await preferencesService.get(user.id)
      if (data) {
        setUserPreferences({
          selectedLocations: data.selected_locations || [],
          locationOrder: data.location_order || [],
        })
      }
    } catch (error) {
      console.error('Error loading preferences:', error)
    }
  }

  // Load users (admin only)
  const loadUsers = async () => {
    try {
      if (user && user.role === 'admin') {
        const data = await usersService.getAll()
        setUsers(data)
      }
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  // Load dockmaster config
  const loadDockmasterConfig = async () => {
    try {
      const data = await dockmasterService.getConfig()
      if (data) {
        setDockmasterConfig({
          baseUrl: data.base_url,
          username: data.username,
          password: data.password,
        })
        setLastInventorySync(data.last_sync)
      }
    } catch (error) {
      console.error('Error loading dockmaster config:', error)
    }
  }

  // ============================================================================
  // BOATS OPERATIONS
  // ============================================================================

  const handleAddBoat = async (boatData) => {
    try {
      // Filter out fields that don't belong in boats table or should be auto-generated
      const { 
        id, 
        dockmaster_id, 
        sales_status, 
        last_synced, 
        isInventory,
        // Remove camelCase versions that will conflict with snake_case
        qrCode,
        nfcTag,
        workOrderNumber,
        mechanicalsComplete,
        cleanComplete,
        fiberglassComplete,
        warrantyComplete,
        archivedDate,
        dockmasterId,
        customerId,
        hullId,
        ...cleanData 
      } = boatData
      
      const newBoat = await boatsService.create({
        ...cleanData,
        qr_code: boatData.qrCode,
        nfc_tag: boatData.nfcTag,
        work_order_number: boatData.workOrderNumber,
        mechanicals_complete: boatData.mechanicalsComplete || false,
        clean_complete: boatData.cleanComplete || false,
        fiberglass_complete: boatData.fiberglassComplete || false,
        warranty_complete: boatData.warrantyComplete || false,
        dockmaster_id: boatData.dockmasterId || null,
        customer_id: boatData.customerId || null,
        hull_id: boatData.hullId || null,
      })
      await loadBoats()
      return newBoat
    } catch (error) {
      console.error('Error adding boat:', error)
      throw error
    }
  }

  const handleUpdateBoat = async (boatId, updates) => {
    try {
      // Filter out fields that don't belong in boats table or would conflict
      const { 
        sales_status, 
        last_synced, 
        isInventory,
        // UI-only fields that shouldn't be saved
        currentLocation,
        currentSlot,
        // Remove camelCase versions
        qrCode,
        nfcTag,
        workOrderNumber,
        mechanicalsComplete,
        cleanComplete,
        fiberglassComplete,
        warrantyComplete,
        invoicedComplete,
        archivedDate,
        dockmasterId,
        customerId,
        hullId,
        // Also remove snake_case versions (we'll add them back correctly)
        qr_code,
        nfc_tag,
        work_order_number,
        mechanicals_complete,
        clean_complete,
        fiberglass_complete,
        warranty_complete,
        invoiced_complete,
        archived_date,
        dockmaster_id,
        customer_id,
        hull_id,
        ...cleanUpdates
      } = updates
      
      // Build updateData with only fields that exist in updates
      const updateData = {
        ...cleanUpdates,
      };
      
      // Add snake_case versions only if camelCase version exists in original updates
      if ('qrCode' in updates) updateData.qr_code = updates.qrCode;
      if ('nfcTag' in updates) updateData.nfc_tag = updates.nfcTag;
      if ('workOrderNumber' in updates) updateData.work_order_number = updates.workOrderNumber;
      if ('mechanicalsComplete' in updates) updateData.mechanicals_complete = updates.mechanicalsComplete;
      if ('cleanComplete' in updates) updateData.clean_complete = updates.cleanComplete;
      if ('fiberglassComplete' in updates) updateData.fiberglass_complete = updates.fiberglassComplete;
      if ('warrantyComplete' in updates) updateData.warranty_complete = updates.warrantyComplete;
      if ('invoicedComplete' in updates) updateData.invoiced_complete = updates.invoicedComplete;
      if ('archivedDate' in updates) updateData.archived_date = updates.archivedDate;
      if ('dockmasterId' in updates) updateData.dockmaster_id = updates.dockmasterId;
      if ('customerId' in updates) updateData.customer_id = updates.customerId;
      if ('hullId' in updates) updateData.hull_id = updates.hullId;
      
      await boatsService.update(boatId, updateData)
      await loadBoats()
    } catch (error) {
      console.error('Error updating boat:', error)
      throw error
    }
  }

  const handleDeleteBoat = async (boatId) => {
    try {
      await boatsService.delete(boatId)
      await loadBoats()
    } catch (error) {
      console.error('Error deleting boat:', error)
      throw error
    }
  }

  const handleAssignNfcTag = async (boatId, tagId) => {
    try {
      await boatsService.assignNfcTag(boatId, tagId)
      await loadBoats()
    } catch (error) {
      console.error('Error assigning NFC tag:', error)
      throw error
    }
  }

  const handleReleaseNfcTag = async (boatId) => {
    try {
      await boatsService.releaseNfcTag(boatId)
      await loadBoats()
    } catch (error) {
      console.error('Error releasing NFC tag:', error)
      throw error
    }
  }

  // ============================================================================
  // INVENTORY BOATS OPERATIONS
  // ============================================================================

  const handleUpdateInventoryBoat = async (boatId, updates) => {
    try {
      // Filter out fields that don't belong in database
      const { 
        isInventory,
        // UI-only fields
        currentLocation,
        currentSlot,
        // Remove camelCase versions
        qrCode,
        nfcTag,
        workOrderNumber,
        mechanicalsComplete,
        cleanComplete,
        fiberglassComplete,
        warrantyComplete,
        invoicedComplete,
        archivedDate,
        dockmasterId,
        hullId,
        salesStatus,
        lastSynced,
        // Also remove snake_case versions (we'll add them back correctly)
        qr_code,
        nfc_tag,
        work_order_number,
        mechanicals_complete,
        clean_complete,
        fiberglass_complete,
        warranty_complete,
        invoiced_complete,
        archived_date,
        dockmaster_id,
        hull_id,
        sales_status,
        last_synced,
        // Don't update location/slot here - use handleMoveBoat for that
        location,
        slot,
        ...cleanUpdates
      } = updates
      
      // Build updateData with only fields that exist in updates
      const updateData = {
        ...cleanUpdates,
      };
      
      // Add snake_case versions only if camelCase version exists in original updates
      if ('workOrderNumber' in updates) updateData.work_order_number = updates.workOrderNumber;
      if ('mechanicalsComplete' in updates) updateData.mechanicals_complete = updates.mechanicalsComplete;
      if ('cleanComplete' in updates) updateData.clean_complete = updates.cleanComplete;
      if ('fiberglassComplete' in updates) updateData.fiberglass_complete = updates.fiberglassComplete;
      if ('warrantyComplete' in updates) updateData.warranty_complete = updates.warrantyComplete;
      if ('invoicedComplete' in updates) updateData.invoiced_complete = updates.invoicedComplete;

      // Only update if there are fields to update
      if (Object.keys(updateData).length > 0) {
        console.log('Inventory boat update - sending to DB:', updateData);
        await inventoryBoatsService.update(boatId, updateData)
        await loadInventoryBoats()
      }
    } catch (error) {
      console.error('Error updating inventory boat:', error)
      throw error
    }
  }

  const handleSyncInventory = async (fullSync = false) => {
    try {
      // Call the Dockmaster inventory edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      console.log(`Calling Dockmaster inventory sync (${fullSync ? 'full' : 'incremental'})...`)
      const response = await fetch(`${supabaseUrl}/functions/v1/dockmaster-inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ fullSync }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Inventory sync error:', errorData)
        throw new Error(errorData.error || 'Failed to sync inventory')
      }

      const result = await response.json()
      console.log(`Received ${result.boats?.length || 0} boats from Dockmaster`)

      if (result.boats && result.boats.length > 0) {
        // Transform API boats to our format and sync to database
        const boatsToSync = result.boats.map((apiBoat) => ({
          dockmaster_id: apiBoat.dockmasterId,
          hull_id: apiBoat.hullId,
          name: apiBoat.name,
          model: apiBoat.model,
          make: apiBoat.make,
          year: apiBoat.year,
          owner: 'INVENTORY',
          status: 'needs-approval',
          sales_status: apiBoat.salesStatus,
          qr_code: `INV-${apiBoat.dockmasterId}`,
          length: apiBoat.length,
          beam: apiBoat.beam,
        }))

        await inventoryBoatsService.sync(boatsToSync, fullSync)
      }
      
      // Update the last sync time
      await dockmasterService.updateLastSync()
      await loadInventoryBoats()
      await loadDockmasterConfig()
      
      console.log('Inventory sync completed successfully')
      return { success: true, count: result.boats?.length || 0 }
    } catch (error) {
      console.error('Error syncing inventory:', error)
      throw error
    }
  }

  // ============================================================================
  // LOCATIONS OPERATIONS
  // ============================================================================

  // Helper to check if current user has location management permissions
  const canManageLocations = () => {
    return user?.role === 'admin' || user?.role === 'manager'
  }

  const handleAddLocation = async (locationData) => {
    // Defense in depth: validate role before proceeding
    if (!canManageLocations()) {
      console.error('Permission denied: Location management requires manager or admin role')
      throw new Error('Permission denied')
    }

    try {
      // Remove id if present - let database auto-generate UUID
      // Also remove poolBoats (camelCase) and undefined values
      const { id, poolBoats, pool_boats, ...dataToSave } = locationData

      const cleanData = {
        ...dataToSave,
        boats: dataToSave.boats || {},
      }

      // Only include pool_boats for pool type locations
      if (locationData.type === 'pool') {
        cleanData.pool_boats = pool_boats || []
      }

      await locationsService.create(cleanData)
      await loadLocations()
    } catch (error) {
      console.error('Error adding location:', error)
      throw error
    }
  }

  const handleUpdateLocation = async (locationId, updates) => {
    // Defense in depth: validate role before proceeding
    if (!canManageLocations()) {
      console.error('Permission denied: Location management requires manager or admin role')
      throw new Error('Permission denied')
    }

    try {
      await locationsService.update(locationId, updates)
      await loadLocations()
    } catch (error) {
      console.error('Error updating location:', error)
      throw error
    }
  }

  const handleDeleteLocation = async (locationId) => {
    // Defense in depth: validate role before proceeding
    if (!canManageLocations()) {
      console.error('Permission denied: Location management requires manager or admin role')
      throw new Error('Permission denied')
    }

    try {
      await locationsService.delete(locationId)
      await loadLocations()
    } catch (error) {
      console.error('Error deleting location:', error)
      throw error
    }
  }

  const handleAssignBoatToSlot = async (boatId, locationId, slotId, isInventory = false) => {
    try {
      if (isInventory) {
        await inventoryBoatsService.assignToSlot(boatId, locationId, slotId)
        await loadInventoryBoats()
      } else {
        await boatsService.assignToSlot(boatId, locationId, slotId)
        await loadBoats()
      }
      await loadLocations()
    } catch (error) {
      console.error('Error assigning boat to slot:', error)
      throw error
    }
  }

  const handleRemoveBoatFromSlot = async (boatId, isInventory = false) => {
    try {
      if (isInventory) {
        await inventoryBoatsService.removeFromSlot(boatId)
        await loadInventoryBoats()
      } else {
        await boatsService.removeFromSlot(boatId)
        await loadBoats()
      }
      await loadLocations()
    } catch (error) {
      console.error('Error removing boat from slot:', error)
      throw error
    }
  }

  const handleMoveBoat = async (boatId, toLocationId, toSlotId, isInventory = false) => {
    console.log('[AppContainer.handleMoveBoat] Called with:', { boatId, toLocationId, toSlotId, isInventory })
    try {
      // Get current boat location before move (for logging)
      const currentBoat = isInventory
        ? inventoryBoats.find(b => b.id === boatId)
        : boats.find(b => b.id === boatId)
      const fromLocation = currentBoat?.location || null
      const fromSlot = currentBoat?.slot || null

      // Get destination location name
      const toLocation = toLocationId
        ? locations.find(l => l.id === toLocationId)?.name || null
        : null

      // If toLocationId is null, this is a removal
      if (!toLocationId) {
        console.log('[AppContainer.handleMoveBoat] Removing boat from location')
        if (isInventory) {
          console.log('[AppContainer.handleMoveBoat] Calling inventoryBoatsService.removeFromSlot')
          await inventoryBoatsService.removeFromSlot(boatId)
          console.log('[AppContainer.handleMoveBoat] Reloading inventory boats')
          await loadInventoryBoats()
        } else {
          await boatsService.removeFromSlot(boatId)
          await loadBoats()
        }
      } else {
        // Normal move
        console.log('[AppContainer.handleMoveBoat] Moving boat to new location')
        if (isInventory) {
          await inventoryBoatsService.moveToSlot(boatId, toLocationId, toSlotId)
          await loadInventoryBoats()
        } else {
          await boatsService.moveToSlot(boatId, toLocationId, toSlotId)
          await loadBoats()
        }
      }

      // Log the movement (don't block on this)
      try {
        await boatMovementsService.logMovement({
          boatId,
          boatType: isInventory ? 'inventory' : 'customer',
          fromLocation,
          fromSlot,
          toLocation,
          toSlot: toSlotId || null,
          movedBy: user?.id || null,
        })
        console.log('[AppContainer.handleMoveBoat] Movement logged')
      } catch (logError) {
        // Don't fail the move if logging fails
        console.error('Error logging boat movement:', logError)
      }

      console.log('[AppContainer.handleMoveBoat] Reloading locations')
      await loadLocations()
      console.log('[AppContainer.handleMoveBoat] Complete')
    } catch (error) {
      console.error('Error moving boat:', error)
      throw error
    }
  }

  // ============================================================================
  // SITES OPERATIONS
  // ============================================================================

  const handleAddSite = async (siteData) => {
    // Defense in depth: validate role before proceeding
    if (!canManageLocations()) {
      console.error('Permission denied: Site management requires manager or admin role')
      throw new Error('Permission denied')
    }

    try {
      const newSite = await sitesService.create(siteData)
      await loadSites()
      return newSite
    } catch (error) {
      console.error('Error adding site:', error)
      throw error
    }
  }

  const handleUpdateSite = async (siteId, updates) => {
    // Defense in depth: validate role before proceeding
    if (!canManageLocations()) {
      console.error('Permission denied: Site management requires manager or admin role')
      throw new Error('Permission denied')
    }

    try {
      await sitesService.update(siteId, updates)
      await loadSites()
    } catch (error) {
      console.error('Error updating site:', error)
      throw error
    }
  }

  const handleDeleteSite = async (siteId) => {
    // Defense in depth: validate role before proceeding
    if (!canManageLocations()) {
      console.error('Permission denied: Site management requires manager or admin role')
      throw new Error('Permission denied')
    }

    try {
      await sitesService.delete(siteId)
      await loadSites()
    } catch (error) {
      console.error('Error deleting site:', error)
      throw error
    }
  }

  const handleReorderSites = async (siteIds) => {
    // Defense in depth: validate role before proceeding
    if (!canManageLocations()) {
      console.error('Permission denied: Site management requires manager or admin role')
      throw new Error('Permission denied')
    }

    try {
      await sitesService.reorder(siteIds)
      await loadSites()
    } catch (error) {
      console.error('Error reordering sites:', error)
      throw error
    }
  }

  // ============================================================================
  // USER PREFERENCES OPERATIONS
  // ============================================================================

  const handleSavePreferences = async (preferences) => {
    try {
      await preferencesService.save(user.id, preferences)
      setUserPreferences(preferences)
    } catch (error) {
      console.error('Error saving preferences:', error)
      throw error
    }
  }

  // ============================================================================
  // DOCKMASTER CONFIG OPERATIONS
  // ============================================================================

  const handleSaveDockmasterConfig = async (config) => {
    try {
      await dockmasterService.saveConfig({
        base_url: config.baseUrl,
        username: config.username,
        password: config.password,
      })
      await loadDockmasterConfig()
    } catch (error) {
      console.error('Error saving dockmaster config:', error)
      throw error
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-lg">Loading your workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <App
      // User
      currentUser={user}
      onSignOut={signOut}
      
      // Boats
      boats={boats}
      onAddBoat={handleAddBoat}
      onUpdateBoat={handleUpdateBoat}
      onDeleteBoat={handleDeleteBoat}
      onAssignNfcTag={handleAssignNfcTag}
      onReleaseNfcTag={handleReleaseNfcTag}
      
      // Inventory Boats
      inventoryBoats={inventoryBoats}
      onUpdateInventoryBoat={handleUpdateInventoryBoat}
      onSyncInventory={handleSyncInventory}
      lastInventorySync={lastInventorySync}
      
      // Locations
      locations={locations}
      onAddLocation={handleAddLocation}
      onUpdateLocation={handleUpdateLocation}
      onDeleteLocation={handleDeleteLocation}
      onAssignBoatToSlot={handleAssignBoatToSlot}
      onRemoveBoatFromSlot={handleRemoveBoatFromSlot}
      onMoveBoat={handleMoveBoat}

      // Sites
      sites={sites}
      onAddSite={handleAddSite}
      onUpdateSite={handleUpdateSite}
      onDeleteSite={handleDeleteSite}
      onReorderSites={handleReorderSites}
      
      // User Preferences
      userPreferences={userPreferences}
      onSavePreferences={handleSavePreferences}
      
      // Users (admin)
      users={users}
      onReloadUsers={loadUsers}
      
      // Dockmaster Config
      dockmasterConfig={dockmasterConfig}
      onSaveDockmasterConfig={handleSaveDockmasterConfig}
    />
  )
}

export default AppContainer
