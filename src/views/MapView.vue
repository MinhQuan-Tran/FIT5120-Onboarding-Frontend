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
      if (!this.apiKey) {
        console.error('Google Maps API key is not set.');
        return;
      }

      document.querySelector('gmpx-api-loader').setAttribute('key', this.apiKey);

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
        center: { lat: -37.81230926513672, lng: 144.96234130859375 },
        zoom: 14,
      });

      placePicker?.addEventListener('gmpx-placechange', () => {
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

    <gmp-map ref="map" map-id="11149c6c4a20631bbf3ddc4f">
      <gmp-advanced-marker ref="marker"></gmp-advanced-marker>
    </gmp-map>
  </main>
</template>

<style scoped></style>
