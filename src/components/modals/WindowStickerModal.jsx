// ============================================================================
// WINDOW STICKER MODAL
// ============================================================================
// Generates a print-ready window sticker for inventory boats
// Combines marketing appeal with MSRP breakdown
// ============================================================================

import React, { useRef } from 'react';
import { X, Printer } from 'lucide-react';

export function WindowStickerModal({ boat, onClose }) {
  const printRef = useRef(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Window Sticker - ${boat.name}</title>
          <style>
            @page {
              size: 8.5in 11in;
              margin: 0.25in;
            }
            body {
              font-family: 'Arial', sans-serif;
              margin: 0;
              padding: 0;
              background: white;
              color: #1e293b;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .sticker {
              max-width: 8in;
              margin: 0 auto;
              padding: 0.25in;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 3px solid #1e40af;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            .dealer-info {
              text-align: left;
            }
            .dealer-name {
              font-size: 24px;
              font-weight: bold;
              color: #1e40af;
            }
            .dealer-tagline {
              font-size: 11px;
              color: #64748b;
            }
            .boat-title {
              text-align: right;
            }
            .boat-year-make {
              font-size: 14px;
              color: #64748b;
            }
            .boat-model {
              font-size: 22px;
              font-weight: bold;
              color: #0f172a;
            }
            .boat-name {
              font-size: 12px;
              color: #475569;
            }
            .stock-hull {
              display: flex;
              justify-content: space-between;
              background: #f1f5f9;
              padding: 8px 12px;
              border-radius: 6px;
              margin-bottom: 16px;
              font-size: 12px;
            }
            .stock-hull strong {
              color: #1e40af;
            }
            .section {
              margin-bottom: 14px;
            }
            .section-title {
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #1e40af;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 4px;
              margin-bottom: 8px;
            }
            .specs-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 8px;
            }
            .spec-item {
              background: #f8fafc;
              padding: 6px 8px;
              border-radius: 4px;
              border: 1px solid #e2e8f0;
            }
            .spec-label {
              font-size: 9px;
              color: #64748b;
              text-transform: uppercase;
            }
            .spec-value {
              font-size: 13px;
              font-weight: 600;
              color: #0f172a;
            }
            .engine-box {
              background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
              border: 2px solid #f59e0b;
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 14px;
            }
            .engine-title {
              font-size: 12px;
              font-weight: bold;
              color: #92400e;
              margin-bottom: 6px;
            }
            .engine-details {
              font-size: 14px;
              font-weight: bold;
              color: #78350f;
            }
            .engine-specs {
              font-size: 11px;
              color: #92400e;
              margin-top: 4px;
            }
            .trailer-box {
              background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
              border: 2px solid #8b5cf6;
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 14px;
            }
            .trailer-title {
              font-size: 12px;
              font-weight: bold;
              color: #5b21b6;
              margin-bottom: 6px;
            }
            .trailer-details {
              font-size: 14px;
              font-weight: bold;
              color: #4c1d95;
            }
            .trailer-specs {
              font-size: 11px;
              color: #6d28d9;
              margin-top: 4px;
            }
            .options-list {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 2px 12px;
              font-size: 11px;
            }
            .option-desc {
              color: #334155;
            }
            .option-price {
              text-align: right;
              font-weight: 600;
              color: #0f172a;
            }
            .pricing-box {
              background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
              border: 3px solid #16a34a;
              border-radius: 12px;
              padding: 16px;
              margin-top: 16px;
            }
            .pricing-row {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;
              font-size: 13px;
            }
            .pricing-row.subtotal {
              border-top: 1px dashed #16a34a;
              margin-top: 8px;
              padding-top: 8px;
            }
            .pricing-row.total {
              border-top: 2px solid #16a34a;
              margin-top: 8px;
              padding-top: 12px;
              font-size: 20px;
              font-weight: bold;
            }
            .pricing-label {
              color: #166534;
            }
            .pricing-value {
              color: #14532d;
              font-weight: 600;
            }
            .pricing-row.total .pricing-value {
              color: #15803d;
              font-size: 24px;
            }
            .footer {
              margin-top: 16px;
              text-align: center;
              font-size: 10px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 12px;
            }
            .sales-status {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 11px;
              font-weight: bold;
              margin-left: 8px;
            }
            .status-available {
              background: #dcfce7;
              color: #166534;
            }
            .status-sold {
              background: #fee2e2;
              color: #991b1b;
            }
            .status-reserved {
              background: #fef3c7;
              color: #92400e;
            }
            @media print {
              body { margin: 0; }
              .sticker { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // Format currency
  const formatPrice = (price) => {
    if (!price) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Get sales status display
  const getSalesStatusInfo = (status) => {
    const statusMap = {
      'HA': { label: 'Available', class: 'status-available' },
      'HS': { label: 'Sold', class: 'status-sold' },
      'OA': { label: 'On Order', class: 'status-available' },
      'OS': { label: 'On Order - Sold', class: 'status-sold' },
      'FA': { label: 'Coming Soon', class: 'status-available' },
      'FS': { label: 'Coming Soon - Sold', class: 'status-sold' },
      'S': { label: 'Sold', class: 'status-sold' },
      'R': { label: 'Reserved', class: 'status-reserved' },
      'FP': { label: 'Floor Plan', class: 'status-available' },
    };
    return statusMap[status] || { label: status, class: 'status-available' };
  };

  const statusInfo = getSalesStatusInfo(boat.salesStatus);

  // Calculate totals
  const basePrice = boat.listPrice || boat.list_price || 0;
  const optionsTotal = (boat.options || []).reduce((sum, opt) => sum + (opt.price || opt.msrp || 0), 0);
  const motorsTotal = (boat.motors || []).reduce((sum, m) => sum + (m.price || m.msrp || 0), 0);
  const trailersTotal = (boat.trailers || []).reduce((sum, t) => sum + (t.price || t.msrp || 0), 0);
  const totalMSRP = basePrice; // List price typically includes everything

  // Collect specs
  const specs = [
    { label: 'Length', value: boat.length },
    { label: 'Beam', value: boat.beam },
    { label: 'Draft', value: boat.draft },
    { label: 'Weight', value: boat.weight },
    { label: 'Hull Type', value: boat.hullType || boat.hull_type },
    { label: 'Hull Material', value: boat.hullMaterial || boat.hull_material },
    { label: 'Fuel Capacity', value: boat.fuelCapacity || boat.fuel_capacity },
    { label: 'Max HP', value: boat.motorRating || boat.motor_rating },
  ].filter(s => s.value);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold">Window Sticker Preview</h3>
            <p className="text-blue-100 text-sm">Print-ready format</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-blue-500 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sticker Preview - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
          <div ref={printRef} className="sticker bg-white shadow-lg rounded-lg p-6 max-w-[8in] mx-auto">
            {/* Header with Dealer & Boat Info */}
            <div className="header flex justify-between items-start border-b-4 border-blue-700 pb-3 mb-4">
              <div className="dealer-info">
                <div className="dealer-name text-2xl font-bold text-blue-700">Boats by George</div>
                <div className="dealer-tagline text-xs text-slate-500">Your Trusted Marine Dealer</div>
              </div>
              <div className="boat-title text-right">
                <div className="boat-year-make text-sm text-slate-500">{boat.year} {boat.make}</div>
                <div className="boat-model text-xl font-bold text-slate-900">{boat.model}</div>
                {boat.name !== `${boat.make} ${boat.model}` && (
                  <div className="boat-name text-xs text-slate-600">{boat.name}</div>
                )}
                <span className={`sales-status inline-block px-3 py-1 rounded-full text-xs font-bold mt-1 ${statusInfo.class}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>

            {/* Stock & Hull */}
            <div className="stock-hull flex justify-between bg-slate-100 px-3 py-2 rounded-md mb-4 text-sm">
              <span><strong className="text-blue-700">Stock #:</strong> {boat.stockNumber || boat.stock_number || 'N/A'}</span>
              <span><strong className="text-blue-700">Hull ID:</strong> {boat.hullId || boat.hull_id || 'N/A'}</span>
              {boat.color && <span><strong className="text-blue-700">Color:</strong> {boat.color}</span>}
            </div>

            {/* Specifications */}
            {specs.length > 0 && (
              <div className="section mb-4">
                <div className="section-title text-xs font-bold uppercase tracking-wide text-blue-700 border-b border-slate-200 pb-1 mb-2">
                  Specifications
                </div>
                <div className="specs-grid grid grid-cols-4 gap-2">
                  {specs.map((spec, idx) => (
                    <div key={idx} className="spec-item bg-slate-50 p-2 rounded border border-slate-200">
                      <div className="spec-label text-[10px] text-slate-500 uppercase">{spec.label}</div>
                      <div className="spec-value text-sm font-semibold text-slate-900">{spec.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Engine */}
            {boat.motors?.length > 0 && (
              <div className="engine-box bg-gradient-to-r from-amber-50 to-amber-100 border-2 border-amber-400 rounded-lg p-3 mb-4">
                <div className="engine-title text-xs font-bold text-amber-800">
                  {boat.motors.length > 1 ? `${boat.motors.length} ENGINES INCLUDED` : 'ENGINE INCLUDED'}
                </div>
                {boat.motors.map((motor, idx) => (
                  <div key={idx} className="mb-2 last:mb-0">
                    <div className="engine-details text-base font-bold text-amber-900">
                      {motor.vendorName} {motor.modelNumber}
                      {motor.horsePower && <span className="ml-2 text-amber-700">({motor.horsePower} HP)</span>}
                    </div>
                    <div className="engine-specs text-xs text-amber-700">
                      {[
                        motor.year && `${motor.year}`,
                        motor.powerType,
                        motor.shaftLength && `${motor.shaftLength} Shaft`,
                        motor.serialNumber && `S/N: ${motor.serialNumber}`,
                      ].filter(Boolean).join(' • ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Trailer */}
            {boat.trailers?.length > 0 && (
              <div className="trailer-box bg-gradient-to-r from-violet-50 to-violet-100 border-2 border-violet-400 rounded-lg p-3 mb-4">
                <div className="trailer-title text-xs font-bold text-violet-800">
                  {boat.trailers.length > 1 ? `${boat.trailers.length} TRAILERS INCLUDED` : 'TRAILER INCLUDED'}
                </div>
                {boat.trailers.map((trailer, idx) => (
                  <div key={idx} className="mb-2 last:mb-0">
                    <div className="trailer-details text-base font-bold text-violet-900">
                      {trailer.vendorName} {trailer.modelNumber}
                    </div>
                    <div className="trailer-specs text-xs text-violet-700">
                      {[
                        trailer.year && `${trailer.year}`,
                        trailer.weightCapacity && `Capacity: ${trailer.weightCapacity}`,
                        trailer.serialNumber && `S/N: ${trailer.serialNumber}`,
                      ].filter(Boolean).join(' • ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Options */}
            {boat.options?.length > 0 && (
              <div className="section mb-4">
                <div className="section-title text-xs font-bold uppercase tracking-wide text-blue-700 border-b border-slate-200 pb-1 mb-2">
                  Factory Options & Equipment ({boat.options.length})
                </div>
                <div className="options-list grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {boat.options.map((opt, idx) => (
                    <React.Fragment key={idx}>
                      <span className="option-desc text-slate-700">
                        {opt.desc || opt.description || opt.optionCode}
                      </span>
                      <span className="option-price text-right font-semibold text-slate-900">
                        {opt.price || opt.msrp ? formatPrice(opt.price || opt.msrp) : '—'}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Accessories */}
            {boat.accessories?.length > 0 && (
              <div className="section mb-4">
                <div className="section-title text-xs font-bold uppercase tracking-wide text-blue-700 border-b border-slate-200 pb-1 mb-2">
                  Accessories ({boat.accessories.length})
                </div>
                <div className="options-list grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {boat.accessories.map((acc, idx) => (
                    <React.Fragment key={idx}>
                      <span className="option-desc text-slate-700">
                        {acc.desc || acc.description || acc.accCode}
                        {acc.qty > 1 && <span className="text-slate-400 ml-1">x{acc.qty}</span>}
                      </span>
                      <span className="option-price text-right font-semibold text-slate-900">
                        {acc.price || acc.msrp ? formatPrice(acc.price || acc.msrp) : '—'}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* MSRP Box */}
            {totalMSRP > 0 && (
              <div className="pricing-box bg-gradient-to-r from-green-50 to-emerald-100 border-4 border-green-500 rounded-xl p-4 mt-4">
                <div className="pricing-row total flex justify-between items-center">
                  <span className="pricing-label text-lg font-bold text-green-800">TOTAL MSRP</span>
                  <span className="pricing-value text-3xl font-bold text-green-700">{formatPrice(totalMSRP)}</span>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="footer mt-4 text-center text-[10px] text-slate-400 border-t border-slate-200 pt-3">
              <p>Prices and specifications subject to change without notice. See dealer for details.</p>
              <p className="mt-1">Generated {new Date().toLocaleDateString()} • Boats by George Asset Management</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WindowStickerModal;
