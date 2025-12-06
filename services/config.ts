
import { AppConfig, ModelsConfig, LogisticsConfig, DiscountRule } from '../types';

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
    discountRules: [],
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
    
    // Remove typical currency symbols and units like 'kg'
    str = str.replace(/[€$£%]/g, '');
    str = str.replace(/kg/gi, ''); 
    
    if (str === '') return 0;

    // Italian format check: if comma exists and is the last separator-like char, treat as decimal
    // But be careful with 1.000,00 vs 1,000.00
    // Simple heuristic: if there is a comma, replace it with dot
    if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

// Splits a CSV line handling quotes
const parseCSVLine = (line: string, delimiter: string): string[] => {
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
    return result;
};

const parseDiscountRules = (rows: string[][]): DiscountRule[] => {
    const rules: DiscountRule[] = [];
    // Regex to match "sconto ... >(number) ... posti"
    // Example: "sconto ore per >50 posti auto (%)"
    // Matches > followed immediately by digits
    const regex = />\s*(\d+)/;

    rows.forEach(row => {
        if (row.length < 2) return;
        const key = row[0];
        const valStr = row[1];
        
        // Check if row is about discounts and contains "posti"
        if (key && key.toLowerCase().includes('sconto') && key.toLowerCase().includes('posti') && regex.test(key)) {
            const match = key.match(regex);
            if (match && match[1]) {
                const threshold = parseInt(match[1], 10);
                const percentage = parseFloatItalian(valStr);
                
                if (!isNaN(threshold) && !isNaN(percentage)) {
                    rules.push({ threshold, percentage });
                }
            }
        }
    });
    // Sort descending by threshold so we can find the highest applicable threshold first
    // Example: 100, 50, 20. If spots=60, >100 is false, >50 is true.
    return rules.sort((a, b) => b.threshold - a.threshold);
};

export const fetchAppConfig = async (): Promise<AppConfig> => {
    try {
        const [generalRes, metricsRes] = await Promise.all([
             fetch(GENERAL_CONFIG_URL),
             fetch(METRICS_CONFIG_URL)
        ]);
        
        const generalText = await generalRes.text();
        const metricsText = await metricsRes.text();
        
        const config = { ...DEFAULT_CONFIG };
        const rows = generalText.split('\n').filter(r => r.trim().length > 0);
        
        if (rows.length > 0) {
            const delimiter = detectDelimiter(rows[0]);
            const parsedRows = rows.map(r => parseCSVLine(r, delimiter));

            // Parse General Config
            parsedRows.forEach(row => {
                if (row.length < 2) return;
                const key = row[0].trim().toLowerCase();
                const val = parseFloatItalian(row[1]);
                
                if (key.includes('interno') && key.includes('oraria')) config.internalHourlyRate = val || config.internalHourlyRate;
                if (key.includes('esterno') && key.includes('oraria')) config.externalHourlyRate = val || config.externalHourlyRate;
                if (key.includes('margine')) config.defaultMargin = val || config.defaultMargin;
                
                // Store everything else as custom param
                if (val > 0) {
                    config.customParams[row[0].trim()] = { value: val, description: row[2] || '' };
                }
            });
        }

        // Parse Metrics Config (Discounts)
        const metricsRowsRaw = metricsText.split('\n').filter(r => r.trim().length > 0);
        if (metricsRowsRaw.length > 0) {
            const mDelimiter = detectDelimiter(metricsRowsRaw[0]);
            const parsedMetrics = metricsRowsRaw.map(r => parseCSVLine(r, mDelimiter));
            config.discountRules = parseDiscountRules(parsedMetrics);
            console.log("Parsed Discount Rules:", config.discountRules);
        }

        return config;

    } catch (e) {
        console.error("Error fetching app config:", e);
        return DEFAULT_CONFIG;
    }
};

export const fetchModelsConfig = async (): Promise<ModelsConfig | null> => {
    try {
        const res = await fetch(MODELS_CONFIG_URL);
        const text = await res.text();
        const rows = text.split('\n').filter(r => r.trim().length > 0);
        
        if (rows.length < 2) return null;

        const delimiter = detectDelimiter(rows[0]);
        // Header row
        // NORMALIZE HEADERS: Remove BOM, Trim, Uppercase, Remove Dots/Parens, Replace spaces with underscores
        const headers = parseCSVLine(rows[0], delimiter).map(h => 
            h.replace(/^\uFEFF/, '')
             .trim()
             .toUpperCase()
             .replace(/\./g, '') // Remove dots (P.A. -> PA)
             .replace(/[()]/g, '') // Remove parenthesis ((KG) -> KG)
             .replace(/\s+/g, '_')
        );
        
        const config: ModelsConfig = {};

        // Start from index 1 (skip header)
        for (let i = 1; i < rows.length; i++) {
            const cols = parseCSVLine(rows[i], delimiter);
            if (cols.length < 2) continue;

            const modelName = cols[0].trim();
            if (!modelName) continue;

            config[modelName] = {};

            cols.forEach((colVal, idx) => {
                const header = headers[idx];
                // Try parse number
                const num = parseFloatItalian(colVal);
                // Store if number or string? We mainly need numbers for calculation
                config[modelName][header] = num;
            });
        }
        return config;
    } catch (e) {
        console.error("Error fetching models:", e);
        return null;
    }
};

export const fetchLogisticsConfig = async (): Promise<LogisticsConfig | null> => {
    try {
        const res = await fetch(LOGISTICS_SHEET_URL);
        const text = await res.text();
        const rows = text.split('\n').filter(r => r.trim().length > 0);

        if (rows.length < 2) return null;
        
        const delimiter = detectDelimiter(rows[0]);
        // Normalize Logistics Headers - LESS AGGRESSIVE
        // Keep original wording (e.g. "BILICO 13.60")
        const headers = parseCSVLine(rows[0], delimiter).map(h => 
             h.replace(/^\uFEFF/, '') // Remove BOM
              .trim()
              .toUpperCase()
        );
        
        const config: LogisticsConfig = {};
        
        // Check for 'SIG' (exact), 'SIGLA', or 'PROVINCIA' column
        let provIndex = headers.findIndex(h => h === 'SIG'); // Priority 1: Exact 'SIG' (User Request)
        if (provIndex === -1) {
            provIndex = headers.findIndex(h => h === 'SIGLA'); // Priority 2
        }
        if (provIndex === -1) {
            provIndex = headers.findIndex(h => h.includes('PROV') || h.includes('DEST')); // Priority 3
        }

        if (provIndex === -1) {
            console.error("Logistics CSV missing Province/SIG column. Headers found:", headers);
            return null;
        }

        console.log(`Logistics CSV: Using column '${headers[provIndex]}' as Province Code Key`);

        for (let i = 1; i < rows.length; i++) {
            const cols = parseCSVLine(rows[i], delimiter);
            if (cols.length <= provIndex) continue;

            const rawProv = cols[provIndex].trim().toUpperCase();
            if (!rawProv) continue;

            config[rawProv] = {};
            
            cols.forEach((colVal, idx) => {
                if (idx === provIndex) return;
                const header = headers[idx];
                const val = parseFloatItalian(colVal);
                // We store even 0 values if header exists, just in case
                if (!isNaN(val)) {
                    config[rawProv][header] = val;
                }
            });
        }
        return config;
    } catch (e) {
        console.error("Error fetching logistics:", e);
        return null;
    }
};
