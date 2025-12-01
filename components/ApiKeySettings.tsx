
import React, { useState, useEffect } from 'react';
import { Key, Save, ExternalLink, X, Check } from 'lucide-react';
import { getStoredApiKey, setStoredApiKey } from '../services/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ApiKeySettings: React.FC<Props> = ({ isOpen, onClose }) => {
  const [key, setKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const currentKey = getStoredApiKey();
      if (currentKey) setKey(currentKey);
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!key.trim()) return;
    setStoredApiKey(key.trim());
    
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 relative">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
            <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <div className="bg-blue-100 p-2.5 rounded-lg">
            <Key className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Impostazioni</h2>
            <p className="text-sm text-slate-500">Gestisci Chiave API</p>
          </div>
        </div>

        <div className="space-y-5">
            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Google Gemini API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                    <input
                        type="password"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="Incolla qui la tua API Key..."
                        className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                    <Key className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    Necessaria per generare i preventivi.
                </p>
            </div>
            
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-500">
                <p><strong>Nota:</strong> Le configurazioni dei fogli Google (Tariffe, Modelli, Logistica) sono gestite centralmente e non richiedono inserimento manuale.</p>
            </div>

            <button
                onClick={handleSave}
                disabled={!key.trim()}
                className={`w-full py-3 px-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all shadow-md ${
                    isSaved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                {isSaved ? (
                    <>
                        <Check className="w-5 h-5" /> Salvato!
                    </>
                ) : (
                    <>
                        <Save className="w-5 h-5" /> Salva Impostazioni
                    </>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySettings;
