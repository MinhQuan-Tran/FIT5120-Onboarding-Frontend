<script>
import { createApp } from 'vue';
import MapControls from '@/components/MapControls.vue';
import DestinationInsights from '@/components/DestinationInsights.vue';
import TripPlanner from '@/components/TripPlanner.vue'; // ← NEW

export default {
  data() {
    return {
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      layerVisible: false,
      mapInstance: null,
      markerRef: null,
      lgaLayer: null,
      controlsApp: null,
      controlsEl: null,
      inited: false,
      geojsonLoaded: false,
      popupApp: null,
      popupEl: null,
      infoWindow: null, // shared InfoWindow
      lastInsightsProps: null, // ← remember to support "Back"
    };
  },

  mounted() {
    this.loadWhenReady();
  },

  beforeUnmount() {
    if (this.controlsApp && this.controlsEl) {
      this.controlsApp.unmount();
      this.controlsEl.remove();
    }
    if (this.lgaLayer) {
      this.lgaLayer.setMap(null);
      this.lgaLayer = null;
    }
    if (this.popupApp && this.popupEl) {
      this.popupApp.unmount();
      this.popupEl = null;
      this.popupApp = null;
    }
    if (this.infoWindow) {
      this.infoWindow.close();
      this.infoWindow = null;
    }
  },

  methods: {
    async loadWhenReady() {
      if (!this.apiKey) {
        console.error('Google Maps API key is not set.');
        return;
      }
      document.querySelector('gmpx-api-loader')?.setAttribute('key', this.apiKey);

      await customElements.whenDefined('gmp-map');
      await this.$nextTick();

      const mapEl = this.$refs.map?.innerMap;
      if (!mapEl) {
        setTimeout(() => this.loadWhenReady(), 100);
        return;
      }

      this.mapInstance = mapEl;
      this.markerRef = this.$refs.marker;
      this.init();
    },

    async init() {
      if (this.inited) return;
      this.inited = true;

      const map = this.mapInstance;
      const marker = this.markerRef;
      if (!map || !marker) return;

      map.setOptions({
        mapTypeControl: false,
        streetViewControl: false,
        center: { lat: -37.81230926513672, lng: 144.96234130859375 },
        mapId: '11149c6c4a20631b72145c7a',
      });

      // One shared InfoWindow
      this.infoWindow = new google.maps.InfoWindow({ maxWidth: 400 });

      // Disable default map.data usage
      map.data.setMap(null);

      // Local Data layer
      if (!this.lgaLayer) {
        this.lgaLayer = new google.maps.Data({ map });
        this.lgaLayer.setStyle(() => ({
          strokeColor: '#2962FF',
          strokeWeight: 3,
          strokeOpacity: 1,
          fillColor: '#2962FF',
          fillOpacity: 0.25,
          visible: this.layerVisible,
        }));
      }

      // Load GeoJSON once
      if (!this.geojsonLoaded) {
        try {
          const gj = await fetch('/melbourne_lga_24600.geojson').then((r) => r.json());
          this.lgaLayer.forEach((f) => this.lgaLayer.remove(f));
          const added = this.lgaLayer.addGeoJson(gj);
          this.geojsonLoaded = true;

          const bounds = new google.maps.LatLngBounds();
          added.forEach((f) => f.getGeometry()?.forEachLatLng((ll) => bounds.extend(ll)));
          if (!bounds.isEmpty()) map.fitBounds(bounds);
        } catch (e) {
          console.error('Failed to load local GeoJSON. Ensure the file is in /public.', e);
        }
      }

      // Place picker -> shared custom info window
      const placePicker = document.querySelector('gmpx-place-picker');
      if (placePicker && !placePicker.__popupBound) {
        placePicker.__popupBound = true;

        placePicker.addEventListener('gmpx-placechange', () => {
          const place = placePicker.value;
          if (!place || !place.location) {
            window.alert(`No details available for input: '${place?.name}'`);
            this.infoWindow.close();
            marker.position = null;
            return;
          }

          if (place.viewport) {
            map.fitBounds(place.viewport);
          } else {
            map.setCenter(place.location);
            map.setZoom(17);
          }
          marker.position = place.location;

          const title = place.displayName ?? place.name ?? 'Selected place';
          const address = place.formattedAddress ?? '';
          const lat =
            typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
          const lng =
            typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
          const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;

          // anchor to marker; no explicit position
          this.openInfoWindow({ title, address, lat, lng, linkHref: link }, marker, null);
        });
      }

      // POI clicks on the map -> same custom info window
      await google.maps.importLibrary('places');
      const places = new google.maps.places.PlacesService(map);

      map.addListener('click', (e) => {
        if (!e.placeId) return;
        e.stop(); // stop default POI bubble

        places.getDetails(
          { placeId: e.placeId, fields: ['name', 'formatted_address', 'geometry.location'] },
          (place, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location)
              return;

            const loc = place.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
            const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;

            this.openInfoWindow(
              {
                title: place.name ?? 'Place',
                address: place.formatted_address ?? '',
                lat,
                lng,
                linkHref: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name ?? 'Place')}`,
              },
              null,
              loc,
            );
          },
        );
      });

      // Clicking your marker also reuses the same info window
      marker.addEventListener('gmp-click', () => {
        const pos = marker.position;
        const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
        this.openInfoWindow(
          {
            title: 'Marker',
            address: 'Selected marker position',
            lat,
            lng,
            linkHref: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
          },
          marker,
          null,
        );
      });

      // Mount MapControls
      this.mountControls();

      map.addListener('zoom_changed', () => {
        let count = 0;
        this.lgaLayer.forEach(() => count++);
        // console.log('zoom', map.getZoom(), 'features in layer', count);
      });
    },

    // Helper: mount any Vue component into the shared InfoWindow
    mountInfoContent(Component, props) {
      if (!this.mapInstance || !this.infoWindow) return;

      // Unmount previous
      if (this.popupApp && this.popupEl) {
        this.popupApp.unmount();
        this.popupEl = null;
        this.popupApp = null;
      }

      const el = document.createElement('div');
      this.popupApp = createApp(Component, props);
      this.popupApp.mount(el);
      this.popupEl = el;

      this.infoWindow.setContent(el);
    },

    // Open InfoWindow with the DestinationInsights component
    openInfoWindow(props, anchor, position) {
      if (!this.mapInstance || !this.infoWindow) return;

      // Remember insights props so we can come back from the planner
      this.lastInsightsProps = { ...props };

      // Mount insights with an event handler to swap to planner
      this.mountInfoContent(DestinationInsights, {
        ...props,
        onOpenPlanner: (payload) => this.handleOpenPlanner(payload),
      });

      // Style tweaks on first open
      const mapDiv = this.mapInstance.getDiv();
      google.maps.event.addListenerOnce(this.infoWindow, 'domready', () => {
        const iwC = mapDiv.querySelector('.gm-style-iw-c');
        const iwD = mapDiv.querySelector('.gm-style-iw-d');
        const iw = mapDiv.querySelector('.gm-style-iw');
        [iwC, iwD, iw].forEach((node) => {
          if (node) node.style.padding = '8px';
        });

        const titleContainer = mapDiv.querySelector('.gm-style-iw-ch');
        if (titleContainer) {
          titleContainer.style.padding = '0';
          titleContainer.textContent = props && props.title ? String(props.title) : '';
          titleContainer.style.fontWeight = 'bold';
          titleContainer.style.fontSize = '24px';
          titleContainer.style.lineHeight = '32px';
          titleContainer.style.color = '#2962FF';
        }

        const closeButton = mapDiv.querySelector('button[aria-label="Close"]');
        if (closeButton) {
          closeButton.style.width = '24px';
          closeButton.style.height = '24px';
          closeButton.style.position = 'static';
          closeButton.style.margin = '0 0 auto auto';
          const span = closeButton.querySelector('span');
          if (span) span.style.margin = 'auto';
        }

        const dialogContainer = mapDiv.querySelector('.gm-style-iw-d');
        if (dialogContainer) dialogContainer.style.padding = '0';
      });

      // Open by anchor or position
      if (position) {
        this.infoWindow.setPosition(position);
        this.infoWindow.open(this.mapInstance);
      } else if (anchor) {
        this.infoWindow.open(this.mapInstance, anchor);
      } else {
        this.infoWindow.open(this.mapInstance);
      }
    },

    // Swap to TripPlanner after "Plan To"
    handleOpenPlanner(payload) {
      // payload: { address, lat, lng, selectedDay, busySeries }
      this.mountInfoContent(TripPlanner, {
        address: payload.address,
        lat: payload.lat,
        lng: payload.lng,
        busySeries: payload.busySeries,
        defaultTravelMinutes: 20,
        onBack: () => this.handlePlannerBack(),
        onGoTo: (plan) => this.handlePlannerGoTo(plan),
      });
    },

    // Back -> restore DestinationInsights
    handlePlannerBack() {
      if (!this.lastInsightsProps) return;
      this.mountInfoContent(DestinationInsights, {
        ...this.lastInsightsProps,
        onOpenPlanner: (payload) => this.handleOpenPlanner(payload),
      });
    },

    // Go To -> example: open Google Maps directions to destination
    handlePlannerGoTo(plan) {
      // plan contains: address, lat, lng, arrivalTime, suggestedDepartTime, travelMinutes, searchMinutes, status
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        plan.address || `${plan.lat},${plan.lng}`,
      )}&travelmode=driving`;
      window.open(url, '_blank');
      // Keep the planner open; or close InfoWindow if you prefer:
      // this.infoWindow?.close();
    },

    mountControls() {
      if (!this.mapInstance) return;
      const map = this.mapInstance;
      if (this.controlsApp && this.controlsEl) return;

      const rootEl = document.createElement('div');
      this.controlsEl = rootEl;

      this.controlsApp = createApp(MapControls, {
        initialLgaVisible: this.layerVisible,
        onToggleLga: (visible) => {
          this.layerVisible = visible;
          if (this.lgaLayer) {
            this.lgaLayer.setStyle(() => ({
              strokeColor: '#2962FF',
              strokeWeight: 3,
              strokeOpacity: 1,
              fillColor: '#2962FF',
              fillOpacity: 0.25,
              visible: this.layerVisible,
            }));
          }
        },
      });

      this.controlsApp.mount(rootEl);
      map.controls[google.maps.ControlPosition.TOP_LEFT].push(rootEl);
    },
  },
};
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

    <gmp-map ref="map">
      <gmp-advanced-marker ref="marker"></gmp-advanced-marker>
    </gmp-map>
  </main>
</template>
