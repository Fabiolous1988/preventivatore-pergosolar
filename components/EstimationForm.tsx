
import React, { useState } from 'react';
import { EstimateInputs, ServiceType, TransportMode } from '../types';
import { Loader2, MapPin, Calendar, Truck, UserCog, Percent, Building2, Info } from 'lucide-react';

interface Props {
  onSubmit: (data: EstimateInputs) => void;
  isLoading: boolean;
}

interface AddressState {
  street: string;
  city: string;
  zip: string;
  province: string;
}

const EstimationForm: React.FC<Props> = ({ onSubmit, isLoading }) => {
  // Split address state
  const [origin, setOrigin] = useState<AddressState>({ street: '', city: '', zip: '', province: '' });
  const [destination, setDestination] = useState<AddressState>({ street: '', city: '', zip: '', province: '' });
  const [excludeOriginTransfer, setExcludeOriginTransfer] = useState(false);

  const [formData, setFormData] = useState<Omit<EstimateInputs, 'origin' | 'destination' | 'excludeOriginTransfer'>>({
    serviceType: ServiceType.FULL_INSTALLATION,
    transportMode: TransportMode.COMPANY_VEHICLE,
    startDate: new Date().toISOString().split('T')[0],
    durationDays: 1,
    marginPercent: 30,
    additionalNotes: ''
  });

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
      [name]: name === 'durationDays' || name === 'marginPercent' ? Number(value) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct full address strings
    const originStr = `${origin.street}, ${origin.zip} ${origin.city} ${origin.province}`;
    const destStr = `${destination.street}, ${destination.zip} ${destination.city} ${destination.province}`;

    onSubmit({
      ...formData,
      origin: originStr.trim(),
      destination: destStr.trim(),
      excludeOriginTransfer
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">Dettagli Progetto</h2>
        <p className="text-sm text-slate-500">Inserisci i parametri dell'intervento.</p>
      </div>

      {/* Address Section */}
      <div className="space-y-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
        
        {/* Origin */}
        <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-1">
                <Building2 className="w-4 h-4 text-blue-600" /> Origine (HQ)
            </label>
            <div className="grid grid-cols-1 gap-3">
                <input
                    type="text"
                    placeholder="Via / Piazza e Numero Civico"
                    value={origin.street}
                    onChange={(e) => handleAddressChange('origin', 'street', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    required
                />
                <div className="grid grid-cols-6 gap-3">
                     <input
                        type="text"
                        placeholder="CAP"
                        value={origin.zip}
                        onChange={(e) => handleAddressChange('origin', 'zip', e.target.value)}
                        className="col-span-2 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Città"
                        value={origin.city}
                        onChange={(e) => handleAddressChange('origin', 'city', e.target.value)}
                        className="col-span-3 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Prov"
                        value={origin.province}
                        onChange={(e) => handleAddressChange('origin', 'province', e.target.value)}
                        className="col-span-1 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm uppercase"
                        maxLength={2}
                        required
                    />
                </div>
                
                {/* Last Mile Option */}
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
                        I tecnici vengono accompagnati in stazione/aeroporto con mezzi propri (nessun costo taxi/bus da HQ).
                    </label>
                </div>
            </div>
        </div>

        {/* Destination */}
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
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Service Type */}
        <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <UserCog className="w-4 h-4" /> Tipo di Servizio
            </label>
            <select
                name="serviceType"
                value={formData.serviceType}
                onChange={handleChange}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
                {Object.values(ServiceType).map(type => (
                    <option key={type} value={type}>{type}</option>
                ))}
            </select>
        </div>

        {/* Transport */}
        <div className="space-y-2 md:col-span-2">
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
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Se mezzi pubblici: calcola opzioni Treno/Aereo + Transfer locale.
            </p>
        </div>

        {/* Date & Duration */}
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
        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Durata (Giorni)
            </label>
            <input
                type="number"
                min="1"
                name="durationDays"
                value={formData.durationDays}
                onChange={handleChange}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
            />
        </div>

        {/* Margin */}
        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Percent className="w-4 h-4" /> Margine Desiderato (%)
            </label>
            <input
                type="number"
                min="0"
                max="100"
                name="marginPercent"
                value={formData.marginPercent}
                onChange={handleChange}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
            />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Note Aggiuntive</label>
        <textarea
            name="additionalNotes"
            value={formData.additionalNotes}
            onChange={handleChange}
            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            rows={3}
            placeholder="es. Necessario hotel 4 stelle, attrezzi ingombranti..."
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
            <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Calcolo in corso...
            </>
        ) : (
            'Genera Preventivo'
        )}
      </button>
    </form>
  );
};

export default EstimationForm;
