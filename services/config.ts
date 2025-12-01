
import { AppConfig, ModelsConfig, LogisticsConfig } from '../types';

// Hardcoded URLs provided by user
export const LOGISTICS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTL-4djiL6_Z8-PmHgKeJ2QmEHtZdChrJXEBIni0FyQ8Nu3dkm_6j5haSd6SElMNw/pub?output=csv';

// Placeholders - You can replace these with the actual specific sheets if they differ, 
// or point to the same sheet if all data is in one file (though usually formatted differently)
export const GENERAL_CONFIG_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTL-4djiL6_Z8-PmHgKeJ2QmEHtZdChrJXEBIni0FyQ8Nu3dkm_6j5haSd6SElMNw/pub?output=csv'; 
export const MODELS_CONFIG_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9RtPO7RSU2bQMuQLxtF44P0IT0ccAp4NgMAmSx6u-xGBNtSb2GPrN9YbVdLA7XQ/pub?output=csv';

export const DEFAULT_CONFIG: AppConfig = {
    internalHourlyRate: 20,
    externalHourlyRate: 37,
    customParams: {}
};

export const fetchAppConfig = async (url: string = GENERAL_CONFIG_URL): Promise<AppConfig> => {
    try {
        // console.log("Fetching config from:", url);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const text = await response.text();
        const lines = text.split('\n');
        const config: AppConfig = { 
            internalHourlyRate: 20, 
            externalHourlyRate: 37,
            customParams: {} 
        };
        
        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const key = parts[0].trim().replace(/^["']|["']$/g, '');
                const valStr = parts[1].trim();
                const value = parseFloat(valStr);
                let description = '';
                if (parts.length > 2) {
                    description = parts.slice(2).join(',').trim().replace(/^["']|["']$/g, '');
                }

                if (!isNaN(value) && key) {
                    config.customParams[key] = { value, description };

                    const lowerKey = key.toLowerCase();
                    if (lowerKey === 'internal_rate' || lowerKey === 'internal_hourly_rate') {
                        config.internalHourlyRate = value;
                    } else if (lowerKey === 'external_rate' || lowerKey === 'external_hourly_rate') {
                        config.externalHourlyRate = value;
                    }
                }
            }
        });

        return config;

    } catch (error) {
        console.warn("Failed to load general config sheet. Using defaults.", error);
        return DEFAULT_CONFIG;
    }
};

export const fetchModelsConfig = async (url: string = MODELS_CONFIG_URL): Promise<ModelsConfig | null> => {
    try {
        // console.log("Fetching models config from:", url);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Models sheet network error");

        const text = await response.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return null;

        const headerParts = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const modelsConfig: ModelsConfig = {};

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length < 2) continue;

            const modelName = parts[0].trim().replace(/^["']|["']$/g, '');
            if (!modelName) continue;

            const params: Record<string, number> = {};
            
            for (let j = 1; j < parts.length; j++) {
                if (j >= headerParts.length) break;
                const colName = headerParts[j]; 
                const val = parseFloat(parts[j].trim());
                if (!isNaN(val)) {
                    params[colName] = val;
                }
            }
            modelsConfig[modelName] = params;
        }
        
        return modelsConfig;

    } catch (error) {
        console.error("Failed to load models config", error);
        return null;
    }
};

export const fetchLogisticsConfig = async (url: string = LOGISTICS_SHEET_URL): Promise<LogisticsConfig | null> => {
    try {
        console.log("Fetching logistics config from:", url);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Logistics sheet network error");

        const text = await response.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return null;

        const headerParts = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
        const logisticsConfig: LogisticsConfig = {};

        // Find relevant column indices
        const provinceIdx = headerParts.findIndex(h => h.includes('provincia') || h === 'sigla' || h === 'prov');
        if (provinceIdx === -1) return null;

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length <= provinceIdx) continue;

            const province = parts[provinceIdx].trim().replace(/^["']|["']$/g, '').toUpperCase();
            if (!province || province.length > 2) continue; // Basic validation

            const costs: Record<string, number> = {};
            
            for (let j = 0; j < parts.length; j++) {
                if (j === provinceIdx) continue;
                const colName = headerParts[j];
                const val = parseFloat(parts[j].trim());
                if (!isNaN(val)) {
                    costs[colName] = val;
                }
            }
            logisticsConfig[province] = costs;
        }
        
        console.log("Logistics Config Loaded:", Object.keys(logisticsConfig).length, "provinces");
        return logisticsConfig;

    } catch (error) {
        console.error("Failed to load logistics config", error);
        return null;
    }
};
