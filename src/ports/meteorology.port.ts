import { MoodRecord, SynopticChartData } from '../core/models';

export interface GenerateChartOptions {
  selectedRecordId?: string;
}

export interface MeteorologyPort {
  generateSynopticChart(
    records: readonly MoodRecord[],
    options?: GenerateChartOptions
  ): Promise<SynopticChartData>;
  invalidateCache(): void;
}
