import { MoodRecord, SynopticChartData } from '../core/models';
import { evaluateSynopticSystem, sortMoodRecords } from '../core/meteorology-engine';
import { MeteorologyPort } from '../ports/meteorology.port';

interface ChartCacheEntry {
  promise: Promise<SynopticChartData>;
}

interface QueuedRequest {
  key: string;
  records: MoodRecord[];
  selectedRecordId?: string;
  generation: number;
  resolve: (chart: SynopticChartData) => void;
  reject: (error: unknown) => void;
}

export function createChartCacheKey(
  records: readonly MoodRecord[],
  selectedRecordId?: string
): string {
  return JSON.stringify({
    selectedRecordId: selectedRecordId ?? null,
    records: sortMoodRecords(records)
  });
}

export class MeteorologyEngineAdapter implements MeteorologyPort {
  private cache = new Map<string, ChartCacheEntry>();
  private latest: QueuedRequest | undefined;
  private scheduled = false;
  private running = false;
  private generation = 0;

  async generateSynopticChart(
    records: readonly MoodRecord[],
    options: { selectedRecordId?: string } = {}
  ): Promise<SynopticChartData> {
    const key = createChartCacheKey(records, options.selectedRecordId);
    const cached = this.cache.get(key);
    if (cached) return cached.promise;

    return new Promise<SynopticChartData>((resolve, reject) => {
      this.abortLatest();
      this.latest = {
        key,
        records: [...records],
        selectedRecordId: options.selectedRecordId,
        generation: this.generation,
        resolve,
        reject
      };

      if (this.scheduled || this.running) return;
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        void this.processLatest();
      });
    });
  }

  private async processLatest(): Promise<void> {
    const request = this.latest;
    this.latest = undefined;
    if (!request) return;

    this.running = true;
    try {
      const chart = await evaluateSynopticSystem(request.records, {
        selectedRecordId: request.selectedRecordId
      });
      if (request.generation === this.generation) {
        this.cache.set(request.key, { promise: Promise.resolve(chart) });
      }
      request.resolve(chart);
    } catch (error) {
      request.reject(error);
    } finally {
      this.running = false;
      if (this.latest) {
        this.scheduled = true;
        queueMicrotask(() => {
          this.scheduled = false;
          void this.processLatest();
        });
      }
    }
  }

  private abortLatest(): void {
    if (!this.latest) return;
    this.latest.reject(new DOMException('A newer chart request was scheduled', 'AbortError'));
    this.latest = undefined;
  }

  invalidateCache(): void {
    this.generation += 1;
    this.cache.clear();
    this.abortLatest();
  }
}
