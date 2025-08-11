<script lang="ts">
import {
  defineComponent,
  type CSSProperties,
  onMounted,
  onBeforeUnmount,
  watch,
  ref,
  nextTick,
} from 'vue';
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
type Hour = `${number}${number}:00`;
type DaySeries = readonly number[];
type BusyDataset = Record<Day, DaySeries>;

function hourLabels(): Hour[] {
  const labels: Hour[] = [];
  for (let h = 0; h < 24; h++) {
    const s = h.toString().padStart(2, '0') as `${number}${number}`;
    labels.push(`${s}:00`);
  }
  return labels;
}

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
        color: '#222',
      };
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
      return { height: '190px', width: '100%', minWidth: '240px' };
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
  },
  setup() {
    const selectedDay = ref<Day>('Monday');
    const canvasRef = ref<HTMLCanvasElement | null>(null);
    const chartRef = ref<Chart<'bar'> | null>(null);
    const ro = ref<ResizeObserver | null>(null);
    const labels = hourLabels();

    const buildConfig = (day: Day): ChartConfiguration<'bar'> => ({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: `${day} busyness`,
            data: DUMMY_BUSY[day].slice(),
            xAxisID: 'x',
            yAxisID: 'y',
            backgroundColor: 'rgba(61, 90, 254, 0.75)',
            borderColor: '#3D5AFE',
            borderWidth: 1,
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
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                return items[0]?.label ?? '';
              },
              label(ctx) {
                return ` Busy: ${typeof ctx.parsed.y === 'number' ? ctx.parsed.y : 0}%`;
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
            beginAtZero: true,
            suggestedMax: 100,
            ticks: {
              stepSize: 25,
              callback(value) {
                return `${value}%`;
              },
              font: { size: 10 },
            },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    });

    const hasScales = (c: Chart<'bar'> | null): boolean => {
      const s = c?.scales as unknown as Record<string, unknown> | undefined;
      return !!(s && s['x'] && s['y']);
    };

    const createChart = (day: Day): void => {
      const ctx = canvasRef.value?.getContext('2d');
      if (!ctx) return;
      chartRef.value?.destroy();
      chartRef.value = new Chart(ctx, buildConfig(day));
    };

    // Wait until the canvas is connected and has non-zero size (InfoWindow timing)
    const waitForCanvas = async (): Promise<void> => {
      await nextTick();
      let tries = 0;
      while (tries < 20) {
        // ~20 frames max
        const el = canvasRef.value;
        if (el && el.isConnected) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return;
        }
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        tries++;
      }
    };

    onMounted(async () => {
      await waitForCanvas();
      createChart(selectedDay.value);

      // Keep responsive inside InfoWindow
      if (canvasRef.value?.parentElement) {
        ro.value = new ResizeObserver(() => chartRef.value?.resize());
        ro.value.observe(canvasRef.value.parentElement);
      }
    });

    onBeforeUnmount(() => {
      ro.value?.disconnect();
      ro.value = null;
      chartRef.value?.destroy();
      chartRef.value = null;
    });

    watch(
      selectedDay,
      (day) => {
        queueMicrotask(() => {
          const chart = chartRef.value;
          if (!chart || !hasScales(chart)) {
            createChart(day);
            return;
          }
          try {
            chart.data.datasets[0].label = `${day} busyness`;
            chart.data.datasets[0].data = DUMMY_BUSY[day].slice();
            chart.update();
          } catch {
            // If update fails during a reflow, rebuild
            createChart(day);
          }
        });
      },
      { flush: 'post' },
    );

    return { selectedDay, canvasRef };
  },
});
</script>

<template>
  <div :style="boxStyle">
    <!-- Address -->
    <p :style="rowStyle">{{ address }}</p>

    <!-- Header row: Busy hours + Day selection -->
    <div :style="headerStyle">
      <span :style="badgeStyle">Busy hours</span>

      <div>
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

    <!-- Bar chart -->
    <div :style="chartWrapStyle">
      <canvas ref="canvasRef" style="display: block; width: 100%; height: 100%"></canvas>
    </div>

    <!-- Link -->
    <a v-if="linkHref" :href="linkHref" target="_blank" rel="noopener" :style="linkStyle">
      View on Google Maps
    </a>
  </div>
</template>
