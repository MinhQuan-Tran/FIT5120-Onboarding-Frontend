<script lang="ts">
import { defineComponent, type CSSProperties, nextTick, markRaw } from 'vue';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  type ChartConfiguration,
  type ChartDataset,
  type ScriptableContext,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);

type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
type Hour = `${number}${number}:00`;

function hourLabels(): Hour[] {
  const out: Hour[] = [];
  for (let h = 0; h < 24; h++) out.push(`${String(h).padStart(2, '0')}:00` as Hour);
  return out;
}
function todayInMelbourne(): Day {
  const days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ] as const;
  const name = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    timeZone: 'Australia/Melbourne',
  }).format(new Date());
  return (days as readonly string[]).includes(name) ? (name as Day) : 'Monday';
}

const EPIC2_BASE = (import.meta as any).env?.VITE_EPIC2_BASE;
const EPIC2_PATH = '/default/epic2/parkingBusyHourly';
const BUSY_ALERT_THRESHOLD = 80;

export default defineComponent({
  name: 'DestinationInsights',
  emits: ['open-planner'],

  props: {
    title: { type: String, required: false },
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    linkHref: { type: String, default: '' },
  },

  data() {
    return {
      selectedDay: todayInMelbourne() as Day,
      chartRef: null as Chart<'bar'> | null,
      labels: hourLabels() as Hour[],
      loading: false as boolean,
      loadError: '' as string,
      currentBusy: Array(24).fill(0) as number[],
      _reqId: 0 as number,
      _cache: new Map<string, number[]>(),
    };
  },

  computed: {
    boxStyle(): CSSProperties {
      return { color: '#222', display: 'flex', flexDirection: 'column', alignItems: 'stretch' };
    },
    rowStyle(): CSSProperties {
      return { margin: '6px 0' };
    },
    linkStyle(): CSSProperties {
      return { color: '#2962FF', textDecoration: 'none' };
    },
    selectStyle(): CSSProperties {
      return {
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        padding: '6px 28px 6px 10px',
        border: '1px solid #E0E0E0',
        borderRadius: '8px',
        background: `#fff url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%2399A1A8' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 8px center`,
        fontSize: '12px',
      };
    },
    labelStyle(): CSSProperties {
      return { marginRight: '8px', fontWeight: 600, color: '#444' };
    },
    chartWrapStyle(): CSSProperties {
      return { height: '190px', width: '100%', minWidth: '240px', position: 'relative' };
    },
    headerStyle(): CSSProperties {
      return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        margin: '2px 0 8px',
      };
    },
    badgeStyle(): CSSProperties {
      return {
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: '999px',
        fontSize: '14px',
        background: '#EEF2FF',
        color: '#3D5AFE',
      };
    },
    ctaRowStyle(): CSSProperties {
      return {
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        justifyContent: 'flex-start',
        marginTop: '10px',
      };
    },
    buttonStyle(): CSSProperties {
      return {
        background: '#3D5AFE',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        fontSize: '12px',
      };
    },
    subtleStyle(): CSSProperties {
      return { fontSize: '11px', color: '#6b7280', marginTop: '4px' };
    },
    emptyOverlayStyle(): CSSProperties {
      return {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        color: '#6b7280',
        pointerEvents: 'none',
      };
    },
    legendRowStyle(): CSSProperties {
      return {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        color: '#6b7280',
        marginTop: '2px',
      };
    },
    legendDotCriticalStyle(): CSSProperties {
      return {
        width: '10px',
        height: '10px',
        borderRadius: '2px',
        background: '#E53935',
        display: 'inline-block',
      };
    },
    alertBoxStyle(): CSSProperties {
      return {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 8px',
        borderRadius: '8px',
        border: '1px solid #FDE68A',
        background: '#FEF3C7',
        color: '#92400E',
        fontSize: '12px',
        margin: '4px 0 6px',
        lineHeight: 1.3,
      };
    },
    isEmptySeries(): boolean {
      return this.currentBusy.every((v) => v === 0);
    },
    threshold(): number {
      return BUSY_ALERT_THRESHOLD;
    },

    // --- NEW: clearer indicator bits ---
    veryBusyRanges(): Array<{ start: number; end: number }> {
      const out: Array<{ start: number; end: number }> = [];
      let runStart = -1;
      for (let h = 0; h < 24; h++) {
        const busy = this.currentBusy[h] >= BUSY_ALERT_THRESHOLD;
        if (busy && runStart === -1) runStart = h;
        if ((!busy || h === 23) && runStart !== -1) {
          const end = busy && h === 23 ? 23 : h - 1;
          out.push({ start: runStart, end });
          runStart = -1;
        }
      }
      return out;
    },
    veryBusyHours(): number {
      return this.veryBusyRanges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
    },
    periodCount(): number {
      return this.veryBusyRanges.length;
    },
    rangesText(): string {
      // show up to 3 ranges like "11:00–13:00"
      const pad = (n: number) => String(n).padStart(2, '0');
      const text = this.veryBusyRanges.slice(0, 3).map(({ start, end }) => {
        const endHour = (end + 1) % 24; // block end is exclusive
        return `${pad(start)}:00–${pad(endHour)}:00`;
      });
      return this.veryBusyRanges.length > 3 ? text.join(', ') + ', …' : text.join(', ');
    },
  },

  watch: {
    selectedDay(newDay: Day) {
      const ds = (this.chartRef?.data.datasets?.[0] as ChartDataset<'bar', number[]>) || null;
      if (ds) {
        ds.label = `${newDay} busyness`;
        this.chartRef!.update('none');
      }
      this.ensureBusyFor(this.lat, this.lng, newDay);
    },
    lat() {
      this._cache.clear();
      this.ensureBusyFor(this.lat, this.lng, this.selectedDay);
    },
    lng() {
      this._cache.clear();
      this.ensureBusyFor(this.lat, this.lng, this.selectedDay);
    },
  },

  methods: {
    getCanvas(): HTMLCanvasElement | null {
      return (this.$refs.canvasRef as HTMLCanvasElement | null) ?? null;
    },
    isCanvasReady(): boolean {
      const el = this.getCanvas();
      if (!el || !el.isConnected) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !!el.getContext('2d');
    },

    buildConfig(day: Day): ChartConfiguration<'bar'> {
      const labels = [...this.labels];
      return {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: `${day} busyness`,
              data: [...this.currentBusy],
              xAxisID: 'x',
              yAxisID: 'y',
              backgroundColor: (ctx: ScriptableContext<'bar'>) => {
                const v = Number(ctx.raw ?? 0);
                return v >= BUSY_ALERT_THRESHOLD
                  ? 'rgba(244, 67, 54, 0.85)'
                  : 'rgba(61, 90, 254, 0.75)';
              },
              borderColor: (ctx: ScriptableContext<'bar'>) => {
                const v = Number(ctx.raw ?? 0);
                return v >= BUSY_ALERT_THRESHOLD ? '#E53935' : '#3D5AFE';
              },
              borderWidth: (ctx: ScriptableContext<'bar'>) =>
                Number(ctx.raw ?? 0) >= BUSY_ALERT_THRESHOLD ? 2 : 1,
              borderRadius: 6,
              hoverBorderWidth: 1,
              barPercentage: 0.9,
              categoryPercentage: 0.9,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          events: Chart.defaults.events,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            title: { display: false },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false,
              callbacks: {
                title(items) {
                  return items[0]?.label ?? '';
                },
                label(ctx) {
                  const v = typeof ctx.parsed.y === 'number' ? ctx.parsed.y : 0;
                  const warn = v >= BUSY_ALERT_THRESHOLD ? ' – very busy' : '';
                  return ` Busy: ${v}%${warn}`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                maxRotation: 0,
                autoSkip: false,
                callback(_val, idx) {
                  return (idx as number) % 3 === 0 ? labels[idx as number] : '';
                },
                font: { size: 10 },
              },
            },
            y: {
              display: false,
              ticks: { display: false },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      };
    },

    destroyChart(): void {
      this.chartRef?.destroy();
      this.chartRef = null;
    },
    createChart(day: Day): void {
      if (!this.isCanvasReady()) return;
      const ctx = this.getCanvas()!.getContext('2d');
      if (!ctx) return;
      this.destroyChart();
      const config = this.buildConfig(day);
      this.chartRef = markRaw(new Chart(ctx, config));
    },

    updateChart(day: Day, series: number[]): void {
      const chart = this.chartRef;
      if (!chart) return;
      const ds = chart.data.datasets[0] as ChartDataset<'bar', number[]>;
      ds.label = `${day} busyness`;
      ds.data = [...series];
      chart.update('none');
    },

    async waitForCanvas(): Promise<void> {
      await nextTick();
      let tries = 0;
      while (tries < 20) {
        if (this.isCanvasReady()) return;
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        tries++;
      }
    },

    cacheKey(lat: number, lng: number, day: Day): string {
      const kLat = lat.toFixed(3);
      const kLng = lng.toFixed(3);
      return `${kLat},${kLng},${day}`;
    },

    normaliseBusy(arr: unknown): number[] {
      const a = Array.isArray(arr) ? arr.slice(0, 24) : [];
      const out: number[] = Array(24).fill(0);
      for (let i = 0; i < 24; i++) {
        const v = Number(a[i] ?? 0);
        out[i] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
      }
      return out;
    },

    buildUrl(lat: number, lng: number, day: Day): string {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng), day });
      return `${EPIC2_BASE}${EPIC2_PATH}?${params.toString()}`;
    },

    async ensureBusyFor(lat: number, lng: number, day: Day): Promise<void> {
      const key = this.cacheKey(lat, lng, day);

      if (this._cache.has(key)) {
        const series = this._cache.get(key)!;
        this.currentBusy = series;
        this.updateChart(day, series);
        this.loadError = '';
        this.loading = false;
        return;
      }

      const reqId = ++this._reqId;
      this.loading = true;
      this.loadError = '';

      try {
        const url = this.buildUrl(lat, lng, day);
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json?.code !== 0) throw new Error(json?.message || 'API error');

        const series = this.normaliseBusy(json?.result?.busy);
        if (reqId !== this._reqId) return;

        this._cache.set(key, series);
        this.currentBusy = series;
        this.updateChart(day, series);
      } catch (err: any) {
        if (reqId !== this._reqId) return;
        this.loadError = err?.message || 'Failed to load busy data';
      } finally {
        if (reqId === this._reqId) this.loading = false;
      }
    },

    onPlanToClick(): void {
      const busySeries = [...(this.currentBusy ?? Array(24).fill(0))];
      this.$emit('open-planner', {
        address: this.address,
        lat: this.lat,
        lng: this.lng,
        selectedDay: this.selectedDay,
        busySeries,
      });
    },
  },

  async mounted() {
    await this.waitForCanvas();
    this.createChart(this.selectedDay);
    this.ensureBusyFor(this.lat, this.lng, this.selectedDay);
  },

  beforeUnmount() {
    this.destroyChart();
  },
});
</script>

