
import { EstimateInputs, AppConfig, ModelsConfig, LogisticsConfig, TransportMode, ComputedCosts } from "../types";

// Helper to check if a date range includes a weekend (Saturday or Sunday)
const hasWeekendOverlap = (startDate: string, durationDays: number): boolean => {
    const start = new Date(startDate);
    // Safety check
    if (isNaN(start.getTime())) return false;
    
    const end = new Date(start);
    end.setDate(start.getDate() + Math.ceil(durationDays));
    
    // Iterate through days to check for Sat(6) or Sun(0)
    const curr = new Date(start);
    while (curr < end) {
        const day = curr.getDay();
        if (day === 0 || day === 6) return true;
        curr.setDate(curr.getDate() + 1);
    }
    return false;
};

export const calculateDeterministicCosts = (
    inputs: EstimateInputs,
    config: AppConfig,
    distanceKm: number,
    durationText: string // e.g. "3 hours 20 mins"
): ComputedCosts => {
    
    // Initialize Explanation Logs
    let laborLog = "";
    let travelLog = "";
    let livingLog = "";
    let logisticsLog = "";

    // --- 1. PARSE DURATION ---
    let travelTimeOneWay = 0;
    const hoursMatch = durationText.match(/(\d+)\s*(?:h|ora|ore)/i);
    const minsMatch = durationText.match(/(\d+)\s*min/i);
    
    if (hoursMatch) travelTimeOneWay += parseInt(hoursMatch[1]);
    if (minsMatch) travelTimeOneWay += parseInt(minsMatch[1]) / 60;
    
    if (travelTimeOneWay === 0 && distanceKm > 0) {
        travelTimeOneWay = distanceKm / 80; 
        travelLog += `• Durata viaggio stimata su media 80km/h: ${travelTimeOneWay.toFixed(1)} ore.\n`;
    } else {
        travelLog += `• Durata viaggio da Maps: ${durationText}.\n`;
    }

    // --- 2. SETUP BASICS ---
    const days = inputs.durationDays;
    const internalTechs = inputs.useInternalTeam ? inputs.internalTechs : 0;
    const externalTechs = inputs.useExternalTeam ? inputs.externalTechs : 0;
    const totalTechs = internalTechs + externalTechs;
    
    laborLog += `• Durata Cantiere: ${days} giorni lavorativi.\n`;
    
    // --- 3. DETERMINE WORK HOURS (Labor) ---
    let internalLaborHours = 0;
    if (inputs.internalHours !== undefined && inputs.internalHours > 0) {
        internalLaborHours = inputs.internalHours;
        laborLog += `• Ore Interne (Manuale): ${internalLaborHours.toFixed(2)}h totali.\n`;
    } else {
        internalLaborHours = days * 8 * internalTechs;
        laborLog += `• Ore Interne (Stimate): ${days}gg * 8h * ${internalTechs} tecnici = ${internalLaborHours.toFixed(2)}h.\n`;
    }

    let externalLaborHours = 0;
    if (inputs.externalHours !== undefined && inputs.externalHours > 0) {
        externalLaborHours = inputs.externalHours;
        laborLog += `• Ore Esterne (Manuale): ${externalLaborHours.toFixed(2)}h totali.\n`;
    } else {
        externalLaborHours = days * 8 * externalTechs;
        laborLog += `• Ore Esterne (Stimate): ${days}gg * 8h * ${externalTechs} tecnici = ${externalLaborHours.toFixed(2)}h.\n`;
    }

    // --- 4. INTERNAL TEAM COSTS ---
    let internalTravelCost = 0;
    let internalTravelTimeCost = 0;
    let internalHotelCost = 0;
    let internalPerDiemCost = 0;
    let internalLaborCost = 0;
    let isWeekendReturnApplied = false;

    if (internalTechs > 0) {
        // A. Labor
        internalLaborCost = internalLaborHours * config.internalHourlyRate;
        laborLog += `• Costo Interno: ${internalLaborHours.toFixed(2)}h * €${config.internalHourlyRate}/h = €${internalLaborCost.toFixed(2)}.\n`;

        // B. Travel Costs
        if (inputs.transportMode === TransportMode.COMPANY_VEHICLE) {
            const costPerKm = 0.45; 
            const highwayTollEst = (distanceKm / 10) * 1.0; 
            
            let trips = 1; 
            if (inputs.returnOnWeekends && hasWeekendOverlap(inputs.startDate, days)) {
                trips = 2;
                isWeekendReturnApplied = true;
                travelLog += `• Rientro Weekend: Applicato (Viaggi raddoppiati).\n`;
            }

            const totalDistKm = distanceKm * 2 * trips;
            const fuelWearCost = totalDistKm * costPerKm;
            const tollCost = highwayTollEst * 2 * trips;
            internalTravelCost = fuelWearCost + tollCost;
            
            travelLog += `• Veicolo Aziendale (${trips} viaggi A/R):\n`;
            travelLog += `  - Distanza Totale: ${totalDistKm.toFixed(0)} km\n`;
            travelLog += `  - Costo Km (€0.45): €${fuelWearCost.toFixed(2)}\n`;
            travelLog += `  - Pedaggi Stimati: €${tollCost.toFixed(2)}\n`;

            // Travel Time
            const totalTravelHours = travelTimeOneWay * 2 * trips;
            internalTravelTimeCost = totalTravelHours * config.internalHourlyRate * internalTechs;
            travelLog += `• Tempo Guida Tecnici:\n`;
            travelLog += `  - Ore Totali: ${totalTravelHours.toFixed(2)}h * ${internalTechs} tecnici\n`;
            travelLog += `  - Costo: €${internalTravelTimeCost.toFixed(2)}\n`;

        } else {
            // Public Transport
            const ticketCost = (distanceKm * 0.15) * 2 * internalTechs; 
            internalTravelCost = ticketCost;
            travelLog += `• Mezzi Pubblici: Stima biglietti €${ticketCost.toFixed(2)} (${internalTechs} persone A/R).\n`;
            
            const totalTravelHours = travelTimeOneWay * 2;
            internalTravelTimeCost = totalTravelHours * config.internalHourlyRate * internalTechs;
            travelLog += `• Tempo Viaggio (Labor): €${internalTravelTimeCost.toFixed(2)}.\n`;
        }

        // C. Living Costs
        internalPerDiemCost = 50 * days * internalTechs;
        livingLog += `• Diaria/Vitto: €50 * ${days}gg * ${internalTechs} pers. = €${internalPerDiemCost.toFixed(2)}.\n`;

        let nights = Math.max(0, Math.ceil(days) - 1);
        if (isWeekendReturnApplied) {
            nights = Math.max(0, nights - 2);
            livingLog += `• Hotel: Riduzione notti per rientro weekend.\n`;
        }

        const avgHotelPrice = 80;
        internalHotelCost = nights * avgHotelPrice * internalTechs;
        livingLog += `• Hotel: ${nights} notti * €${avgHotelPrice} * ${internalTechs} pers. = €${internalHotelCost.toFixed(2)}.\n`;
        
        // Local Displacement
        if (nights > 0 && inputs.transportMode === TransportMode.COMPANY_VEHICLE) {
            const localDisplacement = (15 * 4 * days * 0.45);
            internalTravelCost += localDisplacement;
            travelLog += `• Spostamenti Locali (Hotel-Cantiere): €${localDisplacement.toFixed(2)}.\n`;
        }
    }

    // --- 5. EXTERNAL TEAM COSTS ---
    let externalLaborCost = 0;
    if (externalTechs > 0) {
        externalLaborCost = externalLaborHours * config.externalHourlyRate;
        laborLog += `• Costo Esterno (All-in): ${externalLaborHours.toFixed(2)}h * €${config.externalHourlyRate}/h = €${externalLaborCost.toFixed(2)}.\n`;
    }

    // --- 6. LOGISTICS & EXTRAS ---
    let forkliftCost = 0;
    let materialTransportCost = 0;
    let logisticsMethod = "Furgone Aziendale (Standard)";

    // Forklift Rule
    if (inputs.includeBallast && !inputs.hasForklift) {
        forkliftCost = 700;
        let extraText = "";
        if (days > 5) {
            const extraDays = Math.ceil(days) - 5;
            forkliftCost += (extraDays * 120);
            extraText = ` (+ ${extraDays}gg extra)`;
        }
        logisticsLog += `• Noleggio Muletto: €${forkliftCost.toFixed(2)} (Base €700${extraText}).\n`;
    }

    const ballastWeight = inputs.includeBallast ? (inputs.parkingSpots || 0) * 1600 : 0; 
    
    // Check Logistics Config
    const provMatch = inputs.destination.match(/\b([A-Z]{2})\b/);
    const destProv = provMatch ? provMatch[1] : null;

    if (destProv && inputs.logisticsConfig && inputs.logisticsConfig[destProv]) {
        const provCosts = inputs.logisticsConfig[destProv];
        if (ballastWeight > 2000) {
            const costKeys = Object.keys(provCosts);
            const heavyKey = costKeys.find(k => k.includes('BILICO') || k.includes('GRU') || k.includes('CAMION'));
            if (heavyKey) {
                materialTransportCost = provCosts[heavyKey];
                logisticsMethod = heavyKey;
                logisticsLog += `• Trasporto Materiale (Tabella ${destProv}): €${materialTransportCost.toFixed(2)} [${logisticsMethod}].\n`;
            }
        }
    } else {
        if (ballastWeight > 1200) {
            materialTransportCost = distanceKm * 1.5;
            if (materialTransportCost < 300) materialTransportCost = 300; 
            logisticsMethod = "Trasporto Dedicato (Stima)";
            logisticsLog += `• Trasporto Dedicato (Peso > 1200kg): €${materialTransportCost.toFixed(2)} (stimato su km).\n`;
        } else {
            logisticsLog += `• Trasporto Materiale: Incluso nei mezzi aziendali (Peso contenuto).\n`;
        }
    }
    
    // --- 7. TOTALS & MARGIN ---
    const totalCost = 
        internalLaborCost + 
        internalTravelCost + 
        internalTravelTimeCost + 
        internalHotelCost + 
        internalPerDiemCost + 
        externalLaborCost + 
        forkliftCost + 
        materialTransportCost;

    let targetMarginDecimal = inputs.marginPercent / 100;
    if (targetMarginDecimal >= 0.99) targetMarginDecimal = 0.99;
    
    const grossSalesPrice = totalCost / (1 - targetMarginDecimal);
    const discountAmount = grossSalesPrice * (inputs.discountPercent ? inputs.discountPercent / 100 : 0);
    const finalSalesPrice = grossSalesPrice - discountAmount;
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
            "Viaggio/Logistica": travelLog + "\n" + logisticsLog // Fallback combination
        }
    };
};
