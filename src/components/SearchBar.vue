<script lang="ts">
export default {};
</script>

<template>
  <div
    ref="mapContainer"
    v-bind:slot="'control-block-start-inline-start'"
    class="place-picker-container"
  >
    <gmpx-place-picker ref="place-picker" placeholder="Enter an address"></gmpx-place-picker>
  </div>
</template>
