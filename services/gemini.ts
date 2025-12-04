
import { GoogleGenAI } from "@google/genai";
import { EstimateInputs, EstimateResult, TransportMode, AppConfig } from "../types";
import { getStoredApiKey } from "./storage";
import { DEFAULT_CONFIG } from "./config";
import { calculateBallastCount } from "./calculator";

const BASE_BUSINESS_RULES = `
- soglia_distanza_trasferta_km: 150 km
- indennita_trasferta_giornaliera_per_tecnico: €50.00
- soglia_minima_ore_lavoro_utili: 2 ore (residue dopo viaggio)
- ore_lavoro_giornaliere_standard: 8 ore (massimo in cantiere)
- ore_totali_giornata_porta_porta: 10 ore (Viaggio + Lavoro)
- km_per_litro_furgone: 11 km/l
- costo_usura_mezzo_euro_km: €0.037/km
- raggio_spostamenti_loco: 15 km (Hotel-Cantiere, max 20 min auto)
`;

// NEW LOGISTICS RULES
const LOGISTICS_RULES = `
REGOLA ZAVORRE E MULETTO (MANDATORIA):
- Se ci sono Zavorre (includeBallast = true), è OBBLIGATORIO noleggiare un mezzo di sollevamento (Muletto), a meno che il cliente non lo abbia (hasForklift).
- COSTO NOLEGGIO MULETTO:
  - Fino a 5 giorni lavorativi (inclusi): €700 forfait.
  - Dal 6° giorno in poi: + €120 per ogni giorno extra.
  - Esempio: 4 giorni = €700. 7 giorni = €700 + (2 * 120) = €940.

REGOLA SQUADRE ESTERNE (CRUCIALE):
- Le squadre ESTERNE fatturano SOLO LE ORE LAVORATE moltiplicate per la tariffa oraria.
- ZERO SPESE VIAGGIO, ZERO VITTO, ZERO ALLOGGIO per tecnici esterni (sono costi inclusi nella loro tariffa).
- Se c'è una squadra mista (Interni + Esterni), calcola viaggio/hotel SOLO per gli Interni.

REGOLA RIENTRO WEEKEND:
- Controlla le date (startDate + durationDays).
- Se l'opzione "returnOnWeekends" è attiva E il periodo di lavoro include un Sabato e una Domenica nel mezzo (quindi NON finisce di venerdì):
  - Aggiungi costi di viaggio A/R extra per far rientrare la squadra INTERNA a casa.
  - Formula stima: (Distanza * 2) km aggiuntivi + Autostrada A/R.
  - Se non c'è weekend nel mezzo, ignora questa opzione anche se attiva.

LOGISTICA MEZZI (PESI):
- Peso Zavorra Singola: 1600 kg (standard) o vedi Knowledge Base.
- Furgone Aziendale: Max 1000kg.
- Bilico Completo: Max 24000 kg (240 q).
- Camion con Gru: Max 16000 kg (160 q).
- Se Distanza > 200 km: Bilico richiede hotel autista (extra). Camion Gru include hotel autista.
`;

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
    // No error throw here, let SDK handle it or use default if handled in storage
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

