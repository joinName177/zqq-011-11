import { MoodRecord, SynopticChartData } from '../core/models';
import { evaluateSynopticSystem } from '../core/meteorology-engine';
import { MeteorologyPort } from '../ports/meteorology.port';

/**
 * 气象计算引擎适配器。
 *
 * 缓存策略：以输入指纹（记录序列 + 聚焦日期）为键缓存图表结果。
 * 任何数据或聚焦变更都会改变指纹，使旧缓存自然失效；
 * 数据变更（新增/重置/删除）后调用方也应通过 invalidate() 显式失效。
 * 缓存的图表对象视为不可变，调用方不得事后改写（例如覆盖 currentRecord）。
 */
export class MeteorologyEngineAdapter implements MeteorologyPort {
  private cache: { fingerprint: string; chart: SynopticChartData } | null = null;
  private requestSeq = 0;

  generateSynopticChart(records: MoodRecord[], focusDate?: string): SynopticChartData {
    const fingerprint = this.fingerprintOf(records, focusDate);
    if (this.cache && this.cache.fingerprint === fingerprint) {
      return this.cache.chart;
    }
    const chart = evaluateSynopticSystem(records, focusDate);
    this.cache = { fingerprint, chart };
    return chart;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** 单调递增的重算票据：保证重算顺序，便于丢弃过期的异步结果 */
  nextRequestTicket(): number {
    return ++this.requestSeq;
  }

  isLatestTicket(ticket: number): boolean {
    return ticket === this.requestSeq;
  }

  private fingerprintOf(records: MoodRecord[], focusDate?: string): string {
    const identity = records.map(r => `${r.id}@${r.date}`).join('|');
    return `${records.length}#${focusDate || 'latest'}#${identity}`;
  }
}
