<script lang="ts">
import { defineComponent } from 'vue';
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
import SearchBar from '@/components/SearchBar.vue';

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
  components: { SearchBar },

  data() {
    return {
      epic1baseURL: 'https://u6f6jwcwa0.execute-api.us-east-1.amazonaws.com',
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
              label: 'Melbourne CBD – Total population',
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
            title: { display: true, text: 'Melbourne CBD – Total population by year' },
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
            title: { display: true, text: 'Victoria – Vehicles & Attrition rate' },
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
  <main style="display: grid; gap: 24px">
    <SearchBar />

    <section>
      <h2 style="margin: 0 0 8px">Melbourne CBD population (bar)</h2>
      <div style="height: 360px">
        <canvas ref="popCanvas"></canvas>
      </div>
    </section>

    <section>
      <h2 style="margin: 0 0 8px">Victoria vehicle attrition (bars + line)</h2>
      <div style="height: 360px">
        <canvas ref="attrCanvas"></canvas>
      </div>
    </section>

    <p v-if="loading" style="opacity: 0.7">Loading charts…</p>
    <p v-if="errorMsg" style="color: #d32f2f">{{ errorMsg }}</p>
  </main>
</template>

<style scoped></style>
