import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Trash2, Edit2, Save, X, Anchor, RotateCw, RotateCcw, Printer, ZoomIn, ZoomOut, Move, Flower2, Armchair, Tent, Flag, Table, ArrowUp, ArrowDown, Copy, Grid, Layers, Package } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { boatShowsService } from '../services/supabaseService';
import { BoatShowModal } from '../components/modals/BoatShowModal';

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

export function BoatShowPlanner({ inventoryBoats = [] }) {
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
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const PIXELS_PER_FOOT = 10;

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

  const handleMouseMove = useCallback((e) => {
    if (isDragging && dragItem && selectedShow) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      let newX = Math.round(canvasPos.x - dragOffset.x);
      let newY = Math.round(canvasPos.y - dragOffset.y);
      newX = Math.max(0, Math.min(newX, selectedShow.widthFt - (dragItem.widthFt || 10)));
      newY = Math.max(0, Math.min(newY, selectedShow.heightFt - (dragItem.heightFt || 10)));
      setItems(items.map(i => i.id === dragItem.id ? { ...i, x: newX, y: newY } : i));
      if (selectedItem?.id === dragItem.id) setSelectedItem({ ...selectedItem, x: newX, y: newY });
    } else if (isPanning) {
      setPanOffset({ x: panOffset.x + e.movementX, y: panOffset.y + e.movementY });
    }
  }, [isDragging, dragItem, dragOffset, isPanning, panOffset, items, selectedItem, selectedShow]);

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
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
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

  const filteredBoats = inventoryBoats.filter(boat => !boatSearch || boat.name?.toLowerCase().includes(boatSearch.toLowerCase()) || boat.model?.toLowerCase().includes(boatSearch.toLowerCase()) || boat.make?.toLowerCase().includes(boatSearch.toLowerCase()));
  const boatsInLayout = new Set(items.filter(i => i.inventoryBoatId).map(i => i.inventoryBoatId));

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col animate-slide-in">
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-2xl font-bold text-slate-900">Boat Show Planner</h2><p className="text-slate-600">Design your boat show layout with drag and drop</p></div>
        <div className="flex items-center gap-2">
          {selectedShow && (<><button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"><Printer className="w-4 h-4" />Print</button><button onClick={() => setShowEditModal(true)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"><Edit2 className="w-4 h-4" />Edit Show</button></>)}
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
                    const typeConfig = SHOW_ITEM_TYPES[item.itemType] || SHOW_ITEM_TYPES.furniture;
                    const boat = item.boat;
                    const displayName = boat ? `${boat.year || ''} ${boat.name}`.trim() : item.label;
                    const bgColor = item.itemType === 'boat' ? '#3b82f6' : (item.color || typeConfig.color);
                    return (
                      <g key={item.id} transform={`translate(${x + width/2}, ${y + height/2}) rotate(${item.rotation || 0}) translate(${-width/2}, ${-height/2})`} onMouseDown={(e) => handleItemMouseDown(e, item)} style={{ cursor: 'move' }}>
                        {item.itemType === 'boat' ? <path d={`M ${width * 0.1} 0 L ${width * 0.9} 0 L ${width} ${height * 0.5} L ${width * 0.9} ${height} L ${width * 0.1} ${height} L 0 ${height * 0.5} Z`} fill={bgColor} stroke={isSelected ? '#1d4ed8' : '#2563eb'} strokeWidth={isSelected ? 3 : 1} /> : <rect width={width} height={height} fill={bgColor} stroke={isSelected ? '#1d4ed8' : 'rgba(0,0,0,0.2)'} strokeWidth={isSelected ? 3 : 1} rx={item.itemType === 'plant' ? width/2 : 4} ry={item.itemType === 'plant' ? height/2 : 4} />}
                        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={Math.min(width, height) * 0.15} fontWeight="bold" style={{ pointerEvents: 'none', userSelect: 'none' }}>{displayName?.substring(0, 20)}</text>
                        <text x={width / 2} y={height / 2 + Math.min(width, height) * 0.2} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.8)" fontSize={Math.min(width, height) * 0.1} style={{ pointerEvents: 'none', userSelect: 'none' }}>{item.widthFt}'×{item.heightFt}'</text>
                        {isSelected && <><rect x={-4} y={-4} width={8} height={8} fill="#1d4ed8" /><rect x={width-4} y={-4} width={8} height={8} fill="#1d4ed8" /><rect x={-4} y={height-4} width={8} height={8} fill="#1d4ed8" /><rect x={width-4} y={height-4} width={8} height={8} fill="#1d4ed8" /></>}
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

export default BoatShowPlanner;
