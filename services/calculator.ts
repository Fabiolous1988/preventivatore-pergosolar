
import { PergolaModel, ModelsConfig } from "../types";

// Base metadata for known models to keep UI nice (categories, lifting rules)
const STATIC_METADATA: Record<string, Partial<PergolaModel>> = {
    'solarflex': { category: 'Solarflex' },
    'centauro': { category: 'Corporate' },
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

// Common logic to find the row
const findModelRow = (modelId: string, modelsConfig: ModelsConfig) => {
    const normTarget = normalize(modelId);
    const availableKeys = Object.keys(modelsConfig);

    // 1. Exact normalized match
    let matchedKey = availableKeys.find(k => normalize(k) === normTarget);

    // 2. Inclusion match (longest first)
    if (!matchedKey) {
        const sortedKeys = [...availableKeys].sort((a, b) => b.length - a.length);
        matchedKey = sortedKeys.find(k => {
            const nK = normalize(k);
            return nK === normTarget || nK.includes(normTarget) || normTarget.includes(nK);
        });
    }
    return matchedKey ? { key: matchedKey, row: modelsConfig[matchedKey] } : null;
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

    const match = findModelRow(modelId, modelsConfig);
    if (!match) return 0;
    const { key, row } = match;
    const availableKeys = Object.keys(modelsConfig);
    
    // --- EXACT COLUMN MAPPING ---
    const base = getVal(row, ['ORE_INSTALLAZIONE_1PA']);
    const pv = includePV ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF']) : 0;
    const gaskets = includeGaskets ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI']) : 0;
    
    // Ballast logic
    let ballastTotalTime = 0;
    if (includeBallast) {
        const numBallasts = calculateBallastCount(spots);
        let timeFor2 = 0;
        
        if (selectedBallastId) {
             const normBallast = normalize(selectedBallastId);
             const ballastKey = availableKeys.find(k => normalize(k) === normBallast);
             if (ballastKey) {
                 const ballastRow = modelsConfig[ballastKey];
                 timeFor2 = getVal(ballastRow, ['ORE_INSTALLAZIONE_ZAVORRE']);
             }
        }

        if (timeFor2 === 0) {
             timeFor2 = getVal(row, ['ORE_INSTALLAZIONE_ZAVORRE']);
        }

        if (timeFor2 > 0) {
            const pairs = numBallasts / 2; 
            ballastTotalTime = pairs * timeFor2; 
        }
    }

    const total = ((base + pv + gaskets) * spots) + ballastTotalTime;
    
    return Math.round(total * 100) / 100;
};

// --- NEW: WEIGHT CALCULATION ---
export const calculateTotalWeight = (
    modelId: string,
    spots: number,
    includeBallast: boolean,
    modelsConfig: ModelsConfig | null
): { total: number, structure: number, ballast: number } => {
    const result = { total: 0, structure: 0, ballast: 0 };
    
    if (spots <= 0) return result;

    // 1. Structure Weight
    let structureUnitWeight = 0; 
    
    if (modelsConfig && modelId) {
        const match = findModelRow(modelId, modelsConfig);
        if (match) {
            const keys = Object.keys(match.row);
            
            // Search strategy for Weight Key
            // Priority 1: Contains 'PESO' and '1PA' (or '1_PA', '1_POSTO')
            let weightKey = keys.find(k => 
                (k.includes('PESO') || k.includes('KG')) && 
                (k.includes('1PA') || k.includes('1_PA') || k.includes('1_POSTO'))
            );
            
            // Priority 2: Contains 'PESO' and 'STRUTTURA'
            if (!weightKey) {
                weightKey = keys.find(k => k.includes('PESO') && k.includes('STRUTTURA'));
            }

            // Priority 3: Exact fallbacks
            if (!weightKey) {
                 const fallbacks = ['PESO', 'KG', 'PESO_TOTALE', 'TOTALE_PESO', 'KG_STRUTTURA'];
                 weightKey = keys.find(k => fallbacks.includes(k));
            }

            if (weightKey) {
                const val = match.row[weightKey];
                if (val > 0) structureUnitWeight = val;
            }
        }
    }

    // Fallback if not found in CSV
    if (structureUnitWeight === 0) {
        structureUnitWeight = 200;
        // Optional: console.warn(`Weight not found for model ${modelId}, using fallback 200kg`);
    }

    result.structure = spots * structureUnitWeight;

    // 2. Ballast Weight
    if (includeBallast) {
        const numBallasts = calculateBallastCount(spots); 
        // Heuristic: 800kg per block (1600kg per pair)
        result.ballast = numBallasts * 800; 
    }

    result.total = result.structure + result.ballast;
    return result;
};

// Generates a human-readable explanation of the calculation
export const explainCalculation = (
    modelId: string, 
    spots: number, 
    includePV: boolean, 
    includeGaskets: boolean,
    includeBallast: boolean,
    selectedBallastId: string | undefined,
    modelsConfig: ModelsConfig | null,
    totalTechs: number
): string => {
    if (!modelId || !modelsConfig) return "Seleziona un modello per vedere il calcolo.";
    
    const match = findModelRow(modelId, modelsConfig);
    if (!match) return "Modello non trovato nel database CSV.";
    const { key, row } = match;
    const availableKeys = Object.keys(modelsConfig);

    let explanation = `Analisi per il modello "${key}" su ${spots} posti auto:\n\n`;

    // 1. Base Structure
    const base = getVal(row, ['ORE_INSTALLAZIONE_1PA']);
    explanation += `1. STRUTTURA: Il database indica ${base} ore per 1 posto auto.\n`;
    explanation += `   -> ${base} ore x ${spots} posti = ${(base * spots).toFixed(2)} ore.\n`;

    // 2. PV
    if (includePV) {
        const pv = getVal(row, ['ORE_INSTALLAZIONE_1PA_PF']);
        explanation += `2. PANNELLI FOTOVOLTAICI (PF): Aggiunta di ${pv} ore per posto.\n`;
        explanation += `   -> ${pv} ore x ${spots} posti = ${(pv * spots).toFixed(2)} ore extra.\n`;
    }

    // 3. Gaskets
    if (includeGaskets) {
        const gaskets = getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI']);
        explanation += `3. GUARNIZIONI: Aggiunta di ${gaskets} ore per posto.\n`;
        explanation += `   -> ${gaskets} ore x ${spots} posti = ${(gaskets * spots).toFixed(2)} ore extra.\n`;
    }

    // 4. Ballasts
    let ballastTotalTime = 0;
    if (includeBallast) {
        const numBallasts = calculateBallastCount(spots);
        let timeFor2 = 0;
        let source = "dal modello pergola";
        
        if (selectedBallastId) {
             const normBallast = normalize(selectedBallastId);
             const ballastKey = availableKeys.find(k => normalize(k) === normBallast);
             if (ballastKey) {
                 const ballastRow = modelsConfig[ballastKey];
                 timeFor2 = getVal(ballastRow, ['ORE_INSTALLAZIONE_ZAVORRE']);
                 source = `specifico per "${ballastKey}"`;
             }
        }
        if (timeFor2 === 0) {
             timeFor2 = getVal(row, ['ORE_INSTALLAZIONE_ZAVORRE']);
        }

        if (timeFor2 > 0) {
            const pairs = numBallasts / 2;
            ballastTotalTime = pairs * timeFor2;
            explanation += `4. ZAVORRE: Servono ${numBallasts} zavorre. Il tempo (${source}) è di ${timeFor2} ore ogni 2 zavorre.\n`;
            explanation += `   -> Calcolo: (${numBallasts} / 2) * ${timeFor2} = ${ballastTotalTime.toFixed(2)} ore extra.\n`;
        } else {
            explanation += `4. ZAVORRE: Tempo non definito nel CSV per queste zavorre (0 ore aggiunte).\n`;
        }
    }

    // Totals
    const totalHours = ((base + (includePV ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF']) : 0) + (includeGaskets ? getVal(row, ['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI']) : 0)) * spots) + ballastTotalTime;
    
    explanation += `\n---------------------------------\n`;
    explanation += `TOTALE ORE LAVORO (Man-Hours): ${totalHours.toFixed(2)} ore\n`;
    
    // Weight Preview
    const weights = calculateTotalWeight(modelId, spots, includeBallast, modelsConfig);
    explanation += `\nSTIMA PESO TOTALE: ~${weights.total.toLocaleString()} kg\n`;
    explanation += `(Struttura: ${weights.structure}kg + Zavorre: ${weights.ballast}kg)\n`;
    
    if (totalTechs > 0) {
        const hoursPerDay = totalTechs * 8;
        const days = totalHours / hoursPerDay;
        explanation += `\nCONVERSIONE IN GIORNI:\n`;
        explanation += `Hai ${totalTechs} tecnici. Lavorano 8 ore al giorno ciascuno = ${hoursPerDay} ore lavorative giornaliere.\n`;
        explanation += `-> ${totalHours.toFixed(2)} ore totali / ${hoursPerDay} ore/giorno = ${days.toFixed(2)} giorni.\n`;
        explanation += `(Il sistema arrotonda a step di 0.5 giorni per sicurezza)`;
    } else {
        explanation += `\n(Seleziona dei tecnici per calcolare i giorni)`;
    }

    return explanation;
};
