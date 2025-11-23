
export enum ServiceType {
  FULL_INSTALLATION = 'Installazione Completa',
  SUPPORT_1_TECH = 'Supporto (1 Tecnico)',
  SUPPORT_2_TECHS = 'Supporto (2 Tecnici)',
}

export enum TransportMode {
  COMPANY_VEHICLE = 'Veicolo Aziendale',
  PUBLIC_TRANSPORT = 'Mezzi Pubblici (Treno/Aereo)',
}

export interface EstimateInputs {
  origin: string;
  destination: string;
  excludeOriginTransfer: boolean; // New flag for last-mile exclusion
  serviceType: ServiceType;
  transportMode: TransportMode;
  startDate: string;
  durationDays: number;
  marginPercent: number;
  additionalNotes: string;
}

export interface CostItem {
  category: string; // Restricted to "Lavoro", "Viaggio", "Vitto/Alloggio" by prompt
  description: string;
  amount: number;
}

export interface TransportOption {
  id: string;
  methodName: string; // e.g., "Treno + Taxi" or "Veicolo Aziendale"
  logisticsSummary: string; // Specific details for this option
  breakdown: CostItem[];
  totalCost: number;
  salesPrice: number;
  marginAmount: number;
}

export interface EstimateResult {
  options: TransportOption[]; // Array of potential scenarios
  commonReasoning: string; // AI's general thought process
}
