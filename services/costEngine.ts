
import { EstimateInputs, AppConfig, ModelsConfig, LogisticsConfig, TransportMode, ComputedCosts } from "../types";
import { calculateTotalWeight } from "./calculator";

// Helper to check if a date range includes a weekend (Saturday or Sunday)
const hasWeekendOverlap = (startDate: string, durationDays: number): boolean => {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return false;
    
    const end = new Date(start);
    end.setDate(start.getDate() + Math.ceil(durationDays));
    
    const curr = new Date(start);
    while (curr < end) {
        const day = curr.getDay();
        if (day === 0 || day === 6) return true;
        curr.setDate(curr.getDate() + 1);
    }
    return false;
};

// Helper to normalize strings for loose matching (removes spaces and symbols)
// E.g. "BILICO  CARICO" -> "BILICOCARICO"
const looseNormalize = (str: string) => str.replace(/[^A-Z0-9]/gi, '').toUpperCase();

// Helper to find a value in the province record with flexible key matching
const findCostInTable = (costs: Record<string, number>, keywords: string[]): { name: string, cost: number } | null => {
    if (!costs) return null;
    const availableKeys = Object.keys(costs);
    
    // 1. Strict "Includes" Search (Exact text priority)
    // Cerca esattamente "BILICO CARICO COMPLETO"
    for (const kw of keywords) {
        const match = availableKeys.find(k => k.includes(kw));
        if (match && costs[match] > 0) {
            return { name: match, cost: costs[match] };
        }
    }

    // 2. Loose Search (Strip spaces/symbols)
    // Cerca "BILICOCARICOCOMPLETO" dentro "BILICO_CARICO_COMPLETO" o spazi doppi
    for (const kw of keywords) {
        const cleanKw = looseNormalize(kw);
        const match = availableKeys.find(k => looseNormalize(k).includes(cleanKw));
        if (match && costs[match] > 0) {
            return { name: match, cost: costs[match] };
        }
    }

    return null;
};

// KEYWORDS LISTS - Updated with User Requirements
const BILICO_KEYWORDS = [
    "BILICO CARICO COMPLETO", // USER PRIORITY
    "AUTOARTICOLATO",
    "BILICO",
    "TIR",
    "13.60",
    "24T"
];

const GRU_KEYWORDS = [
    "CAMION CON GRU E SCARICO", // USER PRIORITY
    "CAMION GRU", 
    "MOTRICE GRU", 
    "GRU"
];

const MOTRICE_KEYWORDS = [
    "MOTRICE", 
    "DEDICATO", 
    "CAMION"
];

