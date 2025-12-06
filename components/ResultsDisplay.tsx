
import React, { useState, useEffect } from 'react';
import { EstimateResult, TransportOption, CostItem } from '../types';
import CostChart from './CostChart';
import { FileText, TrendingUp, Info, Train, Plane, Car, CheckCircle2, AlertCircle, Briefcase, BedDouble, MapPin, Download, Pencil, RotateCcw, Save, HelpCircle, BoxSelect, Bug, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  result: EstimateResult;
}

const ResultsDisplay: React.FC<Props> = ({ result }) => {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedOptions, setEditedOptions] = useState<TransportOption[]>([]);
  
  // Track open tooltip for category explanation
  const [activeReasoning, setActiveReasoning] = useState<string | null>(null);

  // Debug Modal State
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  // Reset selection and edit state when result changes (new AI generation)
  useEffect(() => {
    setSelectedOptionIndex(0);
    setIsEditMode(false);
    setActiveReasoning(null);
    setIsDebugOpen(false);
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
    doc.text("Preventivo Pergosolar", 14, 20);
    
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

    doc.save("Preventivo_Pergosolar.pdf");
  };

  const renderCostSection = (title: string, items: CostItem[], categoryKey: string, icon: React.ReactNode, colorClass: string) => {
      if (items.length === 0) return null;
      
      const explanation = activeOption.categoryExplanations?.[categoryKey];

      return (
        <div className="relative">
            <h4 className={`text-sm font-bold text-slate-900 px-3 py-1 rounded-md flex justify-between items-center ${colorClass}`}>
                <div className="flex items-center gap-2">
                    {icon} 
                    {title}
                    {explanation && (
                        <button 
                            type="button"
                            onClick={() => setActiveReasoning(activeReasoning === categoryKey ? null : categoryKey)}
                            className="text-slate-500 hover:text-blue-600 focus:outline-none"
                            title="Vedi dettaglio calcolo"
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <span>€{getCategoryTotal(items).toFixed(2)}</span>
            </h4>
            
            {/* Reasoning Popover */}
            {activeReasoning === categoryKey && explanation && (
                <div className="mb-3 mt-1 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-slate-700 font-mono whitespace-pre-wrap animate-in fade-in z-20 relative shadow-sm">
                    <p className="font-bold text-yellow-800 mb-1 flex items-center gap-1"><Info className="w-3 h-3"/> Logica Calcolo:</p>
                    {explanation}
                </div>
            )}

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
                onClick={() => setIsDebugOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm whitespace-nowrap border bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                title="Vedi Logistica Raw"
            >
                <Bug className="w-4 h-4" />
                Debug Dati
            </button>

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

      {/* DEBUG MODAL */}
      {isDebugOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Bug className="w-5 h-5 text-red-600" /> Diagnostica Lettura CSV
                    </h3>
                    <button onClick={() => setIsDebugOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6 overflow-auto font-mono text-xs text-slate-700 bg-slate-50">
                    <pre className="whitespace-pre-wrap">{result.debugLog || "Nessun dato di debug disponibile."}</pre>
                </div>
                <div className="p-4 border-t border-slate-200 bg-white rounded-b-xl flex justify-end">
                    <button onClick={() => setIsDebugOpen(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-slate-800 font-medium text-sm">
                        Chiudi
                    </button>
                </div>
            </div>
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
                {renderCostSection("Manodopera", groupedCosts.Lavoro, "Lavoro", <Briefcase className="w-4 h-4 text-blue-600"/>, "bg-blue-50 border border-blue-100 text-blue-800")}
                {renderCostSection("Viaggio & Trasporti", groupedCosts.Viaggio, "Viaggio", <Car className="w-4 h-4 text-emerald-600"/>, "bg-emerald-50 border border-emerald-100 text-emerald-800")}
                {renderCostSection("Vitto & Alloggio", groupedCosts.VittoAlloggio, "Vitto/Alloggio", <BedDouble className="w-4 h-4 text-amber-600"/>, "bg-amber-50 border border-amber-100 text-amber-800")}
                {renderCostSection("Logistica & Altro", groupedCosts.Altro, "Altro", <BoxSelect className="w-4 h-4 text-purple-600"/>, "bg-purple-50 border border-purple-100 text-purple-800")}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
                <p>Clicca l'icona <HelpCircle className="w-3 h-3 inline"/> per vedere il calcolo specifico di ogni voce.</p>
            </div>
        </div>

        {/* Visualization & Logistics */}
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-500" /> Ripartizione Spese
                </h3>
                <div className="h-64 w-full">
                    <CostChart items={activeOption.breakdown} />
                </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" /> Strategia Logistica
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed bg-white p-3 rounded border border-slate-200">
                    {activeOption.logisticsSummary}
                </p>
            </div>

             {/* Common Reasoning */}
             <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                <h3 className="text-sm font-bold text-blue-800 mb-2 uppercase flex items-center gap-2">
                    <Info className="w-4 h-4" /> Note Generali
                </h3>
                <p className="text-sm text-blue-700 leading-relaxed">
                    {result.commonReasoning}
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
