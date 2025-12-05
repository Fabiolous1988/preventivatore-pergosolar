import { EstimateInputs, AppConfig, ModelsConfig, LogisticsConfig, TransportMode, ComputedCosts } from "../types";

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

// Helper to find a value in the province record with flexible key matching
const findCostInTable = (costs: Record<string, number>, keywords: string[]): { name: string, cost: number } | null => {
    if (!costs) return null;
    const availableKeys = Object.keys(costs);
    
    for (const kw of keywords) {
        const match = availableKeys.find(k => k.toUpperCase().includes(kw));
        if (match && costs[match] > 0) {
            return { name: match, cost: costs[match] };
        }
    }
    return null;
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
        
        // Per Diem
        internalPerDiemCost = 50 * days * internalTechs;
        livingLog += `• Vitto: €50 * ${days}gg * ${internalTechs} pers = €${internalPerDiemCost.toFixed(2)}.\n`;

        // Hotel
        let nights = Math.max(0, Math.ceil(days) - 1);
        if (inputs.returnOnWeekends && hasWeekendOverlap(inputs.startDate, days)) {
            // Assume returning home saves 2 hotel nights but costs travel
            nights = Math.max(0, nights - 2); 
            isWeekendReturnApplied = true;
            livingLog += `• Hotel: Notti ridotte per rientro weekend.\n`;
        }
        internalHotelCost = nights * 80 * internalTechs;
        livingLog += `• Hotel: ${nights} notti * €80 * ${internalTechs} pers = €${internalHotelCost.toFixed(2)}.\n`;

        // Tech Travel (Van)
        if (inputs.transportMode === TransportMode.COMPANY_VEHICLE) {
            let trips = 1; 
            if (isWeekendReturnApplied) trips = 2;
            
            const totalDist = distanceKm * 2 * trips;
            const fuel = totalDist * 0.45; // €0.45/km van cost
            const tolls = (distanceKm / 10) * 2 * trips; // approx tolls
            internalTravelCost = fuel + tolls;
            
            const totalTravelHours = travelTimeOneWay * 2 * trips;
            internalTravelTimeCost = totalTravelHours * config.internalHourlyRate * internalTechs;
            
            travelLog += `• Furgone Tecnici: ${totalDist}km totali (${trips} viaggi A/R).\n`;
            travelLog += `  - Costo Km+Pedaggi: €${internalTravelCost.toFixed(2)}.\n`;
            travelLog += `  - Costo Tempo Guida: €${internalTravelTimeCost.toFixed(2)} (${totalTravelHours.toFixed(1)}h tot).\n`;
        } else {
            // Public Transport
            const ticketCost = (distanceKm * 0.15) * 2 * internalTechs;
            internalTravelCost = ticketCost;
            internalTravelTimeCost = (travelTimeOneWay * 2) * config.internalHourlyRate * internalTechs;
            travelLog += `• Mezzi Pubblici: Biglietti €${ticketCost.toFixed(2)} + Tempo €${internalTravelTimeCost.toFixed(2)}.\n`;
        }
    }

    // --- 4. EXTERNAL COSTS ---
    const externalLaborCost = externalLaborHours * config.externalHourlyRate;
    if (externalTechs > 0) {
        laborLog += `• Esterni: ${externalLaborHours.toFixed(1)}h * €${config.externalHourlyRate} = €${externalLaborCost.toFixed(2)}.\n`;
    }

    // --- 5. LOGISTICS & HEAVY TRANSPORT (THE CRITICAL PART) ---
    let forkliftCost = 0;
    let materialTransportCost = 0;
    let logisticsMethod = "Furgone Aziendale (Materiale Leggero)";

    // Forklift
    if (inputs.includeBallast && !inputs.hasForklift) {
        forkliftCost = 700 + (Math.max(0, days - 5) * 120);
        logisticsLog += `• Noleggio Muletto: €${forkliftCost.toFixed(2)}.\n`;
    }

    // --- WEIGHT CALCULATION ---
    const spots = inputs.parkingSpots || 0;
    const ballastWeight = inputs.includeBallast ? (spots * 1600) : 0; 
    const structureWeight = spots * 200; // Est. 200kg/spot
    const totalWeightKg = ballastWeight + structureWeight;

    logisticsLog += `• Peso Totale: ${totalWeightKg.toLocaleString()} kg (Struttura: ${structureWeight}, Zavorre: ${ballastWeight}).\n`;

    // --- PROVINCE LOOKUP ---
    // Try to extract province (XX) from destination string
    // Regex looks for 2 uppercase letters bounded by word boundaries
    const provMatch = inputs.destination.match(/\b([A-Za-z]{2})\b/); 
    const destProv = provMatch ? provMatch[1].toUpperCase() : "??";
    
    logisticsLog += `• Provincia Destinazione rilevata: "${destProv}".\n`;

    let tableCosts = null;
    if (inputs.logisticsConfig && destProv !== "??") {
        // Find province key handling whitespace
        const provKey = Object.keys(inputs.logisticsConfig).find(k => k.trim().toUpperCase() === destProv);
        if (provKey) {
            tableCosts = inputs.logisticsConfig[provKey];
        } else {
            logisticsLog += `! ATTENZIONE: Provincia ${destProv} non trovata nel CSV Logistica.\n`;
        }
    }

    // --- VEHICLE SELECTION LOGIC ---
    if (totalWeightKg > 1500) {
        // Needs heavy transport
        let vehicleType = "";
        let foundOption = null;

        if (totalWeightKg > 22000) {
            // > 22 tons -> BILICO
            vehicleType = "BILICO";
            if (tableCosts) foundOption = findCostInTable(tableCosts, ['BILICO', 'AUTOARTICOLATO']);
        } else if (totalWeightKg > 6000) {
            // > 6 tons -> MOTRICE / CAMION GRU
            vehicleType = "MOTRICE/GRU";
            if (tableCosts) foundOption = findCostInTable(tableCosts, ['MOTRICE', 'GRU', 'CAMION']);
        } else {
            // > 1.5 tons -> Small Truck
            vehicleType = "MOTRICE/CAMIONCINO";
            if (tableCosts) foundOption = findCostInTable(tableCosts, ['MOTRICE', 'CAMION', 'CORRIERE']);
        }

        if (foundOption) {
            materialTransportCost = foundOption.cost;
            logisticsMethod = `Mezzo Pesante: ${foundOption.name} (Tabella)`;
            logisticsLog += `• Mezzo Selezionato: ${foundOption.name} (Costo Tabella: €${materialTransportCost}).\n`;
        } else {
            // Fallback estimation if table lookup failed
            const rate = totalWeightKg > 22000 ? 2.5 : 1.6;
            materialTransportCost = Math.max(350, (distanceKm * rate) + 200);
            logisticsMethod = `${vehicleType} (Stima Km)`;
            logisticsLog += `! Costo tabella non trovato per ${vehicleType} a ${destProv}. Usata stima su km: €${materialTransportCost.toFixed(2)}.\n`;
        }
    } else {
        logisticsLog += `• Peso < 1500kg: Materiale trasportato con furgoni tecnici o corriere espresso (incluso/marginale).\n`;
    }

    // --- 6. TOTALS ---
    const totalCost = 
        internalLaborCost + 
        internalTravelCost + 
        internalTravelTimeCost + 
        internalHotelCost + 
        internalPerDiemCost + 
        externalLaborCost + 
        forkliftCost + 
        materialTransportCost;

    let marginDec = config.defaultMargin / 100;
    const salesPrice = totalCost / (1 - marginDec);
    const discountVal = salesPrice * ((inputs.discountPercent || 0) / 100);
    const finalSalesPrice = salesPrice - discountVal;
    const marginAmount = finalSalesPrice - totalCost;

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
        salesPrice: finalSalesPrice,
        marginAmount,
        isWeekendReturnApplied,
        activeTechs: totalTechs,
        totalManHours: internalLaborHours + externalLaborHours,
        logisticsMethod,
        categoryExplanations: {
            "Lavoro": laborLog,
            "Viaggio": travelLog,
            "Vitto/Alloggio": livingLog,
            "Altro": logisticsLog,
            "Viaggio/Logistica": travelLog + "\n" + logisticsLog
        }
    };
};