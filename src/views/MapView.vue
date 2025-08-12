<script>
import { createApp } from 'vue';
import MapControls from '@/components/MapControls.vue';
import DestinationInsights from '@/components/DestinationInsights.vue';
import TripPlanner from '@/components/TripPlanner.vue';
import BayInfo from '@/components/BayInfo.vue';

const EPIC2_BASE = import.meta.env.VITE_EPIC2_BASE; // for busySeries
const BUSY_PATH = '/default/epic2/parkingBusyHourly';

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
      infoWindow: null,
      lastInsightsProps: null,

      // bay state
      parkingMarkers: [],
      baysLoading: false,
      baysError: '',
      baysCounts: { unoccupied: 0, occupied: 0 },
      _baysReqId: 0,
      _markerLib: null,

      // remember last opened bay so planner back returns to it
      lastBayProps: null,
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
    this.clearParkingMarkers();
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

      this.infoWindow = new google.maps.InfoWindow({ maxWidth: 400 });
      map.data.setMap(null);

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

      // Place picker
      const placePicker = document.querySelector('gmpx-place-picker');
      if (placePicker && !placePicker.__popupBound) {
        placePicker.__popupBound = true;

        placePicker.addEventListener('gmpx-placechange', () => {
          const place = placePicker.value;
          if (!place || !place.location) {
            window.alert(`No details available for input: '${place?.name}'`);
            this.infoWindow.close();
            marker.position = null;
            this.clearParkingMarkers();
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

          this.openInfoWindow({ title, address, lat, lng, linkHref: link }, marker, null);
          this.fetchAndRenderBays(lat, lng);
        });
      }

      // POI clicks
      await google.maps.importLibrary('places');
      const places = new google.maps.places.PlacesService(map);

      map.addListener('click', (e) => {
        if (!e.placeId) return;
        e.stop();

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
            this.fetchAndRenderBays(lat, lng);
          },
        );
      });

      // Marker click
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
        this.fetchAndRenderBays(lat, lng);
      });

      this.mountControls();
    },

    // ---- InfoWindow helpers ----
    mountInfoContent(Component, props) {
      if (!this.mapInstance || !this.infoWindow) return;

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

    applyInfoWindowChrome(titleText) {
      const mapDiv = this.mapInstance.getDiv();
      google.maps.event.addListenerOnce(this.infoWindow, 'domready', () => {
        const iwC = mapDiv.querySelector('.gm-style-iw-c');
        const iwD = mapDiv.querySelector('.gm-style-iw-d');
        const iw = mapDiv.querySelector('.gm-style-iw');
        [iwC, iwD, iw].forEach((node) => node && (node.style.padding = '8px'));

        const titleContainer = mapDiv.querySelector('.gm-style-iw-ch');
        if (titleContainer) {
          titleContainer.style.padding = '0';
          titleContainer.textContent = titleText ? String(titleText) : '';
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
    },

    openInfoWindow(props, anchor, position) {
      if (!this.mapInstance || !this.infoWindow) return;

      this.lastInsightsProps = { ...props };

      this.mountInfoContent(DestinationInsights, {
        ...props,
        onOpenPlanner: (payload) => this.handleOpenPlanner(payload),
      });
      this.applyInfoWindowChrome(props?.title || 'Details');

      if (position) {
        this.infoWindow.setPosition(position);
        this.infoWindow.open(this.mapInstance);
      } else if (anchor) {
        this.infoWindow.open(this.mapInstance, anchor);
      } else {
        this.infoWindow.open(this.mapInstance);
      }
    },

    // ---- Planner swap from insights ----
    handleOpenPlanner(payload) {
      this.mountInfoContent(TripPlanner, {
        address: payload.address,
        lat: payload.lat,
        lng: payload.lng,
        busySeries: payload.busySeries,
        defaultTravelMinutes: 20,
        onBack: () => this.handlePlannerBack(),
        onGoTo: (plan) => this.handlePlannerGoTo(plan),
      });
      this.applyInfoWindowChrome('Trip plan');
    },
    handlePlannerBack() {
      if (!this.lastInsightsProps) return;
      this.mountInfoContent(DestinationInsights, {
        ...this.lastInsightsProps,
        onOpenPlanner: (payload) => this.handleOpenPlanner(payload),
      });
      this.applyInfoWindowChrome(this.lastInsightsProps?.title || 'Details');
    },
    handlePlannerGoTo(plan) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        plan.address || `${plan.lat},${plan.lng}`,
      )}&travelmode=driving`;
      window.open(url, '_blank');
    },

    // ---- Controls ----
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

    // ---- Marker lib ----
    async ensureMarkerLib() {
      if (this._markerLib) return this._markerLib;
      this._markerLib = await google.maps.importLibrary('marker');
      return this._markerLib;
    },

    clearParkingMarkers() {
      this.parkingMarkers.forEach((m) => (m.map = null));
      this.parkingMarkers = [];
      this.baysCounts = { unoccupied: 0, occupied: 0 };
      this.baysError = '';
    },

    baysUrl(lat, lng) {
      const u = new URL(
        'https://p6p1i5ed5h.execute-api.us-east-1.amazonaws.com/default/epic2/nearbySegments',
      );
      u.searchParams.set('lat', String(lat));
      u.searchParams.set('lon', String(lng));
      return u.toString();
    },

    // ---- Melbourne-time + restriction helpers ----
    melNowParts() {
      const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Melbourne',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t)?.value;
      const wd = (get('weekday') || '').slice(0, 3);
      const hh = Number(get('hour') || '0');
      const mm = Number(get('minute') || '0');
      return { weekday: wd, minutes: hh * 60 + mm };
    },

    expandDays(spec) {
      if (!spec) return new Set();
      const norm = String(spec).replace(/\s+/g, '').replace('–', '-');
      const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const set = new Set();
      const parts = norm.split(',');
      for (const p of parts) {
        if (!p) continue;
        const m = p.split('-');
        if (m.length === 2) {
          const a = DAY.indexOf(m[0]);
          const b = DAY.indexOf(m[1]);
          if (a >= 0 && b >= 0) {
            if (a <= b) for (let i = a; i <= b; i++) set.add(DAY[i]);
            else {
              for (let i = a; i < DAY.length; i++) set.add(DAY[i]);
              for (let i = 0; i <= b; i++) set.add(DAY[i]);
            }
          }
        } else {
          const short = p.slice(0, 3);
          if (DAY.includes(short)) set.add(short);
        }
      }
      return set;
    },

    hhmmToMin(s) {
      if (!s) return null;
      const [h, m] = String(s)
        .split(':')
        .map((x) => Number(x));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    },

    inWindow(startStr, endStr, nowMin) {
      const s = this.hhmmToMin(startStr);
      const e = this.hhmmToMin(endStr);
      if (s == null || e == null) return false;
      if (e === s) return true;
      if (e > s) return nowMin >= s && nowMin < e;
      return nowMin >= s || nowMin < e;
    },

    displayToMinutes(label) {
      if (!label) return Number.POSITIVE_INFINITY;
      const m = String(label)
        .toUpperCase()
        .match(/^(\d+)\s*([PM])$/);
      if (!m) return Number.POSITIVE_INFINITY;
      const n = Number(m[1]);
      return m[2] === 'P' ? n * 60 : n;
    },

    chooseCurrentRow(rows) {
      const { weekday, minutes } = this.melNowParts();
      const candidates = rows.filter((r) => {
        const days = this.expandDays(r?.Restriction_Days);
        if (!days.has(weekday)) return false;
        return this.inWindow(r?.Time_Restrictions_Start, r?.Time_Restrictions_Finish, minutes);
      });
      if (!candidates.length) return null;
      candidates.sort(
        (a, b) =>
          this.displayToMinutes(a?.Restriction_Display) -
          this.displayToMinutes(b?.Restriction_Display),
      );
      return candidates[0];
    },

    selectCurrentBays(json) {
      const rows = Array.isArray(json?.result) ? json.result : [];
      const groups = new Map();
      for (const r of rows) {
        const id = String(r?.KerbsideID ?? '');
        if (!id) continue;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(r);
      }

      const now = this.melNowParts();
      const out = [];

      for (const [kerbsideId, arr] of groups.entries()) {
        const curr = this.chooseCurrentRow(arr);
        if (!curr) continue;

        const rawStatuses = new Set(arr.map((r) => String(r?.Status_Description || '')));
        const occupied = [...rawStatuses].some((s) => /Present/i.test(s));
        const unoccupied = [...rawStatuses].some((s) => /Unoccupied/i.test(s));
        const status = occupied ? 'occupied' : unoccupied ? 'unoccupied' : 'unknown';

        const dedupe = new Map();
        for (const r of arr) {
          const label = String(r?.Restriction_Display || '').toUpperCase();
          const days = String(r?.Restriction_Days || '');
          const start = String(r?.Time_Restrictions_Start || '');
          const finish = String(r?.Time_Restrictions_Finish || '');
          const key = `${label}|${days}|${start}|${finish}`;
          if (!dedupe.has(key)) {
            const daySet = this.expandDays(days);
            const active = daySet.has(now.weekday) && this.inWindow(start, finish, now.minutes);
            dedupe.set(key, { label, days, start, finish, isActive: active });
          }
        }
        const restrictions = [...dedupe.values()].sort(
          (a, b) => this.displayToMinutes(a.label) - this.displayToMinutes(b.label),
        );

        out.push({
          kerbsideId,
          status,
          lat: Number(curr?.Latitude),
          lng: Number(curr?.Longitude),
          zone: String(curr?.Restriction_Display || '').toUpperCase(),
          segment: String(curr?.RoadSegmentDescription || ''),
          seenAt: String(curr?.Status_Timestamp || ''),
          restrictions,
        });
      }
      return out;
    },

    // ---- Busy series fetch (for TripPlanner) ----
    todayInMelbourne() {
      const name = new Intl.DateTimeFormat('en-AU', {
        weekday: 'long',
        timeZone: 'Australia/Melbourne',
      }).format(new Date());
      const valid = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      return valid.includes(name) ? name : 'Monday';
    },
    normaliseBusy(arr) {
      const a = Array.isArray(arr) ? arr.slice(0, 24) : [];
      const out = Array(24).fill(0);
      for (let i = 0; i < 24; i++) {
        const v = Number(a[i] ?? 0);
        out[i] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
      }
      return out;
    },
    async fetchBusySeries(lat, lng) {
      try {
        const day = this.todayInMelbourne();
        const params = new URLSearchParams({ lat: String(lat), lng: String(lng), day });
        const url = `${EPIC2_BASE}${BUSY_PATH}?${params.toString()}`;
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`busy HTTP ${res.status}`);
        const json = await res.json();
        if (json?.code !== 0) throw new Error(json?.message || 'API error');
        return this.normaliseBusy(json?.result?.busy);
      } catch (e) {
        console.warn('Busy series fallback (zeros):', e);
        return Array(24).fill(0);
      }
    },

    // ---- Markers (keep your LZ yellow early-return) ----
    async ensureMarkerLib() {
      if (this._markerLib) return this._markerLib;
      this._markerLib = await google.maps.importLibrary('marker');
      return this._markerLib;
    },

    makePin({ status, label }) {
      const { PinElement } = this._markerLib;

      const raw = String(label ?? '').trim();
      const norm = raw.toUpperCase();
      const compact = norm.replace(/[\s\-_.]/g, '');
      const isLZ =
        /(LZ|LDZ|LOADING|LOAD|PICK ?UP|PKUP|DELIV)/i.test(raw) ||
        compact.startsWith('LZ') ||
        compact.endsWith('LZ') ||
        compact.includes('LOADINGZONE');

      const isUnocc = status === 'unoccupied';
      const isOcc = status === 'occupied';

      const makeGlyph = (text, sizePx, color) => {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.fontFamily =
          'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        el.style.fontWeight = '700';
        el.style.lineHeight = '1';
        el.style.fontSize = `${sizePx}px`;
        el.style.color = color;
        el.style.transform = 'translateY(1px)';
        el.style.letterSpacing = '-0.25px';
        return el;
      };

      // LZ (unoccupied) -> yellow, return early
      if (isLZ && isUnocc) {
        const pin = new PinElement({
          background: '#FDD835',
          borderColor: '#F9A825',
          glyph: makeGlyph(raw || 'LZ', 9, '#111111'),
          scale: 1.08,
        });
        return pin.element;
      }

      const background = isUnocc ? '#2E7D32' : isOcc ? '#E53935' : '#9E9E9E';
      const border = isUnocc ? '#1B5E20' : isOcc ? '#B71C1C' : '#616161';
      const glyphColor = '#FFFFFF';
      const glyphText = isUnocc ? raw || 'P' : '•';
      const glyphSize = isUnocc ? 9 : 8; // smaller text
      const scale = isOcc ? 0.66 : 0.98; // occupied smaller

      const pin = new PinElement({
        background,
        borderColor: border,
        glyph: makeGlyph(glyphText, glyphSize, glyphColor),
        scale,
      });
      return pin.element;
    },

    // ---- Bay InfoWindow ----
    handleBayBack() {
      if (!this.lastInsightsProps) return;
      this.mountInfoContent(DestinationInsights, {
        ...this.lastInsightsProps,
        onOpenPlanner: (payload) => this.handleOpenPlanner(payload),
      });
      this.applyInfoWindowChrome(this.lastInsightsProps?.title || 'Details');
    },

    async handleBayPlanTo(payload) {
      const busySeries = await this.fetchBusySeries(payload.lat, payload.lng);
      // Keep a back path to the bay details
      const backToBay = () => this.lastBayProps && this.openBayInfo(null, this.lastBayProps);

      this.mountInfoContent(TripPlanner, {
        address: payload.address,
        lat: payload.lat,
        lng: payload.lng,
        busySeries,
        defaultTravelMinutes: 20,
        onBack: backToBay,
        onGoTo: (plan) => this.handlePlannerGoTo(plan),
      });
      this.applyInfoWindowChrome('Trip plan');
    },

    openBayInfo(anchor, bay) {
      if (!this.infoWindow || !this.mapInstance) return;
      this.lastBayProps = { ...bay };
      this.mountInfoContent(BayInfo, {
        status: bay.status,
        segment: bay.segment,
        seenAt: bay.seenAt,
        lat: bay.lat,
        lng: bay.lng,
        kerbsideId: bay.kerbsideId,
        restrictions: bay.restrictions,
        onBack: () => this.handleBayBack(),
        onPlanTo: (payload) => this.handleBayPlanTo(payload),
      });
      this.applyInfoWindowChrome(bay.segment || 'Parking bay');

      // Anchor if available, else open at bay coordinates
      if (anchor) {
        this.infoWindow.open({ map: this.mapInstance, anchor });
      } else {
        this.infoWindow.setPosition({ lat: bay.lat, lng: bay.lng });
        this.infoWindow.open(this.mapInstance);
      }
    },

    // ---- Fetch + render bays ----
    async fetchAndRenderBays(lat, lng) {
      if (!this.mapInstance) return;
      const reqId = ++this._baysReqId;
      this.baysLoading = true;
      this.baysError = '';
      this.baysCounts = { unoccupied: 0, occupied: 0 };
      this.clearParkingMarkers();

      try {
        await this.ensureMarkerLib();
        const res = await fetch(this.baysUrl(lat, lng), { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`nearbySegments HTTP ${res.status}`);
        const json = await res.json();
        const bays = this.selectCurrentBays(json);
        if (reqId !== this._baysReqId) return;

        const { AdvancedMarkerElement } = this._markerLib;
        let unocc = 0;
        let occ = 0;

        for (const b of bays) {
          if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue;
          if (b.status === 'unoccupied') unocc++;
          if (b.status === 'occupied') occ++;

          const marker = new AdvancedMarkerElement({
            map: this.mapInstance,
            position: { lat: b.lat, lng: b.lng },
            content: this.makePin({ status: b.status, label: b.zone }),
            title: `${b.status === 'unoccupied' ? 'Unoccupied' : b.status === 'occupied' ? 'Occupied' : 'Unknown'}${b.zone ? ' • ' + b.zone : ''}`,
            zIndex: b.status === 'unoccupied' ? 1000 : 900,
          });

          marker.addListener('click', () => this.openBayInfo(marker, b));
          this.parkingMarkers.push(marker);
        }

        this.baysCounts = { unoccupied: unocc, occupied: occ };
      } catch (e) {
        if (reqId !== this._baysReqId) return;
        this.baysError = e?.message || 'Failed to fetch nearby bays';
      } finally {
        if (reqId === this._baysReqId) this.baysLoading = false;
      }
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