export const chatWithAgent = async (history: any[], message: string) => {
    const ai = getClient();
    try {
        const chat = ai.chats.create({
            model: "gemini-3-pro-preview",
            history: history
        });
        const result = await chat.sendMessage({ message });
        return result.text;
    } catch (e) {
        console.warn("Pro model failed for chat, falling back to Flash", e);
        const chat = ai.chats.create({
            model: "gemini-2.5-flash",
            history: history
        });
        const result = await chat.sendMessage({ message });
        return result.text;
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

  const ballastCount = inputs.includeBallast && inputs.parkingSpots ? calculateBallastCount(inputs.parkingSpots) : 0;
  // Note: Total weight calculation is better handled by AI using the Knowledge Base (CSV) if available, 
  // but we pass a rough estimate here just in case.
  const estBallastWeight = ballastCount * 1600; 

  // --- Step 1: Grounding ---
  if (onStatusUpdate) onStatusUpdate("Consultazione Google Maps per distanze...");
  
  let routeInfo = "N/D";
  let searchContext = "N/D";
  let destProvinceCode = "XX";
  
  // Extract province from destination string approximately
  const provMatch = inputs.destination.match(/\b([A-Z]{2})\b/);
  if (provMatch) destProvinceCode = provMatch[1];

  try {
    const mapsPromise = (async () => {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Distance, driving time and province code from ${inputs.origin} to ${inputs.destination}?`,
                config: { tools: [{ googleMaps: {} }] }
            });
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            let mapText = response.text;
            if (chunks) mapText += " " + JSON.stringify(chunks);
            return mapText;
        } catch (e) { console.error(e); return "Errore Mappe"; }
    })();

    if (onStatusUpdate) onStatusUpdate(`Analisi prezzi per ${totalTechs} persone...`);
    
    const searchPromise = (async () => {
        try {
             let query = `prezzo medio gasolio Italia oggi, costo hotel 3 stelle a ${inputs.destination} per ${internalTechsCount} persone site:booking.com OR site:expedia.it`;
             if (inputs.transportMode === TransportMode.PUBLIC_TRANSPORT) {
                 query += `, costo biglietto treno da ${inputs.origin} a ${inputs.destination} per ${internalTechsCount} persone site:trainline.com OR site:trenitalia.com, costo volo da aeroporto vicino a ${inputs.origin} a aeroporto vicino a ${inputs.destination} site:skyscanner.it, costo medio taxi da stazione/aeroporto a ${inputs.destination}`;
             }
             const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: query,
                config: { tools: [{ googleSearch: {} }] }
            });
            return response.text;
        } catch (e) { console.error(e); return "Errore Ricerca"; }
    })();

    const groundingTimeout = new Promise<[string, string]>(resolve => setTimeout(() => resolve(["Timeout Mappe", "Timeout Ricerca"]), 20000));
    
    const [mapsResult, searchResult] = await Promise.race([
        Promise.all([mapsPromise, searchPromise]),
        groundingTimeout
    ]) as [string, string];

    routeInfo = mapsResult;
    searchContext = searchResult;

  } catch (err) {
    console.error("Grounding Error:", err);
  }

  // --- Step 2: Reasoning ---
  if (onStatusUpdate) onStatusUpdate("Calcolo preventivo e scenari...");

  let customConfigString = "";
  if (config.customParams && Object.keys(config.customParams).length > 0) {
      customConfigString = "\nPARAMETRI AZIENDALI AGGIUNTIVI (Dal Foglio Configurazione):\n";
      for (const [key, data] of Object.entries(config.customParams)) {
          customConfigString += `- ${key}: ${data.value} ${data.description ? `(${data.description})` : ''}\n`;
      }
  }

  // Logistics Costs Injection
  let logisticsCostsString = "Nessun dato logistico specifico per questa provincia.";
  if (inputs.logisticsConfig && destProvinceCode) {
      const provCosts = inputs.logisticsConfig[destProvinceCode] || inputs.logisticsConfig[Object.keys(inputs.logisticsConfig).find(k => inputs.destination.toUpperCase().includes(k)) || ''];
      
      if (provCosts) {
          logisticsCostsString = `COSTI LOGISTICA PER PROVINCIA ${destProvinceCode}:\n`;
          for (const [k, v] of Object.entries(provCosts)) {
              logisticsCostsString += `- ${k}: €${v}\n`;
          }
      } else {
          logisticsCostsString += ` (Provincia '${destProvinceCode}' non trovata nel foglio logistica)`;
      }
  }

  let modelsSpecsString = "";
  if (inputs.modelsConfig) {
      modelsSpecsString = "\nKNOWLEDGE BASE MODELLI & PESI (Dal CSV Knowledge Base):\n";
      modelsSpecsString += "Usa questi dati per calcolare pesi totali e capacità camion.\n";
      
      const selectedModelKey = Object.keys(inputs.modelsConfig).find(k => k.toLowerCase().includes(inputs.selectedModelId?.toLowerCase() || ''));
      if (selectedModelKey) {
          modelsSpecsString += `DATI SPECIFICI MODELLO SELEZIONATO (${selectedModelKey}):\n`;
          const params = inputs.modelsConfig[selectedModelKey];
          for (const [key, val] of Object.entries(params)) {
              modelsSpecsString += `- ${key}: ${val}\n`;
          }
      } else {
          modelsSpecsString += "Modello selezionato non trovato esplicitamente nel CSV, usa stime prudenziali o cerca 'Solarflex' come base.\n";
      }
  }

  const prompt = `
    Sei "OptiCost", l'agente esperto di preventivazione per Pergosolar.
    
    OBIETTIVO:
    Calcolare i costi rigorosi per l'installazione.
    
    DATI INPUT:
    - Origine (HQ): ${inputs.origin}
    - Destinazione: ${inputs.destination} (Provincia: ${destProvinceCode})
    - Data Inizio: ${inputs.startDate}
    - Modalità: ${inputs.transportMode}
    - Squadra INTERNA: ${inputs.internalTechs} persone (Tariffa: €${config.internalHourlyRate}/h).
    - Squadra ESTERNA: ${inputs.externalTechs} persone (Tariffa: €${config.externalHourlyRate}/h).
    - Modello: ${inputs.selectedModelId} (Posti: ${inputs.parkingSpots})
    - OPZIONI INSTALLAZIONE:
      * Installazione PF (Pannelli Fotovoltaici): ${inputs.includePV ? 'Sì' : 'No'}
      * Installazione Guarnizioni: ${inputs.includeGaskets ? 'Sì' : 'No'}
      * Installazione Telo: ${inputs.includeFabric ? 'Sì' : 'No'}
      * Installazione Pannelli Coibentati: ${inputs.includeInsulatedPanels ? 'Sì' : 'No'}
      * Installazione Zavorre: ${inputs.includeBallast ? 'Sì' : 'No'} (Qtà: ${ballastCount}, Peso Tot stimato: ${estBallastWeight} kg)
    - Muletto Cliente (già in loco): ${inputs.hasForklift ? 'Sì' : 'No'}
    - Ore Man-Hour Totali Stimate dal sistema: ${inputs.calculatedHours} (Usa questo come base lavoro)
    - Rientro nel Weekend? ${inputs.returnOnWeekends ? 'Sì' : 'No'}
    - Sconto Cliente Applicabile (Quantità): ${inputs.discountPercent || 0}%
    - Note Aggiuntive: ${inputs.additionalNotes}

    METRICHE NASCOSTE (DA USARE MA NON RIVELARE):
    - Margine Commerciale Target: ${inputs.marginPercent}%
    - Costo Extra Orario: €${inputs.extraHourlyCost}
    - Costo Extra Giornaliero: €${inputs.extraDailyCost}

    REGOLE DI BUSINESS:
    ${BASE_BUSINESS_RULES}
    ${LOGISTICS_RULES}
    
    ${customConfigString}
    ${logisticsCostsString}
    ${modelsSpecsString}

    LOGICA LOGISTICA (CRUCIALE):
    1. Calcola il PESO TOTALE del materiale (Struttura + Zavorre) usando i dati della Knowledge Base se disponibili (es. PESO_STRUTTURA, PESO_ZAVORRE).
    2. Determina i mezzi necessari (Furgone, Bilico, Camion Gru) basandoti sui limiti di peso (240q, 160q).
    3. Se ci sono Zavorre e il cliente NON ha il muletto, DEVI inserire il costo NOLEGGIO MULETTO (700€ base + 120€/gg extra).
    4. Cerca Hotel (solo per squadra interna) entro un raggio di 15km dal cantiere.
    
    IMPORTANTE - PRIORITÀ AI COSTI TABELLARI:
    - Se nella sezione "COSTI LOGISTICA PER PROVINCIA" sono presenti costi per Bilico o Gru, DEVI USARE ESATTAMENTE QUELLI. 
    - Ignora stime generiche di mercato se hai il dato tabellare per la provincia.
    - Se il costo tabellare è €500, usa €500.

    LOGICA WEEKEND (DATA-AWARE):
    - Controlla se l'intervallo di date (${inputs.startDate} per ${inputs.durationDays} giorni) include sabati/domeniche.
    - Se sì E "Rientro nel Weekend" è attivo, applica i costi di viaggio A/R extra.
    - Se no (es. lunedì-venerdì), ignora l'opzione Rientro Weekend.
    
    LOGICA SCONTO (OTTIMIZZAZIONE PREZZO):
    - Calcola il Costo Totale.
    - Calcola il Margine Target per ottenere il Prezzo di Vendita Lordo.
    - Se è presente uno "Sconto Cliente Applicabile" (>0%), applicalo al Prezzo di Vendita Lordo per ottenere il Prezzo di Vendita Finale.
    - Mostra chiaramente che è stato applicato uno sconto volume nel reasoning, ma il salesPrice finale deve essere quello scontato.

    SCENARIO A: SQUADRA INTERNA
    - Calcola Viaggio (Km * CostoKm + Autostrada + Tempo Tecnici).
    - Hotel se giorni > 1.
    - Spostamenti locali: (15km * 4 * giorni) * costo km.

    SCENARIO B: SQUADRA ESTERNA
    - (Ore Totali * Tariffa Oraria Esterna).
    - STOP. Nessun costo viaggio, hotel o vitto per esterni. Costi 100% a loro carico.

    OUTPUT REQUIREMENT: 
    - Nel "logisticsSummary", scrivi esplicitamente "MEZZO TRASPORTO: [Bilico/Camion Gru/Furgone]".
    - Crea una voce di costo separata chiamata "Trasporto Materiale (Bilico/Gru)" sotto la categoria "Viaggio" se applicabile.
    - NON scrivere esplicitamente "Margine del X%" nel testo. Dai solo il valore finale in euro.
    - PULIZIA: NON INCLUDERE flag tecnici come "(IncludeBallast=true)" o "(No Customer Forklift)" nella descrizione testuale. Descrivi la situazione in italiano naturale (es. "Incluso costo muletto poiché non presente in loco").

    OUTPUT JSON:
    {
      "options": [
        {
          "id": "opt_1",
          "methodName": "Descrizione Metodo (es. Camion Gru + Squadra Esterna)",
          "logisticsSummary": "Dettaglio peso tot, mezzi scelti, regola autista, regola muletto, regola week-end",
          "breakdown": [
            { "category": "Lavoro", "description": "...", "amount": 0 },
            { "category": "Viaggio", "description": "...", "amount": 0 },
            { "category": "Vitto/Alloggio", "description": "...", "amount": 0 }
          ],
          "totalCost": 0,
          "salesPrice": 0,
          "marginAmount": 0
        }
      ],
      "commonReasoning": "Spiegazione logica scelte."
    }
  `;

  try {
    // 120s timeout for the Pro model
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout calcolo AI (120s).")), 120000)
    );

    const generatePromise = ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const response = await Promise.race([generatePromise, timeoutPromise]) as any;
    
    console.log("AI Response:", response.text);
    const parsed = cleanAndParseJSON(response.text);

    parsed.options.forEach((opt: any) => {
        opt.totalCost = Number(opt.totalCost) || 0;
        opt.salesPrice = Number(opt.salesPrice) || 0;
        opt.marginAmount = Number(opt.marginAmount) || 0;
        opt.breakdown.forEach((item: any) => {
            item.amount = Number(item.amount) || 0;
        });
    });

    return parsed;

  } catch (e: any) {
    console.error("AI Generation Error:", e);
    
    let msg = e.message || String(e);

    // Attempt to extract cleaner error message from Google's JSON error structure if present
    if (msg.includes('{') && msg.includes('error')) {
        try {
            const match = msg.match(/{.*}/s); // simplistic JSON extraction
            if (match) {
                const errObj = JSON.parse(match[0]);
                if (errObj.error?.message) {
                    msg = errObj.error.message;
                }
            }
        } catch (jsonErr) {
            // ignore parsing error, use original msg
        }
    }

    const lowerMsg = msg.toLowerCase();

    // Critical Error: Leaked API Key
    if (lowerMsg.includes("leaked") || lowerMsg.includes("permission_denied") || msg.includes("403")) {
        throw new Error("LA TUA CHIAVE API È STATA BLOCCATA DA GOOGLE (Leaked Key). Per sicurezza Google l'ha disattivata perchè rilevata in pubblico. Generane una nuova su AI Studio e aggiornala nelle Impostazioni.");
    }
    
    // Fallback logic for Timeout, Quota (429), or Resource Exhausted
    // This catches "Timeout calcolo AI (120s)", "429", "quota", "resource exhausted"
    if (
        lowerMsg.includes("429") || 
        lowerMsg.includes("quota") || 
        lowerMsg.includes("timeout") || 
        lowerMsg.includes("resource_exhausted") ||
        lowerMsg.includes("limit")
    ) {
         console.warn("Pro model failed (Quota/Timeout), falling back to Flash. Reason:", msg);
         if (onStatusUpdate) onStatusUpdate("Modello Pro occupato, passaggio automatico a Flash...");
         
         try {
            const fallbackResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: { 
                    responseMimeType: "application/json"
                    // IMPORTANT: Do NOT send thinkingConfig to Flash
                }
            });
            const fallbackParsed = cleanAndParseJSON(fallbackResponse.text);
            return fallbackParsed;
         } catch (fallbackError: any) {
             console.error("Fallback failed:", fallbackError);
             throw new Error(`Errore anche col modello di riserva: ${fallbackError.message}`);
         }
    }

    throw new Error(`Errore calcolo AI: ${msg}`);
  }
};
