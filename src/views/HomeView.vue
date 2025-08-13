<script lang="ts">
import { defineComponent } from 'vue';
import { RouterLink } from 'vue-router';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
);

// ---------- Types ----------
interface ApiEnvelope<T> {
  code: number;
  message: string;
  result: T;
}

interface AttritionRow {
  Period: number;
  Vehicles: number;
  'Attrition Rate': number;
}

// Use a raw shape for population rows, then pick years via guards.
type PopulationRowRaw = Record<string, unknown>;

// ---------- Type guards ----------
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === 'string';

function isAttritionRow(o: unknown): o is AttritionRow {
  if (typeof o !== 'object' || o === null) return false;
  const r = o as Record<string, unknown>;
  return isNumber(r['Period']) && isNumber(r['Vehicles']) && isNumber(r['Attrition Rate']);
}

function getYearSeries(row: PopulationRowRaw): { labels: string[]; values: number[] } {
  const labels: string[] = [];
  const values: number[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (/^\d{4}$/.test(k) && isNumber(v)) {
      labels.push(k);
    }
  }
  labels.sort(); // ensure chronological order
  for (const y of labels) {
    const val = row[y];
    values.push(isNumber(val) ? val : 0);
  }
  return { labels, values };
}

// ---------- Vue component ----------
export default defineComponent({
  name: 'HomeView',
  components: { RouterLink },

  data() {
    return {
      epic1baseURL: (import.meta as any).env?.VITE_EPIC1_BASE,
      popChart: null as Chart | null,
      attrChart: null as Chart | null,
      loading: true,
      errorMsg: null as string | null,
    };
  },

  async mounted() {
    try {
      const [popData, attrData] = await Promise.all([
        this.fetchMelbourneCBDPopulation(),
        this.fetchVicVehicleAttrition(),
      ]);
      this.drawPopulationBar(popData);
      this.drawAttritionCombo(attrData);
    } catch (e) {
      this.errorMsg = e instanceof Error ? e.message : 'Failed to load charts.';
      console.error(e);
    } finally {
      this.loading = false;
    }
  },

  beforeUnmount() {
    this.popChart?.destroy();
    this.attrChart?.destroy();
  },

  methods: {
    async fetchMelbourneCBDPopulation(): Promise<{ labels: string[]; values: number[] }> {
      const url = `${this.epic1baseURL}/default/epic1/melCBDPopulation`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Population request failed (${res.status})`);

      const json = (await res.json()) as ApiEnvelope<PopulationRowRaw[]>;
      const rows = Array.isArray(json.result) ? json.result : [];
      const total = rows.find(
        (r) => isString(r['Area_Name']) && r['Area_Name'] === 'Melbourne CBD - Total',
      );
      if (!total) throw new Error('Could not find "Melbourne CBD - Total" in population data.');

      return getYearSeries(total);
    },

    async fetchVicVehicleAttrition(): Promise<{
      labels: string[];
      vehicles: number[];
      attrRate: number[];
    }> {
      const url = `${this.epic1baseURL}/default/epic1/vicVehichleAttr`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Attrition request failed (${res.status})`);

      const json = (await res.json()) as ApiEnvelope<unknown>;
      const rows = Array.isArray(json.result) ? json.result : [];
      const valid: AttritionRow[] = rows.filter(isAttritionRow);

      const labels = valid.map((r) => String(r.Period));
      const vehicles = valid.map((r) => r.Vehicles);
      const attrRate = valid.map((r) => r['Attrition Rate']);
      return { labels, vehicles, attrRate };
    },

    drawPopulationBar(data: { labels: string[]; values: number[] }) {
      const canvas = this.$refs.popCanvas as HTMLCanvasElement | undefined;
      if (!canvas) return;

      this.popChart?.destroy();

      const config: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [
            {
              label: 'Melbourne CBD - Total population',
              data: data.values,
              backgroundColor: 'rgba(41, 98, 255, 0.65)',
              borderColor: '#2962FF',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'Melbourne CBD - Total population by year' },
            legend: { display: true, position: 'top' },
            tooltip: { mode: 'index', intersect: false },
          },
          scales: {
            x: {
              title: { display: true, text: 'Year' },
              ticks: { maxRotation: 0, autoSkip: true },
            },
            y: { title: { display: true, text: 'Population' }, beginAtZero: true },
          },
        },
      };

      this.popChart = new Chart(
        canvas.getContext('2d') as CanvasRenderingContext2D,
        config as ChartConfiguration,
      );
    },

    drawAttritionCombo(data: { labels: string[]; vehicles: number[]; attrRate: number[] }) {
      const canvas = this.$refs.attrCanvas as HTMLCanvasElement | undefined;
      if (!canvas) return;

      this.attrChart?.destroy();

      const config: ChartConfiguration = {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [
            {
              type: 'bar',
              label: 'Vehicles (Vic.)',
              data: data.vehicles,
              backgroundColor: 'rgba(76, 175, 80, 0.6)',
              borderColor: 'rgba(76, 175, 80, 1)',
              borderWidth: 1,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: 'Attrition rate (%)',
              data: data.attrRate,
              borderColor: '#FF6D00',
              backgroundColor: '#FF6D00',
              borderWidth: 2,
              pointRadius: 3,
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'Victoria - Vehicles & Attrition rate' },
            legend: { display: true, position: 'top' },
            tooltip: { mode: 'index', intersect: false },
          },
          scales: {
            x: { title: { display: true, text: 'Year' } },
            y: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'Vehicles' },
              beginAtZero: true,
            },
            y1: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Attrition rate (%)' },
              beginAtZero: true,
            },
          },
        },
      };

      this.attrChart = new Chart(canvas.getContext('2d') as CanvasRenderingContext2D, config);
    },
  },
});
</script>

