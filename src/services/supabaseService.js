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

  // Import a boat from Dockmaster search results
  async importFromDockmaster(dockmasterBoat) {
    // Check if boat with this hull_id already exists
    if (dockmasterBoat.serialNumber || dockmasterBoat.hullId) {
      const hullId = dockmasterBoat.serialNumber || dockmasterBoat.hullId
      const existing = await this.getByHullId(hullId)
      if (existing) {
        // Return existing boat instead of creating duplicate
        return existing
      }
    }

    // Transform Dockmaster data to our boat format
    const boatData = {
      name: dockmasterBoat.name || dockmasterBoat.description ||
            `${dockmasterBoat.boatModelInfo?.vendorName || ''} ${dockmasterBoat.boatModelInfo?.modelNumber || ''}`.trim() ||
            'Unknown Boat',
      model: dockmasterBoat.model || dockmasterBoat.boatModelInfo?.modelNumber || '',
      hull_id: dockmasterBoat.serialNumber || dockmasterBoat.hullId || null,
      owner: dockmasterBoat.owner || dockmasterBoat.custName || '',
      customer_id: dockmasterBoat.custId || null,
      dockmaster_boat_id: dockmasterBoat.id || dockmasterBoat.dockmasterId || null,
      status: 'active',
      location: null,
      slot: null,
    }

    return this.create(boatData)
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
        // Pool location - remove from pool_boats array - use String() for consistent comparison
        const updatedPoolBoats = (location.pool_boats || []).filter(id => String(id) !== String(boatId))
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
    // Verify target location exists
    const { error: locError } = await supabase
      .from('locations')
      .select('id')
      .eq('id', toLocationId)
      .single()

    if (locError) throw locError

    // Remove from ALL locations where this boat might exist (more robust than relying on boat.location)
    // This ensures the boat is removed even if boat.location is stale or incorrect
    const { data: allLocations } = await supabase
      .from('locations')
      .select('*')
      .order('id', { ascending: true })

    if (allLocations) {
      for (const loc of allLocations) {
        let needsUpdate = false
        let updatedLocation = { ...loc }

        // Handle grid-type locations - use String() for consistent comparison
        if (loc.boats) {
          const slotKey = Object.keys(loc.boats).find(key => String(loc.boats[key]) === String(boatId))
          if (slotKey) {
            console.log('[Boats] Found boat in grid location:', loc.name, 'slot:', slotKey, '- removing it')
            updatedLocation.boats = { ...loc.boats }
            delete updatedLocation.boats[slotKey]
            needsUpdate = true
          }
        }

        // Handle pool-type locations - use String() for consistent comparison
        if (loc.type === 'pool' && loc.pool_boats && loc.pool_boats.some(id => String(id) === String(boatId))) {
          console.log('[Boats] Found boat in pool location:', loc.name, '- removing it')
          updatedLocation.pool_boats = loc.pool_boats.filter(id => String(id) !== String(boatId))
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

    // Re-fetch target location to get current state after removal
    // This is critical for same-location moves (e.g., moving to adjacent cell)
    const { data: freshLocation, error: freshLocError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', toLocationId)
      .single()

    if (freshLocError) throw freshLocError

    // Add to target location based on type
    if (freshLocation.type === 'pool') {
      // Pool location - add to pool_boats array
      const currentPoolBoats = freshLocation.pool_boats || []
      const updatedPoolBoats = [...currentPoolBoats, boatId]
      await supabase
        .from('locations')
        .update({ pool_boats: updatedPoolBoats })
        .eq('id', toLocationId)

      return this.update(boatId, {
        location: freshLocation.name,
        slot: 'pool',
      })
    } else {
      // Grid location - check slot availability and add to boats object
      if (freshLocation.boats && freshLocation.boats[toSlotId]) {
        throw new Error('Target slot is already occupied')
      }

      const updatedNewBoats = { ...freshLocation.boats, [toSlotId]: boatId }
      await supabase
        .from('locations')
        .update({ boats: updatedNewBoats })
        .eq('id', toLocationId)

      return this.update(boatId, {
        location: freshLocation.name,
        slot: toSlotId,
      })
    }
  },
}

// ============================================================================
// BOAT LIFECYCLE SERVICE
// ============================================================================
// Centralized service for boat status transitions, import, and archive operations
// Use this instead of directly calling create/update to prevent duplicates
// ============================================================================

export const boatLifecycleService = {
  // Valid boat statuses
  STATUSES: {
    NEEDS_APPROVAL: 'needs-approval',
    NEEDS_PARTS: 'needs-parts',
    PARTS_KIT_PULLED: 'parts-kit-pulled',
    ON_DECK: 'on-deck',
    ALL_WORK_COMPLETE: 'all-work-complete',
    ARCHIVED: 'archived',
    ACTIVE: 'active', // For inventory boats
  },

  /**
   * Find existing boat by matching criteria (dockmasterId or hullId)
   * Checks ALL statuses (not just archived) and BOTH tables (boats + inventory_boats)
   *
   * @param {Object} criteria - { dockmasterId, hullId }
   * @returns {Object|null} - { boat, source: 'boats'|'inventory_boats' } or null
   */
  async findExistingBoat(criteria) {
    const { dockmasterId, hullId } = criteria;

    // Priority 1: Check by Dockmaster ID in boats table (most reliable)
    if (dockmasterId) {
      const { data: boatsByDockmaster, error: e1 } = await supabase
        .from('boats')
        .select('*')
        .eq('dockmaster_id', dockmasterId);

      if (!e1 && boatsByDockmaster && boatsByDockmaster.length > 0) {
        return { boat: boatsByDockmaster[0], source: 'boats' };
      }
    }

    // Priority 2: Check by Hull ID in boats table (permanent identifier)
    if (hullId) {
      const { data: boatsByHull, error: e2 } = await supabase
        .from('boats')
        .select('*')
        .eq('hull_id', hullId);

      if (!e2 && boatsByHull && boatsByHull.length > 0) {
        return { boat: boatsByHull[0], source: 'boats' };
      }
    }

    // Priority 3: Check inventory_boats table by Dockmaster ID
    if (dockmasterId) {
      const { data: inventoryBoats, error: e3 } = await supabase
        .from('inventory_boats')
        .select('*')
        .eq('dockmaster_id', dockmasterId);

      if (!e3 && inventoryBoats && inventoryBoats.length > 0) {
        return { boat: inventoryBoats[0], source: 'inventory_boats' };
      }
    }

    return null;
  },

  /**
   * Import or update a boat from Dockmaster
   * - If boat exists (any status, any table): updates it and unarchives if needed
   * - If boat doesn't exist: creates new with status 'needs-approval'
   * - Prevents duplicates by comprehensive matching
   *
   * @param {Object} boatData - Boat data to import
   * @param {Object} options - { preserveLocation: boolean, targetStatus: string }
   * @returns {Object} - Created or updated boat
   */
  async importOrUpdateBoat(boatData, options = {}) {
    const {
      preserveLocation = false,
      targetStatus = this.STATUSES.NEEDS_APPROVAL
    } = options;

    // Clean and prepare boat data
    const cleanData = {
      name: boatData.name || 'Unknown Boat',
      model: boatData.model || '',
      hull_id: boatData.hullId || boatData.hull_id || null,
      dockmaster_id: boatData.dockmasterId || boatData.dockmaster_id || null,
      owner: boatData.owner || '',
      customer_id: boatData.customerId || boatData.customer_id || null,
      work_order_number: boatData.workOrderNumber || boatData.work_order_number || null,
    };

    // Search for existing boat
    const existing = await this.findExistingBoat({
      dockmasterId: cleanData.dockmaster_id,
      hullId: cleanData.hull_id
    });

    if (existing) {
      // FOUND: Update existing boat
      const { boat: existingBoat, source } = existing;

      // If found in inventory_boats, we need to move it to boats table
      if (source === 'inventory_boats') {
        // Create in boats table (this is a "promotion" from inventory)
        const newBoatData = {
          ...cleanData,
          qr_code: `QR-${Date.now()}`,
          nfc_tag: null,
          status: targetStatus,
          location: null,
          slot: null,
          archived_date: null,
        };

        const { data: newBoat, error } = await supabase
          .from('boats')
          .insert([newBoatData])
          .select();

        if (error) throw error;

        // Optionally delete from inventory_boats to prevent confusion
        // (Commented out to preserve inventory history)
        // await supabase.from('inventory_boats').delete().eq('id', existingBoat.id);

        return newBoat[0];
      }

      // Found in boats table - update it
      const wasArchived = existingBoat.status === this.STATUSES.ARCHIVED;

      const updates = {
        ...cleanData,
        // If boat was archived, unarchive it
        status: wasArchived ? targetStatus : existingBoat.status,
        archived_date: wasArchived ? null : existingBoat.archived_date,
        // Preserve or clear location based on options
        location: preserveLocation ? existingBoat.location : null,
        slot: preserveLocation ? existingBoat.slot : null,
      };

      return await boatsService.update(existingBoat.id, updates);
    } else {
      // NOT FOUND: Create new boat
      const newBoatData = {
        ...cleanData,
        qr_code: boatData.qrCode || `QR-${Date.now()}`,
        nfc_tag: boatData.nfcTag || null,
        status: targetStatus,
        location: null,
        slot: null,
        archived_date: null,
      };

      return await boatsService.create(newBoatData);
    }
  },

  /**
   * Unarchive a boat (typically when placing it back on the board)
   * Sets status to 'needs-approval' and clears archivedDate
   *
   * @param {string} boatId - Boat ID to unarchive
   * @param {Object} options - { targetStatus: string, location: string, slot: string }
   * @returns {Object} - Updated boat
   */
  async unarchiveBoat(boatId, options = {}) {
    const {
      targetStatus = this.STATUSES.NEEDS_APPROVAL,
      location = null,
      slot = null
    } = options;

    const boat = await boatsService.getById(boatId);

    if (!boat) {
      throw new Error(`Boat ${boatId} not found`);
    }

    if (boat.status !== this.STATUSES.ARCHIVED) {
      // Not archived - just update location if provided
      if (location !== null) {
        return await boatsService.update(boatId, { location, slot });
      }
      return boat;
    }

    // Unarchive the boat
    const updates = {
      status: targetStatus,
      archived_date: null,
      location,
      slot,
    };

    return await boatsService.update(boatId, updates);
  },

  /**
   * Archive/release a boat
   * - Sets status to 'archived'
   * - Sets archivedDate to now
   * - Clears location and slot
   * - NOTE: Caller must handle removing from location.boats object
   *
   * @param {string} boatId - Boat ID to archive
   * @returns {Object} - Updated boat
   */
  async archiveBoat(boatId) {
    const updates = {
      status: this.STATUSES.ARCHIVED,
      archived_date: new Date().toISOString(),
      location: null,
      slot: null,
    };

    return await boatsService.update(boatId, updates);
  },

  /**
   * Update boat status with validation
   * Prevents invalid status transitions (e.g., archived boats can't change work phases)
   *
   * @param {string} boatId - Boat ID
   * @param {string} newStatus - Target status
   * @returns {Object} - Updated boat
   */
  async updateBoatStatus(boatId, newStatus) {
    const boat = await boatsService.getById(boatId);

    if (!boat) {
      throw new Error(`Boat ${boatId} not found`);
    }

    // Don't allow status changes on archived boats (must unarchive first)
    if (boat.status === this.STATUSES.ARCHIVED && newStatus !== this.STATUSES.ARCHIVED) {
      throw new Error('Cannot change status of archived boat. Unarchive it first.');
    }

    // Validate status is valid
    const validStatuses = Object.values(this.STATUSES);
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    return await boatsService.update(boatId, { status: newStatus });
  },
};

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
  // Uses batch upsert to minimize database operations and real-time events
  async sync(apiBoats, fullSync = false) {
    // Get existing inventory boats
    const existing = await this.getAll()
    const existingMap = new Map(
      existing.map(b => [b.dockmaster_id, b])
    )

    const existingIds = new Set()
    const boatsToUpsert = []

    // Process API boats - prepare for batch upsert
    for (const apiBoat of apiBoats) {
      existingIds.add(apiBoat.dockmaster_id)

      const existingBoat = existingMap.get(apiBoat.dockmaster_id)

      // Prepare boat data for upsert (preserve location/slot if exists)
      boatsToUpsert.push({
        ...apiBoat,
        // Preserve existing location assignment if boat exists
        location: existingBoat?.location || null,
        slot: existingBoat?.slot || null,
        last_synced: new Date().toISOString()
      })
    }

    // Single batch upsert operation instead of N individual updates
    // This triggers only ONE real-time event instead of N events
    if (boatsToUpsert.length > 0) {
      console.log(`Upserting ${boatsToUpsert.length} boats in single batch operation`)
      const { error } = await supabase
        .from('inventory_boats')
        .upsert(boatsToUpsert, {
          onConflict: 'dockmaster_id',
          ignoreDuplicates: false
        })

      if (error) {
        console.error('Error upserting inventory boats:', error)
        throw error
      }
    }

    // Only delete boats on full sync (incremental sync only returns today's changes)
    if (fullSync) {
      const toDelete = existing.filter(b => !existingIds.has(b.dockmaster_id))
      if (toDelete.length > 0) {
        console.log(`Deleting ${toDelete.length} boats no longer in Dockmaster`)
        const deleteIds = toDelete.map(b => b.id)
        const { error: deleteError } = await supabase
          .from('inventory_boats')
          .delete()
          .in('id', deleteIds)

        if (deleteError) {
          console.error('Error deleting stale inventory boats:', deleteError)
        }
      }
    }

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
        // Check pool_boats array - use String() for consistent comparison
        const poolBoats = location.pool_boats || []
        if (poolBoats.some(id => String(id) === String(boatId))) {
          console.log('[removeFromSlot] Found boat in pool location:', location.name)
          foundInLocation = true
          const updatedPoolBoats = poolBoats.filter(id => String(id) !== String(boatId))
          await supabase
            .from('locations')
            .update({ pool_boats: updatedPoolBoats })
            .eq('id', location.id)
          console.log('[removeFromSlot] Removed from pool_boats')
        }
      } else {
        // Check boats object for grid locations - use String() for consistent comparison
        const boats = location.boats || {}
        const slotWithBoat = Object.keys(boats).find(slot => String(boats[slot]) === String(boatId))
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

        // Handle grid-type locations - use String() for consistent comparison
        if (loc.boats) {
          const slotKey = Object.keys(loc.boats).find(key => String(loc.boats[key]) === String(boatId))
          if (slotKey) {
            console.log('[Inventory] Found boat in grid location:', loc.name, 'slot:', slotKey, '- removing it')
            updatedLocation.boats = { ...loc.boats }
            delete updatedLocation.boats[slotKey]
            needsUpdate = true
          }
        }

        // Handle pool-type locations - use String() for consistent comparison
        if (loc.type === 'pool' && loc.pool_boats && loc.pool_boats.some(id => String(id) === String(boatId))) {
          console.log('[Inventory] Found boat in pool location:', loc.name, '- removing it')
          updatedLocation.pool_boats = loc.pool_boats.filter(id => String(id) !== String(boatId))
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
// SITES OPERATIONS (grouping locations by physical place)
// ============================================================================

export const sitesService = {
  // Get all sites ordered by sort_order
  async getAll() {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Get single site
  async getById(id) {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Create site
  async create(siteData) {
    // Get max sort_order to put new site at the end
    const { data: existing } = await supabase
      .from('sites')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data, error } = await supabase
      .from('sites')
      .insert([{ ...siteData, sort_order: nextOrder }])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Update site
  async update(id, updates) {
    const { data, error } = await supabase
      .from('sites')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Delete site (only if no locations are assigned)
  async delete(id) {
    // Check if any locations use this site
    const { data: locations } = await supabase
      .from('locations')
      .select('id')
      .eq('site_id', id)
      .limit(1)

    if (locations && locations.length > 0) {
      throw new Error('Cannot delete site with assigned locations. Please move or delete locations first.')
    }

    const { error } = await supabase
      .from('sites')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Reorder sites (update sort_order for all)
  async reorder(siteIds) {
    const promises = siteIds.map((id, index) =>
      supabase
        .from('sites')
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq('id', id)
    )

    const results = await Promise.all(promises)
    const errors = results.filter(r => r.error)
    if (errors.length > 0) throw errors[0].error
    return true
  },

  // Ensure a default site exists (called on app load)
  async ensureDefaultSite() {
    const sites = await this.getAll()
    if (sites.length === 0) {
      return this.create({ name: 'Main Site' })
    }
    return sites[0]
  },

  // Get locations for a site
  async getLocationsForSite(siteId) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('site_id', siteId)
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
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
// SERVICE REQUESTS (Sales-to-Service Collaboration)
// ============================================================================

export const requestsService = {
  // Get all requests with related data
  async getAll() {
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        *,
        inventory_boat:inventory_boats(id, name, make, model, year, hull_id, stock_number, dockmaster_id, color),
        creator:users!service_requests_created_by_fkey(id, name),
        service_completer:users!service_requests_service_completed_by_fkey(id, name),
        confirmer:users!service_requests_confirmed_by_fkey(id, name),
        messages:request_messages(*, user:users(id, name)),
        attachments:request_attachments(*, uploaded_by:users(id, name))
      `)
      .is('archived_at', null)  // Exclude archived by default
      .order('created_at', { ascending: false })

    if (error) throw error

    // Add public URLs to attachments
    const result = (data || []).map(req => {
      if (req.attachments && req.attachments.length > 0) {
        req.attachments = req.attachments.map(att => {
          const { data: { publicUrl } } = supabase.storage
            .from('request-attachments')
            .getPublicUrl(att.file_path)
          return { ...att, url: publicUrl }
        })
      }
      return req
    })

    return result
  },

  // Get all including archived
  async getAllIncludingArchived() {
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        *,
        inventory_boat:inventory_boats(id, name, make, model, year, hull_id, stock_number, dockmaster_id, color),
        creator:users!service_requests_created_by_fkey(id, name),
        service_completer:users!service_requests_service_completed_by_fkey(id, name),
        confirmer:users!service_requests_confirmed_by_fkey(id, name),
        messages:request_messages(*, user:users(id, name)),
        attachments:request_attachments(*, uploaded_by:users(id, name))
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Add public URLs to attachments
    const result = (data || []).map(req => {
      if (req.attachments && req.attachments.length > 0) {
        req.attachments = req.attachments.map(att => {
          const { data: { publicUrl } } = supabase.storage
            .from('request-attachments')
            .getPublicUrl(att.file_path)
          return { ...att, url: publicUrl }
        })
      }
      return req
    })

    return result
  },

  // Get single request by ID
  async getById(id) {
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        *,
        inventory_boat:inventory_boats(id, name, make, model, year, hull_id, stock_number, dockmaster_id, color),
        creator:users!service_requests_created_by_fkey(id, name),
        service_completer:users!service_requests_service_completed_by_fkey(id, name),
        confirmer:users!service_requests_confirmed_by_fkey(id, name),
        messages:request_messages(*, user:users(id, name)),
        attachments:request_attachments(*, uploaded_by:users(id, name))
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    // Add public URLs to attachments
    if (data && data.attachments && data.attachments.length > 0) {
      data.attachments = data.attachments.map(att => {
        const { data: { publicUrl } } = supabase.storage
          .from('request-attachments')
          .getPublicUrl(att.file_path)
        return { ...att, url: publicUrl }
      })
    }

    return data
  },

  // Create new request
  async create(requestData) {
    const { data, error } = await supabase
      .from('service_requests')
      .insert([requestData])
      .select()

    if (error) throw error
    return data?.[0]
  },

  // Update request
  async update(id, updates) {
    const { data, error } = await supabase
      .from('service_requests')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data?.[0]
  },

  // Mark service complete
  async markServiceComplete(id, userId) {
    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'service-complete',
        service_completed_by: userId,
        service_completed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()

    if (error) throw error
    return data?.[0]
  },

  // Confirm complete (by original requester)
  async confirmComplete(id, userId) {
    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'closed',
        confirmed_by: userId,
        confirmed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()

    if (error) throw error
    return data?.[0]
  },

  // Add message to request
  async addMessage(requestId, userId, message) {
    const { data, error } = await supabase
      .from('request_messages')
      .insert([{
        request_id: requestId,
        user_id: userId,
        message
      }])
      .select(`*, user:users(id, name)`)

    if (error) throw error
    return data?.[0]
  },

  // Archive old closed requests (call periodically or via cron)
  async archiveOldRequests() {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data, error } = await supabase
      .from('service_requests')
      .update({ archived_at: new Date().toISOString() })
      .eq('status', 'closed')
      .is('archived_at', null)
      .lt('confirmed_at', thirtyDaysAgo.toISOString())
      .select()

    if (error) throw error
    return data || []
  },
}

// ============================================================================
// REQUEST ATTACHMENTS (PDF file storage)
// ============================================================================

export const requestAttachmentsService = {
  // Upload a PDF file and create database record
  async upload(requestId, file, uploadedBy) {
    // 1. Generate unique filename
    const timestamp = Date.now()
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `${requestId}/${timestamp}_${safeFilename}`

    // 2. Upload to storage bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('request-attachments')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) throw uploadError

    // 3. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('request-attachments')
      .getPublicUrl(filePath)

    // 4. Create database record
    const { data, error } = await supabase
      .from('request_attachments')
      .insert({
        request_id: requestId,
        filename: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type || 'application/pdf',
        uploaded_by: uploadedBy
      })
      .select(`
        *,
        uploaded_by:users!request_attachments_uploaded_by_fkey(id, name)
      `)
      .single()

    if (error) throw error

    // Return with URL for immediate display
    return { ...data, url: publicUrl }
  },

  // Delete attachment (storage + database)
  async delete(attachmentId) {
    // 1. Get the attachment record to find file path
    const { data: attachment, error: fetchError } = await supabase
      .from('request_attachments')
      .select('file_path')
      .eq('id', attachmentId)
      .single()

    if (fetchError) throw fetchError

    // 2. Delete from storage
    const { error: storageError } = await supabase.storage
      .from('request-attachments')
      .remove([attachment.file_path])

    if (storageError) {
      console.warn('Storage delete error (continuing):', storageError)
      // Continue anyway - DB record deletion is more important
    }

    // 3. Delete database record
    const { error: dbError } = await supabase
      .from('request_attachments')
      .delete()
      .eq('id', attachmentId)

    if (dbError) throw dbError

    return true
  },

  // Get all attachments for a request
  async getForRequest(requestId) {
    const { data, error } = await supabase
      .from('request_attachments')
      .select(`
        *,
        uploaded_by:users!request_attachments_uploaded_by_fkey(id, name)
      `)
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })

    if (error) throw error

    // Add public URLs
    return (data || []).map(att => {
      const { data: { publicUrl } } = supabase.storage
        .from('request-attachments')
        .getPublicUrl(att.file_path)
      return { ...att, url: publicUrl }
    })
  }
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS (Optional - for live updates)
// ============================================================================

export const subscriptions = {
  // Broadcast channel for instant cross-device sync
  boatBroadcastChannel: null,

  // Initialize boat broadcast channel for instant peer-to-peer sync
  // Uses Supabase Broadcast (not database) for <100ms latency
  initBoatBroadcast(onReceive) {
    this.boatBroadcastChannel = supabase
      .channel('boat-sync', {
        config: { broadcast: { self: false } }  // Don't receive own broadcasts
      })
      .on('broadcast', { event: 'boat_change' }, ({ payload }) => {
        console.log('[Broadcast] Received boat change:', payload)
        onReceive(payload)
      })
      .subscribe()

    return this.boatBroadcastChannel
  },

  // Send boat change to all other devices instantly
  broadcastBoatChange(payload) {
    if (this.boatBroadcastChannel) {
      this.boatBroadcastChannel.send({
        type: 'broadcast',
        event: 'boat_change',
        payload
      })
      console.log('[Broadcast] Sent boat change:', payload)
    }
  },

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

  // Subscribe to service requests changes
  subscribeToRequests(callback) {
    return supabase
      .channel('service-requests-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests' },
        callback
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'request_messages' },
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
      boat_type: item.boatType || null,
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
    if (updates.boatType !== undefined) dbUpdates.boat_type = updates.boatType

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
// BOAT MOVEMENTS OPERATIONS (location history tracking)
// ============================================================================

export const boatMovementsService = {
  // Log a boat movement
  async logMovement({ boatId, boatType, fromLocation, fromSlot, toLocation, toSlot, movedBy, notes }) {
    const { data, error } = await supabase
      .from('boat_movements')
      .insert([{
        boat_id: boatId,
        boat_type: boatType || 'customer',
        from_location: fromLocation,
        from_slot: fromSlot,
        to_location: toLocation,
        to_slot: toSlot,
        moved_by: movedBy,
        notes: notes || null,
      }])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get movement history for a boat (most recent first)
  async getForBoat(boatId, limit = 10) {
    const { data, error } = await supabase
      .from('boat_movements')
      .select(`
        *,
        moved_by_user:users!boat_movements_moved_by_fkey(id, name, email)
      `)
      .eq('boat_id', boatId)
      .order('moved_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data || []).map(m => ({
      id: m.id,
      boatId: m.boat_id,
      boatType: m.boat_type,
      fromLocation: m.from_location,
      fromSlot: m.from_slot,
      toLocation: m.to_location,
      toSlot: m.to_slot,
      movedBy: m.moved_by,
      movedByUser: m.moved_by_user,
      movedAt: m.moved_at,
      notes: m.notes,
    }))
  },

  // Get last N movements for a boat (for quick "previous locations")
  async getLastMovements(boatId, count = 2) {
    return this.getForBoat(boatId, count)
  },
}

// ============================================================================
// CENTRALIZED MOVE SERVICE
// ============================================================================
// Single source of truth for moving boats and logging movement history
// Reads from database to ensure correct from_location/from_slot values

export async function moveBoatWithHistory(boatId, toLocationId, toSlotId, userId, isInventory = false) {
  // 1. Fetch current boat state from DATABASE (not React state)
  const tableName = isInventory ? 'inventory_boats' : 'boats'
  const { data: boat, error: fetchError } = await supabase
    .from(tableName)
    .select('id, location, slot')
    .eq('id', boatId)
    .single()

  if (fetchError) throw fetchError

  const fromLocation = boat.location || null
  const fromSlot = boat.slot || null

  // 2. Get toLocation name
  let toLocation = null
  if (toLocationId) {
    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', toLocationId)
      .single()
    toLocation = loc?.name || null
  }

  // 3. Perform the move
  if (toLocationId) {
    if (isInventory) {
      await inventoryBoatsService.moveToSlot(boatId, toLocationId, toSlotId)
    } else {
      await boatsService.moveToSlot(boatId, toLocationId, toSlotId)
    }
  } else {
    if (isInventory) {
      await inventoryBoatsService.removeFromSlot(boatId)
    } else {
      await boatsService.removeFromSlot(boatId)
    }
  }

  // 4. Log movement with correct values from database
  await boatMovementsService.logMovement({
    boatId,
    boatType: isInventory ? 'inventory' : 'customer',
    fromLocation,
    fromSlot,
    toLocation,
    toSlot: toSlotId || null,
    movedBy: userId,
    notes: null
  })

  return { fromLocation, fromSlot, toLocation, toSlot: toSlotId }
}

// ============================================================================
// EXPORT ALL SERVICES
// ============================================================================

export default {
  auth: authService,
  boats: boatsService,
  boatLifecycle: boatLifecycleService,
  inventoryBoats: inventoryBoatsService,
  locations: locationsService,
  sites: sitesService,
  preferences: preferencesService,
  dockmaster: dockmasterService,
  users: usersService,
  boatShows: boatShowsService,
  boatMovements: boatMovementsService,
  requests: requestsService,
  requestAttachments: requestAttachmentsService,
  moveBoatWithHistory,
  subscriptions,
  getAllBoatsCombined,
  toCamelCase,
  toSnakeCase,
}