<template>
  <div :style="boxStyle">
    <p :style="rowStyle">{{ address }}</p>

    <div :style="headerStyle">
      <span :style="badgeStyle">Busy hours</span>
      <div style="width: fit-content">
        <label for="busy-day" :style="labelStyle">Day</label>
        <select id="busy-day" v-model="selectedDay" :style="selectStyle">
          <option>Monday</option>
          <option>Tuesday</option>
          <option>Wednesday</option>
          <option>Thursday</option>
          <option>Friday</option>
          <option>Saturday</option>
          <option>Sunday</option>
        </select>
      </div>
    </div>

    <!-- Clearer banner: counts *hours* and *periods*, plus example ranges -->
    <div v-if="veryBusyHours > 0" :style="alertBoxStyle" aria-live="polite">
      <span aria-hidden="true">⚠️</span>
      Very busy (≥{{ threshold }}%) for <strong>{{ veryBusyHours }}</strong>
      {{ veryBusyHours === 1 ? 'hour' : 'hours' }} across <strong>{{ periodCount }}</strong>
      {{ periodCount === 1 ? 'period' : 'periods' }}
      <template v-if="rangesText"> — {{ rangesText }}</template>
    </div>

    <!-- Mini legend -->
    <div :style="legendRowStyle">
      <span :style="legendDotCriticalStyle" aria-hidden="true"></span>
      <span>Very busy (≥{{ threshold }}%)</span>
    </div>

    <div :style="chartWrapStyle">
      <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%"></canvas>
      <div v-if="!loading && !loadError && isEmptySeries" :style="emptyOverlayStyle">
        No data for this day/location yet
      </div>
    </div>

    <div v-if="loading || loadError" :style="subtleStyle">
      <template v-if="loading">Fetching live data…</template>
      <template v-else>Couldn't load live data: {{ loadError }}</template>
    </div>

    <a v-if="linkHref" :href="linkHref" target="_blank" rel="noopener" :style="linkStyle">
      View on Google Maps
    </a>

    <div :style="ctaRowStyle">
      <button :style="buttonStyle" type="button" @click="onPlanToClick">Plan To</button>
    </div>
  </div>
</template>
