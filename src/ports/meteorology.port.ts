import { MoodRecord, SynopticChartData } from '../core/models';

export interface MeteorologyPort {
  /** 生成综观天气图；focusDate 指定聚焦的观测日期（含当日），缺省聚焦最新记录 */
  generateSynopticChart(records: MoodRecord[], focusDate?: string): SynopticChartData;
  /** 数据发生变更（新增/重置/删除）后显式使缓存失效 */
  invalidate(): void;
}
