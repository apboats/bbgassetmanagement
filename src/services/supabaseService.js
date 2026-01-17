// ============================================================================
// SUPABASE SERVICE LAYER
// ============================================================================
// Central location for all database operations
// Import this file and call functions instead of using localStorage
// ============================================================================

import { supabase } from '../supabaseClient'

// ============================================================================
// AUTHENTICATION OPERATIONS
// ============================================================================

export const authService = {
  // Sign up new user
  async signUp(email, password, userData) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: userData.username,
          name: userData.name,
        }
      }
    })

    if (authError) throw authError

    // User profile is created automatically by database trigger on auth.users insert
    // The trigger reads from auth.users.raw_user_meta_data to populate username and name

    return authData
  },

  // Resend confirmation email
  async resendConfirmationEmail(email) {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    })

    if (error) throw error
    return data
  },

  // Sign in existing user
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    return data
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  // Get current session
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  // Get current user profile (from users table)
  async getCurrentUser() {
    const session = await this.getSession()
    if (!session) return null

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', session.user.id)
      .single()

    if (error) throw error
    return data
  },

  // Request password reset email
  async resetPasswordRequest(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) throw error
    return data
  },

  // Update password (called after user clicks reset link)
  async updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) throw error
    return data
  },
}

// ============================================================================
// BOATS OPERATIONS (Customer Boats)
// ============================================================================

