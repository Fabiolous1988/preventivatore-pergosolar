
import React, { useState, useEffect } from 'react';
import { Key, Save, AlertTriangle, ExternalLink, X } from 'lucide-react';
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
      const current = getStoredApiKey();
      if (current) setKey(current);
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
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 relative">
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
            <h2 className="text-xl font-bold text-slate-800">Configurazione Chiave API</h2>
            <p className="text-sm text-slate-500">Collega il tuo account Google per utilizzare l'app.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
            <p className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Per utilizzare questo strumento è necessaria una <strong>Gemini API Key</strong>. 
                I costi di utilizzo verranno addebitati sul tuo account Google Cloud (se superi la soglia gratuita).
              </span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Inserisci la tua API Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="text-xs text-slate-500 flex justify-between items-center pt-2">
             <span>Non hai una chiave?</span>
             <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
             >
                Ottienila qui <ExternalLink className="w-3 h-3" />
             </a>
          </div>

          <button
            onClick={handleSave}
            disabled={!key.trim()}
            className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all mt-4 ${
              isSaved 
                ? 'bg-green-600 text-white' 
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {isSaved ? <CheckLabel /> : <SaveLabel />}
          </button>
        </div>
      </div>
    </div>
  );
};

const SaveLabel = () => (
    <>
        <Save className="w-4 h-4" /> Salva e Continua
    </>
);

const CheckLabel = () => (
    <>
        Chiave Salvata!
    </>
);

export default ApiKeySettings;
