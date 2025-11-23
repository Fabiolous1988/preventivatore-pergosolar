
import { GoogleGenAI } from "@google/genai";
import { EstimateInputs, EstimateResult, TransportMode } from "../types";
import { getStoredApiKey } from "./storage";

const COST_CONSTANTS = `
- Costo Orario Tecnico (Interno): €35/ora
- Giornata lavorativa: 8 ore
- Diaria (Trasferta) a persona: €40/giorno (vitto)
- Usura Veicolo Aziendale: €0.15/km
- Consumo Medio Carburante: €1.85/litro (circa 12km/l)
- Margine min: variabile da input
`;

// Helper to clean JSON strings
const cleanAndParseJSON = (text: string) => {
  try {
    // Remove markdown code blocks if present
    let clean = text.replace(/```json\n/g, "").replace(/\n```/g, "").replace(/```/g, "");
    // Locate the first '{' and last '}' to handle potential intro text
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", text);
    throw new Error("Errore nella lettura della risposta AI. Riprova.");
  }
};

// Helper to get authenticated client or throw error
const getClient = () => {
    const apiKey = getStoredApiKey();
    if (!apiKey) {
        throw new Error("Chiave API mancante. Inseriscila nelle impostazioni.");
    }
    return new GoogleGenAI({ apiKey });
};

export const calculateEstimate = async (
  inputs: EstimateInputs, 
  onStatusUpdate?: (status: string) => void
): Promise<EstimateResult> => {
  
  const ai = getClient();

  // --- Step 1: Grounding (Maps & Search) ---
  if (onStatusUpdate) onStatusUpdate("Consultazione Google Maps per distanze...");
  
  let routeInfo = "N/D";
  let searchContext = "N/D";

  try {
    // Parallel Execution with individual timeouts
    const mapsPromise = (async () => {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Distance and driving time from ${inputs.origin} to ${inputs.destination}?`,
                config: { tools: [{ googleMaps: {} }] }
            });
            // Extract map data from chunks if available, or text
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            let mapText = response.text;
            if (chunks) mapText += " " + JSON.stringify(chunks);
            return mapText;
        } catch (e) { console.error(e); return "Errore Mappe"; }
    })();

    if (onStatusUpdate) onStatusUpdate("Analisi prezzi trasporti e hotel...");
    
    const searchPromise = (async () => {
        try {
             // Contextual search based on transport mode
             let query = `hotel prices in ${inputs.destination} for ${inputs.startDate}`;
             if (inputs.transportMode === TransportMode.PUBLIC_TRANSPORT) {
                 query += `, train and flight cost from ${inputs.origin} to ${inputs.destination}`;
             }
             const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: query,
                config: { tools: [{ googleSearch: {} }] }
            });
            return response.text; // Search results usually in text
        } catch (e) { console.error(e); return "Errore Ricerca"; }
    })();

    // Wait for data (max 15 seconds for grounding to avoid blocking everything)
    const groundingTimeout = new Promise<[string, string]>(resolve => setTimeout(() => resolve(["Timeout Mappe", "Timeout Ricerca"]), 15000));
    
    const [mapsResult, searchResult] = await Promise.race([
        Promise.all([mapsPromise, searchPromise]),
        groundingTimeout
    ]) as [string, string];

    routeInfo = mapsResult;
    searchContext = searchResult;

  } catch (err) {
    console.error("Grounding Error:", err);
  }

  // --- Step 2: Reasoning & Calculation ---
  if (onStatusUpdate) onStatusUpdate("Elaborazione preventivo e calcoli finali...");

  const prompt = `
    Sei un esperto agente di stima costi per interventi tecnici.
    
    INPUT DATI:
    - Origine: ${inputs.origin}
    - Destinazione: ${inputs.destination}
    - Escludi Trasferimento Iniziale HQ: ${inputs.excludeOriginTransfer ? "SI (Tecnici accompagnati gratis in stazione)" : "NO (Calcola taxi/mezzi da HQ a stazione/aeroporto)"}
    - Tipo Servizio: ${inputs.serviceType}
    - Modalità: ${inputs.transportMode}
    - Data: ${inputs.startDate}
    - Durata: ${inputs.durationDays} giorni
    - Margine Richiesto: ${inputs.marginPercent}%
    - Note: ${inputs.additionalNotes}

    DATI CONTESTO (DAL WEB/MAPS):
    - Info Percorso: ${routeInfo}
    - Info Prezzi/Logistica: ${searchContext}
    - Costanti Aziendali: ${COST_CONSTANTS}

    RICHIESTA:
    Genera un preventivo JSON rigoroso.
    
    REGOLE CATEGORIE COSTI (IMPORTANTE):
    Ogni voce di costo ("breakdown") DEVE appartenere ESCLUSIVAMENTE a una di queste 3 categorie esatte:
    1. "Lavoro" -> (Costo orario tecnici per ore lavorate + ore viaggio).
    2. "Viaggio" -> (Biglietti aereo/treno, taxi, metro, pedaggi, carburante, usura auto).
    3. "Vitto/Alloggio" -> (Hotel, diarie pasti).
    
    NON inventare altre categorie. Raggruppa tutto in queste tre.

    Se la modalità è "Mezzi Pubblici", DEVI generare ALMENO 2 opzioni nell'array 'options':
    1. Opzione Treno (se fattibile) + Transfer locale
    2. Opzione Aereo (se fattibile) + Transfer locale
    Se la distanza è breve, l'aereo potrebbe non esserci, usa solo Treno o Bus.
    
    Nel calcolo "Viaggio", se "Escludi Trasferimento Iniziale HQ" è SI, NON mettere costi per arrivare alla stazione di partenza.

    OUTPUT JSON SCHEMA:
    {
      "options": [
        {
          "id": "opt1",
          "methodName": "Nome Metodo (es. Treno + Taxi)",
          "logisticsSummary": "Descrizione breve itinerario (es. Frecciarossa fino a Milano C.le, poi Taxi 15min)",
          "breakdown": [
            { "category": "Viaggio", "description": "Biglietto Treno A/R", "amount": 100.00 },
            { "category": "Lavoro", "description": "2 Tecnici x 8 ore x 2 giorni", "amount": 200.00 },
            { "category": "Vitto/Alloggio", "description": "Hotel 2 notti", "amount": 150.00 }
          ],
          "totalCost": 450.00,
          "salesPrice": 585.00,
          "marginAmount": 135.00
        }
      ],
      "commonReasoning": "Spiegazione generale delle scelte fatte"
    }
  `;

  // Set a hard timeout for the reasoning phase (120 seconds)
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Tempo di elaborazione scaduto (Timeout)")), 120000)
  );

  const generationPromise = ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 8192 } // Reduced slightly for speed, still high reasoning
    }
  });

  try {
      const response: any = await Promise.race([generationPromise, timeoutPromise]);
      
      if (onStatusUpdate) onStatusUpdate("Finalizzazione dati...");
      const json = cleanAndParseJSON(response.text);
      
      // Sanitize numbers
      json.options = json.options.map((opt: any) => ({
          ...opt,
          totalCost: Number(opt.totalCost) || 0,
          salesPrice: Number(opt.salesPrice) || 0,
          marginAmount: Number(opt.marginAmount) || 0,
          breakdown: Array.isArray(opt.breakdown) ? opt.breakdown.map((b: any) => ({
              ...b,
              amount: Number(b.amount) || 0
          })) : []
      }));

      return json;

  } catch (error: any) {
      console.error("Generation Error:", error);
      throw new Error(error.message || "Errore durante la generazione del preventivo.");
  }
};

export const chatWithAgent = async (history: any[], message: string) => {
    const ai = getClient();
    const chat = ai.chats.create({
        model: "gemini-3-pro-preview",
        history: history
    });
    const result = await chat.sendMessage(message);
    return result.text;
};
