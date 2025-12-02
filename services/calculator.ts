
import { PergolaModel, ModelsConfig } from "../types";

// Base metadata for known models to keep UI nice (categories, lifting rules)
// We will merge this with the dynamic CSV data.
const STATIC_METADATA: Record<string, Partial<PergolaModel>> = {
    'solarflex': { category: 'Solarflex', requiresLifting: false },
    'solarflex_maxi': { category: 'Solarflex', requiresLifting: false },
    'solarflex_urano': { category: 'Solarflex', requiresLifting: false },
    'solarflex_urano_twin': { category: 'Solarflex', requiresLifting: false },
    'centauro_corporate': { category: 'Corporate', requiresLifting: true, liftingType: 'Mezzo Sollevamento' },
    'centauro_corporate_twin': { category: 'Corporate', requiresLifting: true, liftingType: 'Mezzo Sollevamento' },
    'solarflex_truck': { category: 'Automotive', requiresLifting: false },
    'solarflex_camper': { category: 'Automotive', requiresLifting: false },
};

// HELPER: Normalize string for comparison (remove ALL spaces, symbols, lowercase)
export const normalize = (str: string) => str.replace(/[^a-z0-9]/gi, '').toLowerCase();

// Generates the official list of models directly from the loaded CSV config
export const getDynamicModelList = (modelsConfig: ModelsConfig | null): PergolaModel[] => {
    if (!modelsConfig) {
        // Fallback to basic static list if no config loaded
        return Object.entries(STATIC_METADATA).map(([id, meta]) => ({
            id,
            name: id.replace(/_/g, ' ').toUpperCase(), // Fallback name
            category: meta.category || 'Standard',
            allowsStructure: true,
            allowsPV: true,
            allowsGaskets: true,
            requiresLifting: !!meta.requiresLifting,
            liftingType: meta.liftingType
        }));
    }

    // Generate list from CSV Keys
    return Object.keys(modelsConfig).map(modelKey => {
        const row = modelsConfig[modelKey];
        const normKey = normalize(modelKey);
        
        // Try to find static metadata match based on fuzzy name check
        const knownId = Object.keys(STATIC_METADATA).find(id => normalize(id) === normKey || normKey.includes(normalize(id)));
        const meta = knownId ? STATIC_METADATA[knownId] : {};

        // Infer capabilities from CSV Columns
        // If column exists and value > 0, then feature is allowed
        const hasPV = getVal(row, ['ORE_INSTALLAZIONE_1PA_PF', 'ORE_PV_1PA']) > 0;
        const hasGaskets = getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI', 'ORE_GUARNIZIONI_1PA']) > 0;
        
        return {
            id: modelKey, // THE ID IS NOW THE EXACT CSV KEY
            name: modelKey, // Display Name matches CSV exactly (includes typos like URALNO, which ensures matching works)
            category: meta.category || 'Generale',
            allowsStructure: true,
            allowsPV: hasPV || true, // Default true if column missing, or check logic
            allowsGaskets: hasGaskets || true,
            requiresLifting: !!meta.requiresLifting,
            liftingType: meta.liftingType
        };
    });
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
    modelId: string, // This will now be the EXACT CSV KEY
    spots: number, 
    includePV: boolean, 
    includeGaskets: boolean,
    includeBallast: boolean,
    modelsConfig: ModelsConfig | null
): number => {
    if (!modelId || spots <= 0) return 0;
    if (!modelsConfig) return 0;

    // DIRECT LOOKUP
    // Since dropdown ID = CSV Key, we don't need fuzzy matching anymore!
    const row = modelsConfig[modelId];
    
    if (!row) {
        console.warn(`[Calculator] Model "${modelId}" not found in CSV keys.`);
        return 0;
    }

    console.log(`[Calculator] Exact Match Found for "${modelId}"`);

    // --- EXACT COLUMN MAPPING ---
    const base = getVal(row, ['ORE_INSTALLAZIONE_1PA']);
    const pv = includePV ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF']) : 0;
    const gaskets = includeGaskets ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI']) : 0;
    
    // Ballast logic
    let ballastTotalTime = 0;
    if (includeBallast) {
        const numBallasts = calculateBallastCount(spots);
        const timeFor2 = getVal(row, ['ORE_INSTALLAZIONE_ZAVORRE']);
        // Logic: timeFor2 is for 2 ballasts. 
        if (timeFor2 > 0) {
            const pairs = Math.ceil(numBallasts / 2);
            ballastTotalTime = pairs * timeFor2; 
        }
    }

    const total = ((base + pv + gaskets) * spots) + ballastTotalTime;
    
    return Math.round(total * 100) / 100;
};
