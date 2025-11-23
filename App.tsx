
import React, { useState, useEffect } from 'react';
import { EstimateInputs, EstimateResult } from './types';
import { calculateEstimate } from './services/gemini';
import { getStoredApiKey } from './services/storage';
import EstimationForm from './components/EstimationForm';
import ResultsDisplay from './components/ResultsDisplay';
import ChatInterface from './components/ChatInterface';
import ApiKeySettings from './components/ApiKeySettings';
import { Calculator, Map, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Check for API key on mount
  useEffect(() => {
    const key = getStoredApiKey();
    if (!key) {
      setIsSettingsOpen(true);
    }
  }, []);

  const handleEstimate = async (inputs: EstimateInputs) => {
    const key = getStoredApiKey();
    if (!key) {
        setIsSettingsOpen(true);
        return;
    }

    setLoading(true);
    setLoadingStatus("Inizializzazione agente...");
    setError(null);
    setResult(null);
    
    try {
      const data = await calculateEstimate(inputs, (status) => {
          setLoadingStatus(status);
      });
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Impossibile generare il preventivo. Controlla gli input o la chiave API.");
      if (err.message?.includes("API Key") || err.message?.includes("Chiave API")) {
          setIsSettingsOpen(true);
      }
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
                <Calculator className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">FieldEst <span className="text-slate-400 font-normal">AI Agent</span></h1>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                <Map className="w-3 h-3" />
                <span>Powered by Gemini</span>
             </div>
             <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                title="Impostazioni API Key"
             >
                <Settings className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Left Column: Input */}
            <div className="xl:col-span-4">
                <div className="sticky top-24">
                    <EstimationForm onSubmit={handleEstimate} isLoading={loading} />
                    
                    {error && (
                        <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 text-sm animate-in fade-in">
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Output */}
            <div className="xl:col-span-8">
                {result ? (
                    <ResultsDisplay result={result} />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 min-h-[400px] border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                        {loading ? (
                            <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
                                <div className="relative w-20 h-20 mx-auto">
                                     <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                                     <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-700">L'AI sta lavorando</h3>
                                    <p className="text-sm text-slate-500 font-mono mt-1">{loadingStatus || "Elaborazione dati..."}</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Calculator className="w-16 h-16 mb-4 opacity-20" />
                                <p className="text-lg font-medium">Pronto al calcolo</p>
                                <p className="text-sm">Compila il modulo per generare un preventivo dettagliato.</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
      </main>

      <ChatInterface lastResult={result} />
      
      <ApiKeySettings 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};

export default App;
