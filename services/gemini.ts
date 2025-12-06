
import { GoogleGenAI } from "@google/genai";
import { EstimateInputs, EstimateResult, TransportMode, AppConfig, ComputedCosts } from "../types";
import { getStoredApiKey } from "./storage";
import { DEFAULT_CONFIG } from "./config";
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
    throw e;
  }
};

const getClient = () => {
    const apiKey = getStoredApiKey();
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

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

// Robust text-to-number parsing for Maps output
const parseDistanceString = (text: string): { km: number, durationStr: string } => {
    let km = 0;
    let durationStr = "N/A";

    // 1. Extract Duration first
    // Look for patterns like "2 ore 30 min", "1 h 10 min", "45 min"
    const durMatch = text.match(/((?:\d+\s*(?:ore|ora|h|hours?))?\s*(?:\d+\s*(?:min|minuti|m))?)/i);
    if (durMatch && durMatch[0].length > 2) {
        durationStr = durMatch[0].trim();
    }

    // 2. Extract Distance
    // Regex that catches: "1200 km", "1.200 km", "1,200.5 km", "12,5 km"
    const kmRegex = /([\d\.,]+)\s*(?:km|chilometri)/i;
    const kmMatch = text.match(kmRegex);

    if (kmMatch) {
        let rawNum = kmMatch[1].trim(); // e.g. "1.200" or "1,200" or "12,5"

        // Heuristic to decide if "." is thousand or decimal separator
        // If the duration indicates a long trip (>1 hour) but the number is small (<20) and has a dot, it's thousands.
        const isLongTrip = durationStr.includes("ore") || durationStr.includes("h") || durationStr.includes("hour");
        
        // Remove all non-numeric chars except . and ,
        // Try standard ParseFloat (US style: 1,200.50 -> 1200.5)
        let valUS = parseFloat(rawNum.replace(/,/g, ''));
        
        // Try EU style (1.200,50 -> 1200.5)
        let valEU = parseFloat(rawNum.replace(/\./g, '').replace(',', '.'));

        if (isNaN(valUS)) valUS = 0;
        if (isNaN(valEU)) valEU = 0;

        // Decision logic
        if (rawNum.includes('.') && !rawNum.includes(',')) {
            // Ambiguous: "1.200". Is it 1.2 or 1200?
            if (isLongTrip && valUS < 10 && valEU > 100) {
                km = valEU; // It was a thousand separator
            } else {
                km = valUS; // Default to standard float
            }
        } else if (rawNum.includes(',') && !rawNum.includes('.')) {
            // Ambiguous: "1,200" (US 1200) or "1,2" (EU 1.2)
            // Usually Google Maps returns dots for decimals in API but commas in IT UI.
            // Let's assume EU style for comma if single comma?
            km = valEU;
        } else {
            // Mixed or clean number
            km = Math.max(valUS, valEU);
        }
    }

    return { km, durationStr };
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
    // SIMPLE PROMPT: Just asking for the path, allowing the tool to do its job naturally
    const mapResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Calcola il percorso stradale tra "${inputs.origin}" e "${inputs.destination}". Dimmi i km totali e il tempo di guida stimato. Usa Google Maps.`,
        config: { 
            tools: [{ googleMaps: {} }],
        }
    });
    
    const text = mapResponse.text || "";
    console.log("Maps Response Raw:", text);

    const parsed = parseDistanceString(text);
    distanceKm = parsed.km;
    durationText = parsed.durationStr;

    // Fallback if still 0
    if (distanceKm <= 0.1) {
        console.warn("Maps returned ~0 km. Using fallback.");
        distanceKm = 50; 
        durationText = "Stima Fallback (50km)";
    }
    
    console.log(`Maps Final: ${distanceKm} km, ${durationText}`);

  } catch (err) {
    console.warn("Maps Error (using fallback):", err);
    distanceKm = 50;
    durationText = "Stima Fallback (Error)";
  }

  // --- Step 2: Deterministic Calculation (Code) ---
  if (onStatusUpdate) onStatusUpdate("Calcolo costi rigoroso...");

  const costs: ComputedCosts = calculateDeterministicCosts(inputs, config, distanceKm, durationText);

  // --- Step 3: Formatting & Explanation (Flash) ---
  if (onStatusUpdate) onStatusUpdate("Generazione report finale...");

  const prompt = `
    Sei "OptiCost".
    
    Ho già calcolato i costi rigorosamente.
    Il tuo compito è SOLO creare il JSON finale e scrivere una spiegazione discorsiva ("commonReasoning").
    
    DATI CALCOLATI (USALI ESATTAMENTE COSÌ):
    - Distanza: ${costs.distanceKm} km (${costs.travelDurationHours.toFixed(1)}h guida)
    - Modalità: ${inputs.transportMode}
    - Squadra Interna: ${internalTechsCount} tecnici. Costo Lavoro: €${costs.internalLaborCost.toFixed(2)}. Costo Viaggio: €${costs.internalTravelCost.toFixed(2)}. Costo Tempo Viaggio: €${costs.internalTravelTimeCost.toFixed(2)}. Hotel: €${costs.internalHotelCost.toFixed(2)}. Vitto: €${costs.internalPerDiemCost.toFixed(2)}.
    - Squadra Esterna: ${externalTechsCount} tecnici. Costo Lavoro Totale: €${costs.externalLaborCost.toFixed(2)}.
    - Logistica: Muletto €${costs.forkliftCost.toFixed(2)}. Trasporto Materiale €${costs.materialTransportCost.toFixed(2)} (${costs.logisticsMethod}).
    - Rientro Weekend? ${costs.isWeekendReturnApplied ? 'SI' : 'NO'}.
    
    TOTALI:
    - Costo Vivo: €${costs.totalCost.toFixed(2)}
    - Prezzo Vendita: €${costs.salesPrice.toFixed(2)}
    - Margine: €${costs.marginAmount.toFixed(2)}
    
    OUTPUT JSON:
    {
      "options": [
        {
          "id": "opt_final",
          "methodName": "${inputs.useInternalTeam && inputs.useExternalTeam ? 'Squadra Mista' : inputs.useInternalTeam ? 'Squadra Interna' : 'Squadra Esterna'}",
          "logisticsSummary": "Descrivi mezzi, pesi e logistica.",
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
      "commonReasoning": "Spiegazione sintetica dei totali."
    }
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

    if (parsed.options && parsed.options.length > 0) {
        parsed.options.forEach((opt: any) => {
            opt.categoryExplanations = costs.categoryExplanations;
        });
    }
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
