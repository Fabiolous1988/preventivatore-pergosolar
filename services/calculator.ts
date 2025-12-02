
import { PergolaModel, ModelsConfig } from "../types";

// Base metadata for known models to keep UI nice (categories, lifting rules)
const STATIC_METADATA: Record<string, Partial<PergolaModel>> = {
    'solarflex': { category: 'Solarflex' },
    'centauro': { category: 'Corporate' },
    // Add generic category matching here if needed
};

// HELPER: Normalize string for comparison (remove ALL spaces, symbols, lowercase)
export const normalize = (str: string) => str.replace(/[^a-z0-9]/gi, '').toLowerCase();

// Generates the official list of models directly from the loaded CSV config
export const getDynamicModelList = (modelsConfig: ModelsConfig | null): PergolaModel[] => {
    if (!modelsConfig) {
        return [];
    }

    return Object.keys(modelsConfig)
        // Filter out Ballasts (ZAVORRE) from the main model list
        .filter(key => !key.includes('ZAVORRA'))
        .map(modelKey => {
            const row = modelsConfig[modelKey];
            
            const hasPV = getVal(row, ['ORE_INSTALLAZIONE_1PA_PF', 'ORE_PV_1PA']) > 0;
            const hasGaskets = getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI', 'ORE_GUARNIZIONI_1PA']) > 0;
            
            return {
                id: modelKey,
                name: modelKey, 
                category: 'Generale',
                allowsStructure: true,
                allowsPV: hasPV || true, 
                allowsGaskets: hasGaskets || true,
                requiresLifting: false, 
            };
        });
};

export const getBallastList = (modelsConfig: ModelsConfig | null): string[] => {
    if (!modelsConfig) return [];
    return Object.keys(modelsConfig).filter(key => key.includes('ZAVORRA'));
};

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
    selectedBallastId: string | undefined,
    modelsConfig: ModelsConfig | null
): number => {
    if (!modelId || spots <= 0) return 0;
    if (!modelsConfig) return 0;

    const normTarget = normalize(modelId);
    const availableKeys = Object.keys(modelsConfig);

    // --- EXACT MATCH LOGIC (PRIORITY) ---
    // 1. Try absolute strict equality on normalized strings
    let matchedKey = availableKeys.find(k => normalize(k) === normTarget);

    // 2. If not found, sort by length desc and find first inclusion
    // This solves "Solarflex Urano Twin" vs "Solarflex Urano"
    if (!matchedKey) {
        const sortedKeys = [...availableKeys].sort((a, b) => b.length - a.length);
        matchedKey = sortedKeys.find(k => {
            const nK = normalize(k);
            return nK === normTarget || nK.includes(normTarget) || normTarget.includes(nK);
        });
    }

    if (!matchedKey) {
        console.warn(`[Calculator] Model "${modelId}" not found in CSV keys.`);
        return 0;
    }

    console.log(`[Calculator] Matching "${modelId}" -> "${matchedKey}"`);
    const row = modelsConfig[matchedKey];
    
    // --- EXACT COLUMN MAPPING ---
    const base = getVal(row, ['ORE_INSTALLAZIONE_1PA']);
    const pv = includePV ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF']) : 0;
    const gaskets = includeGaskets ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI']) : 0;
    
    // Ballast logic
    let ballastTotalTime = 0;
    if (includeBallast) {
        const numBallasts = calculateBallastCount(spots);
        
        // Determine Ballast Time
        // Try to look up the SPECIFIC BALLAST ROW first
        let timeFor2 = 0;
        
        if (selectedBallastId) {
             const normBallast = normalize(selectedBallastId);
             const ballastKey = availableKeys.find(k => normalize(k) === normBallast);
             if (ballastKey) {
                 const ballastRow = modelsConfig[ballastKey];
                 timeFor2 = getVal(ballastRow, ['ORE_INSTALLAZIONE_ZAVORRE']);
             }
        }

        // Fallback: Check if the Pergola Row has a generic ballast time
        if (timeFor2 === 0) {
             timeFor2 = getVal(row, ['ORE_INSTALLAZIONE_ZAVORRE']);
        }

        // Logic: timeFor2 is for 2 ballasts (1 PA usually needs 2 ballasts approx, but user said "ore per 2 zavorre")
        if (timeFor2 > 0) {
            // How many pairs of ballasts?
            const pairs = numBallasts / 2; // Can be decimal? usually time is proportional
            ballastTotalTime = pairs * timeFor2; 
        }
    }

    const total = ((base + pv + gaskets) * spots) + ballastTotalTime;
    
    return Math.round(total * 100) / 100;
};
