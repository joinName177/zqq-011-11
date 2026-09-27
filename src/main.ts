import './ui/styles.css';
import { LocalStorageMoodAdapter } from './adapters/local-storage-mood.adapter';
import { MeteorologyEngineAdapter } from './adapters/meteorology-engine.adapter';
import { createRecordFromTag, evaluateSynopticSystem } from './core/meteorology-engine';
import { MoodRecord, SynopticChartData } from './core/models';
import { renderWeatherApp, bindWeatherApp, type WeatherUIHandlers } from './ui/app';
import { summarizeMood, chartSummary } from './core/mood-summary';
import { moodTelemetry } from './adapters/mood-telemetry';
import { buildBugSurface } from './adapters/quality/bugSurface';

const repo = new LocalStorageMoodAdapter();
const metEngine = new MeteorologyEngineAdapter();

let records = repo.getAll();
let chartData: SynopticChartData = evaluateSynopticSystem(records);
let selectedRecordId: string | undefined;

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

let recalculationToken = 0;
let recalculationQueued = false;

function render() {
  renderWeatherApp(
    rootEl,
    chartData,
    isModalOpen,
    selectedTag,
    selectedIntensity,
    noteText
  );
}

function scheduleChartRecalculation() {
  const token = ++recalculationToken;

  // Coalesce mutations that happen in the same task while still invalidating a
  // recalculation whose source state changed before it reached the microtask.
  if (recalculationQueued) return;

  recalculationQueued = true;
  Promise.resolve().then(async () => {
    recalculationQueued = false;
    const requestRecords = [...records];
    const requestSelectedId = selectedRecordId;

    try {
      const nextChart = await metEngine.generateSynopticChart(requestRecords, {
        selectedRecordId: requestSelectedId
      });
      if (token !== recalculationToken) return;
      chartData = nextChart;
      render();
    } catch (error) {
      if (token !== recalculationToken || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }
      console.error('Failed to generate synoptic chart', error);
    }
  });
}

const handlers: WeatherUIHandlers = {
  onOpenLogModal: () => {
    isModalOpen = true;
    selectedTag = '阴转多云';
    selectedIntensity = 5;
    noteText = '';
    render();
  },
  onResetData: () => {
    // Persist first, then invalidate every cached snapshot, and only afterwards
    // change the view input. This prevents a stale chart from winning the race.
    records = repo.resetToSample();
    metEngine.invalidateCache();
    selectedRecordId = undefined;
    isModalOpen = false;
    scheduleChartRecalculation();
  },
  onSubmitLog: () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newRecord = createRecordFromTag(selectedTag, selectedIntensity, noteText, todayStr);
    repo.add(newRecord);
    records = repo.getAll();
    metEngine.invalidateCache();
    selectedRecordId = undefined;
    isModalOpen = false;
    scheduleChartRecalculation();
  },
  onSelectRecord: (record: MoodRecord) => {
    if (selectedRecordId === record.id) return;
    selectedRecordId = record.id;
    isModalOpen = false;
    scheduleChartRecalculation();
  },
  onCloseModal: () => {
    isModalOpen = false;
    render();
  },
  onTagChange: (tag: string) => {
    selectedTag = tag;
    rootEl.querySelectorAll('.tag-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tag') === tag);
    });
  },
  onIntensityChange: (intensity: number) => {
    selectedIntensity = intensity;
    const value = rootEl.querySelector('#intensityVal');
    if (value) value.textContent = String(intensity);
  },
  onNoteChange: (note: string) => {
    noteText = note;
  }
};

// One delegated listener per control type for the lifetime of the app. innerHTML
// replacement removes DOM nodes but never adds another listener on this root.
const unbindWeatherApp = bindWeatherApp(rootEl, handlers, () => chartData);

render();