<template>
  <main class="home">
    <section class="hero">
      <div class="hero-content">
        <h1>ParkingSpy</h1>
        <p class="tagline">Smarter parking insights for Melbourne CBD</p>
        <div class="actions">
          <RouterLink class="btn primary" to="/map">Open interactive map</RouterLink>
          <a class="btn ghost" href="#insights">See city insights</a>
        </div>
      </div>
      <div class="hero-glow" aria-hidden="true"></div>
    </section>

    <section class="features">
      <div class="feature-card">
        <div class="icon">Map</div>
        <h3>Explore the map</h3>
        <p>Search places, view parking bays, and see live status around your destination.</p>
      </div>
      <div class="feature-card">
        <div class="icon">Tram</div>
        <h3>Near tram stops</h3>
        <p>Bays are annotated when they are within walking distance of tram stops.</p>
      </div>
      <div class="feature-card">
        <div class="icon">Plan</div>
        <h3>Plan your trip</h3>
        <p>Get a quick plan to your destination and jump to Google Maps directions.</p>
      </div>
    </section>

    <section id="insights" class="insights">
      <div class="card">
        <h2>Melbourne CBD population</h2>
        <div class="chart">
          <canvas ref="popCanvas"></canvas>
        </div>
      </div>
      <div class="card">
        <h2>Victoria vehicle attrition</h2>
        <div class="chart">
          <canvas ref="attrCanvas"></canvas>
        </div>
      </div>
    </section>

    <p v-if="loading" class="status muted">Loading charts...</p>
    <p v-if="errorMsg" class="status error">{{ errorMsg }}</p>
  </main>
</template>

<style scoped>
.home {
  display: grid;
  gap: 24px;
}

.hero {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: linear-gradient(180deg, rgba(41, 98, 255, 0.08) 0%, rgba(41, 98, 255, 0.02) 100%);
  border-radius: 16px;
  padding: 40px 24px;
}

.hero-content {
  max-width: 960px;
  margin: 0 auto;
  text-align: center;
}

.hero h1 {
  font-size: 40px;
  line-height: 1.1;
  color: var(--color-heading);
  margin-bottom: 8px;
}

.tagline {
  font-size: 18px;
  color: var(--vt-c-text-light-2);
}

.actions {
  display: inline-flex;
  gap: 12px;
  margin-top: 20px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  font-weight: 600;
}

.btn.primary {
  background: #2962ff;
  color: white;
  border-color: #1e4fe3;
}

.btn.ghost {
  background: transparent;
  color: var(--color-heading);
}

.hero-glow {
  position: absolute;
  inset: -40% -20% auto -20%;
  height: 240px;
  background: radial-gradient(60% 60% at 50% 50%, rgba(41, 98, 255, 0.35) 0%, rgba(41, 98, 255, 0) 70%);
  pointer-events: none;
}

.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.feature-card {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
  background: var(--color-background);
}

.feature-card .icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgba(41, 98, 255, 0.12);
  margin-bottom: 8px;
  font-size: 20px;
}

.feature-card h3 {
  font-size: 18px;
  margin-bottom: 6px;
  color: var(--color-heading);
}

.feature-card p {
  color: var(--vt-c-text-light-2);
}

.insights {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.card {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
  background: var(--color-background);
}

.card h2 {
  margin-bottom: 8px;
}

.chart {
  height: 360px;
}

.status {
  margin-top: 4px;
}

.status.muted {
  opacity: 0.7;
}

.status.error {
  color: #d32f2f;
}

@media (max-width: 900px) {
  .features {
    grid-template-columns: 1fr;
  }
  .insights {
    grid-template-columns: 1fr;
  }
  .hero h1 {
    font-size: 32px;
  }
}
</style>
