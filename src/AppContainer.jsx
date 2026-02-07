// ============================================================================
// APP CONTAINER - DATA LAYER
// ============================================================================
// This component handles all Supabase data loading and state management
// It wraps the UI layer (App.jsx) and passes data + callbacks as props
// ============================================================================

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthProvider'
import supabaseService, { getAllBoatsCombined, boatLifecycleService } from './services/supabaseService'
import App from './App'

// Debounce helper with cancel capability to prevent rapid-fire API calls
function createCancellableDebounce(fn, delay) {
  let timeoutId = null
  const debouncedFn = (...args) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      timeoutId = null
      fn(...args)
    }, delay)
  }
  debouncedFn.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }
  return debouncedFn
}

const {
  boats: boatsService,
  inventoryBoats: inventoryBoatsService,
  locations: locationsService,
  sites: sitesService,
  preferences: preferencesService,
  dockmaster: dockmasterService,
  users: usersService,
  requests: requestsService,
  requestAttachments: requestAttachmentsService,
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
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  // Ref to track if a sync is in progress - prevents real-time callbacks from
  // trying to reload data while the database is busy with bulk operations
  const syncInProgressRef = useRef(false)

  // Refs to store debounced functions so we can cancel them when sync starts
  const debouncedFunctionsRef = useRef({
    loadBoats: null,
    loadLocations: null,
    loadInventoryBoats: null
  })

  // Ref to store inventory channel so we can unsubscribe/resubscribe during sync
  const inventoryChannelRef = useRef(null)
  const resubscribeInventoryRef = useRef(null)

  // Ref for broadcast channel (instant cross-device sync)
  const boatBroadcastChannelRef = useRef(null)
  const broadcastHandlerRef = useRef(null)

  // Load all data on mount
  useEffect(() => {
    if (user) {
      loadAllData()
    }
  }, [user])

  // Subscribe to real-time updates (optional but recommended)
  // Debounced callbacks prevent connection pool exhaustion during bulk syncs
  useEffect(() => {
    if (!user) return

    console.log('Setting up real-time subscriptions...')

    // Create cancellable debounced loaders - wait 2 seconds after last change before reloading
    // These can be cancelled when sync starts to prevent any pending reloads from firing
    const debouncedLoadBoats = createCancellableDebounce(() => {
      if (syncInProgressRef.current) {
        console.log('Real-time update: skipping boats reload (sync in progress)')
        return
      }
      console.log('Real-time update: reloading boats (debounced)')
      loadBoats()
    }, 2000)

    const debouncedLoadLocations = createCancellableDebounce(() => {
      if (syncInProgressRef.current) {
        console.log('Real-time update: skipping locations reload (sync in progress)')
        return
      }
      console.log('Real-time update: reloading locations (debounced)')
      loadLocations()
    }, 2000)

    const debouncedLoadInventoryBoats = createCancellableDebounce(() => {
      if (syncInProgressRef.current) {
        console.log('Real-time update: skipping inventory boats reload (sync in progress)')
        return
      }
      console.log('Real-time update: reloading inventory boats (debounced)')
      loadInventoryBoats()
    }, 2000)

    // Store references so sync can cancel pending debounced calls
    debouncedFunctionsRef.current = {
      loadBoats: debouncedLoadBoats,
      loadLocations: debouncedLoadLocations,
      loadInventoryBoats: debouncedLoadInventoryBoats
    }

    try {
      // Subscribe to boats changes
      const boatsChannel = supabaseService.subscriptions.subscribeToBoats(() => {
        console.log('Real-time update: boats changed')
        debouncedLoadBoats()
        debouncedLoadLocations()
      })

      // Subscribe to locations changes
      const locationsChannel = supabaseService.subscriptions.subscribeToLocations(() => {
        console.log('Real-time update: locations changed')
        debouncedLoadLocations()
        debouncedLoadBoats()
      })

      // Subscribe to inventory boats changes
      // Store channel ref so we can unsubscribe during sync
      const subscribeToInventory = () => {
        return supabaseService.subscriptions.subscribeToInventoryBoats(() => {
          // Skip entirely if sync is in progress - don't even log
          if (syncInProgressRef.current) return
          console.log('Real-time update: inventory boats changed')
          debouncedLoadInventoryBoats()
          debouncedLoadLocations()
        })
      }

      inventoryChannelRef.current = subscribeToInventory()

      // Store the resubscribe function so sync can call it after completion
      resubscribeInventoryRef.current = () => {
        console.log('Re-subscribing to inventory real-time updates...')
        inventoryChannelRef.current = subscribeToInventory()
      }

      // Subscribe to service requests changes
      const requestsChannel = supabaseService.subscriptions.subscribeToRequests(() => {
        console.log('Real-time update: requests changed')
        loadRequests()
      })

      // Initialize broadcast channel for instant cross-device sync
      // This provides <100ms sync vs 2s debounced database polling
      boatBroadcastChannelRef.current = supabaseService.subscriptions.initBoatBroadcast((payload) => {
        // Use ref to call handler - ensures we always have current applyOptimisticMove
        if (broadcastHandlerRef.current) {
          broadcastHandlerRef.current(payload)
        }
      })

      console.log('Real-time subscriptions active')

      return () => {
        console.log('Cleaning up real-time subscriptions...')
        supabaseService.subscriptions.unsubscribe(boatsChannel)
        supabaseService.subscriptions.unsubscribe(locationsChannel)
        if (inventoryChannelRef.current) {
          supabaseService.subscriptions.unsubscribe(inventoryChannelRef.current)
        }
        supabaseService.subscriptions.unsubscribe(requestsChannel)
        if (boatBroadcastChannelRef.current) {
          supabaseService.subscriptions.unsubscribe(boatBroadcastChannelRef.current)
        }
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
          loadRequests().then(() => console.log('✓ Requests loaded')),
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
        completedBy: boat.completed_by,
        completedAt: boat.completed_at,
        notesUpdatedBy: boat.notes_updated_by,
        notesUpdatedAt: boat.notes_updated_at,
        dockmasterId: boat.dockmaster_id,
        customerId: boat.customer_id,
        hullId: boat.hull_id,
        storageBoat: boat.storage_boat ?? false,
        // Seasonal work phases (storage boats only)
        fallStatus: boat.fall_status || 'needs-approval',
        winterStatus: boat.winter_status || 'needs-approval',
        springStatus: boat.spring_status || 'needs-approval',
        fallMechanicalsComplete: boat.fall_mechanicals_complete ?? false,
        fallCleanComplete: boat.fall_clean_complete ?? false,
        fallFiberglassComplete: boat.fall_fiberglass_complete ?? false,
        fallWarrantyComplete: boat.fall_warranty_complete ?? false,
        fallInvoicedComplete: boat.fall_invoiced_complete ?? false,
        winterMechanicalsComplete: boat.winter_mechanicals_complete ?? false,
        winterCleanComplete: boat.winter_clean_complete ?? false,
        winterFiberglassComplete: boat.winter_fiberglass_complete ?? false,
        winterWarrantyComplete: boat.winter_warranty_complete ?? false,
        winterInvoicedComplete: boat.winter_invoiced_complete ?? false,
        springMechanicalsComplete: boat.spring_mechanicals_complete ?? false,
        springCleanComplete: boat.spring_clean_complete ?? false,
        springFiberglassComplete: boat.spring_fiberglass_complete ?? false,
        springWarrantyComplete: boat.spring_warranty_complete ?? false,
        springInvoicedComplete: boat.spring_invoiced_complete ?? false,
        // Seasonal completion tracking
        fallCompletedBy: boat.fall_completed_by || null,
        fallCompletedAt: boat.fall_completed_at || null,
        winterCompletedBy: boat.winter_completed_by || null,
        winterCompletedAt: boat.winter_completed_at || null,
        springCompletedBy: boat.spring_completed_by || null,
        springCompletedAt: boat.spring_completed_at || null,
      }))

      // Only update if data changed (prevents flicker from debounced reloads)
      setBoats(prevBoats => {
        if (JSON.stringify(prevBoats) === JSON.stringify(transformedData)) {
          return prevBoats // Same reference = no re-render
        }
        return transformedData
      })
    } catch (error) {
      console.error('Error loading boats:', error)
    }
  }

  // Load inventory boats with retry logic for database timeouts
  const loadInventoryBoats = async (retryCount = 0) => {
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
        completedBy: boat.completed_by,
        completedAt: boat.completed_at,
        notesUpdatedBy: boat.notes_updated_by,
        notesUpdatedAt: boat.notes_updated_at,
        dockmasterId: boat.dockmaster_id,
        hullId: boat.hull_id,
        salesStatus: boat.sales_status,
        lastSynced: boat.last_synced,
        isInventory: true, // Mark as inventory boat
      }))

      // Only update if data changed (prevents flicker from debounced reloads)
      setInventoryBoats(prevBoats => {
        if (JSON.stringify(prevBoats) === JSON.stringify(transformedData)) {
          return prevBoats // Same reference = no re-render
        }
        return transformedData
      })
    } catch (error) {
      // Retry with exponential backoff for statement timeout errors
      if (error.code === '57014' && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s
        console.log(`Database busy (timeout), retrying in ${delay}ms... (attempt ${retryCount + 1}/3)`)
        await new Promise(resolve => setTimeout(resolve, delay))
        return loadInventoryBoats(retryCount + 1)
      }
      console.error('Error loading inventory boats:', error)
    }
  }

  // Load locations
  const loadLocations = async () => {
    try {
      const data = await locationsService.getAll()
      // Only update if data changed (prevents flicker from debounced reloads)
      setLocations(prevLocations => {
        if (JSON.stringify(prevLocations) === JSON.stringify(data)) {
          return prevLocations // Same reference = no re-render
        }
        return data
      })
    } catch (error) {
      console.error('Error loading locations:', error)
    }
  }

  // Load sites
  const loadSites = async () => {
    try {
      const data = await sitesService.getAll()
      setSites(data || [])
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

  // Load users (all authenticated users - needed for @mentions)
  const loadUsers = async () => {
    try {
      if (user) {
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

  // Load service requests
  const loadRequests = async () => {
    try {
      const data = await requestsService.getAll()
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    }
  }

  // ============================================================================
  // BOATS OPERATIONS
  // ============================================================================

  const handleAddBoat = async (boatData) => {
    try {
      // Use centralized lifecycle service (prevents duplicates)
      await boatLifecycleService.importOrUpdateBoat(boatData, {
        targetStatus: 'needs-approval',
        preserveLocation: false
      });

      // Reload boats from database
      await loadBoats();
    } catch (error) {
      console.error('Error adding boat:', error);
      throw error;
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
        completedAt,
        completedBy,
        notesUpdatedBy,
        notesUpdatedAt,
        dockmasterId,
        customerId,
        hullId,
        storageBoat,
        // Seasonal fields (camelCase - will be mapped to snake_case)
        fallStatus,
        winterStatus,
        springStatus,
        fallMechanicalsComplete,
        fallCleanComplete,
        fallFiberglassComplete,
        fallWarrantyComplete,
        fallInvoicedComplete,
        winterMechanicalsComplete,
        winterCleanComplete,
        winterFiberglassComplete,
        winterWarrantyComplete,
        winterInvoicedComplete,
        springMechanicalsComplete,
        springCleanComplete,
        springFiberglassComplete,
        springWarrantyComplete,
        springInvoicedComplete,
        fallCompletedBy,
        fallCompletedAt,
        winterCompletedBy,
        winterCompletedAt,
        springCompletedBy,
        springCompletedAt,
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
        completed_at,
        completed_by,
        notes_updated_by,
        notes_updated_at,
        dockmaster_id,
        customer_id,
        hull_id,
        storage_boat,
        fall_status,
        winter_status,
        spring_status,
        fall_mechanicals_complete,
        fall_clean_complete,
        fall_fiberglass_complete,
        fall_warranty_complete,
        fall_invoiced_complete,
        winter_mechanicals_complete,
        winter_clean_complete,
        winter_fiberglass_complete,
        winter_warranty_complete,
        winter_invoiced_complete,
        spring_mechanicals_complete,
        spring_clean_complete,
        spring_fiberglass_complete,
        spring_warranty_complete,
        spring_invoiced_complete,
        fall_completed_by,
        fall_completed_at,
        winter_completed_by,
        winter_completed_at,
        spring_completed_by,
        spring_completed_at,
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
      if ('completedAt' in updates) updateData.completed_at = updates.completedAt;
      if ('completedBy' in updates) updateData.completed_by = updates.completedBy;
      if ('notesUpdatedBy' in updates) updateData.notes_updated_by = updates.notesUpdatedBy;
      if ('notesUpdatedAt' in updates) updateData.notes_updated_at = updates.notesUpdatedAt;
      if ('dockmasterId' in updates) updateData.dockmaster_id = updates.dockmasterId;
      if ('customerId' in updates) updateData.customer_id = updates.customerId;
      if ('hullId' in updates) updateData.hull_id = updates.hullId;
      if ('storageBoat' in updates) updateData.storage_boat = updates.storageBoat;
      // Seasonal work phases
      if ('fallStatus' in updates) updateData.fall_status = updates.fallStatus;
      if ('winterStatus' in updates) updateData.winter_status = updates.winterStatus;
      if ('springStatus' in updates) updateData.spring_status = updates.springStatus;
      if ('fallMechanicalsComplete' in updates) updateData.fall_mechanicals_complete = updates.fallMechanicalsComplete;
      if ('fallCleanComplete' in updates) updateData.fall_clean_complete = updates.fallCleanComplete;
      if ('fallFiberglassComplete' in updates) updateData.fall_fiberglass_complete = updates.fallFiberglassComplete;
      if ('fallWarrantyComplete' in updates) updateData.fall_warranty_complete = updates.fallWarrantyComplete;
      if ('fallInvoicedComplete' in updates) updateData.fall_invoiced_complete = updates.fallInvoicedComplete;
      if ('winterMechanicalsComplete' in updates) updateData.winter_mechanicals_complete = updates.winterMechanicalsComplete;
      if ('winterCleanComplete' in updates) updateData.winter_clean_complete = updates.winterCleanComplete;
      if ('winterFiberglassComplete' in updates) updateData.winter_fiberglass_complete = updates.winterFiberglassComplete;
      if ('winterWarrantyComplete' in updates) updateData.winter_warranty_complete = updates.winterWarrantyComplete;
      if ('winterInvoicedComplete' in updates) updateData.winter_invoiced_complete = updates.winterInvoicedComplete;
      if ('springMechanicalsComplete' in updates) updateData.spring_mechanicals_complete = updates.springMechanicalsComplete;
      if ('springCleanComplete' in updates) updateData.spring_clean_complete = updates.springCleanComplete;
      if ('springFiberglassComplete' in updates) updateData.spring_fiberglass_complete = updates.springFiberglassComplete;
      if ('springWarrantyComplete' in updates) updateData.spring_warranty_complete = updates.springWarrantyComplete;
      if ('springInvoicedComplete' in updates) updateData.spring_invoiced_complete = updates.springInvoicedComplete;
      // Seasonal completion tracking
      if ('fallCompletedBy' in updates) updateData.fall_completed_by = updates.fallCompletedBy;
      if ('fallCompletedAt' in updates) updateData.fall_completed_at = updates.fallCompletedAt;
      if ('winterCompletedBy' in updates) updateData.winter_completed_by = updates.winterCompletedBy;
      if ('winterCompletedAt' in updates) updateData.winter_completed_at = updates.winterCompletedAt;
      if ('springCompletedBy' in updates) updateData.spring_completed_by = updates.springCompletedBy;
      if ('springCompletedAt' in updates) updateData.spring_completed_at = updates.springCompletedAt;

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
        completedAt,
        completedBy,
        notesUpdatedBy,
        notesUpdatedAt,
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
        completed_at,
        completed_by,
        notes_updated_by,
        notes_updated_at,
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
      if ('completedAt' in updates) updateData.completed_at = updates.completedAt;
      if ('completedBy' in updates) updateData.completed_by = updates.completedBy;
      if ('notesUpdatedBy' in updates) updateData.notes_updated_by = updates.notesUpdatedBy;
      if ('notesUpdatedAt' in updates) updateData.notes_updated_at = updates.notesUpdatedAt;

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
    // Set flag to prevent real-time subscription callbacks from trying to reload
    // while database is busy with bulk operations
    syncInProgressRef.current = true
    console.log('Sync started - blocking real-time reloads')

    // Cancel any pending debounced reloads to prevent them from firing during/after sync
    const debouncedFns = debouncedFunctionsRef.current
    if (debouncedFns.loadBoats) debouncedFns.loadBoats.cancel()
    if (debouncedFns.loadLocations) debouncedFns.loadLocations.cancel()
    if (debouncedFns.loadInventoryBoats) debouncedFns.loadInventoryBoats.cancel()
    console.log('Cancelled pending debounced reloads')

    // Unsubscribe from inventory real-time updates to prevent 200+ events during sync
    if (inventoryChannelRef.current) {
      console.log('Unsubscribing from inventory real-time updates during sync...')
      supabaseService.subscriptions.unsubscribe(inventoryChannelRef.current)
      inventoryChannelRef.current = null
    }

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
          // Core identifiers
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

          // Dimensions
          length: apiBoat.length,
          beam: apiBoat.beam,

          // New basic details
          stock_number: apiBoat.stockNumber,
          color: apiBoat.color,
          list_price: apiBoat.listPrice,
          total_cost: apiBoat.totalCost,
          received_date: apiBoat.receivedDate,
          comments: apiBoat.comments,

          // New boat specs
          draft: apiBoat.draft,
          weight: apiBoat.weight,
          hull_type: apiBoat.hullType,
          hull_material: apiBoat.hullMaterial,
          fuel_capacity: apiBoat.fuelCapacity,
          water_capacity: apiBoat.waterCapacity,
          motor_rating: apiBoat.motorRating,
          sleep_capacity: apiBoat.sleepCapacity,

          // JSONB fields
          motors: apiBoat.motors,
          trailers: apiBoat.trailers,
          options: apiBoat.options,
          accessories: apiBoat.accessories,
          raw_data: apiBoat.rawData,
        }))

        await inventoryBoatsService.sync(boatsToSync, fullSync)
      }

      // Update the last sync time
      await dockmasterService.updateLastSync()

      // Cancel any pending debounced calls that may have queued during sync
      // This prevents them from firing after we clear the sync flag
      const debouncedFns = debouncedFunctionsRef.current
      if (debouncedFns.loadInventoryBoats) debouncedFns.loadInventoryBoats.cancel()
      if (debouncedFns.loadLocations) debouncedFns.loadLocations.cancel()
      if (debouncedFns.loadBoats) debouncedFns.loadBoats.cancel()
      console.log('Cancelled pending debounced reloads before final load')

      // Clear the sync flag before reloading so real-time updates work again
      syncInProgressRef.current = false
      console.log('Sync completed - waiting for database to settle')

      // Wait for database to settle before reloading
      await new Promise(resolve => setTimeout(resolve, 1500))

      await loadInventoryBoats()
      await loadDockmasterConfig()

      // Re-subscribe to inventory real-time updates after a short delay
      // This ensures any lingering real-time events from the sync have finished
      setTimeout(() => {
        if (resubscribeInventoryRef.current) {
          console.log('Re-subscribing to inventory real-time updates')
          resubscribeInventoryRef.current()
        }
      }, 1000)

      console.log('Inventory sync completed successfully')
      return { success: true, count: result.boats?.length || 0 }
    } catch (error) {
      // Cancel pending debounced calls on error too
      const debouncedFns = debouncedFunctionsRef.current
      if (debouncedFns.loadInventoryBoats) debouncedFns.loadInventoryBoats.cancel()
      if (debouncedFns.loadLocations) debouncedFns.loadLocations.cancel()
      if (debouncedFns.loadBoats) debouncedFns.loadBoats.cancel()

      // Make sure to clear flag even on error
      syncInProgressRef.current = false
      // Re-subscribe after delay even on error
      setTimeout(() => {
        if (resubscribeInventoryRef.current) {
          resubscribeInventoryRef.current()
        }
      }, 1000)
      console.error('Error syncing inventory:', error)
      throw error
    }
  }

  const handleSyncInternalWorkOrders = async (fullSync = false) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      console.log(`Calling internal work orders sync (${fullSync ? 'full' : 'incremental'})...`)
      const response = await fetch(`${supabaseUrl}/functions/v1/dockmaster-internal-workorders-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ fullSync })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Internal work orders sync error:', errorData)
        throw new Error(errorData.error || 'Failed to sync internal work orders')
      }

      const result = await response.json()
      console.log('Internal work orders sync completed:', result)
      return result
    } catch (error) {
      console.error('Error syncing internal work orders:', error)
      throw error
    }
  }

  // ============================================================================
  // LOCATIONS OPERATIONS
  // ============================================================================

  const handleAddLocation = async (locationData) => {
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
    try {
      await locationsService.update(locationId, updates)
      await loadLocations()
    } catch (error) {
      console.error('Error updating location:', error)
      throw error
    }
  }

  const handleDeleteLocation = async (locationId) => {
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

  // Optimistic update helper - updates UI immediately before database call
  // This makes drag-and-drop feel instant instead of waiting for DB round-trip
  const applyOptimisticMove = (boatId, fromLocationId, fromSlotId, toLocationId, toSlotId, isInventory) => {
    // Update locations state - remove from old location, add to new location
    setLocations(prevLocations => {
      return prevLocations.map(location => {
        let updatedLocation = location
        const isSourceLocation = location.id === fromLocationId
        const isTargetLocation = location.id === toLocationId

        // Remove boat from source location (either from boats object or pool_boats array)
        if (isSourceLocation) {
          if (fromSlotId === 'pool') {
            // Remove from pool_boats array
            const newPoolBoats = (updatedLocation.pool_boats || []).filter(id => id !== boatId)
            updatedLocation = { ...updatedLocation, pool_boats: newPoolBoats }
          } else if (updatedLocation.boats) {
            // Remove from boats object
            const newBoats = { ...updatedLocation.boats }
            delete newBoats[fromSlotId]
            updatedLocation = { ...updatedLocation, boats: newBoats }
          }
        }

        // Add boat to target location (either to boats object or pool_boats array)
        // This can be the same location as source (moving within same location)
        if (isTargetLocation) {
          if (toSlotId === 'pool') {
            // Add to pool_boats array
            const newPoolBoats = [...(updatedLocation.pool_boats || []), boatId]
            updatedLocation = { ...updatedLocation, pool_boats: newPoolBoats }
          } else {
            // Add to boats object
            const newBoats = { ...(updatedLocation.boats || {}), [toSlotId]: boatId }
            updatedLocation = { ...updatedLocation, boats: newBoats }
          }
        }

        return updatedLocation
      })
    })

    // Update boats state - change location and slot on the boat record
    const setBoatsFunc = isInventory ? setInventoryBoats : setBoats
    setBoatsFunc(prevBoats => {
      return prevBoats.map(boat => {
        if (boat.id === boatId) {
          return { ...boat, location: toLocationId, slot: toSlotId }
        }
        return boat
      })
    })
  }

  // Set broadcast handler ref so it always has access to current applyOptimisticMove
  broadcastHandlerRef.current = (payload) => {
    console.log('[Broadcast] Applying remote boat change')
    applyOptimisticMove(
      payload.boatId,
      payload.fromLocationId,
      payload.fromSlotId,
      payload.toLocationId,
      payload.toSlotId,
      payload.isInventory
    )
  }

  const handleMoveBoat = async (
    boatOrBoatId,
    toLocationOrId,
    toSlotId,
    isInventory = false,
    dragFromLocationId = null,  // Optional: from drag hook (avoids stale state on rapid moves)
    dragFromSlotId = null       // Optional: from drag hook
  ) => {
    // Handle both boat object and boatId string
    const boatId = typeof boatOrBoatId === 'object' ? boatOrBoatId.id : boatOrBoatId;

    // Handle both location object and locationId string
    const toLocationId = typeof toLocationOrId === 'object'
      ? toLocationOrId?.id
      : toLocationOrId;

    // Detect isInventory from boat object if not explicitly passed
    const isInventoryBoat = typeof boatOrBoatId === 'object' && boatOrBoatId.isInventory === true
      ? true
      : isInventory;

    // Find current boat location before move (for optimistic update)
    // Use drag hook's values if provided (source of truth, avoids stale React state on rapid moves)
    // Otherwise search locations (fallback for non-drag moves)
    let fromLocationId = dragFromLocationId
    let fromSlotId = dragFromSlotId

    if (!fromLocationId) {
      for (const location of locations) {
        // Check grid slots (location.boats is an object: { "0-1": boatId, ... })
        if (location.boats) {
          const slotEntry = Object.entries(location.boats).find(([slot, id]) => id === boatId)
          if (slotEntry) {
            fromLocationId = location.id
            fromSlotId = slotEntry[0]
            break
          }
        }
        // Check pool (location.pool_boats is an array of boat IDs)
        if (location.pool_boats?.includes(boatId)) {
          fromLocationId = location.id
          fromSlotId = 'pool'
          break
        }
      }
    }

    console.log('[AppContainer.handleMoveBoat] Called with:', {
      boatId, toLocationId, toSlotId, isInventoryBoat, fromLocationId, fromSlotId
    })

    // OPTIMISTIC UPDATE: Update UI immediately for instant feedback
    applyOptimisticMove(boatId, fromLocationId, fromSlotId, toLocationId, toSlotId, isInventoryBoat)

    // BROADCAST: Notify other devices immediately (before DB call completes)
    // This provides <100ms cross-device sync vs 2s debounced database polling
    supabaseService.subscriptions.broadcastBoatChange({
      boatId,
      fromLocationId,
      fromSlotId,
      toLocationId,
      toSlotId,
      isInventory: isInventoryBoat
    })

    try {
      // Database call runs in background - UI already updated
      await supabaseService.moveBoatWithHistory(
        boatId,
        toLocationId,
        toSlotId,
        user?.id,
        isInventoryBoat
      )
      console.log('[AppContainer.handleMoveBoat] Move and logging complete')

      // Success! No need to reload - optimistic update was correct
      // Real-time subscriptions will sync any changes from other users
    } catch (error) {
      console.error('Error moving boat, reverting optimistic update:', error)

      // REVERT: Reload from database to get correct state
      if (isInventoryBoat) {
        await loadInventoryBoats()
      } else {
        await loadBoats()
      }
      await loadLocations()

      throw error
    }
  }

  // ============================================================================
  // SITES OPERATIONS
  // ============================================================================

  const handleAddSite = async (siteData) => {
    try {
      await sitesService.create(siteData)
      await loadSites()
    } catch (error) {
      console.error('Error adding site:', error)
      throw error
    }
  }

  const handleUpdateSite = async (siteId, updates) => {
    try {
      await sitesService.update(siteId, updates)
      await loadSites()
    } catch (error) {
      console.error('Error updating site:', error)
      throw error
    }
  }

  const handleDeleteSite = async (siteId) => {
    try {
      await sitesService.delete(siteId)
      await loadSites()
    } catch (error) {
      console.error('Error deleting site:', error)
      throw error
    }
  }

  const handleReorderSites = async (newOrder) => {
    try {
      await sitesService.reorder(newOrder)
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
  // SERVICE REQUESTS OPERATIONS
  // ============================================================================

  const handleCreateRequest = async (requestData) => {
    try {
      await requestsService.create(requestData)
      await loadRequests()
    } catch (error) {
      console.error('Error creating request:', error)
      throw error
    }
  }

  const handleUpdateRequest = async (requestId, updates) => {
    try {
      await requestsService.update(requestId, updates)
      await loadRequests()
    } catch (error) {
      console.error('Error updating request:', error)
      throw error
    }
  }

  const handleAddRequestMessage = async (requestId, userId, message) => {
    try {
      await requestsService.addMessage(requestId, userId, message)
      await loadRequests()
    } catch (error) {
      console.error('Error adding request message:', error)
      throw error
    }
  }

  const handleMarkServiceComplete = async (requestId, userId) => {
    try {
      await requestsService.markServiceComplete(requestId, userId)
      await loadRequests()
    } catch (error) {
      console.error('Error marking service complete:', error)
      throw error
    }
  }

  const handleConfirmRequestComplete = async (requestId, userId) => {
    try {
      await requestsService.confirmComplete(requestId, userId)
      await loadRequests()
    } catch (error) {
      console.error('Error confirming request complete:', error)
      throw error
    }
  }

  const handleAttachFile = async (requestId, file) => {
    try {
      const attachment = await requestAttachmentsService.upload(
        requestId,
        file,
        user?.id
      )

      // Update local requests state to include new attachment
      setRequests(prev => prev.map(req => {
        if (req.id === requestId) {
          return {
            ...req,
            attachments: [...(req.attachments || []), attachment]
          }
        }
        return req
      }))
    } catch (error) {
      console.error('Error uploading attachment:', error)
      throw error // Let modal handle the error display
    }
  }

  const handleRemoveAttachment = async (requestId, attachmentId) => {
    try {
      await requestAttachmentsService.delete(attachmentId)

      // Update local state to remove attachment
      setRequests(prev => prev.map(req => {
        if (req.id === requestId) {
          return {
            ...req,
            attachments: (req.attachments || []).filter(a => a.id !== attachmentId)
          }
        }
        return req
      }))
    } catch (error) {
      console.error('Error removing attachment:', error)
      throw error
    }
  }

  const handleApproveEstimates = async (requestId, hash) => {
    try {
      await requestsService.approveEstimates(requestId, user?.id, hash)
      await loadRequests()
    } catch (error) {
      console.error('Error approving estimates:', error)
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
      onSyncInternalWorkOrders={handleSyncInternalWorkOrders}
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

      // Service Requests
      requests={requests}
      onCreateRequest={handleCreateRequest}
      onUpdateRequest={handleUpdateRequest}
      onAddRequestMessage={handleAddRequestMessage}
      onMarkServiceComplete={handleMarkServiceComplete}
      onConfirmRequestComplete={handleConfirmRequestComplete}
      onAttachFile={handleAttachFile}
      onRemoveAttachment={handleRemoveAttachment}
      onApproveEstimates={handleApproveEstimates}
    />
  )
}

export default AppContainer
