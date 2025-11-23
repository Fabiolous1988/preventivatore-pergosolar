
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User } from 'lucide-react';
import { chatWithAgent } from '../services/gemini';
import { EstimateResult } from '../types';

interface Props {
  lastResult: EstimateResult | null;
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    isInitial?: boolean;
}

const ChatInterface: React.FC<Props> = ({ lastResult }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize chat with context when a new result comes in
  useEffect(() => {
    if (lastResult && lastResult.options && lastResult.options.length > 0) {
        const totalCost = lastResult.options[0]?.totalCost?.toFixed(2) || "N/A";
        setMessages([{
            role: 'model',
            text: `Ho generato il preventivo. Il costo interno base (Opzione 1) è €${totalCost}. Chiedimi pure dettagli sulle voci di spesa o come ottimizzare la trasferta.`,
            isInitial: true
        }]);
        // Auto open if desired, or just reset state
        setIsOpen(true);
    }
  }, [lastResult]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    
    // Add user message to UI immediately
    const newHistory = [...messages, { role: 'user' as const, text: userMsg }];
    setMessages(newHistory);
    setIsTyping(true);

    try {
        // Filter out the "initial" welcome message from API history
        // Gemini API chats typically must start with a User message or empty history.
        const apiHistory = newHistory
            .filter(m => !m.isInitial)
            .slice(0, -1) // Exclude the message we are about to send as prompt (optional, depends on SDK usage, but standard practice is history + current prompt)
            .map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

        let prompt = userMsg;
        
        // If this is the very first real interaction, inject the context
        const isFirstRealInteraction = messages.filter(m => !m.isInitial).length === 0;
        if (isFirstRealInteraction && lastResult) {
            prompt = `CONTEXT_DATA: ${JSON.stringify(lastResult)}. 
            
            USER_QUESTION: ${userMsg}
            
            Answer the user question based on the CONTEXT_DATA provided above. Be helpful and concise.`;
        }

        const reply = await chatWithAgent(apiHistory, prompt);
        setMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch (error) {
        console.error(error);
        setMessages(prev => [...prev, { role: 'model', text: "Mi dispiace, ho riscontrato un errore nel processare la richiesta. Riprova tra poco." }]);
    } finally {
        setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 p-4 rounded-full shadow-lg transition-all z-50 ${
          isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
        } text-white`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-40 animate-in fade-in slide-in-from-bottom-10">
          <div className="bg-slate-800 p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
                <h3 className="font-semibold text-white">Assistente AI</h3>
                <p className="text-xs text-slate-300">Chiedi info sul preventivo</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50" ref={scrollRef}>
            {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                        m.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
                    }`}>
                        {m.text}
                    </div>
                </div>
            ))}
            {isTyping && (
                <div className="flex justify-start">
                     <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm rounded-bl-none">
                        <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                     </div>
                </div>
            )}
          </div>

          <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Fai una domanda..."
                className="flex-1 p-2 bg-slate-100 rounded-md border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            />
            <button 
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
                <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatInterface;
