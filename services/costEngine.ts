
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
    for (const kw of keywords) {
        const match = availableKeys.find(k => k.includes(kw));
        if (match && costs[match] > 0) {
            return { name: match, cost: costs[match] };
        }
    }

    // 2. Loose Search (Strip spaces/symbols)
    for (const kw of keywords) {
        const cleanKw = looseNormalize(kw);
        const match = availableKeys.find(k => looseNormalize(k).includes(cleanKw));
        if (match && costs[match] > 0) {
            return { name: match, cost: costs[match] };
        }
    }

    return null;
};

// --- VEHICLE CONSTANTS & KEYWORDS ---
const MAX_WEIGHT_FURGONE = 1000;
const MAX_WEIGHT_GRU = 16000;
const MAX_WEIGHT_BILICO = 24000;

const BILICO_KEYWORDS = [
    "BILICO CARICO COMPLETO", 
    "AUTOARTICOLATO",
    "BILICO",
    "TIR",
    "13.60",
    "24T"
];

const GRU_KEYWORDS = [
    "CAMION CON GRU E SCARICO",
    "CAMION GRU", 
    "MOTRICE GRU", 
    "GRU"
];

const MOTRICE_KEYWORDS = [
    "MOTRICE", 
    "DEDICATO", 
    "CAMION"
];

