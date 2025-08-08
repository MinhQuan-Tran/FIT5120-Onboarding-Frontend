<script>
/// <reference types="@types/google.maps" />
import { defineComponent } from 'vue';

export default defineComponent({
  data() {
    return {
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    };
  },

  mounted() {
    this.loadWhenReady();
  },

  methods: {
    async loadWhenReady() {
      await customElements.whenDefined('gmp-map');
      await this.$nextTick();

      const mapEl = this.$refs.map;
      if (!mapEl?.innerMap) {
        // Wait a tiny bit more if innerMap isn't ready
        setTimeout(() => this.init(), 100);
        return;
      }

      this.init();
    },

    async init() {
      await customElements.whenDefined('gmp-map');

      const map = this.$refs.map;
      const marker = this.$refs.marker;
      const placePicker = document.querySelector('gmpx-place-picker');
      const infowindow = new google.maps.InfoWindow();

      map.innerMap?.setOptions({
        mapTypeControl: false,
        center: { lat: 40.749933, lng: -73.98633 },
        zoom: 13,
      });

      placePicker?.addEventListener('gmpx-placechange', () => {
        console.log('placePicker value changed', placePicker.value);

        const place = placePicker.value;

        if (!place?.location) {
          window.alert(`No details available for input: '${place?.name}'`);
          infowindow.close();
          marker.position = null;
          return;
        }

        if (place.viewport) {
          map.innerMap?.fitBounds(place.viewport);
        } else {
          map.innerMap?.setCenter(place.location);
          map.innerMap?.setZoom(17);
        }

        marker.position = place.location;
        infowindow.setContent(
          `<strong>${place.displayName}</strong><br><span>${place.formattedAddress}</span>`,
        );
        infowindow.open(map.innerMap, marker);
      });
    },
  },
});
</script>

<template>
  <main>
    <div
      ref="mapContainer"
      v-bind:slot="'control-block-start-inline-start'"
      class="place-picker-container"
    >
      <gmpx-place-picker ref="place-picker" placeholder="Enter an address"></gmpx-place-picker>
    </div>

    <gmp-map ref="map" map-id="DEMO_MAP_ID">
      <gmp-advanced-marker ref="marker"></gmp-advanced-marker>
    </gmp-map>
  </main>
</template>

<style scoped></style>
