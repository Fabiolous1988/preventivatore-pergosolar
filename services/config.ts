
import { AppConfig, ModelsConfig, LogisticsConfig } from '../types';

// Hardcoded URLs provided by user
export const LOGISTICS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTL-4djiL6_Z8-PmHgKeJ2QmEHtZdChrJXEBIni0FyQ8Nu3dkm_6j5haSd6SElMNw/pub?output=csv';
export const GENERAL_CONFIG_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTL-4djiL6_Z8-PmHgKeJ2QmEHtZdChrJXEBIni0FyQ8Nu3dkm_6j5haSd6SElMNw/pub?output=csv'; 
export const MODELS_CONFIG_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9RtPO7RSU2bQMuQLxtF44P0IT0ccAp4NgMAmSx6u-xGBNtSb2GPrN9YbVdLA7XQ/pub?output=csv';
export const METRICS_CONFIG_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSk32mnQqJSHloRb9OtVSqjpMvcNrnN9c5INGTUXr6N3t0AwisjfftWyIT8m-YBgg/pub?output=csv';

export const DEFAULT_CONFIG: AppConfig = {
    internalHourlyRate: 20,
    externalHourlyRate: 37,
    defaultMargin: 30,
    defaultExtraHourly: 0,
    defaultExtraDaily: 0,
    customParams: {}
};

// --- ROBUST PARSING UTILS ---

// Detects delimiter based on the first line occurrence
const detectDelimiter = (line: string): string => {
    const commas = (line.match(/,/g) || []).length;
    const semis = (line.match(/;/g) || []).length;
    return semis > commas ? ';' : ',';
};

// Handles Italian numbers (7,60) and Standard (7.60)
// Also removes quotes, currency symbols and spaces inside numbers
const parseFloatItalian = (input: any): number => {
    if (input === null || input === undefined) return 0;
    let str = String(input).trim();
    
    // Remove quotes
    str = str.replace(/^["']|["']$/g, '');
    
    // Remove spaces entirely (handles '1 200,50')
    str = str.replace(/\s/g, '');
    
    // Remove typical currency symbols
    str = str.replace(/[€$£]/g, '');
    
    if (str === '') return 0;

    // Italian format check: if comma exists and is the last separator-like char, treat as decimal
    // But be careful with 1.000,00 vs 1,000.00
    // Simple heuristic: replace ',' with '.'
    if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

// Splits a CSV line handling quoted fields correctly
// e.g. "Col A";"Col B with ; inside";"Col C"
const splitCSVLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result.map(s => s.replace(/^["']|["']$/g, '').trim()); // Clean surrounding quotes
};

// Normalizes header keys: Uppercase, trim, replace spaces/special chars with underscores
const cleanHeader = (header: string): string => {
    return header
        .trim()
        .toUpperCase()
        .replace(/["']/g, '') // remove quotes
        .replace(/\s+/g, '_') // space to underscore
        .replace(/[()]/g, '') // remove parens
        .replace(/[^A-Z0-9_]/g, ''); // remove non-alphanumeric
};


// --- FETCH FUNCTIONS ---

export const fetchAppConfig = async (): Promise<AppConfig> => {
    try {
        // Fetch General Config (Rates) AND Metrics Config (Margin/Extras)
        const [genRes, metricRes] = await Promise.all([
            fetch(GENERAL_CONFIG_URL).then(r => r.text()).catch(() => ""),
            fetch(METRICS_CONFIG_URL).then(r => r.text()).catch(() => "")
        ]);

        const config = { ...DEFAULT_CONFIG };

        // Helper to parse key-value CSVs
        const parseKV = (csvText: string) => {
            if (!csvText) return;
            const lines = csvText.split('\n');
            if (lines.length === 0) return;
            const delimiter = detectDelimiter(lines[0]);
            
            lines.forEach(line => {
                if (!line.trim()) return;
                const cols = splitCSVLine(line, delimiter);
                if (cols.length < 2) return;
                
                const key = cols[0].trim();
                const val = parseFloatItalian(cols[1]);
                const desc = cols[2] || ''; // Optional description

                // Map known keys
                if (key === 'internal_rate' || key === 'tariffa_interna') config.internalHourlyRate = val;
                else if (key === 'external_rate' || key === 'tariffa_esterna') config.externalHourlyRate = val;
                else if (key === 'MARGINE' || key === 'margine_percentuale') config.defaultMargin = val;
                else if (key === 'EXTRA_ORA' || key === 'costo_extra_ora') config.defaultExtraHourly = val;
                else if (key === 'EXTRA_GIORNO' || key === 'costo_extra_giorno') config.defaultExtraDaily = val;
                else {
                    // Store unknown keys
                    config.customParams[key] = { value: val, description: desc };
                }
            });
        };

        parseKV(genRes);
        parseKV(metricRes);

        console.log("Loaded App Config:", config);
        return config;

    } catch (e) {
        console.error("Error fetching App Config:", e);
        return DEFAULT_CONFIG;
    }
};

export const fetchModelsConfig = async (): Promise<ModelsConfig | null> => {
    try {
        const response = await fetch(MODELS_CONFIG_URL);
        const text = await response.text();
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        
        if (lines.length < 2) return null;

        const delimiter = detectDelimiter(lines[0]);
        // Row 0 is Headers
        const rawHeaders = splitCSVLine(lines[0], delimiter);
        const headers = rawHeaders.map(cleanHeader);
        
        console.log("Detected Headers:", headers);

        const modelsConfig: ModelsConfig = {};

        for (let i = 1; i < lines.length; i++) {
            const cols = splitCSVLine(lines[i], delimiter);
            // Column 0 is usually the Model Name
            const modelName = cols[0]?.trim();
            if (!modelName) continue;

            const modelParams: Record<string, number> = {};
            
            // Map each column to the model
            headers.forEach((h, idx) => {
                if (idx === 0) return; // Skip Name column
                const valStr = cols[idx];
                const val = parseFloatItalian(valStr);
                // Store using cleaned header key
                modelParams[h] = val;
            });
            
            // Key the map by raw model name (uppercase) for now, standardisation happens in calculator
            modelsConfig[modelName.toUpperCase()] = modelParams;
        }

        console.log(`Loaded ${Object.keys(modelsConfig).length} models.`);
        return modelsConfig;

    } catch (e) {
        console.error("Error fetching Models Config:", e);
        return null;
    }
};

export const fetchLogisticsConfig = async (): Promise<LogisticsConfig | null> => {
    try {
        const response = await fetch(LOGISTICS_SHEET_URL);
        const text = await response.text();
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        
        if (lines.length < 2) return null;

        const delimiter = detectDelimiter(lines[0]);
        const rawHeaders = splitCSVLine(lines[0], delimiter);
        const headers = rawHeaders.map(cleanHeader);

        const logisticsConfig: LogisticsConfig = {};

        for (let i = 1; i < lines.length; i++) {
            const cols = splitCSVLine(lines[i], delimiter);
            const provinceCode = cols[0]?.trim().toUpperCase(); // Expecting Prov code in col 0
            if (!provinceCode || provinceCode.length !== 2) continue;

            const provCosts: Record<string, number> = {};
            
            headers.forEach((h, idx) => {
                if (idx === 0) return;
                const val = parseFloatItalian(cols[idx]);
                if (val > 0) provCosts[h] = val;
            });

            logisticsConfig[provinceCode] = provCosts;
        }

        console.log(`Loaded Logistics for ${Object.keys(logisticsConfig).length} provinces.`);
        return logisticsConfig;

    } catch (e) {
        console.error("Error fetching Logistics Config:", e);
        return null;
    }
};
