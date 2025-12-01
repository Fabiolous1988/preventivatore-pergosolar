
import { PergolaModel, ModelsConfig } from "../types";

// Official Pergosolar Product Line
export const PERGOLA_MODELS: PergolaModel[] = [
    { id: 'solarflex', name: 'Solarflex', category: 'Solarflex', allowsStructure: true, allowsPV: true, allowsGaskets: true, requiresLifting: false },
    { id: 'solarflex_maxi', name: 'Solarflex Maxi', category: 'Solarflex', allowsStructure: true, allowsPV: true, allowsGaskets: true, requiresLifting: false },
    { id: 'solarflex_urano', name: 'Solarflex Urano', category: 'Solarflex', allowsStructure: true, allowsPV: true, allowsGaskets: true, requiresLifting: false },
    { id: 'solarflex_urano_twin', name: 'Solarflex Urano Twin-Drive', category: 'Solarflex', allowsStructure: true, allowsPV: true, allowsGaskets: true, requiresLifting: false },
    { id: 'centauro_corporate', name: 'Centauro Corporate', category: 'Corporate', allowsStructure: true, allowsPV: true, allowsGaskets: true, requiresLifting: true, liftingType: 'Mezzo Sollevamento' },
    { id: 'centauro_corporate_twin', name: 'Centauro Corporate Twin-Drive', category: 'Corporate', allowsStructure: true, allowsPV: true, allowsGaskets: true, requiresLifting: true, liftingType: 'Mezzo Sollevamento' },
    { id: 'solarflex_truck', name: 'Solarflex Truck', category: 'Automotive', allowsStructure: true, allowsPV: true, allowsGaskets: false, requiresLifting: false },
    { id: 'solarflex_camper', name: 'Solarflex Camper', category: 'Automotive', allowsStructure: true, allowsPV: true, allowsGaskets: false, requiresLifting: false },
];

export const calculateBallastCount = (spots: number): number => {
    if (spots <= 0) return 0;
    return Math.ceil(spots / 2) + 1;
};

// LOOKUP HELPER
const getVal = (params: Record<string, number>, possibleKeys: string[]): number => {
    for (const key of possibleKeys) {
        if (params[key] !== undefined && !isNaN(params[key])) return params[key];
    }
    return 0;
};

export const calculateInstallationHours = (
    modelId: string, 
    spots: number, 
    includePV: boolean, 
    includeGaskets: boolean,
    includeBallast: boolean,
    modelsConfig: ModelsConfig | null
): number => {
    if (!modelId || spots <= 0) return 0;
    if (!modelsConfig) return 0;

    const modelDef = PERGOLA_MODELS.find(m => m.id === modelId);
    const searchName = (modelDef?.name || modelId).toUpperCase().trim();

    // Fix: Sort keys by length descending. 
    // This ensures "SOLARFLEX MAXI" (length 14) is checked before "SOLARFLEX" (length 9).
    const availableKeys = Object.keys(modelsConfig).sort((a, b) => b.length - a.length);

    // 1. Try EXACT Match
    let configKey = availableKeys.find(k => k === searchName);
    
    // 2. If no exact match, try inclusion (still sorted by length desc)
    if (!configKey) {
        configKey = availableKeys.find(k => searchName.includes(k) || k.includes(searchName));
    }
    
    if (!configKey) {
        console.warn(`[Calculator] Model ${searchName} not found in CSV keys:`, availableKeys.slice(0, 5));
        return 0;
    }

    const row = modelsConfig[configKey];
    console.log(`[Calculator] Selected Row for ${searchName} (Matched Key: ${configKey}):`, row);

    // --- EXACT COLUMN MAPPING (Based on user instruction) ---
    
    // 1. BASE: "ORE_INSTALLAZIONE_1PA"
    const base = getVal(row, ['ORE_INSTALLAZIONE_1PA', 'ORE_INSTALLAZIONE_1_PA']);
    
    // 2. PV: "ORE_INSTALLAZIONE_1PA_PF"
    const pv = includePV ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF', 'ORE_PV_1PA']) : 0;
    
    // 3. GASKETS: "ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI"
    const gaskets = includeGaskets ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI', 'ORE_GUARNIZIONI_1PA']) : 0;
    
    // 4. BALLAST: "ORE_INSTALLAZIONE_ZAVORRE" (Time for 2 ballasts)
    let ballastTotalTime = 0;
    if (includeBallast) {
        const numBallasts = calculateBallastCount(spots);
        const timeFor2 = getVal(row, ['ORE_INSTALLAZIONE_ZAVORRE', 'ORE_ZAVORRE']);
        // If csv says "1.50" for 2 ballasts, and we have 4 ballasts -> (4/2)*1.5 = 3 hours
        ballastTotalTime = (numBallasts / 2) * timeFor2;
    }

    // Formula: (Base + PV + Gaskets) * spots + BallastTime
    // Note: PV and Gaskets are usually additive PER SPOT in the sheet logic described
    const total = (base * spots) + (pv * spots) + (gaskets * spots) + ballastTotalTime;
    
    console.log(`[Calc Details] Model:${configKey} Spots:${spots} | Base:${base} PV:${pv} Gask:${gaskets} BallastTime:${ballastTotalTime} -> TOTAL:${total}`);
    
    return Math.round(total * 100) / 100;
};
