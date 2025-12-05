
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
    }
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", text);
    throw new Error("Errore nella lettura della risposta AI. Riprova.");
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
    // We explicitly ask for JSON output to parse distance reliably from Flash
    const mapResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Restituisci ESCLUSIVAMENTE un JSON valido con la distanza stradale e durata tra ${inputs.origin} e ${inputs.destination}. 
        Formato richiesto: { "distanceKm": numero, "duration": "stringa" }. 
        Non aggiungere altro testo.`,
        config: { 
            tools: [{ googleMaps: {} }],
            responseMimeType: "application/json"
        }
    });
    
    const mapData = cleanAndParseJSON(mapResponse.text);
    distanceKm = Number(mapData.distanceKm) || 0;
    durationText = mapData.duration || "";
    
    console.log(`Maps Found: ${distanceKm} km, ${durationText}`);

  } catch (err) {
    console.error("Maps Error:", err);
    // Fallback if maps fail: assume 100km just to let the calculator run
    distanceKm = 100;
    durationText = "1 ora";
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

    return parsed;

  } catch (e: any) {
    console.error("AI Generation Error:", e);
    if (e.message?.includes("API Key")) {
         throw new Error("API Key Errata o Bloccata.");
    }
    throw new Error(`Errore generazione preventivo: ${e.message}`);
  }
};
