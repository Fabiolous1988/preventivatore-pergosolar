
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
    // Logic: Starts at 2. Every 2 spots adds 1.
    // 1-2 spots = 2
    // 3-4 spots = 3
    // 5-6 spots = 4
    return Math.ceil(spots / 2) + 1;
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
    
    // Find model name from ID to look up in config
    const modelDef = PERGOLA_MODELS.find(m => m.id === modelId);
    const modelName = modelDef?.name || modelId; // Try to match by name found in CSV

    let hoursPerSpot = 0;

    if (modelsConfig) {
        // Try to find the model in the loaded config
        // We look for exact match or case-insensitive match (CSV key might be MODELLO_STRUTTURA)
        const configKey = Object.keys(modelsConfig).find(k => k.toLowerCase() === modelName.toLowerCase());
        
        // If exact name match fails, maybe the CSV uses ID or partial name
        const params = configKey ? modelsConfig[configKey] : null;

        if (params) {
            // Found model in CSV, sum up relevant columns based on new specs
            
            // 1. Structure (Base) -> ORE_INSTALLAZIONE_1PA
            const structureBase = params['ORE_INSTALLAZIONE_1PA'] || 0;
            hoursPerSpot += structureBase;

            // 2. PV Logic
            if (includePV) {
                // Determine which PV column to use
                if (includeGaskets) {
                    // Try ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI
                    const pvGasket = params['ORE_INSTALLAZIONE_1PA_PF_GUARNIZIONI'] || 0;
                    hoursPerSpot += pvGasket;
                } else {
                    // Try ORE_INSTALLAZIONE_1PA_PF
                    const pvStd = params['ORE_INSTALLAZIONE_1PA_PF'] || 0;
                    hoursPerSpot += pvStd;
                }
            }

            // 3. Ballast (Zavorre) -> ORE_INSTALLAZIONE_ZAVORRE
            if (includeBallast) {
                const ballast = params['ORE_INSTALLAZIONE_ZAVORRE'] || 0;
                hoursPerSpot += ballast;
            }

        } else {
            // Fallback if model not in CSV
            console.warn(`Model ${modelName} not found in configuration sheet.`);
            hoursPerSpot = 5; // Fallback
        }
    } else {
        // No config loaded, fallback default
        hoursPerSpot = 5;
    }

    return hoursPerSpot * spots;
};
