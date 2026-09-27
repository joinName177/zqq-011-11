import './ui/styles.css';
import { LocalStorageMoodAdapter } from './adapters/local-storage-mood.adapter';
import { MeteorologyEngineAdapter } from './adapters/meteorology-engine.adapter';
import { createRecordFromTag } from './core/meteorology-engine';
import { MoodRecord, SynopticChartData } from './core/models';
import { renderWeatherApp } from './ui/app';
import { summarizeMood, chartSummary } from './core/mood-summary';
import { moodTelemetry } from './adapters/mood-telemetry';
import { buildBugSurface } from './adapters/quality/bugSurface';

const repo = new LocalStorageMoodAdapter();
const metEngine = new MeteorologyEngineAdapter();

let records = repo.getAll();
// 当前聚焦的观测日期；undefined 表示聚焦最新一条记录
let focusedDate: string | undefined;
let chartData: SynopticChartData = metEngine.generateSynopticChart(records, focusedDate);

let isModalOpen = false;
let selectedTag = '阴转多云';
let selectedIntensity = 5;
let noteText = '';

const rootEl = document.getElementById('app')!;
const bugSurface = buildBugSurface([records.length, chartData.zones.length]);
rootEl.dataset.moodSummary = JSON.stringify({
  summary: summarizeMood(records),
  chart: chartSummary(chartData),
  telemetry: moodTelemetry('initial'),
  bugSurface,
  preembeddedBugCount: bugSurface.bugs.length,
  hellBugCount: bugSurface.bugs.filter((bug) => bug.level === 'hell').length,
  difficultBugCount: bugSurface.bugs.filter((bug) => bug.level === 'difficult').length
});

// 重算入口唯一化：所有数据/聚焦变更都经过这里，保证重算顺序。
// 票据守卫确保只有最后一次重算的结果生效，过期（旧）结果直接丢弃，防止异步竞态覆盖新结果。
function recomputeChart() {
  const ticket = metEngine.nextRequestTicket();
  const nextChart = metEngine.generateSynopticChart(records, focusedDate);
  if (!metEngine.isLatestTicket(ticket)) return;
  chartData = nextChart;
}

// 上一轮渲染注册的监听器清理函数；渲染前必须先清理，防止监听器随操作不断堆积
let disposeViewListeners: (() => void) | null = null;
let renderScheduled = false;

function commitView() {
  disposeViewListeners?.();
  disposeViewListeners = renderWeatherApp(
    rootEl,
    chartData,
    isModalOpen,
    selectedTag,
    selectedIntensity,
    noteText,
    {
      onOpenLogModal: () => {
        isModalOpen = true;
        selectedTag = '阴转多云';
        selectedIntensity = 5;
        noteText = '';
        refreshView();
      },
      onResetData: () => {
        records = repo.resetToSample();
        focusedDate = undefined;
        metEngine.invalidate();
        recomputeChart();
        refreshView();
      },
      onSubmitLog: (tag: string, intensity: number, note: string) => {
        const todayStr = new Date().toISOString().split('T')[0];
        repo.add(createRecordFromTag(tag, intensity, note, todayStr));
        records = repo.getAll();
        focusedDate = undefined;
        metEngine.invalidate();
        recomputeChart();
        isModalOpen = false;
        refreshView();
      },
      onSelectRecord: (record: MoodRecord) => {
        // 只更新聚焦点，当前观测点由引擎在同一次计算中得出，
        // 不再用旧图表里的记录对象事后覆盖新结果
        focusedDate = record.date;
        recomputeChart();
        refreshView();
      }
    },
    () => {
      isModalOpen = false;
      refreshView();
    },
    (tag: string) => {
      selectedTag = tag;
      refreshView();
    },
    (intensity: number) => {
      selectedIntensity = intensity;
      refreshView();
    },
    (note: string) => {
      noteText = note;
    }
  );
}

// 微任务合并渲染：同一轮事件循环里的连续状态变更只触发一次真实渲染，
// 避免重算/重绘任务随连续操作不断堆积
function refreshView() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    commitView();
  });
}

// Initial mount
refreshView();