// Helper to look up dynamic params from config or use defaults
const getParam = (config: AppConfig, keys: string[], defaultVal: number): number => {
    for (const key of keys) {
        // Try strict match
        if (config.customParams[key]) return config.customParams[key].value;
        // Try loose match
        const found = Object.keys(config.customParams).find(k => k.toUpperCase().includes(key.toUpperCase()));
        if (found) return config.customParams[found].value;
    }
    return defaultVal;
};

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

    // --- CALCULATE VAN COST PER KM (RIGOROUS) ---
    // Formula: (FuelPrice / KmPerLiter) + Wear + Tolls
    const kmPerLiter = getParam(config, ['KM_PER_LITRO_FURGONE', 'KM_LITRO', 'CONSUMO_FURGONE'], 11);
    const fuelPrice = getParam(config, ['COSTO_MEDIO_GASOLIO_EURO_LITRO', 'PREZZO_GASOLIO', 'COSTO_GASOLIO'], 1.80);
    const wearCost = getParam(config, ['COSTO_USURA_MEZZO_EURO_KM', 'USURA_MEZZO', 'USURA'], 0.037);
    const tollCost = getParam(config, ['COSTO_AUTOSTRADA_EURO_KM', 'AUTOSTRADA', 'PEDAGGI'], 0.09); // Default Italian highway avg if missing

    const fuelCostPerKm = kmPerLiter > 0 ? (fuelPrice / kmPerLiter) : 0.16;
    const vanCostPerKm = fuelCostPerKm + wearCost + tollCost;

    debugBuffer += `--- COSTO FURGONE ---\n`;
    debugBuffer += `Parametri: ${kmPerLiter} km/l, €${fuelPrice}/l Gasolio, €${wearCost}/km Usura, €${tollCost}/km Autostrada\n`;
    debugBuffer += `Calcolo: (€${fuelPrice} / ${kmPerLiter}) + ${wearCost} + ${tollCost} = €${vanCostPerKm.toFixed(3)}/km\n`;

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

        // Travel (Company Vehicle for Techs)
        if (inputs.transportMode === TransportMode.COMPANY_VEHICLE) {
            // Check weekend return
            let numberOfRoundTrips = 1;
            if (inputs.returnOnWeekends || (hasWeekendOverlap(inputs.startDate, days) && days > 5)) {
                isWeekendReturnApplied = true;
                const weeks = Math.floor(days / 5);
                numberOfRoundTrips = 1 + weeks;
                travelLog += `• Rientro Weekend applicato: ${numberOfRoundTrips} viaggi A/R.\n`;
            }

            const totalKm = distanceKm * 2 * numberOfRoundTrips;
            internalTravelCost = totalKm * vanCostPerKm;
            
            travelLog += `• Mezzi Aziendali (Tecnici): ${totalKm.toFixed(0)} km * €${vanCostPerKm.toFixed(2)}/km = €${internalTravelCost.toFixed(2)}.\n`;
            travelLog += `  (Dettaglio Km: Gasolio €${fuelCostPerKm.toFixed(2)} + Usura €${wearCost.toFixed(3)} + Pedaggi €${tollCost.toFixed(2)})\n`;

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
         categoryExplanations["Lavoro"] += `• Esterni (All-in): ${externalLaborHours.toFixed(1)}h * €${config.externalHourlyRate} = €${externalLaborCost.toFixed(2)}.\n`;
    }

    // --- 5. LOGISTICS (The complex part) ---
    let materialTransportCost = 0;
    let forkliftCost = 0;
    let logisticsMethod = "Nessuno";

    // Weight Calculation
    const weightData = calculateTotalWeight(
        inputs.selectedModelId || '', 
        inputs.parkingSpots || 0, 
        inputs.includeBallast || false, 
        inputs.modelsConfig || null
    );
    const totalWeightKg = weightData.total;
    debugBuffer += `Peso Calcolato: ${totalWeightKg} kg (Strut: ${weightData.structure}, Zav: ${weightData.ballast})\n`;
    logisticsLog += `• Peso Totale Materiale: ${totalWeightKg.toLocaleString()} kg.\n`;

    // Determine Province Cost Row
    let provinceCosts: Record<string, number> | undefined;
    if (inputs.logisticsConfig && inputs.destinationProvince) {
        provinceCosts = inputs.logisticsConfig[inputs.destinationProvince];
    }

    // --- VEHICLE SELECTION LOGIC (STRICT) ---
    // User Rules:
    // Furgone: <= 1000kg
    // Camion Gru: > 1000kg AND <= 16000kg
    // Bilico: > 16000kg (Max 24000kg)
    
    let vehicleType = "FURGONE"; 
    
    if (totalWeightKg <= MAX_WEIGHT_FURGONE) {
        vehicleType = "FURGONE";
        debugBuffer += `Veicolo: FURGONE (Peso <= ${MAX_WEIGHT_FURGONE}kg)\n`;
    } else if (totalWeightKg <= MAX_WEIGHT_GRU) {
        vehicleType = "GRU";
        debugBuffer += `Veicolo: GRU (Peso > 1000kg e <= ${MAX_WEIGHT_GRU}kg)\n`;
    } else {
        vehicleType = "BILICO";
        debugBuffer += `Veicolo: BILICO (Peso > ${MAX_WEIGHT_GRU}kg)\n`;
    }

    logisticsLog += `• Mezzo Richiesto: ${vehicleType}.\n`;

    // --- COST LOOKUP ---
    if (vehicleType === "FURGONE") {
        // Se il materiale sta nel furgone...
        if (inputs.transportMode === TransportMode.COMPANY_VEHICLE && internalTechs > 0) {
            // Se i tecnici vanno col furgone, il materiale viaggia con loro.
            materialTransportCost = 0;
            logisticsMethod = "Furgone Aziendale (Con Tecnici)";
            logisticsLog += `• Materiale caricato su furgone tecnici (Costo incluso nel viaggio personale).\n`;
        } else {
            // Se i tecnici non usano il furgone (es. Treno/Aereo), dobbiamo mandare un furgone apposta per il materiale?
            // Assumiamo spedizione dedicata con il nostro furgone.
            const totalKm = distanceKm * 2; 
            materialTransportCost = totalKm * vanCostPerKm;
            logisticsMethod = "Furgone Aziendale (Dedicato)";
            logisticsLog += `• Spedizione dedicata Furgone: ${totalKm.toFixed(0)}km * €${vanCostPerKm.toFixed(2)} = €${materialTransportCost.toFixed(2)}.\n`;
            logisticsLog += `  (Usa parametri consumo furgone aziendale come sopra).\n`;
        }
    } else if (provinceCosts) {
        // Mezzi Pesanti (GRU o BILICO) -> Tabella Logistica
        let match: { name: string, cost: number } | null = null;
        let searchKeywords: string[] = [];

        if (vehicleType === "BILICO") {
            searchKeywords = BILICO_KEYWORDS;
            match = findCostInTable(provinceCosts, searchKeywords);
        } else if (vehicleType === "GRU") {
            searchKeywords = GRU_KEYWORDS;
            match = findCostInTable(provinceCosts, searchKeywords);
            // Fallback to Motrice if GRU specific not found but Motrice is
            if (!match) match = findCostInTable(provinceCosts, MOTRICE_KEYWORDS);
        }

        if (match) {
            materialTransportCost = match.cost;
            logisticsMethod = `${vehicleType} (Da Tabella)`;
            logisticsLog += `• Costo Trasporto Tabellare: €${match.cost.toFixed(2)} (Colonna: ${match.name}).\n`;
            
            if (vehicleType === "GRU") {
                logisticsLog += `• (Nota: Questo costo include anche vitto/alloggio autista).\n`;
            }
            
            debugBuffer += `MATCH TABELLA: €${match.cost}\n`;
        } else {
            // Fallback only if table lookup fails for heavy vehicles
            debugBuffer += `MISSING IN TABLE for ${vehicleType}. Fallback Estimate.\n`;
            const ratePerKm = vehicleType === 'BILICO' ? 2.5 : 1.8;
            materialTransportCost = distanceKm * 2 * ratePerKm;
            logisticsMethod = `${vehicleType} (STIMA - Dato mancante)`;
            logisticsLog += `• ! DATO MANCANTE IN TABELLA ! Stima chilometrica: €${materialTransportCost.toFixed(2)}.\n`;
        }
    } else {
         logisticsLog += `• Provincia non trovata per Logistica. Uso stima.\n`;
         // Fallback logic for unknown province
         const ratePerKm = vehicleType === 'BILICO' ? 2.5 : (vehicleType === 'GRU' ? 1.8 : 0.6);
         materialTransportCost = distanceKm * 2 * ratePerKm;
         logisticsMethod = `${vehicleType} (STIMA)`;
    }

    // Forklift Logic
    // If we use BILICO (without Crane) and customer has NO forklift, we rent one.
    // If we use GRU, the crane does the job.
    if (!inputs.hasForklift && vehicleType !== "GRU" && vehicleType !== "FURGONE") {
        forkliftCost = 350 * days; 
        logisticsLog += `• Noleggio Muletto in loco: €${forkliftCost} (Cliente sprovvisto).\n`;
    }

    if (inputs.excludeOriginTransfer) {
        if (materialTransportCost > 0) {
            logisticsLog += `• (Trasporto materiale €${materialTransportCost} stornato su richiesta utente).\n`;
            materialTransportCost = 0;
            logisticsMethod = "Ritiro Cliente (Ex Works)";
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
