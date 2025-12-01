
import React, { useState, useEffect } from 'react';
import { EstimateInputs, ServiceType, TransportMode, ModelsConfig, LogisticsConfig } from '../types';
import { PERGOLA_MODELS, calculateInstallationHours, calculateBallastCount } from '../services/calculator';
import { Loader2, MapPin, Calendar, Truck, UserCog, Building2, LayoutGrid, CarFront, ArrowDownCircle, Users, CheckSquare, Weight, BoxSelect, RefreshCw, Calculator, Bug, Eye } from 'lucide-react';

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

  const [useInternalTeam, setUseInternalTeam] = useState(true);
  const [internalTechs, setInternalTechs] = useState(2);
  const [useExternalTeam, setUseExternalTeam] = useState(false);
  const [externalTechs, setExternalTechs] = useState(1);

  const [selectedModelId, setSelectedModelId] = useState<string>('solarflex');
  const [parkingSpots, setParkingSpots] = useState<number>(2);
  const [includePV, setIncludePV] = useState<boolean>(false);
  const [includeGaskets, setIncludeGaskets] = useState<boolean>(false);
  const [includeBallast, setIncludeBallast] = useState<boolean>(false);
  const [calculatedHours, setCalculatedHours] = useState<number>(0);
  const [hasForklift, setHasForklift] = useState<boolean>(false);
  const [returnOnWeekends, setReturnOnWeekends] = useState<boolean>(false);

  const [formData, setFormData] = useState<Omit<EstimateInputs, 'origin' | 'destination' | 'excludeOriginTransfer' | 'selectedModelId' | 'parkingSpots' | 'includePV' | 'includeGaskets' | 'includeBallast' | 'calculatedHours' | 'useInternalTeam' | 'internalTechs' | 'useExternalTeam' | 'externalTechs' | 'modelsConfig' | 'hasForklift' | 'returnOnWeekends' | 'marginPercent' | 'extraHourlyCost' | 'extraDailyCost'>>({
    serviceType: ServiceType.FULL_INSTALLATION,
    transportMode: TransportMode.COMPANY_VEHICLE,
    startDate: new Date().toISOString().split('T')[0],
    durationDays: 1,
    additionalNotes: 'Necessarie stanze singole per alloggio tecnici.',
  });

  const selectedModel = PERGOLA_MODELS.find(m => m.id === selectedModelId);
  const ballastCount = includeBallast ? calculateBallastCount(parkingSpots) : 0;

  const performCalculation = () => {
    const hours = calculateInstallationHours(selectedModelId, parkingSpots, includePV, includeGaskets, includeBallast, modelsConfig);
    setCalculatedHours(hours);
    
    const activeTechs = (useInternalTeam ? internalTechs : 0) + (useExternalTeam ? externalTechs : 0);
    const techs = activeTechs > 0 ? activeTechs : 1;
    const estimatedDays = hours > 0 ? Math.max(0.5, Math.ceil(hours / techs / 9 * 2) / 2) : 1;
    
    setFormData(prev => ({ ...prev, durationDays: estimatedDays }));
  };

  useEffect(() => {
    performCalculation();
  }, [selectedModelId, parkingSpots, includePV, includeGaskets, includeBallast, formData.serviceType, useInternalTeam, internalTechs, useExternalTeam, externalTechs, modelsConfig]);

  const handleAddressChange = (type: 'origin' | 'destination', field: keyof AddressState, value: string) => {
    if (type === 'origin') setOrigin(prev => ({ ...prev, [field]: value }));
    else setDestination(prev => ({ ...prev, [field]: value }));
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
      modelsConfig,
      marginPercent: 0,
      extraHourlyCost: 0,
      extraDailyCost: 0
    });
  };

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
                <div className="flex items-start gap-3 mt-1 p-2 bg-blue-50/50 rounded-md border border-blue-100">
                    <input id="excludeTransfer" type="checkbox" checked={excludeOriginTransfer} onChange={(e) => setExcludeOriginTransfer(e.target.checked)} className="w-4 h-4 mt-1" />
                    <label htmlFor="excludeTransfer" className="text-xs text-slate-600 font-semibold pt-0.5">
                        Escludi trasporto iniziale (Last-Mile HQ)
                    </label>
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
                     <input type="text" placeholder="Prov" value={destination.province} onChange={(e) => handleAddressChange('destination', 'province', e.target.value)} className="col-span-1 p-2.5 border border-slate-300 rounded-lg text-sm uppercase" maxLength={2} required />
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
            </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Tipo di Servizio</label>
            <select name="serviceType" value={formData.serviceType} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                <option value={ServiceType.FULL_INSTALLATION}>{ServiceType.FULL_INSTALLATION}</option>
                <option value={ServiceType.SUPPORT}>{ServiceType.SUPPORT}</option>
            </select>
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
                    {PERGOLA_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Posti Auto</label>
                <input type="number" min="1" max="100" value={parkingSpots} onChange={(e) => setParkingSpots(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded text-sm" />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-3 mt-2">
                <label className={`flex items-center gap-2 p-2 rounded border ${selectedModel?.allowsPV ? 'bg-white border-slate-200' : 'bg-slate-100 opacity-50'}`}>
                    <input type="checkbox" checked={includePV} onChange={(e) => setIncludePV(e.target.checked)} disabled={!selectedModel?.allowsPV} className="w-4 h-4" />
                    <span className="text-sm">Includi Fotovoltaico</span>
                </label>
                <label className={`flex items-center gap-2 p-2 rounded border ${selectedModel?.allowsGaskets ? 'bg-white border-slate-200' : 'bg-slate-100 opacity-50'}`}>
                    <input type="checkbox" checked={includeGaskets} onChange={(e) => setIncludeGaskets(e.target.checked)} disabled={!selectedModel?.allowsGaskets} className="w-4 h-4" />
                    <span className="text-sm">Includi Guarnizioni</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded border bg-white border-slate-200">
                    <input type="checkbox" checked={includeBallast} onChange={(e) => setIncludeBallast(e.target.checked)} className="w-4 h-4" />
                    <div className="flex flex-col">
                        <span className="text-sm flex items-center gap-1"><Weight className="w-3 h-3"/> Zavorre</span>
                        {includeBallast && <span className="text-xs text-blue-600 font-bold">Qtà: {ballastCount} ({(ballastCount * 1600)}kg)</span>}
                    </div>
                </label>
            </div>
        </div>
        )}

        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Giorni Lavorativi Stimati (Ore Totali / 9)
            </label>
            <div className="flex gap-2 items-center">
                <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    name="durationDays"
                    value={formData.durationDays}
                    onChange={handleChange}
                    className="flex-1 p-2 border border-slate-300 rounded-lg bg-white"
                    required
                />
                <button
                    type="button"
                    onClick={performCalculation}
                    className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-1 hover:bg-blue-100"
                >
                    <RefreshCw className="w-3 h-3" />
                </button>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-500 ml-1">
                <Calculator className="w-3 h-3" />
                <span>
                   Ore Totali Tabellari: 
                   <span className={`ml-1 font-bold ${calculatedHours === 0 ? 'text-red-500' : 'text-slate-800'}`}>
                       {calculatedHours.toFixed(2)}h
                   </span>
                </span>
                {calculatedHours === 0 && (
                    <span className="text-red-500 ml-2 animate-pulse">(Errore: dati non trovati nel CSV?)</span>
                )}
            </div>
             
             {formData.serviceType === ServiceType.FULL_INSTALLATION && (
                 <div className="flex items-start gap-3 mt-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                     <input id="returnOnWeekends" type="checkbox" checked={returnOnWeekends} onChange={(e) => setReturnOnWeekends(e.target.checked)} className="w-4 h-4 mt-1" />
                     <label htmlFor="returnOnWeekends" className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">Rientro nel Weekend?</span>
                    </label>
                </div>
            )}
        </div>
        
        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Note Aggiuntive</label>
            <textarea name="additionalNotes" value={formData.additionalNotes} onChange={handleChange} rows={3} className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-end">
        <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckSquare className="w-5 h-5" />}
            {isLoading ? 'Calcolo in corso...' : 'Calcola Preventivo'}
        </button>
      </div>

      <details className="mt-8 text-xs text-slate-400 border-t pt-4">
          <summary className="cursor-pointer flex items-center gap-2 hover:text-slate-600 mb-2 font-bold text-slate-500">
              <Eye className="w-4 h-4" /> DEBUG DATI MODELLI (CSV Viewer)
          </summary>
          <div className="bg-slate-100 p-4 rounded overflow-auto max-h-80 font-mono text-slate-700">
              <p><strong>Status Caricamento:</strong> {modelsConfig ? `✅ Caricati ${Object.keys(modelsConfig).length} modelli` : '❌ NON CARICATI'}</p>
              
              {modelsConfig && (
                  <div className="mt-4">
                      <p className="font-bold border-b border-slate-300 pb-1 mb-2">MODELLI TROVATI:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {Object.keys(modelsConfig).map(modelKey => (
                              <div key={modelKey} className={`p-2 border rounded ${modelKey.includes(selectedModelId.toUpperCase()) ? 'bg-blue-100 border-blue-400' : 'bg-white border-slate-200'}`}>
                                  <strong>{modelKey}</strong>
                                  <div className="mt-1 pl-2 border-l-2 border-slate-300 text-[10px]">
                                      {Object.entries(modelsConfig[modelKey]).map(([k, v]) => (
                                          <div key={k}>{k}: {v}</div>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      </details>
    </form>
  );
};

export default EstimationForm;
