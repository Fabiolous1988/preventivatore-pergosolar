
import React, { useState, useEffect } from 'react';
import { EstimateInputs, ServiceType, TransportMode, ModelsConfig, LogisticsConfig } from '../types';
import { PERGOLA_MODELS, calculateInstallationHours, calculateBallastCount } from '../services/calculator';
import { Loader2, MapPin, Calendar, Truck, UserCog, Percent, Building2, PlusCircle, LayoutGrid, CarFront, ArrowDownCircle, Users, CheckSquare, Weight, BoxSelect, RefreshCw } from 'lucide-react';

interface Props {
  onSubmit: (data: EstimateInputs) => void;
  isLoading: boolean;
  modelsConfig: ModelsConfig | null;
}

interface AddressState {
  street: string;
  city: string;
  zip: string;
  province: string;
}

const EstimationForm: React.FC<Props> = ({ onSubmit, isLoading, modelsConfig }) => {
  const [origin, setOrigin] = useState<AddressState>({ 
    street: 'Via Disciplina 11', 
    city: 'San Martino Buon Albergo', 
    zip: '37036', 
    province: 'VR' 
  });
  const [destination, setDestination] = useState<AddressState>({ street: '', city: '', zip: '', province: '' });
  const [excludeOriginTransfer, setExcludeOriginTransfer] = useState(true);

  // Team Composition State
  const [useInternalTeam, setUseInternalTeam] = useState(true);
  const [internalTechs, setInternalTechs] = useState(2);
  const [useExternalTeam, setUseExternalTeam] = useState(false);
  const [externalTechs, setExternalTechs] = useState(1);

  // Installation Module State
  const [selectedModelId, setSelectedModelId] = useState<string>('solarflex');
  const [parkingSpots, setParkingSpots] = useState<number>(2);
  const [includePV, setIncludePV] = useState<boolean>(false);
  const [includeGaskets, setIncludeGaskets] = useState<boolean>(false);
  const [includeBallast, setIncludeBallast] = useState<boolean>(false);
  const [calculatedHours, setCalculatedHours] = useState<number>(0);
  const [hasForklift, setHasForklift] = useState<boolean>(false);
  const [returnOnWeekends, setReturnOnWeekends] = useState<boolean>(false);

  const [formData, setFormData] = useState<Omit<EstimateInputs, 'origin' | 'destination' | 'excludeOriginTransfer' | 'selectedModelId' | 'parkingSpots' | 'includePV' | 'includeGaskets' | 'includeBallast' | 'calculatedHours' | 'useInternalTeam' | 'internalTechs' | 'useExternalTeam' | 'externalTechs' | 'modelsConfig' | 'hasForklift' | 'returnOnWeekends'>>({
    serviceType: ServiceType.FULL_INSTALLATION,
    transportMode: TransportMode.COMPANY_VEHICLE,
    startDate: new Date().toISOString().split('T')[0],
    durationDays: 1,
    marginPercent: 30,
    additionalNotes: '',
    extraHourlyCost: 0,
    extraDailyCost: 0
  });

  const selectedModel = PERGOLA_MODELS.find(m => m.id === selectedModelId);
  const ballastCount = includeBallast ? calculateBallastCount(parkingSpots) : 0;

  useEffect(() => {
    const hours = calculateInstallationHours(selectedModelId, parkingSpots, includePV, includeGaskets, includeBallast, modelsConfig);
    setCalculatedHours(hours);
    
    if (formData.serviceType === ServiceType.FULL_INSTALLATION) {
        const activeTechs = (useInternalTeam ? internalTechs : 0) + (useExternalTeam ? externalTechs : 0);
        const techs = activeTechs > 0 ? activeTechs : 1;
        const estimatedDays = Math.max(1, Math.ceil(hours / techs / 9 * 2) / 2);
        setFormData(prev => ({ ...prev, durationDays: estimatedDays }));
    }
  }, [selectedModelId, parkingSpots, includePV, includeGaskets, includeBallast, formData.serviceType, useInternalTeam, internalTechs, useExternalTeam, externalTechs, modelsConfig]);

  const applyCalculatedDays = () => {
      const activeTechs = (useInternalTeam ? internalTechs : 0) + (useExternalTeam ? externalTechs : 0);
      const techs = activeTechs > 0 ? activeTechs : 1;
      const estimatedDays = Math.max(1, Math.ceil(calculatedHours / techs / 9 * 2) / 2);
      setFormData(prev => ({ ...prev, durationDays: estimatedDays }));
  };

  const handleAddressChange = (
    type: 'origin' | 'destination',
    field: keyof AddressState,
    value: string
  ) => {
    if (type === 'origin') {
      setOrigin(prev => ({ ...prev, [field]: value }));
    } else {
      setDestination(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['durationDays', 'marginPercent', 'extraHourlyCost', 'extraDailyCost'].includes(name) ? Number(value) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!useInternalTeam && !useExternalTeam) {
        alert("Seleziona almeno una squadra (Interna o Esterna).");
        return;
    }
    if (useInternalTeam && internalTechs <= 0) {
        alert("Il numero di tecnici interni deve essere > 0");
        return;
    }
    if (useExternalTeam && externalTechs <= 0) {
        alert("Il numero di tecnici esterni deve essere > 0");
        return;
    }

    const originStr = `${origin.street}, ${origin.zip} ${origin.city} ${origin.province}`;
    const destStr = `${destination.street}, ${destination.zip} ${destination.city} ${destination.province}`;

    onSubmit({
      ...formData,
      origin: originStr.trim(),
      destination: destStr.trim(),
      excludeOriginTransfer,
      useInternalTeam,
      internalTechs,
      useExternalTeam,
      externalTechs,
      selectedModelId,
      parkingSpots,
      includePV,
      includeGaskets,
      includeBallast,
      calculatedHours,
      hasForklift,
      returnOnWeekends,
      modelsConfig
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Configuratore OptiCost</h2>
        <p className="text-sm text-slate-500">Definisci modello, squadre e logistica.</p>
        {!modelsConfig && (
            <div className="mt-2 text-xs text-orange-600 bg-orange-50 p-2 rounded border border-orange-100 flex items-center gap-2">
                <LayoutGrid className="w-3 h-3" />
                <span>Nessuna configurazione modelli caricata. Verranno usati valori standard.</span>
            </div>
        )}
      </div>

      <div className="space-y-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
        <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-1">
                <Building2 className="w-4 h-4 text-blue-600" /> Origine (HQ)
            </label>
            <div className="grid grid-cols-1 gap-3">
                <input
                    type="text"
                    value={origin.street}
                    onChange={(e) => handleAddressChange('origin', 'street', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                />
                <div className="grid grid-cols-6 gap-3">
                     <input
                        type="text"
                        value={origin.zip}
                        onChange={(e) => handleAddressChange('origin', 'zip', e.target.value)}
                        className="col-span-2 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    />
                    <input
                        type="text"
                        value={origin.city}
                        onChange={(e) => handleAddressChange('origin', 'city', e.target.value)}
                        className="col-span-3 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    />
                    <input
                        type="text"
                        value={origin.province}
                        onChange={(e) => handleAddressChange('origin', 'province', e.target.value)}
                        className="col-span-1 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm uppercase"
                        maxLength={2}
                    />
                </div>
                <div className="flex items-start gap-3 mt-1 p-2 bg-blue-50/50 rounded-md border border-blue-100">
                    <div className="flex items-center h-5">
                        <input
                            id="excludeTransfer"
                            type="checkbox"
                            checked={excludeOriginTransfer}
                            onChange={(e) => setExcludeOriginTransfer(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                    </div>
                    <label htmlFor="excludeTransfer" className="text-xs text-slate-600 cursor-pointer">
                        <span className="font-semibold text-slate-700 block">Escludi trasporto iniziale (Last-Mile HQ)</span>
                        I tecnici vengono accompagnati in stazione/aeroporto con mezzi propri.
                    </label>
                </div>
            </div>
        </div>

        <div className="space-y-3 pt-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-1">
                <MapPin className="w-4 h-4 text-red-600" /> Destinazione (Cantiere)
            </label>
             <div className="grid grid-cols-1 gap-3">
                <input
                    type="text"
                    placeholder="Via / Piazza e Numero Civico"
                    value={destination.street}
                    onChange={(e) => handleAddressChange('destination', 'street', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    required
                />
                <div className="grid grid-cols-6 gap-3">
                     <input
                        type="text"
                        placeholder="CAP"
                        value={destination.zip}
                        onChange={(e) => handleAddressChange('destination', 'zip', e.target.value)}
                        className="col-span-2 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Città"
                        value={destination.city}
                        onChange={(e) => handleAddressChange('destination', 'city', e.target.value)}
                        className="col-span-3 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Prov"
                        value={destination.province}
                        onChange={(e) => handleAddressChange('destination', 'province', e.target.value)}
                        className="col-span-1 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm uppercase"
                        maxLength={2}
                        required
                    />
                </div>
                 <div className="flex items-start gap-3 mt-1 p-2 bg-slate-100 rounded-md border border-slate-200">
                    <div className="flex items-center h-5">
                        <input
                            id="hasForklift"
                            type="checkbox"
                            checked={hasForklift}
                            onChange={(e) => setHasForklift(e.target.checked)}
                            className="w-4 h-4 text-slate-600 border-slate-300 rounded focus:ring-slate-500"
                        />
                    </div>
                    <label htmlFor="hasForklift" className="text-xs text-slate-600 cursor-pointer flex items-center gap-1">
                        <BoxSelect className="w-4 h-4 text-slate-500"/>
                        <span className="font-semibold text-slate-700">Disponibilità Muletto/Mezzo di Scarico in cantiere?</span>
                    </label>
                </div>
            </div>
        </div>
      </div>

      <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <UserCog className="w-4 h-4" /> Tipo di Servizio
            </label>
            <select
                name="serviceType"
                value={formData.serviceType}
                onChange={handleChange}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
                <option value={ServiceType.FULL_INSTALLATION}>{ServiceType.FULL_INSTALLATION}</option>
                <option value={ServiceType.SUPPORT}>{ServiceType.SUPPORT}</option>
            </select>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-1 mb-1 flex items-center gap-2">
                <Users className="w-4 h-4" /> Composizione Squadre
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-3 rounded-md border transition-colors ${useInternalTeam ? 'bg-white border-blue-200 shadow-sm' : 'bg-slate-100 border-slate-200 opacity-70'}`}>
                     <div className="flex items-center gap-2 mb-2">
                        <input 
                            type="checkbox" 
                            id="useInternal" 
                            checked={useInternalTeam} 
                            onChange={(e) => setUseInternalTeam(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="useInternal" className="font-semibold text-sm text-slate-800 cursor-pointer">Squadra Interna</label>
                     </div>
                     <div className="pl-6">
                        <label className="text-xs text-slate-500 block mb-1">Numero Tecnici</label>
                        <input 
                            type="number" 
                            min="1" 
                            value={internalTechs} 
                            onChange={(e) => setInternalTechs(parseInt(e.target.value) || 0)}
                            disabled={!useInternalTeam}
                            className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100"
                        />
                     </div>
                </div>

                <div className={`p-3 rounded-md border transition-colors ${useExternalTeam ? 'bg-white border-blue-200 shadow-sm' : 'bg-slate-100 border-slate-200 opacity-70'}`}>
                     <div className="flex items-center gap-2 mb-2">
                        <input 
                            type="checkbox" 
                            id="useExternal" 
                            checked={useExternalTeam} 
                            onChange={(e) => setUseExternalTeam(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="useExternal" className="font-semibold text-sm text-slate-800 cursor-pointer">Squadra Esterna</label>
                     </div>
                     <div className="pl-6">
                        <label className="text-xs text-slate-500 block mb-1">Numero Tecnici</label>
                        <input 
                            type="number" 
                            min="1" 
                            value={externalTechs} 
                            onChange={(e) => setExternalTechs(parseInt(e.target.value) || 0)}
                            disabled={!useExternalTeam}
                            className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100"
                        />
                     </div>
                </div>
            </div>
            <div className="text-xs text-right text-slate-500 mt-2">
                Totale Tecnici: <span className="font-bold text-slate-800">{(useInternalTeam ? internalTechs : 0) + (useExternalTeam ? externalTechs : 0)}</span>
            </div>
        </div>

        {formData.serviceType === ServiceType.FULL_INSTALLATION && (
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
                <div className="md:col-span-2 text-sm font-bold text-slate-700 border-b border-slate-200 pb-1 mb-1 flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" /> Specifiche Tecniche Prodotto
                </div>
                
                <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Modello Struttura</label>
                    <select
                        value={selectedModelId}
                        onChange={(e) => setSelectedModelId(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    >
                        {PERGOLA_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.category})</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <CarFront className="w-3 h-3" /> Posti Auto
                    </label>
                    <input
                        type="number"
                        min="1"
                        max="100"
                        value={parkingSpots}
                        onChange={(e) => setParkingSpots(Number(e.target.value))}
                        className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    />
                </div>

                <div className="md:col-span-2 grid grid-cols-2 gap-3 mt-2">
                    <label className={`flex items-center gap-2 p-2 rounded border ${selectedModel?.allowsPV ? 'bg-white border-slate-200 cursor-pointer' : 'bg-slate-100 border-slate-100 opacity-50 cursor-not-allowed'}`}>
                        <input
                            type="checkbox"
                            checked={includePV}
                            onChange={(e) => setIncludePV(e.target.checked)}
                            disabled={!selectedModel?.allowsPV}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm">Includi Fotovoltaico</span>
                    </label>

                    <label className={`flex items-center gap-2 p-2 rounded border ${selectedModel?.allowsGaskets ? 'bg-white border-slate-200 cursor-pointer' : 'bg-slate-100 border-slate-100 opacity-50 cursor-not-allowed'}`}>
                        <input
                            type="checkbox"
                            checked={includeGaskets}
                            onChange={(e) => setIncludeGaskets(e.target.checked)}
                            disabled={!selectedModel?.allowsGaskets}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm">Includi Guarnizioni</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded border bg-white border-slate-200 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeBallast}
                            onChange={(e) => setIncludeBallast(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div className="flex flex-col">
                            <span className="text-sm flex items-center gap-1"><Weight className="w-3 h-3"/> Zavorre</span>
                            {includeBallast && (
                                <span className="text-xs text-blue-600 font-bold">Qtà calcolata: {ballastCount} ({(ballastCount * 1600)}kg)</span>
                            )}
                        </div>
                    </label>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Modalità Trasporto
                </label>
                <select
                    name="transportMode"
                    value={formData.transportMode}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                    {Object.values(TransportMode).map(mode => (
                        <option key={mode} value={mode}>{mode}</option>
                    ))}
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Data Inizio
                </label>
                <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                />
            </div>
        </div>

        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Giorni di Lavoro (Stimati)
            </label>
            <div className="flex gap-2">
                <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    name="durationDays"
                    value={formData.durationDays}
                    onChange={handleChange}
                    disabled={formData.serviceType === ServiceType.FULL_INSTALLATION}
                    className={`flex-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none ${formData.serviceType === ServiceType.FULL_INSTALLATION ? 'bg-slate-100 text-slate-500' : ''}`}
                    required
                />
                {formData.serviceType !== ServiceType.FULL_INSTALLATION && (
                    <button
                        type="button"
                        onClick={applyCalculatedDays}
                        className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap flex items-center gap-1"
                        title="Usa la stima calcolata in background"
                    >
                        <ArrowDownCircle className="w-4 h-4" />
                        Applica calcolo
                    </button>
                )}
            </div>
            
            {/* Weekend Return Checkbox - Only for Full Installation */}
            {formData.serviceType === ServiceType.FULL_INSTALLATION && (
                 <div className="flex items-start gap-3 mt-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                    <div className="flex items-center h-5">
                        <input
                            id="returnOnWeekends"
                            type="checkbox"
                            checked={returnOnWeekends}
                            onChange={(e) => setReturnOnWeekends(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                    </div>
                    <label htmlFor="returnOnWeekends" className="text-xs text-slate-600 cursor-pointer flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 text-slate-500"/>
                        <span className="font-semibold text-slate-700">Rientro nel Weekend?</span>
                        <span className="text-slate-400 font-normal ml-1">(Se cantiere lungo, calcola viaggio A/R extra)</span>
                    </label>
                </div>
            )}

            <p className="text-xs text-slate-500 mt-1">
              {formData.serviceType === ServiceType.FULL_INSTALLATION 
                ? "Calcolato automaticamente in base alle specifiche." 
                : "Inserisci manualmente o applica la stima basata sul modello selezionato."}
            </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-200 pt-4">
             <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <Percent className="w-3 h-3" /> Margine (%)
                </label>
                <input
                    type="number"
                    name="marginPercent"
                    value={formData.marginPercent}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                />
             </div>
             <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <PlusCircle className="w-3 h-3" /> Extra/Ora
                </label>
                <input
                    type="number"
                    name="extraHourlyCost"
                    value={formData.extraHourlyCost}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                />
             </div>
             <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <PlusCircle className="w-3 h-3" /> Extra/Giorno
                </label>
                <input
                    type="number"
                    name="extraDailyCost"
                    value={formData.extraDailyCost}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                />
             </div>
        </div>

        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Note Aggiuntive</label>
            <textarea
                name="additionalNotes"
                value={formData.additionalNotes}
                onChange={handleChange}
                rows={3}
                placeholder="E.g. Accesso cantiere difficile, orari limitati..."
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            />
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-end">
        <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckSquare className="w-5 h-5" />}
            {isLoading ? 'Calcolo in corso...' : 'Calcola Preventivo'}
        </button>
      </div>
    </form>
  );
};

export default EstimationForm;
