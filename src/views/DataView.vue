<script lang="ts">
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

export default {
  name: 'DataView',
  data() {
    return {
      chartData: {
        labels: ['January', 'February', 'March'],
        datasets: [{ data: [40, 20, 12] }],
      },
      chartOptions: {
        responsive: true,
      },
    };
  },
  components: {
    Bar,
  },
};
</script>

<template>
  <main class="data-view">
    <h1>Data View</h1>
    <p>This is the data view where you can display and manage your data.</p>
    <!-- Add your data display and management components here -->
    <Bar id="my-chart-id" :options="chartOptions" :data="chartData" />
  </main>
</template>
