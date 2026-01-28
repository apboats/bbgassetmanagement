import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Search, X, Package, Map, Users, Edit2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { boatsService, inventoryBoatsService, boatLifecycleService } from '../services/supabaseService';

export function ScanView({ boats, locations, onUpdateBoats, onUpdateLocations }) {
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
  const [scanStatus, setScanStatus] = useState(''); // For showing scan progress
  const [lastScanTime, setLastScanTime] = useState(0);

  // Manual search states
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Refs for camera
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const isProcessingRef = useRef(false); // Track processing state for interval
  const isCameraReadyRef = useRef(false); // Track camera ready state for interval

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
                isCameraReadyRef.current = true;
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
    // Stop auto-scan interval
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    isCameraReadyRef.current = false;
    setIsCameraReady(false);
    setScanStatus('');
  };

  // Capture just the focus box region for better OCR accuracy
  const captureImage = (forAutoScan = false) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas) {
      const context = canvas.getContext('2d');

      // Calculate the focus box region (center 80% width, 15% height)
      const boxWidth = video.videoWidth * 0.8;
      const boxHeight = video.videoHeight * 0.15;
      const boxX = (video.videoWidth - boxWidth) / 2;
      const boxY = (video.videoHeight - boxHeight) / 2;

      // Set canvas to focus box size
      canvas.width = boxWidth;
      canvas.height = boxHeight;

      // Draw only the focus box region
      context.drawImage(
        video,
        boxX, boxY, boxWidth, boxHeight,  // Source rectangle
        0, 0, boxWidth, boxHeight          // Destination rectangle
      );

      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);

      if (!forAutoScan) {
        setCapturedImage(imageDataUrl);
        stopCamera();
      }

      return imageDataUrl;
    }
    return null;
  };

  // Auto-scan function that runs periodically
  const performAutoScan = async () => {
    // Skip if already processing or not ready
    if (isProcessingRef.current || !isCameraReadyRef.current || !videoRef.current) {
      return;
    }

    isProcessingRef.current = true;
    setScanStatus('Scanning...');

    try {
      const imageDataUrl = captureImage(true);
      if (!imageDataUrl) {
        isProcessingRef.current = false;
        return;
      }

      // Call the edge function for OCR
      const { data, error } = await supabase.functions.invoke('ocr-hull-id', {
        body: { imageBase64: imageDataUrl }
      });

      if (error) {
        console.log('Auto-scan OCR error:', error.message);
        setScanStatus('Scanning...');
        isProcessingRef.current = false;
        return;
      }

      if (!data.success || !data.text) {
        setScanStatus('Point at Hull ID tag...');
        isProcessingRef.current = false;
        return;
      }

      const cleanedText = data.text;
      const confidence = data.confidence || 0;

      // Hull ID format: 12 characters (3 letters + 5 alphanumeric + 1 letter + 3 digits)
      // Only proceed if we have exactly 12 chars and good confidence
      if (cleanedText.length === 12 && confidence >= 70) {
        console.log('Auto-scan found valid Hull ID:', cleanedText, 'confidence:', confidence);

        // Stop scanning and process the result
        stopCamera();
        setCapturedImage(imageDataUrl);
        setOcrResult(cleanedText);
        setOcrConfidence(confidence);

        // Search for the boat
        await searchBoatByHullId(cleanedText);
      } else if (cleanedText.length >= 8) {
        // Show partial detection
        setScanStatus(`Detected: ${cleanedText} (${cleanedText.length}/12 chars)`);
      } else if (cleanedText.length > 0) {
        setScanStatus(`Reading: ${cleanedText}...`);
      } else {
        setScanStatus('Point at Hull ID tag...');
      }
    } catch (err) {
      console.log('Auto-scan error:', err.message);
      setScanStatus('Scanning...');
    } finally {
      isProcessingRef.current = false;
    }
  };

  // Start auto-scanning when camera is ready
  useEffect(() => {
    if (isCameraReady && !scanIntervalRef.current) {
      console.log('[AutoScan] Starting auto-scan interval');
      setScanStatus('Point at Hull ID tag...');

      // Start scanning every 2 seconds
      scanIntervalRef.current = setInterval(() => {
        performAutoScan();
      }, 2000);

      // Do an immediate first scan after a short delay
      setTimeout(() => performAutoScan(), 500);
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [isCameraReady]);

  // OCR processing using Google Cloud Vision via Edge Function
  const processImage = async (imageDataUrl) => {
    setIsProcessing(true);
    setOcrResult('');

    try {
      // Call the edge function for OCR
      const { data, error } = await supabase.functions.invoke('ocr-hull-id', {
        body: { imageBase64: imageDataUrl }
      });

      if (error) {
        console.error('OCR function error:', error);
        throw new Error(error.message || 'OCR service error');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to process image');
      }

      const cleanedText = data.text || '';
      const confidence = data.confidence || 0;

      setOcrResult(cleanedText);
      setOcrConfidence(confidence);

      // Search for boat with this Hull ID
      if (cleanedText.length >= 8) {
        await searchBoatByHullId(cleanedText);
      } else {
        alert('Could not read a valid Hull ID. Please try again or use manual search.');
        setShowManualSearch(true);
      }
    } catch (error) {
      console.error('OCR error:', error);
      alert('Failed to process image. Please try again.');
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
        // Found boat - show location picker (with archived warning)
        setSelectedBoat(foundBoat);
        setShowLocationPicker(true);

        // Show different message if boat is archived
        if (foundBoat.status === 'archived') {
          setOcrResult(`✓ Found: ${foundBoat.name} (ARCHIVED)`);
        } else {
          setOcrResult(`✓ Found: ${foundBoat.name}`);
        }
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

  // Manual search
  const searchBoatsManually = () => {
    const query = searchQuery.toLowerCase().trim();

    if (!query) {
      alert('Please enter a search term');
      return;
    }

    // Search across all boats, but exclude archived boats
    const results = boats.filter(boat => {
      // Check if boat matches search query
      const matchesQuery = boat.name?.toLowerCase().includes(query) ||
        boat.owner?.toLowerCase().includes(query) ||
        boat.hullId?.toLowerCase().includes(query) ||
        boat.model?.toLowerCase().includes(query);

      // Exclude archived boats from search results
      const isNotArchived = boat.status !== 'archived';

      return matchesQuery && isNotArchived;
    });

    setSearchResults(results);
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

    // Check if boat is archived and prompt for unarchive
    const isArchived = selectedBoat.status === 'archived';
    if (isArchived) {
      const confirmed = window.confirm(
        `"${selectedBoat.name}" is currently archived.\n\n` +
        `Moving it to a location will unarchive it and set status to "Needs Approval".\n\n` +
        `Do you want to continue?`
      );
      if (!confirmed) {
        return;
      }
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

    // Use centralized service to unarchive if needed
    let updatedBoat;
    if (isArchived) {
      // Boat is archived - use service to unarchive and place
      updatedBoat = await boatLifecycleService.unarchiveBoat(selectedBoat.id, {
        targetStatus: 'needs-approval',
        location: location.name,
        slot: finalSlot
      });
    } else {
      // Boat is not archived - just update location
      updatedBoat = await boatsService.update(selectedBoat.id, {
        location: location.name,
        slot: finalSlot
      });
    }

    await onUpdateLocations(locations.map(l => l.id === location.id ? updatedLocation : l));

    // Reload all boats to get fresh data from database
    const refreshedBoats = await boatsService.getAll();
    onUpdateBoats(refreshedBoats);

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

          {/* Active Camera with Focus Box Overlay */}
          {isCameraActive && (
            <div className="relative">
              {/* Video element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg"
              />

              {/* Focus box overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Dark overlay with transparent center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Top dark area */}
                  <div className="absolute top-0 left-0 right-0 h-[42.5%] bg-black/50" />
                  {/* Bottom dark area */}
                  <div className="absolute bottom-0 left-0 right-0 h-[42.5%] bg-black/50" />
                  {/* Left dark area (in the middle band) */}
                  <div className="absolute top-[42.5%] bottom-[42.5%] left-0 w-[10%] bg-black/50" />
                  {/* Right dark area (in the middle band) */}
                  <div className="absolute top-[42.5%] bottom-[42.5%] right-0 w-[10%] bg-black/50" />

                  {/* Focus box border */}
                  <div
                    className="absolute border-2 border-blue-400 rounded-lg"
                    style={{
                      width: '80%',
                      height: '15%',
                      top: '42.5%',
                      left: '10%',
                    }}
                  >
                    {/* Corner markers */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                  </div>
                </div>

                {/* Scan status text */}
                <div className="absolute bottom-20 left-0 right-0 text-center">
                  <div className={`inline-block px-4 py-2 rounded-full text-white text-sm font-medium ${
                    scanStatus.includes('Detected') ? 'bg-green-600' : 'bg-black/70'
                  }`}>
                    {scanStatus || 'Initializing camera...'}
                  </div>
                </div>

                {/* Instructions */}
                <div className="absolute top-4 left-0 right-0 text-center">
                  <div className="inline-block px-4 py-2 bg-black/70 rounded-full text-white text-sm">
                    Position Hull ID tag in the box
                  </div>
                </div>
              </div>

              {/* Manual capture and cancel buttons */}
              <div className="mt-4 flex gap-2 justify-center">
                <button
                  onClick={() => {
                    const imageDataUrl = captureImage(false);
                    if (imageDataUrl) {
                      processImage(imageDataUrl);
                    }
                  }}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-400 transition-colors"
                >
                  Capture Now
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
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
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

export default ScanView;
