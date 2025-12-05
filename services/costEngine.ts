

import { EstimateInputs, AppConfig, ModelsConfig, LogisticsConfig, TransportMode } from "../types";

export interface ComputedCosts {
    distanceKm: number;
    travelDurationHours: number;
    
    // Internal Team Costs
    internalTravelCost: number; // (Km * rate) + tolls
    internalTravelTimeCost: number; // Hours * HourlyRate
    internalHotelCost: number;
    internalPerDiemCost: number; // Vitto
    internalLaborCost: number;
    
    // External Team Costs
    externalLaborCost: number; // Rate * Hours (All inclusive)
    
    // Logistics
    forkliftCost: number;
    materialTransportCost: number;
    
    // Totals
    totalCost: number;
    salesPrice: number;
    marginAmount: number;
    
    // Meta for AI explanation
    isWeekendReturnApplied: boolean;
    activeTechs: number;
    totalManHours: number;
    logisticsMethod: string;
}

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
    
    // --- 1. PARSE DURATION ---
    // Rough parse of text like "3 ore e 20 min" to decimal hours
    let travelTimeOneWay = 0;
    const hoursMatch = durationText.match(/(\d+)\s*(?:h|ora|ore)/i);
    const minsMatch = durationText.match(/(\d+)\s*min/i);
    
    if (hoursMatch) travelTimeOneWay += parseInt(hoursMatch[1]);
    if (minsMatch) travelTimeOneWay += parseInt(minsMatch[1]) / 60;
    
    // Fallback if parsing fails but we have distance (avg speed 80km/h)
    if (travelTimeOneWay === 0 && distanceKm > 0) {
        travelTimeOneWay = distanceKm / 80; 
    }

    // --- 2. SETUP BASICS ---
    const days = inputs.durationDays;
    const internalTechs = inputs.useInternalTeam ? inputs.internalTechs : 0;
    const externalTechs = inputs.useExternalTeam ? inputs.externalTechs : 0;
    const totalTechs = internalTechs + externalTechs;
    
    // Determine Work Hours (Man-Hours)
    // If calculatedHours is passed (from calculator.ts), use it. Otherwise derive from days * 8 * techs
    // However, for cost calculation, we usually pay based on the days blocked.
    // Let's align with the previous AI logic: Cost is based on "Duration Days * 8 hours/day * Rate"
    const paidHoursPerTech = days * 8; 

    // --- 3. INTERNAL TEAM COSTS ---
    let internalTravelCost = 0;
    let internalTravelTimeCost = 0;
    let internalHotelCost = 0;
    let internalPerDiemCost = 0;
    let internalLaborCost = 0;
    let isWeekendReturnApplied = false;

    if (internalTechs > 0) {
        // A. Labor (Work on site)
        internalLaborCost = paidHoursPerTech * config.internalHourlyRate * internalTechs;

        // B. Travel Costs (Only for Internal)
        // Scenario: Company Vehicle
        if (inputs.transportMode === TransportMode.COMPANY_VEHICLE) {
            const costPerKm = 0.45; // Average generic cost (fuel + wear) or roughly derived from prompt rules
            const highwayTollEst = (distanceKm / 10) * 1.0; // Approx 0.10 EUR/km for tolls
            
            // Standard Trip: Origin -> Dest -> Origin
            let trips = 1; 

            // Weekend Return Rule
            if (inputs.returnOnWeekends && hasWeekendOverlap(inputs.startDate, days)) {
                trips = 2; // Techs go home for weekend and come back
                isWeekendReturnApplied = true;
            }

            const totalDistKm = distanceKm * 2 * trips;
            internalTravelCost = (totalDistKm * costPerKm) + (highwayTollEst * 2 * trips);
            
            // Travel Time (Labor cost while driving)
            // Assuming all internal techs are paid for travel time
            const totalTravelHours = travelTimeOneWay * 2 * trips;
            internalTravelTimeCost = totalTravelHours * config.internalHourlyRate * internalTechs;
        } 
        // Scenario: Public Transport
        else {
            // Estimate Ticket cost (approx 0.15 EUR/km per person)
            const ticketCost = (distanceKm * 0.15) * 2 * internalTechs; 
            internalTravelCost = ticketCost;
            
            // Travel Time (paid less or full? assuming full for simplicity as per previous logic)
            const totalTravelHours = travelTimeOneWay * 2;
            internalTravelTimeCost = totalTravelHours * config.internalHourlyRate * internalTechs;
        }

        // C. Living Costs (Hotel + Food)
        // Per Diem (Vitto): 50 EUR/day per tech
        internalPerDiemCost = 50 * days * internalTechs;

        // Hotel: If duration > 1 day. Nights = Math.ceil(days) - 1
        // If they return on weekend, nights might be less, but let's stick to standard logic:
        // If 5 days work, 4 nights hotel.
        let nights = Math.max(0, Math.ceil(days) - 1);
        
        // Adjust nights if weekend return reduces hotel stay? 
        // Usually weekend return means they DON'T stay in hotel Sat/Sun night.
        // For safety/simplicity of this version, we keep standard calculation or subtract 2 nights if weekend return.
        if (isWeekendReturnApplied) {
            nights = Math.max(0, nights - 2);
        }

        const avgHotelPrice = 80; // EUR/night/person
        internalHotelCost = nights * avgHotelPrice * internalTechs;
        
        // Add Local Displacement (Hotel <-> Site)
        // 15km * 2 * 2 (round trip) * days * costPerKm
        if (nights > 0 && inputs.transportMode === TransportMode.COMPANY_VEHICLE) {
            internalTravelCost += (15 * 4 * days * 0.45);
        }
    }

    // --- 4. EXTERNAL TEAM COSTS ---
    let externalLaborCost = 0;
    if (externalTechs > 0) {
        // External teams are all-inclusive. No travel, no hotel calculated separately.
        externalLaborCost = paidHoursPerTech * config.externalHourlyRate * externalTechs;
    }

    // --- 5. LOGISTICS & EXTRAS ---
    let forkliftCost = 0;
    let materialTransportCost = 0;
    let logisticsMethod = "Furgone Aziendale (Standard)";

    // Forklift Rule
    if (inputs.includeBallast && !inputs.hasForklift) {
        // Base 700 up to 5 days
        forkliftCost = 700;
        if (days > 5) {
            const extraDays = Math.ceil(days) - 5;
            forkliftCost += (extraDays * 120);
        }
    }

    // Trucking Logic (Simplified Weight Check)
    // Ballast Weight approx 80kg/block * count? Or 1600kg total provided in inputs?
    // Let's estimate total weight roughly
    const ballastWeight = inputs.includeBallast ? (inputs.parkingSpots || 0) * 1600 : 0; // Using the heavy estimate logic from prompt
    
    // Check Logistics Config for specific province costs
    // Extract province from destination
    const provMatch = inputs.destination.match(/\b([A-Z]{2})\b/);
    const destProv = provMatch ? provMatch[1] : null;

    if (destProv && inputs.logisticsConfig && inputs.logisticsConfig[destProv]) {
        // Use Tabular Data if available
        // Heuristic: If weight > 2000kg, use Bilico/Gru cost from table
        const provCosts = inputs.logisticsConfig[destProv];
        if (ballastWeight > 2000) {
            // Find highest relevant cost or specific key
            const costKeys = Object.keys(provCosts);
            // Look for "BILICO", "CAMION", "GRU"
            const heavyKey = costKeys.find(k => k.includes('BILICO') || k.includes('GRU') || k.includes('CAMION'));
            if (heavyKey) {
                materialTransportCost = provCosts[heavyKey];
                logisticsMethod = heavyKey;
            }
        }
    } else {
        // Fallback Logic
        if (ballastWeight > 1200) {
            // Needs dedicated transport if not in table
            // Rough estimate: 1.5 EUR/km for heavy truck one way
            materialTransportCost = distanceKm * 1.5;
            if (materialTransportCost < 300) materialTransportCost = 300; // Min charge
            logisticsMethod = "Trasporto Dedicato (Stima)";
        }
    }
    
    // --- 6. TOTALS & MARGIN ---
    const totalCost = 
        internalLaborCost + 
        internalTravelCost + 
        internalTravelTimeCost + 
        internalHotelCost + 
        internalPerDiemCost + 
        externalLaborCost + 
        forkliftCost + 
        materialTransportCost;

    // Margin Calculation
    // Sales Price = Total Cost / (1 - Margin%)
    // But we need to handle the Discount Logic asked by user.
    // The discount (inputs.discountPercent) applies to the FINAL Price.
    
    let targetMarginDecimal = inputs.marginPercent / 100;
    let grossSalesPrice = 0;
    
    if (targetMarginDecimal >= 0.99) targetMarginDecimal = 0.99; // Safety
    
    grossSalesPrice = totalCost / (1 - targetMarginDecimal);
    
    // Apply Discount
    const discountAmount = grossSalesPrice * (inputs.discountPercent ? inputs.discountPercent / 100 : 0);
    const finalSalesPrice = grossSalesPrice - discountAmount;
    
    // Recalculate actual margin amount based on discounted price
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
        totalManHours: paidHoursPerTech * totalTechs,
        logisticsMethod
    };
};