export const boatsService = {
  // Get all boats
  async getAll() {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Get single boat by ID
  async getById(id) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Get boat by QR code
  async getByQrCode(qrCode) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('qr_code', qrCode)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get boat by NFC tag
  async getByNfcTag(nfcTag) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('nfc_tag', nfcTag)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get boat by Hull ID
  async getByHullId(hullId) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('hull_id', hullId)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Create new boat
  async create(boatData) {
    const { data, error } = await supabase
      .from('boats')
      .insert([boatData])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Update boat
  async update(id, updates) {
    const { data, error } = await supabase
      .from('boats')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Delete boat
  async delete(id) {
    const { error } = await supabase
      .from('boats')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Batch update boats (for location assignments, etc.)
  async batchUpdate(boats) {
    const promises = boats.map(boat => 
      this.update(boat.id, boat)
    )
    return Promise.all(promises)
  },

  // Search boats by name, model, or owner
  async search(query) {
    const lowerQuery = query.toLowerCase()
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .or(`name.ilike.%${lowerQuery}%,model.ilike.%${lowerQuery}%,owner.ilike.%${lowerQuery}%`)

    if (error) throw error
    return data || []
  },

  // Get boats by status
  async getByStatus(status) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('status', status)

    if (error) throw error
    return data || []
  },

  // Get boats at a specific location
  async getByLocation(locationName) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('location', locationName)

    if (error) throw error
    return data || []
  },

  // Assign NFC tag to boat
  async assignNfcTag(boatId, nfcTag) {
    // First check if tag is already assigned
    const existing = await this.getByNfcTag(nfcTag)
    if (existing && existing.id !== boatId) {
      throw new Error('NFC tag is already assigned to another boat')
    }

    return this.update(boatId, { nfc_tag: nfcTag })
  },

  // Release NFC tag from boat
  async releaseNfcTag(boatId) {
    return this.update(boatId, { nfc_tag: null })
  },

  // Archive boat (set to archived status)
  async archive(boatId) {
    return this.update(boatId, {
      status: 'archived',
      archived_date: new Date().toISOString(),
    })
  },

  // Release boat (archive + remove from location)
  async release(boatId) {
    const boat = await this.getById(boatId)
    
    // Remove from location if assigned
    if (boat.location && boat.slot) {
      const { data: locations } = await supabase
        .from('locations')
        .select('*')
        .eq('name', boat.location)

      if (locations && locations.length > 0) {
        const location = locations[0]
        const updatedBoats = { ...location.boats }
        delete updatedBoats[boat.slot]

        await supabase
          .from('locations')
          .update({ boats: updatedBoats })
          .eq('id', location.id)
      }
    }

    // Archive the boat
    return this.archive(boatId)
  },

  // Assign boat to location slot (updates both boat and location)
  async assignToSlot(boatId, locationId, slotId) {
    // Get location
    const { data: location, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', locationId)
      .single()

    if (locError) throw locError

    // Check if slot is occupied
    if (location.boats && location.boats[slotId]) {
      throw new Error('Slot is already occupied')
    }

    // Get boat
    const boat = await this.getById(boatId)

    // Remove from old location if exists
    if (boat.location && boat.slot) {
      await this.removeFromSlot(boatId)
    }

    // Update location with new boat
    const updatedBoats = { ...location.boats, [slotId]: boatId }
    await supabase
      .from('locations')
      .update({ boats: updatedBoats })
      .eq('id', locationId)

    // Update boat with new location/slot
    return this.update(boatId, {
      location: location.name,
      slot: slotId,
    })
  },

  // Remove boat from location slot
  async removeFromSlot(boatId) {
    const boat = await this.getById(boatId)

    if (!boat.location || !boat.slot) {
      return boat // Already unassigned
    }

    // Find and update location
    const { data: locations } = await supabase
      .from('locations')
      .select('*')
      .eq('name', boat.location)

    if (locations && locations.length > 0) {
      const location = locations[0]

      if (location.type === 'pool') {
        // Pool location - remove from pool_boats array
        const updatedPoolBoats = (location.pool_boats || []).filter(id => id !== boatId)
        await supabase
          .from('locations')
          .update({ pool_boats: updatedPoolBoats })
          .eq('id', location.id)
      } else {
        // Grid location - remove from boats object
        const updatedBoats = { ...location.boats }
        delete updatedBoats[boat.slot]
        await supabase
          .from('locations')
          .update({ boats: updatedBoats })
          .eq('id', location.id)
      }
    }

    // Update boat
    return this.update(boatId, {
      location: null,
      slot: null,
    })
  },

  // Move boat from one slot to another (handles same or different locations)
  async moveToSlot(boatId, toLocationId, toSlotId) {
    // Get target location
    const { data: toLocation, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', toLocationId)
      .single()

    if (locError) throw locError

    const boat = await this.getById(boatId)

    // Remove from old location
    if (boat.location) {
      const { data: oldLocations } = await supabase
        .from('locations')
        .select('*')
        .eq('name', boat.location)

      if (oldLocations && oldLocations.length > 0) {
        const oldLocation = oldLocations[0]

        if (oldLocation.type === 'pool') {
          // Pool location - remove from pool_boats array
          const updatedPoolBoats = (oldLocation.pool_boats || []).filter(id => id !== boatId)
          await supabase
            .from('locations')
            .update({ pool_boats: updatedPoolBoats })
            .eq('id', oldLocation.id)
        } else {
          // Grid location - remove from boats object
          const updatedOldBoats = { ...oldLocation.boats }

          // Find the slot by boat ID (more reliable than using boat.slot)
          const oldSlotKey = Object.keys(updatedOldBoats).find(key => updatedOldBoats[key] === boatId)
          if (oldSlotKey) {
            delete updatedOldBoats[oldSlotKey]
          }

          await supabase
            .from('locations')
            .update({ boats: updatedOldBoats })
            .eq('id', oldLocation.id)
        }
      }
    }

    // Add to target location based on type
    if (toLocation.type === 'pool') {
      // Pool location - add to pool_boats array
      const currentPoolBoats = toLocation.pool_boats || []
      const updatedPoolBoats = [...currentPoolBoats, boatId]
      await supabase
        .from('locations')
        .update({ pool_boats: updatedPoolBoats })
        .eq('id', toLocationId)

      return this.update(boatId, {
        location: toLocation.name,
        slot: 'pool',
      })
    } else {
      // Grid location - check slot availability and add to boats object
      if (toLocation.boats && toLocation.boats[toSlotId]) {
        throw new Error('Target slot is already occupied')
      }

      const updatedNewBoats = { ...toLocation.boats, [toSlotId]: boatId }
      await supabase
        .from('locations')
        .update({ boats: updatedNewBoats })
        .eq('id', toLocationId)

      return this.update(boatId, {
        location: toLocation.name,
        slot: toSlotId,
      })
    }
  },
}

// ============================================================================
// INVENTORY BOATS OPERATIONS (Dockmaster API Boats)
// ============================================================================

export const inventoryBoatsService = {
  // Get all inventory boats
  async getAll() {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Get single inventory boat by ID
  async getById(id) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Get by Dockmaster ID
  async getByDockmasterId(dockmasterId) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('dockmaster_id', dockmasterId)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get boat by Hull ID
  async getByHullId(hullId) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('hull_id', hullId)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Create new inventory boat
  async create(boatData) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .insert([boatData])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Update inventory boat
  async update(id, updates) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Sync from Dockmaster API
  async sync(apiBoats) {
    // Get existing inventory boats
    const existing = await this.getAll()
    const existingMap = new Map(
      existing.map(b => [b.dockmaster_id, b])
    )

    const toUpdate = []
    const toCreate = []
    const existingIds = new Set()

    // Process API boats
    for (const apiBoat of apiBoats) {
      existingIds.add(apiBoat.dockmaster_id)
      
      if (existingMap.has(apiBoat.dockmaster_id)) {
        // Update existing
        const existingBoat = existingMap.get(apiBoat.dockmaster_id)
        toUpdate.push({
          id: existingBoat.id,
          ...apiBoat,
          last_synced: new Date().toISOString()
        })
      } else {
        // Create new
        toCreate.push({
          ...apiBoat,
          last_synced: new Date().toISOString()
        })
      }
    }

    // Batch operations
    const operations = []

    if (toCreate.length > 0) {
      operations.push(
        supabase.from('inventory_boats').insert(toCreate)
      )
    }

    if (toUpdate.length > 0) {
      operations.push(
        ...toUpdate.map(boat => 
          supabase
            .from('inventory_boats')
            .update(boat)
            .eq('id', boat.id)
        )
      )
    }

    await Promise.all(operations)

    // Return synced boats
    return this.getAll()
  },

  // Delete inventory boat
  async delete(id) {
    const { error } = await supabase
      .from('inventory_boats')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Search inventory boats
  async search(query) {
    const lowerQuery = query.toLowerCase()
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .or(`name.ilike.%${lowerQuery}%,model.ilike.%${lowerQuery}%,make.ilike.%${lowerQuery}%`)

    if (error) throw error
    return data || []
  },

  // Get by sales status
  async getBySalesStatus(salesStatus) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('sales_status', salesStatus)

    if (error) throw error
    return data || []
  },

  // Get by year
  async getByYear(year) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('year', year)

    if (error) throw error
    return data || []
  },

  // Get by make
  async getByMake(make) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('make', make)

    if (error) throw error
    return data || []
  },

  // Assign NFC tag to inventory boat
  async assignNfcTag(boatId, nfcTag) {
    const { data: existing, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('nfc_tag', nfcTag)

    // If we found a boat with this tag and it's not the current boat, throw error
    if (existing && existing.length > 0 && existing[0].id !== boatId) {
      throw new Error('NFC tag is already assigned to another boat')
    }

    return this.update(boatId, { nfc_tag: nfcTag })
  },

  // Release NFC tag
  async releaseNfcTag(boatId) {
    return this.update(boatId, { nfc_tag: null })
  },

  // Assign to location slot
  async assignToSlot(boatId, locationId, slotId) {
    const { data: location, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', locationId)
      .single()

    if (locError) throw locError

    if (location.boats && location.boats[slotId]) {
      throw new Error('Slot is already occupied')
    }

    const boat = await this.getById(boatId)

    // Remove from old location if exists
    if (boat.location && boat.slot) {
      await this.removeFromSlot(boatId)
    }

    // Update location
    const updatedBoats = { ...location.boats, [slotId]: boatId }
    await supabase
      .from('locations')
      .update({ boats: updatedBoats })
      .eq('id', locationId)

    // Update boat
    return this.update(boatId, {
      location: location.name,
      slot: slotId,
    })
  },

  // Remove from slot
  async removeFromSlot(boatId) {
    console.log('[removeFromSlot] Starting removal for boat:', boatId)

    // Fetch all locations to find which one contains this boat
    const { data: allLocations } = await supabase
      .from('locations')
      .select('*')

    console.log('[removeFromSlot] Searching through all locations for boat:', boatId)

    // Search through all locations to find where this boat is
    for (const location of allLocations || []) {
      let foundInLocation = false

      if (location.type === 'pool') {
        // Check pool_boats array
        const poolBoats = location.pool_boats || []
        if (poolBoats.includes(boatId)) {
          console.log('[removeFromSlot] Found boat in pool location:', location.name)
          foundInLocation = true
          const updatedPoolBoats = poolBoats.filter(id => id !== boatId)
          await supabase
            .from('locations')
            .update({ pool_boats: updatedPoolBoats })
            .eq('id', location.id)
          console.log('[removeFromSlot] Removed from pool_boats')
        }
      } else {
        // Check boats object for grid locations
        const boats = location.boats || {}
        const slotWithBoat = Object.keys(boats).find(slot => boats[slot] === boatId)
        if (slotWithBoat) {
          console.log('[removeFromSlot] Found boat in grid location:', location.name, 'slot:', slotWithBoat)
          foundInLocation = true
          const updatedBoats = { ...boats }
          delete updatedBoats[slotWithBoat]
          await supabase
            .from('locations')
            .update({ boats: updatedBoats })
            .eq('id', location.id)
          console.log('[removeFromSlot] Removed from boats object')
        }
      }

      if (foundInLocation) {
        break // Found and removed, no need to check other locations
      }
    }

    // Always clear the boat's location and slot fields
    console.log('[removeFromSlot] Clearing boat location and slot fields')
    const result = await this.update(boatId, {
      location: null,
      slot: null,
    })
    console.log('[removeFromSlot] Removal complete:', result)
    return result
  },

  // Move to slot
  async moveToSlot(boatId, toLocationId, toSlotId) {
    // First, fetch target location to validate it exists
    const { data: toLocation, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', toLocationId)
      .single()

    if (locError) throw locError

    const boat = await this.getById(boatId)

    // Remove from ALL locations where this boat might exist (more robust than relying on boat.location)
    // Force fresh data by using order() which bypasses some caching
    const { data: allLocations } = await supabase
      .from('locations')
      .select('*')
      .order('id', { ascending: true })

    if (allLocations) {
      for (const loc of allLocations) {
        let needsUpdate = false
        let updatedLocation = { ...loc }

        // Handle grid-type locations
        if (loc.boats) {
          const slotKey = Object.keys(loc.boats).find(key => loc.boats[key] === boatId)
          if (slotKey) {
            console.log('[Inventory] Found boat in grid location:', loc.name, 'slot:', slotKey, '- removing it')
            updatedLocation.boats = { ...loc.boats }
            delete updatedLocation.boats[slotKey]
            needsUpdate = true
          }
        }

        // Handle pool-type locations
        if (loc.type === 'pool' && loc.pool_boats && loc.pool_boats.includes(boatId)) {
          console.log('[Inventory] Found boat in pool location:', loc.name, '- removing it')
          updatedLocation.pool_boats = loc.pool_boats.filter(id => id !== boatId)
          needsUpdate = true
        }

        // Only update if changes were made
        if (needsUpdate) {
          const updateData = {}
          if (updatedLocation.boats) updateData.boats = updatedLocation.boats
          if (updatedLocation.pool_boats) updateData.pool_boats = updatedLocation.pool_boats

          await supabase
            .from('locations')
            .update(updateData)
            .eq('id', loc.id)
        }
      }
    }

    // Refetch target location to get fresh data after removals
    const { data: freshToLocation, error: refetchError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', toLocationId)
      .single()

    if (refetchError) throw refetchError

    // Add to target location based on type
    if (freshToLocation.type === 'pool') {
      // Pool location - add to pool_boats array
      const currentPoolBoats = freshToLocation.pool_boats || []

      // Only add if not already present (safety check)
      if (!currentPoolBoats.includes(boatId)) {
        const updatedPoolBoats = [...currentPoolBoats, boatId]
        await supabase
          .from('locations')
          .update({ pool_boats: updatedPoolBoats })
          .eq('id', toLocationId)
      } else {
        console.log('[Inventory] Boat already in target pool, skipping add')
      }

      return this.update(boatId, {
        location: freshToLocation.name,
        slot: 'pool',
      })
    } else {
      // Grid location - check slot availability and add to boats object
      if (freshToLocation.boats && freshToLocation.boats[toSlotId]) {
        throw new Error('Target slot is already occupied')
      }

      const updatedNewBoats = { ...freshToLocation.boats, [toSlotId]: boatId }
      await supabase
        .from('locations')
        .update({ boats: updatedNewBoats })
        .eq('id', toLocationId)

      return this.update(boatId, {
        location: freshToLocation.name,
        slot: toSlotId,
      })
    }
  },
}

// ============================================================================
// LOCATIONS OPERATIONS
// ============================================================================

export const locationsService = {
  // Get all locations
  async getAll() {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Get single location
  async getById(id) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Create location
  async create(locationData) {
    const { data, error } = await supabase
      .from('locations')
      .insert([locationData])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Update location
  async update(id, updates) {
    const { data, error } = await supabase
      .from('locations')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Delete location
  async delete(id) {
    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Batch update locations (for boat assignments)
  async batchUpdate(locations) {
    const promises = locations.map(location =>
      this.update(location.id, location)
    )
    return Promise.all(promises)
  },

  // Get location by name
  async getByName(name) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('name', name)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get all boats at a location (returns full boat objects)
  async getBoatsAtLocation(locationId, boatsData) {
    const location = await this.getById(locationId)
    if (!location || !location.boats) return []

    const boatIds = Object.values(location.boats)
    return boatsData.filter(boat => boatIds.includes(boat.id))
  },

  // Clear all boats from location (emergency use)
  async clearAllBoats(locationId) {
    return this.update(locationId, { boats: {} })
  },
}

// ============================================================================
// USER PREFERENCES OPERATIONS
// ============================================================================

export const preferencesService = {
  // Get user preferences
  async get(userId) {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Save user preferences (upsert)
  async save(userId, preferences) {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          selected_locations: preferences.selectedLocations || [],
          location_order: preferences.locationOrder || [],
        },
        { onConflict: 'user_id' }
      )
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },
}

// ============================================================================
// DOCKMASTER CONFIG OPERATIONS
// ============================================================================

export const dockmasterService = {
  // Get config
  async getConfig() {
    const { data, error } = await supabase
      .from('dockmaster_config')
      .select('*')
      .limit(1)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Save config (upsert)
  async saveConfig(config) {
    // Check if config exists
    const existing = await this.getConfig()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('dockmaster_config')
        .update(config)
        .eq('id', existing.id)
        .select()

      if (error) throw error
      return data && data.length > 0 ? data[0] : null
    } else {
      // Create new
      const { data, error } = await supabase
        .from('dockmaster_config')
        .insert([config])
        .select()

      if (error) throw error
      return data && data.length > 0 ? data[0] : null
    }
  },

  // Update last sync time
  async updateLastSync() {
    const existing = await this.getConfig()
    if (!existing) return

    const { error } = await supabase
      .from('dockmaster_config')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) throw error
  },
}

// ============================================================================
// USERS OPERATIONS (Admin only)
// ============================================================================

export const usersService = {
  // Get all users
  async getAll() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Update user role
  async updateRole(userId, role) {
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS (Optional - for live updates)
// ============================================================================

export const subscriptions = {
  // Subscribe to boats changes
  subscribeToBoats(callback) {
    return supabase
      .channel('boats-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boats' },
        callback
      )
      .subscribe()
  },

  // Subscribe to locations changes
  subscribeToLocations(callback) {
    return supabase
      .channel('locations-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'locations' },
        callback
      )
      .subscribe()
  },

  // Subscribe to inventory boats changes
  subscribeToInventoryBoats(callback) {
    return supabase
      .channel('inventory-boats-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_boats' },
        callback
      )
      .subscribe()
  },

  // Unsubscribe from channel
  unsubscribe(channel) {
    supabase.removeChannel(channel)
  },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Get all boats (combines regular boats and inventory boats)
export const getAllBoatsCombined = async () => {
  const [regularBoats, inventoryBoats] = await Promise.all([
    boatsService.getAll(),
    inventoryBoatsService.getAll()
  ])

  // Add isInventory flag to inventory boats
  const markedInventoryBoats = inventoryBoats.map(boat => ({
    ...boat,
    isInventory: true
  }))

  return [...regularBoats, ...markedInventoryBoats]
}

// Convert database snake_case to camelCase (for consistency with current app)
export const toCamelCase = (obj) => {
  if (!obj) return obj
  if (Array.isArray(obj)) return obj.map(toCamelCase)
  if (typeof obj !== 'object') return obj

  const camelObj = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    camelObj[camelKey] = typeof value === 'object' ? toCamelCase(value) : value
  }
  return camelObj
}

// Convert camelCase to snake_case for database
export const toSnakeCase = (obj) => {
  if (!obj) return obj
  if (Array.isArray(obj)) return obj.map(toSnakeCase)
  if (typeof obj !== 'object') return obj

  const snakeObj = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    snakeObj[snakeKey] = typeof value === 'object' ? toSnakeCase(value) : value
  }
  return snakeObj
}

// ============================================================================
// BOAT SHOWS SERVICE (Layout Planner)
// ============================================================================

export const boatShowsService = {
  // Get all boat shows
  async getAll() {
    const { data, error } = await supabase
      .from('boat_shows')
      .select('*')
      .order('show_date', { ascending: true, nullsFirst: false })

    if (error) throw error
    return data?.map(toCamelCase) || []
  },

  // Get single boat show with items
  async getById(id) {
    const { data, error } = await supabase
      .from('boat_shows')
      .select(`
        *,
        items:boat_show_items(*)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return toCamelCase(data)
  },

  // Create new boat show
  async create(show) {
    const dbShow = {
      name: show.name,
      venue: show.venue || null,
      show_date: show.showDate || null,
      width_ft: show.widthFt || 100,
      height_ft: show.heightFt || 100,
      notes: show.notes || null,
    }

    const { data, error } = await supabase
      .from('boat_shows')
      .insert([dbShow])
      .select()
      .single()

    if (error) throw error
    return toCamelCase(data)
  },

  // Update boat show
  async update(id, updates) {
    const dbUpdates = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.venue !== undefined) dbUpdates.venue = updates.venue
    if (updates.showDate !== undefined) dbUpdates.show_date = updates.showDate
    if (updates.widthFt !== undefined) dbUpdates.width_ft = updates.widthFt
    if (updates.heightFt !== undefined) dbUpdates.height_ft = updates.heightFt
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes

    const { data, error } = await supabase
      .from('boat_shows')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return toCamelCase(data)
  },

  // Delete boat show (cascade deletes items)
  async delete(id) {
    const { error } = await supabase
      .from('boat_shows')
      .delete()
      .eq('id', id)

    if (error) throw error
    return true
  },

  // Get items for a show
  async getItems(showId) {
    const { data, error } = await supabase
      .from('boat_show_items')
      .select(`
        *,
        inventory_boat:inventory_boats(*)
      `)
      .eq('show_id', showId)
      .order('z_index', { ascending: true })

    if (error) throw error
    return data?.map(item => {
      const camelItem = toCamelCase(item)
      // Flatten inventory_boat data if present
      if (camelItem.inventoryBoat) {
        camelItem.boat = toCamelCase(camelItem.inventoryBoat)
        delete camelItem.inventoryBoat
      }
      return camelItem
    }) || []
  },

  // Add item to show
  async addItem(showId, item) {
    const dbItem = {
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
    }

    const { data, error } = await supabase
      .from('boat_show_items')
      .insert([dbItem])
      .select(`
        *,
        inventory_boat:inventory_boats(*)
      `)
      .single()

    if (error) throw error
    
    const camelItem = toCamelCase(data)
    if (camelItem.inventoryBoat) {
      camelItem.boat = toCamelCase(camelItem.inventoryBoat)
      delete camelItem.inventoryBoat
    }
    return camelItem
  },

  // Update item position/rotation
  async updateItem(itemId, updates) {
    const dbUpdates = {}
    if (updates.x !== undefined) dbUpdates.x = updates.x
    if (updates.y !== undefined) dbUpdates.y = updates.y
    if (updates.rotation !== undefined) dbUpdates.rotation = updates.rotation
    if (updates.widthFt !== undefined) dbUpdates.width_ft = updates.widthFt
    if (updates.heightFt !== undefined) dbUpdates.height_ft = updates.heightFt
    if (updates.label !== undefined) dbUpdates.label = updates.label
    if (updates.color !== undefined) dbUpdates.color = updates.color
    if (updates.zIndex !== undefined) dbUpdates.z_index = updates.zIndex

    const { data, error } = await supabase
      .from('boat_show_items')
      .update(dbUpdates)
      .eq('id', itemId)
      .select(`
        *,
        inventory_boat:inventory_boats(*)
      `)
      .single()

    if (error) throw error
    
    const camelItem = toCamelCase(data)
    if (camelItem.inventoryBoat) {
      camelItem.boat = toCamelCase(camelItem.inventoryBoat)
      delete camelItem.inventoryBoat
    }
    return camelItem
  },

  // Remove item from show
  async removeItem(itemId) {
    const { error } = await supabase
      .from('boat_show_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
    return true
  },

  // Batch update items (for bulk position changes)
  async updateItems(items) {
    const updates = items.map(item => ({
      id: item.id,
      x: item.x,
      y: item.y,
      rotation: item.rotation,
      z_index: item.zIndex,
    }))

    // Supabase doesn't have native batch update, so we do individual updates
    const results = await Promise.all(
      updates.map(update => 
        supabase
          .from('boat_show_items')
          .update({ x: update.x, y: update.y, rotation: update.rotation, z_index: update.z_index })
          .eq('id', update.id)
      )
    )

    const errors = results.filter(r => r.error)
    if (errors.length > 0) throw errors[0].error

    return true
  },

  // Subscribe to show changes
  subscribeToShow(showId, callback) {
    return supabase
      .channel(`boat_show_${showId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boat_show_items',
          filter: `show_id=eq.${showId}`,
        },
        callback
      )
      .subscribe()
  },

  // Unsubscribe
  unsubscribe(channel) {
    if (channel) {
      supabase.removeChannel(channel)
    }
  },
}

// ============================================================================
// EXPORT ALL SERVICES
// ============================================================================

export default {
  auth: authService,
  boats: boatsService,
  inventoryBoats: inventoryBoatsService,
  locations: locationsService,
  preferences: preferencesService,
  dockmaster: dockmasterService,
  users: usersService,
  boatShows: boatShowsService,
  subscriptions,
  getAllBoatsCombined,
  toCamelCase,
  toSnakeCase,
}
