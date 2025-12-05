
export enum ServiceType {
  FULL_INSTALLATION = 'Installazione Completa',
  SUPPORT = 'Supporto all\'Installazione', // Simplified generic support type
}

export enum TransportMode {
  COMPANY_VEHICLE = 'Veicolo Aziendale',
  PUBLIC_TRANSPORT = 'Mezzi Pubblici (Treno/Aereo)',
}

export interface EstimateInputs {
  origin: string;
  destination: string;
  excludeOriginTransfer: boolean;
  serviceType: ServiceType;
  transportMode: TransportMode;
  startDate: string;
  durationDays: number; // Used for Support modes or calculated from hours
  marginPercent: number; // Hidden from user, populated from config
  discountPercent?: number; // New: Volume discount
  additionalNotes: string;
  // Manual Extra Costs - Hidden from user, populated from config
  extraHourlyCost: number;
  extraDailyCost: number;
  
  // Team Composition
  useInternalTeam: boolean;
  internalTechs: number;
  useExternalTeam: boolean;
  externalTechs: number;
  
  // New Installation Module Fields
  selectedModelId?: string;
  parkingSpots?: number;
  includePV?: boolean;
  includeGaskets?: boolean;
  includeFabric?: boolean; // New: Telo
  includeInsulatedPanels?: boolean; // New: Pannelli Coibentati
  includeBallast?: boolean; // New: Zavorre
  calculatedHours?: number; // Internal use: passed to AI
  
  // Explicit hours split (Editable by user)
  internalHours?: number;
  externalHours?: number;
  
  // Logistics
  hasForklift?: boolean; // New: Does customer have forklift?
  returnOnWeekends?: boolean; // New: Do techs return home on weekends?
  
  // Dynamic Config passed to Service
  modelsConfig?: ModelsConfig | null; 
  logisticsConfig?: LogisticsConfig | null;
}

export interface CostItem {
  category: string;
  description: string;
  amount: number;
}

export interface TransportOption {
  id: string;
  methodName: string;
  logisticsSummary: string;
  breakdown: CostItem[];
  totalCost: number;
  salesPrice: number;
  marginAmount: number;
}

export interface EstimateResult {
  options: TransportOption[];
  commonReasoning: string;
}

export interface PergolaModel {
  id: string;
  name: string;
  category: string;
  allowsStructure: boolean;
  allowsPV: boolean;
  allowsGaskets: boolean;
  requiresLifting: boolean;
  liftingType?: string;
}

export interface DiscountRule {
  threshold: number; // e.g. 50 (spots)
  percentage: number; // e.g. 5 (%)
}

export interface AppConfig {
  internalHourlyRate: number;
  externalHourlyRate: number;
  defaultMargin: number;
  defaultExtraHourly: number;
  defaultExtraDaily: number;
  // Dynamic discount rules from CSV
  discountRules: DiscountRule[];
  // Store any other parameters found in the sheet (Key -> {Value, Description})
  customParams: Record<string, { value: number; description?: string }>;
}

// Map Model Name -> { Column Name -> Value }
export type ModelsConfig = Record<string, Record<string, number>>;

// Map Province Code (e.g., 'VR', 'MI') -> { vehicleType: cost }
export type LogisticsConfig = Record<string, Record<string, number>>;
