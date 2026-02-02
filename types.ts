
export interface AutoPart {
  partNumber: string;
  partName: string;
  station: string;
  model: string;
  color: string;
  matchPercentage: number;
  description: string;
  category: string;
}

export interface IdentificationResult {
  parts: AutoPart[];
  summary: string;
}

export type ScanStage = 'IDLE' | 'CAPTURING' | 'ANALYZING' | 'RESULT';

export interface PhotoCapture {
  id: string;
  dataUrl: string;
  angle: string;
}

export interface CatalogItem {
  partNumber: string;
  partName: string;
  station: string;
}