export const calculateDeterministicCosts = (
    inputs: EstimateInputs,
    config: AppConfig,
    distanceKm: number,
    durationText: string
): ComputedCosts => {
    
    let laborLog = "";
    let travelLog = "";
    let livingLog = "";
    let logisticsLog = "";
    const categoryExplanations: Record<string, string> = {};
    
    let debugBuffer = `=== DEBUG DIAGNOSTIC (Generato il ${new Date().toLocaleTimeString()}) ===\n`;
    debugBuffer += `Inputs: Prov Destinazione="${inputs.destinationProvince}", Model="${inputs.selectedModelId}", Posti=${inputs.parkingSpots}\n`;

    // --- 1. DURATION & DISTANCE ---
    let travelTimeOneWay = 0;
    const hoursMatch = durationText.match(/(\d+)\s*(?:h|ora|ore)/i);
    const minsMatch = durationText.match(/(\d+)\s*min/i);
    if (hoursMatch) travelTimeOneWay += parseInt(hoursMatch[1]);
    if (minsMatch) travelTimeOneWay += parseInt(minsMatch[1]) / 60;
    
    if (travelTimeOneWay === 0 && distanceKm > 0) {
        travelTimeOneWay = distanceKm / 80; // 80km/h avg
        travelLog += `• Durata stima su km (${distanceKm}km / 80km/h): ${travelTimeOneWay.toFixed(1)}h.\n`;
    } else {
        travelLog += `• Durata da Maps: ${durationText}.\n`;
    }

    // --- 2. LABOR CALCULATION ---
    const days = inputs.durationDays;
    const internalTechs = inputs.useInternalTeam ? inputs.internalTechs : 0;
    const externalTechs = inputs.useExternalTeam ? inputs.externalTechs : 0;
    const totalTechs = internalTechs + externalTechs;

    let internalLaborHours = inputs.internalHours && inputs.internalHours > 0 
        ? inputs.internalHours 
        : days * 8 * internalTechs;

    let externalLaborHours = inputs.externalHours && inputs.externalHours > 0 
        ? inputs.externalHours 
        : days * 8 * externalTechs;

    // --- 3. INTERNAL COSTS ---
    let internalTravelCost = 0;
    let internalTravelTimeCost = 0;
    let internalHotelCost = 0;
    let internalPerDiemCost = 0;
    const internalLaborCost = internalLaborHours * config.internalHourlyRate;
    let isWeekendReturnApplied = false;

    if (internalTechs > 0) {
        laborLog += `• Interni: ${internalLaborHours.toFixed(1)}h * €${config.internalHourlyRate} = €${internalLaborCost.toFixed(2)}.\n`;
        
        // Per Diem (Vitto)
        internalPerDiemCost = 50 * days * internalTechs;
        livingLog += `• Vitto: €50 * ${days}gg * ${internalTechs} tecnici = €${internalPerDiemCost}.\n`;

        // Hotel
        if (days > 1) {
            const nights = Math.ceil(days - 1);
            internalHotelCost = 100 * nights * internalTechs; // 100 euro/night approx
            livingLog += `• Hotel: €100 * ${nights} notti * ${internalTechs} tecnici = €${internalHotelCost}.\n`;
        }

        // Travel (Company Vehicle)
        if (inputs.transportMode === TransportMode.COMPANY_VEHICLE) {
            const fuelTollRate = 0.45; // Euro/km
            // Check weekend return
            let numberOfRoundTrips = 1;
            if (inputs.returnOnWeekends || (hasWeekendOverlap(inputs.startDate, days) && days > 5)) {
                isWeekendReturnApplied = true;
                // Add a round trip for every weekend roughly
                const weeks = Math.floor(days / 5);
                numberOfRoundTrips = 1 + weeks;
                travelLog += `• Rientro Weekend applicato: ${numberOfRoundTrips} viaggi A/R.\n`;
            }

            const totalKm = distanceKm * 2 * numberOfRoundTrips;
            internalTravelCost = totalKm * fuelTollRate;
            travelLog += `• Mezzi Aziendali: ${totalKm.toFixed(0)} km totali * €${fuelTollRate}/km = €${internalTravelCost.toFixed(2)}.\n`;

            // Travel Time Cost for Techs (Hourly rate while driving)
            const totalTravelHours = travelTimeOneWay * 2 * numberOfRoundTrips * internalTechs;
            internalTravelTimeCost = totalTravelHours * config.internalHourlyRate;
            travelLog += `• Tempo Guida Tecnici: ${totalTravelHours.toFixed(1)}h totali * €${config.internalHourlyRate} = €${internalTravelTimeCost.toFixed(2)}.\n`;
        }
    }
    
    // Save Explanation
    categoryExplanations["Lavoro"] = laborLog;
    categoryExplanations["Vitto/Alloggio"] = livingLog;
    
    // --- 4. EXTERNAL COSTS (Fixed Rate) ---
    const externalLaborCost = externalLaborHours * config.externalHourlyRate;
    if (externalTechs > 0) {
         // Append to labor log
         categoryExplanations["Lavoro"] += `• Esterni (All-in): ${externalLaborHours.toFixed(1)}h * €${config.externalHourlyRate} = €${externalLaborCost.toFixed(2)}.\n`;
    }

    // --- 5. LOGISTICS (The complex part) ---
    let materialTransportCost = 0;
    let forkliftCost = 0;
    let logisticsMethod = "Nessuno";

    // Debugging Logistics Config
    if (!inputs.logisticsConfig) {
        debugBuffer += "ERRORE: logisticsConfig non caricato.\n";
    } else {
        debugBuffer += "LogisticsConfig presente.\n";
    }

    // Determine Province Cost Row
    let provinceCosts: Record<string, number> | undefined;
    if (inputs.logisticsConfig && inputs.destinationProvince) {
        // Try strict
        provinceCosts = inputs.logisticsConfig[inputs.destinationProvince];
        debugBuffer += `Ricerca Provincia '${inputs.destinationProvince}': ${provinceCosts ? 'TROVATA' : 'NON TROVATA'}.\n`;
        
        if (provinceCosts) {
            debugBuffer += `Colonne disponibili per ${inputs.destinationProvince}: ${Object.keys(provinceCosts).join(", ")}\n`;
        } else {
            // Fallback try find similar
            const allProvs = Object.keys(inputs.logisticsConfig);
            debugBuffer += `Province disponibili (prime 10): ${allProvs.slice(0, 10).join(", ")}...\n`;
            // Check if user is searching for SIG (VR) but only Full names exist?
            const maybeFull = allProvs.find(p => p.includes(inputs.destinationProvince!));
            if (maybeFull) {
                 debugBuffer += `SUGGERIMENTO: Trovata chiave simile '${maybeFull}'. Il CSV usa nomi estesi invece di SIG?\n`;
            }
        }
    }

    // Weight Calculation
    const weightData = calculateTotalWeight(
        inputs.selectedModelId || '', 
        inputs.parkingSpots || 0, 
        inputs.includeBallast || false, 
        inputs.modelsConfig || null
    );
    const totalWeightKg = weightData.total;
    logisticsLog += `• Peso Totale Stimato: ${totalWeightKg.toLocaleString()} kg (Struttura: ${weightData.structure} + Zavorre: ${weightData.ballast}).\n`;

    // Logic for Vehicle Selection
    let vehicleType = "FURGONE"; 
    // Thresholds
    if (totalWeightKg > 16000) {
        vehicleType = "BILICO";
    } else if (totalWeightKg > 1500) {
        // Heavy but not full truck load
        if (inputs.hasForklift) {
            vehicleType = "MOTRICE"; // Standard truck, customer unloads
        } else {
            vehicleType = "GRU"; // Truck with crane needed
        }
    }

    logisticsLog += `• Veicolo Selezionato: ${vehicleType} (in base a peso e muletto).\n`;

    // Lookup Cost
    if (provinceCosts) {
        let match: { name: string, cost: number } | null = null;
        let searchKeywords: string[] = [];

        if (vehicleType === "BILICO") {
            searchKeywords = BILICO_KEYWORDS;
            match = findCostInTable(provinceCosts, searchKeywords);
        } else if (vehicleType === "GRU") {
            searchKeywords = GRU_KEYWORDS;
            match = findCostInTable(provinceCosts, searchKeywords);
        } else if (vehicleType === "MOTRICE") {
            searchKeywords = MOTRICE_KEYWORDS;
            match = findCostInTable(provinceCosts, searchKeywords);
            // Fallback: if motrice not found, check GRU cost as it covers it
            if (!match) match = findCostInTable(provinceCosts, GRU_KEYWORDS);
        }

        debugBuffer += `Ricerca Veicolo '${vehicleType}' con keywords: [${searchKeywords.join(", ")}]\n`;

        if (match) {
            materialTransportCost = match.cost;
            logisticsMethod = `${match.name} (Tabella)`;
            logisticsLog += `• Trovato costo in tabella: €${match.cost} (Colonna: ${match.name}).\n`;
            debugBuffer += `MATCH TROVATO: Colonna="${match.name}" Valore=${match.cost}\n`;
        } else {
            debugBuffer += `NESSUN MATCH trovate nelle colonne. Fallback su stima.\n`;
            logisticsLog += `• DATO MANCANTE NEL CSV: Nessuna colonna corrisponde alle keywords per ${vehicleType}.\n`;
        }
    } else {
         logisticsLog += `• Provincia non trovata nel file Logistica. Uso stima km.\n`;
    }

    // Fallback Estimate if CSV lookup failed
    if (materialTransportCost === 0 && !inputs.excludeOriginTransfer) {
        const ratePerKm = vehicleType === 'BILICO' ? 2.5 : vehicleType === 'GRU' ? 1.8 : 1.2;
        materialTransportCost = distanceKm * 2 * ratePerKm;
        logisticsMethod = `${vehicleType} (STIMA - Dato mancante in CSV)`;
        logisticsLog += `• Costo stimato: ${distanceKm}km * 2 * €${ratePerKm}/km = €${materialTransportCost.toFixed(2)}.\n`;
    }

    // Forklift Rental (if needed and not provided)
    // If vehicle is GRU, we assume unloading is included in transport cost (usually)
    // If vehicle is MOTRICE or BILICO and NO forklift at site, we might need to rent one locally.
    if (!inputs.hasForklift && vehicleType !== "GRU" && vehicleType !== "FURGONE") {
        forkliftCost = 350 * days; // Estimate rental
        logisticsLog += `• Noleggio Muletto/Sollevatore: €350 * ${days}gg = €${forkliftCost} (Cliente sprovvisto).\n`;
    }

    if (inputs.excludeOriginTransfer) {
        // If explicitly excluded, we zero out the material transport
        if (materialTransportCost > 0) {
            logisticsLog += `• (Nota: Trasporto materiale calcolato in €${materialTransportCost} ma ESCLUSO da opzione utente).\n`;
            materialTransportCost = 0;
            logisticsMethod = "Escluso (Ritiro Cliente)";
        }
    }

    categoryExplanations["Viaggio"] = travelLog + logisticsLog;

    // --- 6. TOTALS ---
    const totalCost = 
        internalLaborCost + 
        internalTravelCost + 
        internalTravelTimeCost + 
        internalHotelCost + 
        internalPerDiemCost + 
        externalLaborCost + 
        materialTransportCost + 
        forkliftCost;

    // Sales Price Calculation (Cost / (1 - Margin%))
    // Margin is percentage of SALES PRICE, not markup on cost
    const marginDec = (inputs.marginPercent || 30) / 100;
    let salesPrice = totalCost;
    if (marginDec < 1) {
        salesPrice = totalCost / (1 - marginDec);
    }
    
    // Apply Volume Discount if any
    if (inputs.discountPercent && inputs.discountPercent > 0) {
        const discountAmount = salesPrice * (inputs.discountPercent / 100);
        salesPrice -= discountAmount;
        categoryExplanations["Altro"] = (categoryExplanations["Altro"] || "") + `• Applicato Sconto Volume ${inputs.discountPercent}%: -€${discountAmount.toFixed(2)}\n`;
    }
    
    const marginAmount = salesPrice - totalCost;

    return {
        distanceKm,
        travelDurationHours: travelTimeOneWay,
        
        internalTravelCost,
        internalTravelTimeCost,
        internalHotelCost,
        internalPerDiemCost,
        internalLaborCost,
        
        externalLaborCost,
        
        forkliftCost,
        materialTransportCost,
        
        totalCost,
        salesPrice,
        marginAmount,
        
        isWeekendReturnApplied,
        activeTechs: totalTechs,
        totalManHours: internalLaborHours + externalLaborHours,
        logisticsMethod,
        
        categoryExplanations,
        debugLog: debugBuffer
    };
};
