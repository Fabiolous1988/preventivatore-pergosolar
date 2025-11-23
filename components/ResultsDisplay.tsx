
import React, { useState, useEffect } from 'react';
import { EstimateResult, TransportOption, CostItem } from '../types';
import CostChart from './CostChart';
import { FileText, TrendingUp, Info, Train, Plane, Car, CheckCircle2, AlertCircle, Briefcase, BedDouble, MapPin, Download, Pencil, RotateCcw, Save } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  result: EstimateResult;
}

const ResultsDisplay: React.FC<Props> = ({ result }) => {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedOptions, setEditedOptions] = useState<TransportOption[]>([]);

  // Reset selection and edit state when result changes (new AI generation)
  useEffect(() => {
    setSelectedOptionIndex(0);
    setIsEditMode(false);
    if (result && result.options) {
      // Deep copy for editing
      setEditedOptions(JSON.parse(JSON.stringify(result.options)));
    }
  }, [result]);

  if (!result || !result.options || result.options.length === 0) {
    return (
        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl text-center text-yellow-800 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8" />
            <p>Nessuna opzione di trasporto generata per questo scenario. Riprova controllando i dati.</p>
        </div>
    );
  }

  // Determine which data source to use
  const currentOptions = isEditMode ? editedOptions : result.options;
  const activeOption = currentOptions[selectedOptionIndex] || currentOptions[0];

  // Handle manual cost updates
  const handleCostChange = (category: string, indexInCategory: number, newAmountStr: string) => {
    const newAmount = parseFloat(newAmountStr);
    if (isNaN(newAmount)) return;

    const newOptions = [...editedOptions];
    const currentOpt = newOptions[selectedOptionIndex];
    
    // 1. Find and update the specific item in the breakdown
    // We need to find the global index in the breakdown array
    let matchCount = 0;
    const globalIndex = currentOpt.breakdown.findIndex(item => {
        if (item.category === category) {
            if (matchCount === indexInCategory) return true;
            matchCount++;
        }
        return false;
    });

    if (globalIndex !== -1) {
        currentOpt.breakdown[globalIndex].amount = newAmount;

        // 2. Recalculate Total Cost
        const newTotalCost = currentOpt.breakdown.reduce((sum, item) => sum + (item.amount || 0), 0);
        
        // 3. Recalculate Sales Price & Margin based on ORIGINAL Margin % 
        // We reference the original AI result to keep the margin percentage constant
        const originalOpt = result.options[selectedOptionIndex];
        const originalMarginRate = originalOpt.salesPrice > 0 
            ? originalOpt.marginAmount / originalOpt.salesPrice 
            : 0;

        // Avoid division by zero or negative prices if margin is 100% (unlikely)
        let newSalesPrice = newTotalCost; 
        if (originalMarginRate < 0.99) {
            newSalesPrice = newTotalCost / (1 - originalMarginRate);
        }

        const newMarginAmount = newSalesPrice - newTotalCost;

        // Update the option stats
        currentOpt.totalCost = newTotalCost;
        currentOpt.salesPrice = newSalesPrice;
        currentOpt.marginAmount = newMarginAmount;

        setEditedOptions(newOptions);
    }
  };

  // Helper to pick icon
  const getIcon = (name: string) => {
    const lower = name?.toLowerCase() || '';
    if (lower.includes('aereo')) return <Plane className="w-4 h-4" />;
    if (lower.includes('treno')) return <Train className="w-4 h-4" />;
    return <Car className="w-4 h-4" />;
  };

  // Group items by category
  const groupedCosts = {
      Lavoro: activeOption.breakdown.filter(i => i.category === 'Lavoro'),
      Viaggio: activeOption.breakdown.filter(i => i.category === 'Viaggio'),
      VittoAlloggio: activeOption.breakdown.filter(i => i.category === 'Vitto/Alloggio'),
      Altro: activeOption.breakdown.filter(i => !['Lavoro', 'Viaggio', 'Vitto/Alloggio'].includes(i.category))
  };

  const getCategoryTotal = (items: CostItem[]) => items.reduce((sum, i) => sum + (i.amount || 0), 0);

  // PDF Generator Function
  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(30, 64, 175); // Blue
    doc.text("Preventivo Field Service", 14, 20);
    
    // Meta Info
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generato il: ${new Date().toLocaleDateString()}`, 14, 26);
    doc.text(`Opzione Selezionata: ${activeOption.methodName}`, 14, 31);
    if (isEditMode) {
        doc.setTextColor(220, 38, 38);
        doc.text("(Valori modificati manualmente)", 14, 36);
    }
    
    // Logistics Summary
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text("Dettaglio Logistica:", 14, 45);
    doc.setFontSize(10);
    doc.setTextColor(80);
    const splitLogistics = doc.splitTextToSize(activeOption.logisticsSummary, 180);
    doc.text(splitLogistics, 14, 51);

    let startY = 60 + (splitLogistics.length * 5);

    // Table Data Preparation
    const tableRows: any[] = [];
    
    // Helper to add section to table
    const addSection = (title: string, items: CostItem[]) => {
        if (items.length > 0) {
            tableRows.push([{ content: title.toUpperCase(), colSpan: 2, styles: { fillColor: [240, 245, 255], fontStyle: 'bold' } }]);
            items.forEach(item => {
                tableRows.push([item.description, `€ ${item.amount.toFixed(2)}`]);
            });
            const subtotal = getCategoryTotal(items);
            tableRows.push([{ content: `Totale ${title}`, styles: { fontStyle: 'bold' }}, { content: `€ ${subtotal.toFixed(2)}`, styles: { fontStyle: 'bold' } }]);
        }
    };

    addSection("Lavoro", groupedCosts.Lavoro);
    addSection("Viaggio & Trasporti", groupedCosts.Viaggio);
    addSection("Vitto & Alloggio", groupedCosts.VittoAlloggio);

    // Render Table
    autoTable(doc, {
        startY: startY,
        head: [['Descrizione', 'Importo']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175] },
        columnStyles: { 
            0: { cellWidth: 'auto' },
            1: { cellWidth: 40, halign: 'right' }
        }
    });

    // Totals Section
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFillColor(240, 248, 255);
    doc.rect(14, finalY, 182, 25, 'F');
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Costo Totale Stimato:`, 20, finalY + 8);
    doc.text(`€ ${(activeOption.totalCost || 0).toFixed(2)}`, 190, finalY + 8, { align: 'right' });
    
    doc.text(`Margine Previsto:`, 20, finalY + 18);
    doc.setTextColor(22, 163, 74); // Green
    doc.text(`€ ${(activeOption.marginAmount || 0).toFixed(2)}`, 190, finalY + 18, { align: 'right' });

    // Footer / Reasoning
    doc.setFontSize(10);
    doc.setTextColor(100);
    const reasoningSplit = doc.splitTextToSize(`Note AI: ${result.commonReasoning}`, 180);
    doc.text(reasoningSplit, 14, finalY + 35);

    doc.save("Preventivo_FieldService.pdf");
  };

  const renderCostSection = (title: string, items: CostItem[], categoryKey: string, icon: React.ReactNode, colorClass: string) => {
      if (items.length === 0) return null;
      return (
        <div>
            <h4 className={`text-sm font-bold text-slate-900 px-3 py-1 rounded-md flex justify-between items-center ${colorClass}`}>
                <span className="flex items-center gap-2">{icon} {title}</span>
                <span>€{getCategoryTotal(items).toFixed(2)}</span>
            </h4>
            <div className="mt-2 pl-4 space-y-2">
                {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm items-center">
                        <span className="text-slate-600 flex-1 mr-2">{item.description}</span>
                        {isEditMode ? (
                            <div className="flex items-center">
                                <span className="text-slate-400 mr-1">€</span>
                                <input 
                                    type="number"
                                    step="0.01"
                                    value={item.amount}
                                    onChange={(e) => handleCostChange(categoryKey, idx, e.target.value)}
                                    className="w-24 p-1 text-right border border-blue-300 rounded bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-slate-700"
                                />
                            </div>
                        ) : (
                             <span className="font-mono text-slate-700">€{item.amount.toFixed(2)}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
      );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Actions Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Scenario Selector */}
        <div className="flex-1">
            {currentOptions.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {currentOptions.map((opt, idx) => (
                         <button
                            key={idx}
                            onClick={() => setSelectedOptionIndex(idx)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium ${
                                selectedOptionIndex === idx 
                                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' 
                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                            }`}
                        >
                            {getIcon(opt.methodName)}
                            {opt.methodName}
                        </button>
                    ))}
                </div>
            )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
            <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm whitespace-nowrap border ${
                    isEditMode 
                    ? 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200' 
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
            >
                {isEditMode ? (
                    <>
                        <RotateCcw className="w-4 h-4" />
                        Annulla / Reset
                    </>
                ) : (
                    <>
                        <Pencil className="w-4 h-4" />
                        Modifica Voci
                    </>
                )}
            </button>

            <button 
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm whitespace-nowrap"
            >
                <Download className="w-4 h-4" />
                Scarica PDF
            </button>
        </div>
      </div>

      {/* Alert for Edit Mode */}
      {isEditMode && (
          <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-center gap-3 text-sm text-orange-800 animate-in fade-in">
              <Info className="w-4 h-4" />
              <span><strong>Modalità Modifica Attiva:</strong> Cambia gli importi nelle caselle qui sotto. Il Totale e il Margine verranno ricalcolati automaticamente. Disabilita per tornare ai dati AI originali.</span>
          </div>
      )}

      {/* Top Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500 mb-1">Costo Totale Stimato</p>
          <p className="text-3xl font-bold text-slate-900">€{(activeOption.totalCost || 0).toFixed(2)}</p>
        </div>
        <div className="bg-blue-50 p-6 rounded-xl shadow-sm border border-blue-100">
          <p className="text-sm text-blue-600 mb-1 font-semibold">Prezzo di Vendita Suggerito</p>
          <p className="text-3xl font-bold text-blue-900">€{(activeOption.salesPrice || 0).toFixed(2)}</p>
        </div>
        <div className="bg-green-50 p-6 rounded-xl shadow-sm border border-green-100">
          <p className="text-sm text-green-600 mb-1 font-semibold">Margine Previsto</p>
          <p className="text-3xl font-bold text-green-900">€{(activeOption.marginAmount || 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown List - Grouped */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" /> Dettaglio Costi ({activeOption.methodName})
            </h3>
            
            <div className="space-y-6 flex-1">
                {renderCostSection("Lavoro (Manodopera)", groupedCosts.Lavoro, "Lavoro", <Briefcase className="w-4 h-4" />, "bg-slate-100")}
                {renderCostSection("Viaggio & Logistica", groupedCosts.Viaggio, "Viaggio", <MapPin className="w-4 h-4" />, "bg-blue-50")}
                {renderCostSection("Vitto & Alloggio", groupedCosts.VittoAlloggio, "Vitto/Alloggio", <BedDouble className="w-4 h-4" />, "bg-orange-50")}
                
                {/* Fallback for unknown categories */}
                {groupedCosts.Altro.length > 0 && renderCostSection("Altro", groupedCosts.Altro, "Altro", <Info className="w-4 h-4" />, "bg-gray-100")}
            </div>

             <div className="flex justify-between items-center pt-4 font-bold text-slate-900 border-t border-slate-200 mt-6">
                <span>Totale Costi Vivi</span>
                <span>€{(activeOption.totalCost || 0).toFixed(2)}</span>
            </div>
        </div>

        {/* Visual Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" /> Distribuzione Costi
            </h3>
            <div className="flex-1 min-h-[250px] flex items-center justify-center">
                <CostChart items={activeOption.breakdown || []} />
            </div>
             <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-600">
                 <strong>Dettaglio Logistica:</strong>
                 <p className="mt-1">{activeOption.logisticsSummary}</p>
             </div>
        </div>
      </div>

      {/* AI Reasoning / Summary */}
      <div className="bg-slate-800 text-slate-50 p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-300" /> Note & Reasoning AI
        </h3>
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
            <p>{result.commonReasoning}</p>
        </div>
      </div>

    </div>
  );
};

export default ResultsDisplay;
