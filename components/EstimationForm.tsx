
import React, { useState, useEffect } from 'react';
import { EstimateInputs, ServiceType, TransportMode, ModelsConfig, LogisticsConfig, PergolaModel, DiscountRule } from '../types';
import { calculateInstallationHours, calculateBallastCount, calculateTotalWeight, normalize, getDynamicModelList, getBallastList, explainCalculation } from '../services/calculator';
import { Loader2, MapPin, Calendar, Truck, UserCog, Building2, LayoutGrid, CarFront, ArrowDownCircle, Users, CheckSquare, Weight, BoxSelect, RefreshCw, Calculator, Bug, Eye, Percent, Clock, FileText, HelpCircle, Timer } from 'lucide-react';

interface Props {
  onSubmit: (data: EstimateInputs) => void;
  isLoading: boolean;
  modelsConfig: ModelsConfig | null;
  discountRules: DiscountRule[];
}

interface AddressState {
  street: string;
  city: string;
  zip: string;
  province: string;
}

const EstimationForm: React.FC<Props> = ({ onSubmit, isLoading, modelsConfig, discountRules }) => {
  const [origin, setOrigin] = useState<AddressState>({ 
    street: 'Via Disciplina 11', 
    city: 'San Martino Buon Albergo', 
    zip: '37036', 
    province: 'VR' 
  });
  const [destination, setDestination] = useState<AddressState>({ street: '', city: '', zip: '', province: '' });
  
  const [useInternalTeam, setUseInternalTeam] = useState(true);
  const [internalTechs, setInternalTechs] = useState(2);
  const [useExternalTeam, setUseExternalTeam] = useState(false);
  const [externalTechs, setExternalTechs] = useState(1);

  // Dynamic Lists
  const [availableModels, setAvailableModels] = useState<PergolaModel[]>([]);
  const [availableBallasts, setAvailableBallasts] = useState<string[]>([]);
  
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedBallastId, setSelectedBallastId] = useState<string>('');

  const [parkingSpots, setParkingSpots] = useState<number>(2);
  
  // Installation Options
  const [includePV, setIncludePV] = useState<boolean>(false);
  const [includeGaskets, setIncludeGaskets] = useState<boolean>(false);
  const [includeFabric, setIncludeFabric] = useState<boolean>(false);
  const [includeInsulatedPanels, setIncludeInsulatedPanels] = useState<boolean>(false);
  const [includeBallast, setIncludeBallast] = useState<boolean>(false);

  const [hasForklift, setHasForklift] = useState<boolean>(false);
  const [returnOnWeekends, setReturnOnWeekends] = useState<boolean>(false);
  
  // Discount Logic
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // Reasoning Display
  const [showReasoning, setShowReasoning] = useState(false);
  const [reasoningText, setReasoningText] = useState("");
  const [calculatedWeight, setCalculatedWeight] = useState(0);

  const [formData, setFormData] = useState<Omit<EstimateInputs, 'origin' | 'destination' | 'destinationProvince' | 'selectedModelId' | 'parkingSpots' | 'includePV' | 'includeGaskets' | 'includeFabric' | 'includeInsulatedPanels' | 'includeBallast' | 'calculatedHours' | 'useInternalTeam' | 'internalTechs' | 'useExternalTeam' | 'externalTechs' | 'modelsConfig' | 'hasForklift' | 'returnOnWeekends' | 'marginPercent' | 'extraHourlyCost' | 'extraDailyCost' | 'discountPercent'>>({
    serviceType: ServiceType.FULL_INSTALLATION,
    transportMode: TransportMode.COMPANY_VEHICLE,
    startDate: new Date().toISOString().split('T')[0],
    durationDays: 1,
    additionalNotes: 'Necessarie stanze singole per alloggio tecnici.',
    internalHours: 0,
    externalHours: 0
  });

  // Load lists from config
  useEffect(() => {
    const list = getDynamicModelList(modelsConfig);
    const ballasts = getBallastList(modelsConfig);
    
    setAvailableModels(list);
    setAvailableBallasts(ballasts);

    // Default Model
    if (list.length > 0 && (!selectedModelId || !list.find(m => m.id === selectedModelId))) {
        if (list[0]) setSelectedModelId(list[0].id);
    }
    
    // Default Ballast
    if (ballasts.length > 0 && !selectedBallastId) {
        // Find 1600 standard
        const std = ballasts.find(b => b.includes('1600')) || ballasts[0];
        setSelectedBallastId(std);
    }
  }, [modelsConfig]);

  // Calculate Discount based on Parking Spots using Dynamic Rules from CSV
  useEffect(() => {
      let discount = 0;
      if (discountRules && discountRules.length > 0) {
          // discountRules are sorted descending. Find the first rule where parkingSpots > threshold.
          const rule = discountRules.find(r => parkingSpots > r.threshold);
          if (rule) {
              discount = rule.percentage;
          }
      }
      setDiscountPercent(discount);
  }, [parkingSpots, discountRules]);

  // Auto-Select Ballast based on Model
  useEffect(() => {
      if (!includeBallast || !selectedModelId || availableBallasts.length === 0) return;
      
      const normModel = normalize(selectedModelId);
      let bestBallast = selectedBallastId;

      if (normModel.includes('twin')) {
          // Look for Twin Drive Ballast (2800 or similar name)
          const twinBallast = availableBallasts.find(b => normalize(b).includes('twen') || normalize(b).includes('twin') || b.includes('2800'));
          if (twinBallast) bestBallast = twinBallast;
      } else {
          // Revert to Standard 1600 if switching away from Twin
          const stdBallast = availableBallasts.find(b => b.includes('1600') && !b.includes('TWIN') && !b.includes('TWEN'));
          if (stdBallast) bestBallast = stdBallast;
      }

      if (bestBallast !== selectedBallastId) {
          setSelectedBallastId(bestBallast);
      }
  }, [selectedModelId, includeBallast, availableBallasts]);

  const selectedModel = availableModels.find(m => m.id === selectedModelId);
  const ballastCount = includeBallast ? calculateBallastCount(parkingSpots) : 0;

  // -- MAIN CALCULATION EFFECT --
  const performCalculation = () => {
    // Only calculate automatically for Full Installation
    if (formData.serviceType !== ServiceType.FULL_INSTALLATION) return;

    // 1. Calculate base Total Hours from CSV
    const totalHours = calculateInstallationHours(
        selectedModelId, 
        parkingSpots, 
        includePV, 
        includeGaskets, 
        includeBallast, 
        selectedBallastId, 
        modelsConfig
    );
    
    // Calculate Weight Preview
    const weights = calculateTotalWeight(selectedModelId, parkingSpots, includeBallast, modelsConfig);
    setCalculatedWeight(weights.total);

    const activeInternal = useInternalTeam ? internalTechs : 0;
    const activeExternal = useExternalTeam ? externalTechs : 0;
    const totalTechs = activeInternal + activeExternal;
    const techs = totalTechs > 0 ? totalTechs : 1;
    
    // 2. Distribute Hours based on team size
    const internalShare = totalTechs > 0 ? (totalHours * (activeInternal / totalTechs)) : 0;
    const externalShare = totalTechs > 0 ? (totalHours * (activeExternal / totalTechs)) : 0;

    // 3. Calculate Days
    // Formula: Total Hours / (Techs * 8)
    const hoursPerDay = techs * 8; 
    const estimatedDaysRaw = totalHours / hoursPerDay;
    const estimatedDays = totalHours > 0 ? Math.max(0.5, Math.ceil(estimatedDaysRaw * 2) / 2) : 1;
    
    setFormData(prev => ({ 
        ...prev, 
        durationDays: estimatedDays,
        internalHours: parseFloat(internalShare.toFixed(2)),
        externalHours: parseFloat(externalShare.toFixed(2))
    }));

    // Prepare explanation text
    const reasoning = explainCalculation(
        selectedModelId, 
        parkingSpots, 
        includePV, 
        includeGaskets, 
        includeBallast, 
        selectedBallastId, 
        modelsConfig,
        totalTechs
    );
    setReasoningText(reasoning);
  };

  useEffect(() => {
    performCalculation();
  }, [selectedModelId, parkingSpots, includePV, includeGaskets, includeBallast, selectedBallastId, formData.serviceType, useInternalTeam, internalTechs, useExternalTeam, externalTechs, modelsConfig]);

  // -- HANDLERS FOR EDITABLE HOURS --
  const updateDaysFromHours = (totalH: number) => {
      const activeInternal = useInternalTeam ? internalTechs : 0;
      const activeExternal = useExternalTeam ? externalTechs : 0;
      const totalTechs = activeInternal + activeExternal;
      const techs = totalTechs > 0 ? totalTechs : 1;
      
      const hoursPerDay = techs * 8;
      const estimatedDaysRaw = totalH / hoursPerDay;
      const estimatedDays = totalH > 0 ? Math.max(0.5, Math.ceil(estimatedDaysRaw * 2) / 2) : 0.5;
      
      setFormData(prev => ({ ...prev, durationDays: estimatedDays }));
  };

  const handleTotalHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTotal = parseFloat(e.target.value) || 0;
      const activeInternal = useInternalTeam ? internalTechs : 0;
      const activeExternal = useExternalTeam ? externalTechs : 0;
      const totalTechs = activeInternal + activeExternal;
      
      // Redistribute
      const internalShare = totalTechs > 0 ? (newTotal * (activeInternal / totalTechs)) : 0;
      const externalShare = totalTechs > 0 ? (newTotal * (activeExternal / totalTechs)) : 0;

      setFormData(prev => ({
          ...prev,
          internalHours: parseFloat(internalShare.toFixed(2)),
          externalHours: parseFloat(externalShare.toFixed(2))
      }));
      updateDaysFromHours(newTotal);
  };

  const handleInternalHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newInternal = parseFloat(e.target.value) || 0;
      const currentExternal = formData.externalHours || 0;
      const newTotal = newInternal + currentExternal;
      
      setFormData(prev => ({ ...prev, internalHours: newInternal }));
      updateDaysFromHours(newTotal);
  };

  const handleExternalHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newExternal = parseFloat(e.target.value) || 0;
      const currentInternal = formData.internalHours || 0;
      const newTotal = newExternal + currentInternal;
      
      setFormData(prev => ({ ...prev, externalHours: newExternal }));
      updateDaysFromHours(newTotal);
  };

  const handleAddressChange = (type: 'origin' | 'destination', field: keyof AddressState, value: string) => {
    // For province, force UPPERCASE
    const cleanValue = field === 'province' ? value.toUpperCase() : value;
    
    if (type === 'origin') setOrigin(prev => ({ ...prev, [field]: cleanValue }));
    else setDestination(prev => ({ ...prev, [field]: cleanValue }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'durationDays' ? Number(value) : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!useInternalTeam && !useExternalTeam) {
        alert("Seleziona almeno una squadra.");
        return;
    }
    const originStr = `${origin.street}, ${origin.zip} ${origin.city} ${origin.province}`;
    const destStr = `${destination.street}, ${destination.zip} ${destination.city} ${destination.province}`;

    onSubmit({
      ...formData,
      origin: originStr.trim(),
      destination: destStr.trim(),
      destinationProvince: destination.province.toUpperCase().trim(),
      useInternalTeam,
      internalTechs,
      useExternalTeam,
      externalTechs,
      selectedModelId,
      parkingSpots,
      includePV,
      includeGaskets,
      includeFabric,
      includeInsulatedPanels,
      includeBallast,
      calculatedHours: (formData.internalHours || 0) + (formData.externalHours || 0),
      hasForklift,
      returnOnWeekends,
      modelsConfig,
      marginPercent: 0,
      extraHourlyCost: 0,
      extraDailyCost: 0,
      discountPercent
    });
  };

  const totalDisplayedHours = (formData.internalHours || 0) + (formData.externalHours || 0);

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Configuratore OptiCost</h2>
        {!modelsConfig && (
            <div className="mt-2 text-xs text-orange-600 bg-orange-50 p-2 rounded border border-orange-100 flex items-center gap-2">
                <LayoutGrid className="w-3 h-3 animate-pulse" />
                <span>Caricamento modelli in corso...</span>
            </div>
        )}
      </div>

      <div className="space-y-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
        <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-1">
                <Building2 className="w-4 h-4 text-blue-600" /> Origine (HQ)
            </label>
            <div className="grid grid-cols-1 gap-3">
                <input type="text" value={origin.street} onChange={(e) => handleAddressChange('origin', 'street', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" />
                <div className="grid grid-cols-6 gap-3">
                     <input type="text" value={origin.zip} onChange={(e) => handleAddressChange('origin', 'zip', e.target.value)} className="col-span-2 p-2.5 border border-slate-300 rounded-lg text-sm" />
                     <input type="text" value={origin.city} onChange={(e) => handleAddressChange('origin', 'city', e.target.value)} className="col-span-3 p-2.5 border border-slate-300 rounded-lg text-sm" />
                     <input type="text" value={origin.province} onChange={(e) => handleAddressChange('origin', 'province', e.target.value)} className="col-span-1 p-2.5 border border-slate-300 rounded-lg text-sm uppercase" maxLength={2} />
                </div>
            </div>
        </div>

        <div className="space-y-3 pt-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-1">
                <MapPin className="w-4 h-4 text-red-600" /> Destinazione
            </label>
             <div className="grid grid-cols-1 gap-3">
                <input type="text" placeholder="Via / Piazza" value={destination.street} onChange={(e) => handleAddressChange('destination', 'street', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" required />
                <div className="grid grid-cols-6 gap-3">
                     <input type="text" placeholder="CAP" value={destination.zip} onChange={(e) => handleAddressChange('destination', 'zip', e.target.value)} className="col-span-2 p-2.5 border border-slate-300 rounded-lg text-sm" required />
                     <input type="text" placeholder="Città" value={destination.city} onChange={(e) => handleAddressChange('destination', 'city', e.target.value)} className="col-span-3 p-2.5 border border-slate-300 rounded-lg text-sm" required />
                     <input type="text" placeholder="Prov" value={destination.province} onChange={(e) => handleAddressChange('destination', 'province', e.target.value)} className="col-span-1 p-2.5 border border-slate-300 rounded-lg text-sm uppercase bg-yellow-50" maxLength={2} required />
                </div>
                 
                 <div className="flex items-center justify-between p-3 bg-slate-100 rounded-lg border border-slate-200 mt-2">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2 cursor-pointer" onClick={() => setHasForklift(!hasForklift)}>
                        <BoxSelect className="w-5 h-5 text-slate-500"/>
                        <span>Disponibilità Muletto/Mezzo di Scarico in cantiere?</span>
                    </label>
                    <button type="button" role="switch" aria-checked={hasForklift} onClick={() => setHasForklift(!hasForklift)} className={`${hasForklift ? 'bg-blue-600' : 'bg-slate-300'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}>
                        <span className={`${hasForklift ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}/>
                    </button>
                </div>

                <div className="space-y-2 mt-2">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-600" /> Data Inizio Lavori
                    </label>
                    <input
                        type="date"
                        name="startDate"
                        value={formData.startDate}
                        onChange={handleChange}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                        required
                    />
                </div>
            </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Tipo di Servizio</label>
                <select name="serviceType" value={formData.serviceType} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                    <option value={ServiceType.FULL_INSTALLATION}>{ServiceType.FULL_INSTALLATION}</option>
                    <option value={ServiceType.SUPPORT}>{ServiceType.SUPPORT}</option>
                </select>
            </div>
            
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Modalità Trasferta
                </label>
                <select name="transportMode" value={formData.transportMode} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                    <option value={TransportMode.COMPANY_VEHICLE}>{TransportMode.COMPANY_VEHICLE}</option>
                    <option value={TransportMode.PUBLIC_TRANSPORT}>{TransportMode.PUBLIC_TRANSPORT}</option>
                </select>
            </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-1 mb-1 flex items-center gap-2">
                <Users className="w-4 h-4" /> Composizione Squadre
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-3 rounded-md border ${useInternalTeam ? 'bg-white border-blue-200' : 'bg-slate-100 border-slate-200 opacity-70'}`}>
                     <div className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={useInternalTeam} onChange={(e) => setUseInternalTeam(e.target.checked)} className="w-4 h-4" />
                        <label className="font-semibold text-sm text-slate-800">Squadra Interna</label>
                     </div>
                     <input type="number" min="1" value={internalTechs} onChange={(e) => setInternalTechs(parseInt(e.target.value) || 0)} disabled={!useInternalTeam} className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div className={`p-3 rounded-md border ${useExternalTeam ? 'bg-white border-blue-200' : 'bg-slate-100 border-slate-200 opacity-70'}`}>
                     <div className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={useExternalTeam} onChange={(e) => setUseExternalTeam(e.target.checked)} className="w-4 h-4" />
                        <label className="font-semibold text-sm text-slate-800">Squadra Esterna</label>
                     </div>
                     <input type="number" min="1" value={externalTechs} onChange={(e) => setExternalTechs(parseInt(e.target.value) || 0)} disabled={!useExternalTeam} className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
            </div>
        </div>

        {formData.serviceType === ServiceType.FULL_INSTALLATION && (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 text-sm font-bold text-slate-700 border-b border-slate-200 pb-1 mb-1 flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" /> Specifiche Tecniche Prodotto
            </div>
            
            <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Modello Struttura</label>
                <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm">
                    {availableModels.length === 0 && <option value="">Caricamento...</option>}
                    {availableModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
                <div className="text-[10px] text-slate-400 font-mono">
                    ID: {selectedModelId}
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Posti Auto</label>
                <input type="number" min="1" max="1000" value={parkingSpots} onChange={(e) => setParkingSpots(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded text-sm" />
            </div>

            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <label className={`flex items-center gap-2 p-2 rounded border ${selectedModel?.allowsPV ? 'bg-white border-slate-200' : 'bg-slate-100 opacity-50'}`}>
                    <input type="checkbox" checked={includePV} onChange={(e) => setIncludePV(e.target.checked)} disabled={!selectedModel?.allowsPV} className="w-4 h-4" />
                    <span className="text-sm">Inst. PF (Pannelli Fotovoltaici)</span>
                </label>
                <label className={`flex items-center gap-2 p-2 rounded border ${selectedModel?.allowsGaskets ? 'bg-white border-slate-200' : 'bg-slate-100 opacity-50'}`}>
                    <input type="checkbox" checked={includeGaskets} onChange={(e) => setIncludeGaskets(e.target.checked)} disabled={!selectedModel?.allowsGaskets} className="w-4 h-4" />
                    <span className="text-sm">Inst. Guarnizioni</span>
                </label>
                {/* New Options */}
                <label className="flex items-center gap-2 p-2 rounded border bg-white border-slate-200">
                    <input type="checkbox" checked={includeFabric} onChange={(e) => setIncludeFabric(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm">Inst. Telo</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded border bg-white border-slate-200">
                    <input type="checkbox" checked={includeInsulatedPanels} onChange={(e) => setIncludeInsulatedPanels(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm">Inst. Pannelli Coibentati</span>
                </label>
            </div>

            <div className="md:col-span-2 space-y-2 bg-white p-3 rounded border border-slate-200 mt-2">
                <div className="flex items-center justify-between mb-2">
                     <label className="flex items-center gap-2">
                        <input type="checkbox" checked={includeBallast} onChange={(e) => setIncludeBallast(e.target.checked)} className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-slate-700">Inst. Zavorre</span>
                     </label>
                     {includeBallast && (
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">
                            Qtà: {ballastCount}
                        </span>
                     )}
                </div>
                {includeBallast && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <select value={selectedBallastId} onChange={(e) => setSelectedBallastId(e.target.value)} className="w-full p-2 border border-slate-300 rounded text-sm bg-slate-50">
                            {availableBallasts.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <Weight className="w-3 h-3" /> Zavorre stimate: ~{ballastCount * 800} kg
                        </p>
                    </div>
                )}
            </div>

            {/* WEIGHT DISPLAY (NEW) */}
            <div className="md:col-span-2 bg-slate-100 p-2 rounded border border-slate-200 flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                    <Weight className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase">Peso Totale Stimato:</span>
                </div>
                <span className="text-sm font-bold text-slate-900 font-mono">
                    {calculatedWeight.toLocaleString()} kg
                </span>
            </div>

             <div className="md:col-span-2 p-3 bg-blue-50 border border-blue-100 rounded-lg mt-2">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-blue-600 uppercase font-bold tracking-wider">Stima Tempi & Manodopera</p>
                    <button 
                        type="button" 
                        onClick={() => setShowReasoning(!showReasoning)}
                        className="text-xs text-blue-700 flex items-center gap-1 hover:underline"
                    >
                        <HelpCircle className="w-3 h-3" />
                        Come è stato calcolato?
                    </button>
                </div>
                
                <div className="flex items-center gap-3">
                     <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            name="durationDays"
                            value={formData.durationDays}
                            onChange={handleChange}
                            step="0.5"
                            min="0.5"
                            className="text-2xl font-bold text-blue-900 w-24 p-1 bg-white border border-blue-200 rounded text-center focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                        <span className="text-sm text-blue-700 font-medium">Giorni Lavorativi</span>
                     </div>
                     <div className="h-10 w-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 ml-auto">
                        <Clock className="w-5 h-5" />
                    </div>
                </div>

                {/* Editable Hours Breakdown */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-blue-100">
                    <div className="text-center">
                        <p className="text-[10px] text-blue-600 uppercase font-bold flex items-center justify-center gap-1"><Timer className="w-3 h-3"/> Totale</p>
                        <div className="flex items-center justify-center">
                            <input 
                                type="number" 
                                value={totalDisplayedHours.toFixed(2)}
                                onChange={handleTotalHoursChange}
                                step="0.5"
                                className="w-20 p-1 text-center text-sm font-bold text-blue-900 bg-white border border-blue-200 rounded focus:ring-1 focus:ring-blue-400 outline-none"
                            />
                            <span className="text-xs text-blue-800 ml-1">h</span>
                        </div>
                    </div>
                    <div className={`text-center rounded p-1 ${useInternalTeam ? 'bg-white/60' : 'opacity-40'}`}>
                        <p className="text-[10px] text-slate-500 uppercase">Interne</p>
                        <div className="flex items-center justify-center">
                             <input 
                                type="number"
                                value={formData.internalHours || 0}
                                onChange={handleInternalHoursChange}
                                disabled={!useInternalTeam}
                                className="w-16 p-1 text-center text-sm font-semibold text-slate-700 bg-transparent border-b border-slate-300 focus:border-blue-500 focus:outline-none disabled:text-slate-400"
                            />
                            <span className="text-xs text-slate-600 ml-1">h</span>
                        </div>
                    </div>
                    <div className={`text-center rounded p-1 ${useExternalTeam ? 'bg-white/60' : 'opacity-40'}`}>
                        <p className="text-[10px] text-slate-500 uppercase">Esterne</p>
                        <div className="flex items-center justify-center">
                             <input 
                                type="number"
                                value={formData.externalHours || 0}
                                onChange={handleExternalHoursChange}
                                disabled={!useExternalTeam}
                                className="w-16 p-1 text-center text-sm font-semibold text-slate-700 bg-transparent border-b border-slate-300 focus:border-blue-500 focus:outline-none disabled:text-slate-400"
                            />
                            <span className="text-xs text-slate-600 ml-1">h</span>
                        </div>
                    </div>
                </div>

                {showReasoning && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-slate-700 font-mono whitespace-pre-wrap animate-in fade-in slide-in-from-top-2">
                        {reasoningText}
                    </div>
                )}
            </div>
            
             {/* Rientro Weekend Logic */}
             {(formData.durationDays > 5 || new Date(formData.startDate).getDay() === 5) && (
                 <div className="md:col-span-2 p-3 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-3">
                    <input 
                        type="checkbox" 
                        checked={returnOnWeekends} 
                        onChange={(e) => setReturnOnWeekends(e.target.checked)}
                        className="w-5 h-5 text-orange-600"
                    />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-orange-800">Rientro nel Weekend?</p>
                        <p className="text-xs text-orange-700">Se selezionato, il preventivo includerà viaggi A/R extra per i weekend intermedi.</p>
                    </div>
                 </div>
             )}

             {/* Discount Feedback */}
             {discountPercent > 0 && (
                 <div className="md:col-span-2 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 animate-pulse">
                     <Percent className="w-5 h-5 text-green-600" />
                     <div>
                         <p className="text-sm font-bold text-green-800">Sconto Volume Attivo!</p>
                         <p className="text-xs text-green-700">Rilevati {parkingSpots} posti auto. Applicato sconto automatico del {discountPercent}% sul totale.</p>
                     </div>
                 </div>
             )}
             
            <div className="md:col-span-2 space-y-2 bg-white p-3 rounded border border-slate-200">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                   <FileText className="w-4 h-4" /> Note Aggiuntive per il Preventivo
                </label>
                <textarea
                    name="additionalNotes"
                    value={formData.additionalNotes}
                    onChange={handleChange}
                    rows={3}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    placeholder="Es. Orari di cantiere, restrizioni accesso, necessità particolari..."
                />
            </div>
        </div>
        )}

        {/* Manual Duration Input for Support Mode */}
        {formData.serviceType === ServiceType.SUPPORT && (
             <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-1 flex items-center gap-2">
                    <UserCog className="w-4 h-4" /> Dettagli Intervento a Consuntivo
                </div>
                
                <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">Giorni Lavorativi Stimati</label>
                     <div className="flex items-center gap-3">
                         <input 
                            type="number" 
                            min="0.5" 
                            step="0.5" 
                            name="durationDays"
                            value={formData.durationDays} 
                            onChange={handleChange} 
                            className="w-32 p-2 border border-slate-300 rounded text-sm font-bold text-center" 
                         />
                         <span className="text-sm text-slate-500">Giorni (Inserimento Manuale)</span>
                     </div>
                     <p className="text-xs text-slate-400">Inserisci la durata prevista dell'intervento. I costi di viaggio verranno calcolati su questa base.</p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Note Intervento / Descrizione Attività</label>
                    <textarea
                        name="additionalNotes"
                        value={formData.additionalNotes}
                        onChange={handleChange}
                        rows={4}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        placeholder="Descrivi cosa deve fare la squadra (es. 'Sola posa vetrate', 'Assistenza montaggio', 'Manutenzione')..."
                    />
                </div>
             </div>
        )}

        {/* Submit Button */}
        <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
            {isLoading ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Calcolo in corso...
                </>
            ) : (
                <>
                    <Calculator className="w-5 h-5" />
                    Genera Preventivo
                </>
            )}
        </button>
      </div>
    </form>
  );
};

export default EstimationForm;
