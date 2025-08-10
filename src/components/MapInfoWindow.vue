<script lang="ts">
import { defineComponent, type CSSProperties, onMounted, onBeforeUnmount, watch, ref } from 'vue';
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
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);

type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

type Hour = `${number}${number}:00`; // "00:00".."23:00"
type DaySeries = readonly number[]; // length 24, 0..100
type BusyDataset = Record<Day, DaySeries>;

function hourLabels(): Hour[] {
  const labels: Hour[] = [];
  for (let h = 0; h < 24; h++) {
    const s = h.toString().padStart(2, '0') as `${number}${number}`;
    labels.push(`${s}:00`);
  }
  return labels;
}

// Dummy data: tweak shapes a bit per day
const DUMMY_BUSY: BusyDataset = {
  Monday: Array.from({ length: 24 }, (_, h) =>
    h < 6 ? 8 : h < 9 ? 35 + (h - 6) * 15 : h < 17 ? 65 : h < 20 ? 55 : 20,
  ) as DaySeries,
  Tuesday: Array.from({ length: 24 }, (_, h) =>
    h < 6 ? 10 : h < 9 ? 40 + (h - 6) * 16 : h < 17 ? 70 : h < 20 ? 60 : 22,
  ) as DaySeries,
  Wednesday: Array.from({ length: 24 }, (_, h) =>
    h < 6 ? 10 : h < 9 ? 42 + (h - 6) * 16 : h < 17 ? 72 : h < 20 ? 62 : 22,
  ) as DaySeries,
  Thursday: Array.from({ length: 24 }, (_, h) =>
    h < 6 ? 12 : h < 9 ? 44 + (h - 6) * 16 : h < 17 ? 74 : h < 21 ? 64 : 24,
  ) as DaySeries,
  Friday: Array.from({ length: 24 }, (_, h) =>
    h < 6 ? 12 : h < 9 ? 48 + (h - 6) * 17 : h < 17 ? 78 : h < 22 ? 70 : 28,
  ) as DaySeries,
  Saturday: Array.from({ length: 24 }, (_, h) =>
    h < 7 ? 14 : h < 12 ? 45 + (h - 7) * 10 : h < 20 ? 75 : 35,
  ) as DaySeries,
  Sunday: Array.from({ length: 24 }, (_, h) =>
    h < 8 ? 12 : h < 12 ? 40 + (h - 8) * 8 : h < 19 ? 60 : 25,
  ) as DaySeries,
};

export default defineComponent({
  name: 'MapPopup',
  props: {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    linkHref: { type: String, required: false, default: '' },
  },
  computed: {
    boxStyle(): CSSProperties {
      return {
        color: '#333',
      };
    },
    lineStyle(): CSSProperties {
      return { margin: '2px 0' };
    },
    linkStyle(): CSSProperties {
      return { color: '#FF6D00', textDecoration: 'underline' };
    },
  },
  setup() {
    const selectedDay = ref<Day>('Monday');
    const canvasRef = ref<HTMLCanvasElement | null>(null);
    const chartRef = ref<Chart<'bar'> | null>(null);
    const labels = hourLabels();

    const buildConfig = (day: Day): ChartConfiguration<'bar'> => ({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: `${day} busyness (%)`,
            data: DUMMY_BUSY[day].slice(), // copy
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
          legend: { display: true, position: 'top' },
          title: { display: true, text: 'Live busyness by hour' },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: {
            title: { display: true, text: 'Hour' },
            ticks: { maxRotation: 0, autoSkip: true },
          },
          y: {
            title: { display: true, text: 'Busyness (%)' },
            beginAtZero: true,
            suggestedMax: 100,
          },
        },
      },
    });

    onMounted(() => {
      const ctx = canvasRef.value?.getContext('2d');
      if (!ctx) return;
      chartRef.value = new Chart(ctx, buildConfig(selectedDay.value));
    });

    onBeforeUnmount(() => {
      chartRef.value?.destroy();
      chartRef.value = null;
    });

    watch(selectedDay, (day) => {
      const chart = chartRef.value;
      if (!chart) return;
      // Update dataset values in place for smoothness
      chart.data.datasets[0].label = `${day} busyness (%)`;
      chart.data.datasets[0].data = DUMMY_BUSY[day].slice();
      chart.update();
    });

    return {
      selectedDay,
      canvasRef,
    };
  },
});
</script>

<template>
  <div :style="boxStyle">
    <p :style="lineStyle">{{ address }}</p>
    <a v-if="linkHref" :href="linkHref" target="_blank" rel="noopener" :style="linkStyle">
      View on Google Maps
    </a>

    <!-- Day selector -->
    <div style="margin: 8px 0">
      <label for="busy-day" style="margin-right: 8px">Day</label>
      <select id="busy-day" v-model="selectedDay">
        <option>Monday</option>
        <option>Tuesday</option>
        <option>Wednesday</option>
        <option>Thursday</option>
        <option>Friday</option>
        <option>Saturday</option>
        <option>Sunday</option>
      </select>
    </div>

    <!-- Bar chart container -->
    <div style="height: 180px; width: 260px">
      <canvas ref="canvasRef"></canvas>
    </div>
  </div>
</template>
