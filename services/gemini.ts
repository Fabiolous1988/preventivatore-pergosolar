import { GoogleGenAI } from "@google/genai";
import { EstimateInputs, EstimateResult, TransportMode, AppConfig, ComputedCosts } from "../types";
import { getStoredApiKey } from "./storage";
import { DEFAULT_CONFIG } from "./config";
import { calculateBallastCount } from "./calculator";
import { calculateDeterministicCosts } from "./costEngine";

const cleanAndParseJSON = (text: string) => {
  try {
    let clean = text.replace(/```json\n/g, "").replace(/\n```/g, "").replace(/```/g, "");
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
        return JSON.parse(clean);
    }
    throw new Error("No JSON block found");
  } catch (e) {
    console.warn("JSON Parse warning:", e);
    // If strict JSON parsing fails, we might just throw or return empty depending on context
    // For the explanation step, we really need JSON.
    throw e;
  }
};

const getClient = () => {
    const apiKey = getStoredApiKey();
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

// Simple chat function remains generic, but uses Flash for speed
export const chatWithAgent = async (history: any[], message: string) => {
    const ai = getClient();
    try {
        const chat = ai.chats.create({
            model: "gemini-2.5-flash",
            history: history
        });
        const result = await chat.sendMessage({ message });
        return result.text;
    } catch (e) {
        console.error(e);
        return "Errore nella chat. Riprova.";
    }
};

export const calculateEstimate = async (
  inputs: EstimateInputs, 
  config: AppConfig = DEFAULT_CONFIG,
  onStatusUpdate?: (status: string) => void
): Promise<EstimateResult> => {
  
  const ai = getClient();
  const internalTechsCount = inputs.useInternalTeam ? inputs.internalTechs : 0;
  const externalTechsCount = inputs.useExternalTeam ? inputs.externalTechs : 0;
  const totalTechs = internalTechsCount + externalTechsCount;
  
  if (totalTechs === 0) {
      throw new Error("Devi selezionare almeno un tecnico (Interno o Esterno).");
  }

  // --- Step 1: Grounding (Google Maps) using FLASH (Fast) ---
  if (onStatusUpdate) onStatusUpdate("Ricerca distanza e percorso (Maps)...");
  
  let distanceKm = 0;
  let durationText = "";
  
  try {
    // REVISED PROMPT: Force explicit numeric output to avoid parsing errors
    const mapResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Calcola il percorso stradale reale tra "${inputs.origin}" e "${inputs.destination}".
        Usa lo strumento Google Maps.
        
        Dopo aver trovato il percorso, estrai i dati e rispondi ESATTAMENTE con questo formato (senza testo introduttivo):
        
        DISTANZA_KM: [numero puro con punto decimale]
        DURATA_TESTO: [testo durata]
        
        Esempio:
        DISTANZA_KM: 120.5
        DURATA_TESTO: 1 ora e 15 min`,
        config: { 
            tools: [{ googleMaps: {} }],
        }
    });
    
    const text = mapResponse.text || "";
    console.log("Maps Raw Response:", text);

    // Strict Parsing
    const distMatch = text.match(/DISTANZA_KM:\s*([\d\.]+)/i);
    if (distMatch) {
        distanceKm = parseFloat(distMatch[1]);
    } else {
        // Fallback: try finding typical distance patterns if strict format failed
        const looseMatch = text.match(/([\d\.,]+)\s*(?:km|chilometri)/i);
        if (looseMatch) {
            let numStr = looseMatch[1];
            // Normalize European format (1.200,50) to JS (1200.50)
            if (numStr.includes('.') && numStr.includes(',')) {
                 numStr = numStr.replace(/\./g, '').replace(',', '.');
            } else if (numStr.includes(',')) {
                 numStr = numStr.replace(',', '.');
            }
            // If only dots, assume they are thousands separators if value > 1000 logic fits, OR user is passing English format.
            // But standardizing on comma for decimal in IT context suggests '.' is thousands.
            // However, 10.5 km is 10.5. 
            // We'll trust parseFloat for simple dot cases unless it looks huge.
            distanceKm = parseFloat(numStr);
        }
    }

    // Match Duration
    const durMatch = text.match(/DURATA_TESTO:\s*(.+)/i) || 
                     text.match(/DURATA:\s*(.+)/i) ||
                     text.match(/((?:\d+\s*(?:ore|ora|h))?\s*(?:\d+\s*(?:min|minuti))?)/i);

    if (durMatch && durMatch[1].trim().length > 0) {
        durationText = durMatch[1].trim();
    } else {
        if (distanceKm > 0) durationText = `${(distanceKm / 80).toFixed(1)} h (Stima)`;
        else durationText = "N/A";
    }

    if (isNaN(distanceKm) || distanceKm <= 0.1) {
        // Only throw if we truly failed. If map returns 0, maybe same city?
        // Let's assume same city = 10km for logistics
        console.warn("Distanza 0 o non trovata. Uso fallback locale.");
        distanceKm = 10; 
        durationText = "20 min (Stima locale)";
    }
    
    console.log(`Maps Final: ${distanceKm} km, ${durationText}`);

  } catch (err) {
    console.warn("Maps Error (using fallback):", err);
    // Fallback if maps fail completely
    distanceKm = 50;
    durationText = "45 min (Stima Fallback)";
  }

  // --- Step 2: Deterministic Calculation (Code) ---
  if (onStatusUpdate) onStatusUpdate("Calcolo costi rigoroso...");

  const costs: ComputedCosts = calculateDeterministicCosts(inputs, config, distanceKm, durationText);

  // --- Step 3: Formatting & Explanation (Flash) ---
  if (onStatusUpdate) onStatusUpdate("Generazione report finale...");

  // We construct the "Prompt" not as a request to calculate, but as a request to FORMAT the already calculated data.
  // This ensures the AI doesn't hallucinate numbers.
  const prompt = `
    Sei "OptiCost", agente preventivatore.
    
    Ho già calcolato i costi rigorosamente tramite codice. 
    Il tuo compito è SOLO creare il JSON finale e scrivere una spiegazione discorsiva ("commonReasoning") in italiano professionale, giustificando le voci.
    
    DATI CALCOLATI (USALI ESATTAMENTE COSÌ, NON RICALCOLARE):
    - Distanza: ${costs.distanceKm} km (${costs.travelDurationHours.toFixed(1)}h guida)
    - Modalità: ${inputs.transportMode}
    - Squadra Interna: ${internalTechsCount} tecnici. Costo Lavoro: €${costs.internalLaborCost.toFixed(2)}. Costo Viaggio: €${costs.internalTravelCost.toFixed(2)}. Costo Tempo Viaggio: €${costs.internalTravelTimeCost.toFixed(2)}. Hotel: €${costs.internalHotelCost.toFixed(2)}. Vitto: €${costs.internalPerDiemCost.toFixed(2)}.
    - Squadra Esterna: ${externalTechsCount} tecnici. Costo Lavoro Totale (All-in): €${costs.externalLaborCost.toFixed(2)}.
    - Logistica: Muletto €${costs.forkliftCost.toFixed(2)}. Trasporto Materiale (€${costs.materialTransportCost.toFixed(2)} - Metodo: ${costs.logisticsMethod}).
    - Rientro Weekend Applicato? ${costs.isWeekendReturnApplied ? 'SI (Viaggi raddoppiati)' : 'NO'}.
    
    TOTALI:
    - Costo Vivo Totale: €${costs.totalCost.toFixed(2)}
    - Prezzo Vendita (Scontato): €${costs.salesPrice.toFixed(2)}
    - Margine: €${costs.marginAmount.toFixed(2)}
    
    OUTPUT RICHIESTO (JSON):
    {
      "options": [
        {
          "id": "opt_final",
          "methodName": "${inputs.useInternalTeam && inputs.useExternalTeam ? 'Squadra Mista' : inputs.useInternalTeam ? 'Squadra Interna' : 'Squadra Esterna'}",
          "logisticsSummary": "Descrivi mezzi, pesi e se c'è muletto o rientro weekend.",
          "breakdown": [
             { "category": "Lavoro", "description": "Manodopera Interna (${internalTechsCount} tecnici)", "amount": ${costs.internalLaborCost.toFixed(2)} },
             { "category": "Lavoro", "description": "Manodopera Esterna (${externalTechsCount} tecnici)", "amount": ${costs.externalLaborCost.toFixed(2)} },
             { "category": "Viaggio", "description": "Carburante, Pedaggi, Usura (${inputs.transportMode})", "amount": ${costs.internalTravelCost.toFixed(2)} },
             { "category": "Viaggio", "description": "Costo Orario Tecnici in Guida", "amount": ${costs.internalTravelTimeCost.toFixed(2)} },
             { "category": "Viaggio", "description": "Trasporto Materiale (${costs.logisticsMethod})", "amount": ${costs.materialTransportCost.toFixed(2)} },
             { "category": "Vitto/Alloggio", "description": "Hotel e Pernottamento", "amount": ${costs.internalHotelCost.toFixed(2)} },
             { "category": "Vitto/Alloggio", "description": "Diaria / Vitto Giornaliero", "amount": ${costs.internalPerDiemCost.toFixed(2)} },
             { "category": "Altro", "description": "Noleggio Muletto (se non presente)", "amount": ${costs.forkliftCost.toFixed(2)} }
          ],
          "totalCost": ${costs.totalCost.toFixed(2)},
          "salesPrice": ${costs.salesPrice.toFixed(2)},
          "marginAmount": ${costs.marginAmount.toFixed(2)}
        }
      ],
      "commonReasoning": "Spiega i totali. Menziona esplicitamente se è stato applicato il 'Rientro Weekend' o il 'Noleggio Muletto' in base ai dati forniti. Conferma che i costi esterni sono all-inclusive. Sottolinea lo sconto volume se applicato."
    }
    
    IMPORTANTE: Rimuovi dal breakdown le voci con importo 0.
  `;

  try {
    const generatePromise = ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const response = await generatePromise;
    const parsed = cleanAndParseJSON(response.text);

    // INJECT DETERMINISTIC EXPLANATIONS
    // We overwrite or add the explanations generated by the cost engine
    // to ensure the UI shows the EXACT math used.
    if (parsed.options && parsed.options.length > 0) {
        parsed.options.forEach((opt: any) => {
            opt.categoryExplanations = costs.categoryExplanations;
        });
    }

    // INJECT DEBUG LOG
    parsed.debugLog = costs.debugLog;

    return parsed;

  } catch (e: any) {
    console.error("AI Generation Error:", e);
    if (e.message?.includes("API Key")) {
         throw new Error("API Key Errata o Bloccata.");
    }
    throw new Error(`Errore generazione preventivo: ${e.message}`);
  }
};
