<script lang="ts">
import { defineComponent, type CSSProperties } from 'vue';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function estimateSearchEta(busyPct: number) {
  return clamp(Math.round(1 + (busyPct - 30) * 0.25), 2, 15);
}

type Stage = 'idle' | 'locating' | 'routing' | 'done' | 'error';
type PermState = 'unknown' | 'granted' | 'prompt' | 'denied';

// API base from env
const EPIC2_BASE = (import.meta as any).env?.VITE_EPIC2_BASE;
const CARBON_PATH = '/default/epic3/carBonEmissionPerKM';

const FALLBACK_FACTORS: Record<string, number> = {
  'Public Transport': 0.04,
  Electric: 0.19,
  Hybrid: 0.37,
  LPG: 0.43,
  Diesel: 0.45,
  Petrol: 0.51,
};

export default defineComponent({
  name: 'TripPlanner',
  emits: ['back', 'go-to'],
  props: {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    busySeries: { type: Array as () => number[], required: true },
    defaultTravelMinutes: { type: Number, default: 20 }, // ignored
  },

  data() {
    const now = new Date();
    now.setSeconds(0, 0);
    const pad = (v: number) => String(v).padStart(2, '0');
    const rounded = new Date(now);
    const m = now.getMinutes();
    rounded.setMinutes(m + ((15 - (m % 15)) % 15));

    return {
      arrivalTime: `${pad(rounded.getHours())}:${pad(rounded.getMinutes())}` as string,

      travelMinutes: null as number | null,
      distanceKm: null as number | null,

      estimationStage: 'idle' as Stage,
      estimateError: '' as string,
      estimateErrorCode: null as number | null,
      origin: null as { lat: number; lng: number } | null,
      permState: 'unknown' as PermState,
      hasRetriedAfterGrant: false,

      carbonLoading: false,
      carbonError: '',
      carbonFactors: { ...FALLBACK_FACTORS } as Record<string, number>,
      selectedFuel: 'Petrol' as string,

      diag: {
        secure: window.isSecureContext,
        framed: window.top !== window.self,
        mapsLoaded: !!(window as any).google?.maps,
        policyAllowsGeo: true,
      },
    };
  },

  computed: {
    boxStyle(): CSSProperties {
      return { color: '#222', display: 'flex', flexDirection: 'column', gap: '12px' };
    },
    rowStyle(): CSSProperties {
      return {
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        alignItems: 'center',
        gap: '8px',
      };
    },
    outRowStyle(): CSSProperties {
      return { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' };
    },
    labelStyle(): CSSProperties {
      return { fontWeight: 600, color: '#444' };
    },
    inputStyle(): CSSProperties {
      return {
        padding: '6px 10px',
        border: '1px solid #E0E0E0',
        borderRadius: '8px',
        fontSize: '12px',
      };
    },
    selectStyle(): CSSProperties {
      return {
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        padding: '6px 28px 6px 10px',
        border: '1px solid #E0E0E0',
        borderRadius: '8px',
        background:
          "#fff url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%2399A1A8' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\") no-repeat right 8px center",
        fontSize: '12px',
      };
    },
    btnRowStyle(): CSSProperties {
      return { display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '4px' };
    },
    btnSecondary(): CSSProperties {
      return {
        background: '#ECEFF1',
        color: '#263238',
        border: 'none',
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        fontSize: '12px',
      };
    },
    btnPrimary(): CSSProperties {
      return {
        background: '#3D5AFE',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        fontSize: '12px',
      };
    },

    arrivalDate(): Date {
      const [h, m] = this.arrivalTime.split(':').map(Number);
      const d = new Date();
      d.setSeconds(0, 0);
      d.setHours(h, m, 0, 0);
      return d;
    },
    busyPct(): number {
      const hour = this.arrivalDate.getHours();
      const s = this.busySeries as number[];
      return s && s.length === 24 ? s[hour] : 50;
    },
    searchEtaMins(): number {
      return estimateSearchEta(this.busyPct);
    },
    statusText(): string {
      return this.busyPct >= 75
        ? 'Likely occupied'
        : this.busyPct >= 55
          ? 'Mixed'
          : 'Likely unoccupied';
    },

    suggestedDepart(): Date | null {
      if (this.travelMinutes == null) return null;
      const d = new Date(this.arrivalDate);
      d.setMinutes(d.getMinutes() - this.travelMinutes - this.searchEtaMins);
      return d;
    },
    formattedArrival(): string {
      return this.arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    formattedDepart(): string {
      return this.suggestedDepart
        ? this.suggestedDepart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—';
    },

    stageMessage(): string {
      if (this.estimationStage === 'locating') return 'Locating…';
      if (this.estimationStage === 'routing') return 'Calculating route…';
      if (this.estimationStage === 'error') {
        const code = this.estimateErrorCode != null ? ` (code ${this.estimateErrorCode})` : '';
        return `${this.estimateError || 'Location unavailable'}${code}`;
      }
      return '—';
    },

    // emissions
    fuelOptions(): string[] {
      return Object.keys(this.carbonFactors);
    },
    selectedFactor(): number | null {
      const v = this.carbonFactors[this.selectedFuel];
      return typeof v === 'number' && isFinite(v) ? v : null;
    },
    carbonKg(): number | null {
      if (this.distanceKm == null || this.selectedFactor == null) return null;
      return this.distanceKm * this.selectedFactor;
    },
    carbonText(): string {
      if (this.carbonKg == null || this.selectedFactor == null || this.distanceKm == null)
        return '—';
      const kg = this.carbonKg;
      const dist = this.distanceKm;
      const factor = this.selectedFactor;
      return `${kg.toFixed(2)} kg CO₂ (${dist.toFixed(1)} km × ${factor.toFixed(2)} kg/km)`;
    },

    // NEW: whether user chose transit
    isTransitSelected(): boolean {
      return this.selectedFuel === 'Public Transport';
    },
  },

  watch: {
    // NEW: When the user changes fuel, recompute route for the appropriate mode (if we know origin)
    selectedFuel() {
      if (!this.origin) return; // will run after locate completes anyway
      this.computeRouteForMode(this.isTransitSelected ? 'TRANSIT' : 'DRIVING');
    },
  },

  methods: {
    onBack() {
      this.$emit('back');
    },
    onGoTo() {
      if (this.travelMinutes == null) return;
      this.$emit('go-to', {
        address: this.address,
        lat: this.lat,
        lng: this.lng,
        arrivalTime: this.arrivalDate.toISOString(),
        suggestedDepartTime: this.suggestedDepart?.toISOString() ?? null,
        travelMinutes: this.travelMinutes,
        distanceKm: this.distanceKm,
        searchMinutes: this.searchEtaMins,
        status: this.statusText,
        origin: this.origin,
        vehicleFuel: this.selectedFuel,
        carbonKg: this.carbonKg,
        carbonFactorKgPerKm: this.selectedFactor,
        travelMode: this.isTransitSelected ? 'TRANSIT' : 'DRIVING', // optional extra
      });
    },

    detectPolicy() {
      try {
        const pp: any = (document as any).permissionsPolicy || (document as any).featurePolicy;
        if (pp?.allowsFeature) {
          this.diag.policyAllowsGeo = !!pp.allowsFeature('geolocation');
        } else if (pp?.allowedFeatures) {
          this.diag.policyAllowsGeo = !!pp.allowedFeatures?.().includes?.('geolocation');
        } else {
          this.diag.policyAllowsGeo = true;
        }
      } catch {
        this.diag.policyAllowsGeo = true;
      }
    },

    async smartLocate(): Promise<GeolocationPosition> {
      if (!navigator.geolocation)
        throw Object.assign(new Error('Geolocation not supported'), { code: 1 });

      try {
        return await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 7000,
            maximumAge: 60_000,
          });
        });
      } catch (eA: any) {
        if (eA?.code === 1 && this.permState !== 'granted') throw eA;
      }

      try {
        return await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15_000,
            maximumAge: 0,
          });
        });
      } catch (eB: any) {
        if (eB?.code === 1 && this.permState !== 'granted') throw eB;
        const watch = await new Promise<GeolocationPosition>((resolve, reject) => {
          let id = 0;
          let t = 0;
          const clean = () => {
            if (id) navigator.geolocation.clearWatch(id);
            if (t) clearTimeout(t);
          };
          id = navigator.geolocation.watchPosition(
            (pos) => {
              clean();
              resolve(pos);
            },
            (err) => {
              clean();
              reject(err);
            },
            { enableHighAccuracy: true, maximumAge: 0 },
          );
          t = window.setTimeout(() => {
            clean();
            reject(Object.assign(new Error('Timed out'), { code: 3 }));
          }, 15_000);
        });
        return watch;
      }
    },

    // NEW: single place to compute routing for a given mode
    async computeRouteForMode(mode: 'DRIVING' | 'TRANSIT') {
      this.estimationStage = 'routing';
      this.travelMinutes = null;
      this.distanceKm = null;

      try {
        const g = (window as any).google;
        if (!g?.maps) throw Object.assign(new Error('Maps not loaded'), { code: -1 });

        const svc = new g.maps.DistanceMatrixService();

        // Build request based on mode
        const base = {
          origins: [this.origin!],
          destinations: [{ lat: this.lat, lng: this.lng }],
          unitSystem: g.maps.UnitSystem.METRIC,
        } as any;

        let req: any;
        if (mode === 'TRANSIT') {
          req = {
            ...base,
            travelMode: g.maps.TravelMode.TRANSIT,
            transitOptions: {
              departureTime: new Date(),
              // You can add: modes: [g.maps.TransitMode.BUS, g.maps.TransitMode.TRAIN], etc.
            },
          };
        } else {
          req = {
            ...base,
            travelMode: g.maps.TravelMode.DRIVING,
            drivingOptions: {
              departureTime: new Date(),
              trafficModel: g.maps.TrafficModel.BEST_GUESS,
            },
          };
        }

        const res = await new Promise<any>((resolve, reject) => {
          svc.getDistanceMatrix(req, (response: any, status: any) => {
            if (status !== 'OK')
              return reject(Object.assign(new Error(`DistanceMatrix ${status}`), { code: -2 }));
            resolve(response);
          });
        });

        const elem = res?.rows?.[0]?.elements?.[0];
        if (!elem || elem.status !== 'OK') {
          const msg = mode === 'TRANSIT' ? 'No public transport route found' : 'No route found';
          throw Object.assign(new Error(msg), { code: -3 });
        }

        const secs =
          (elem.duration_in_traffic && elem.duration_in_traffic.value) ||
          (elem.duration && elem.duration.value);
        const meters = elem.distance?.value;

        if (!secs) throw Object.assign(new Error('No duration returned'), { code: -4 });

        this.travelMinutes = Math.max(1, Math.round(secs / 60));

        // Note: for TRANSIT, Google often still returns a distance. If it doesn’t,
        // we keep distance null (so emissions show "—") rather than guessing.
        this.distanceKm =
          typeof meters === 'number' ? Math.max(0, Math.round((meters / 1000) * 10) / 10) : null;

        this.estimationStage = 'done';
      } catch (e: any) {
        this.estimationStage = 'error';
        this.estimateError = e?.message || 'Route unavailable';
        this.estimateErrorCode = typeof e?.code === 'number' ? e.code : null;
      }
    },

    async autoEstimateFromCurrentLocation() {
      this.estimationStage = 'locating';
      this.estimateError = '';
      this.estimateErrorCode = null;

      try {
        const p = await (navigator as any).permissions?.query?.({
          name: 'geolocation' as PermissionName,
        });
        if (p && ['granted', 'prompt', 'denied'].includes(p.state))
          this.permState = p.state as PermState;
        if (p) {
          p.onchange = () => {
            this.permState = p.state as PermState;
            if (
              p.state === 'granted' &&
              !this.hasRetriedAfterGrant &&
              this.estimationStage === 'error'
            ) {
              this.hasRetriedAfterGrant = true;
              this.autoEstimateFromCurrentLocation();
            }
          };
        }
      } catch {
        /* ignore */
      }

      // 1) locate
      try {
        const pos = await this.smartLocate();
        this.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch (e: any) {
        this.estimationStage = 'error';
        this.estimateError = e?.message || 'Permission denied';
        this.estimateErrorCode = typeof e?.code === 'number' ? e.code : 1;
        if (this.permState === 'granted' && !this.hasRetriedAfterGrant) {
          const once = () => {
            window.removeEventListener('pointerdown', once, true);
            if (!this.hasRetriedAfterGrant) {
              this.hasRetriedAfterGrant = true;
              this.autoEstimateFromCurrentLocation();
            }
          };
          window.addEventListener('pointerdown', once, true);
        }
        return;
      }

      // 2) route for currently selected fuel/mode
      this.computeRouteForMode(this.isTransitSelected ? 'TRANSIT' : 'DRIVING');
    },

    async fetchCarbonFactors() {
      this.carbonLoading = true;
      this.carbonError = '';
      try {
        const res = await fetch(`${EPIC2_BASE}${CARBON_PATH}`, {
          mode: 'cors',
          credentials: 'omit',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const arr = Array.isArray(json?.result) ? json.result : [];
        const map: Record<string, number> = {};
        for (const row of arr) {
          const vt = row?.['Vehicle Type'];
          const v = Number(row?.['Carbon Emission (kg CO2/km)']);
          if (typeof vt === 'string' && isFinite(v)) map[vt] = v;
        }
        if (Object.keys(map).length) {
          this.carbonFactors = map;
          if (!(this.selectedFuel in this.carbonFactors)) {
            this.selectedFuel = Object.keys(this.carbonFactors)[0];
          }
        }
      } catch (e: any) {
        this.carbonError = e?.message || 'Failed to load carbon factors';
      } finally {
        this.carbonLoading = false;
      }
    },
  },

  async mounted() {
    this.detectPolicy();
    this.autoEstimateFromCurrentLocation();
    this.fetchCarbonFactors();
  },
});
</script>

<template>
  <div :style="boxStyle">
    <div :style="rowStyle">
      <span :style="labelStyle">Destination</span>
      <div>{{ address }}</div>
    </div>

    <div :style="rowStyle">
      <label :style="labelStyle" for="arrival">Desired arrival</label>
      <input id="arrival" type="time" v-model="arrivalTime" :style="inputStyle" />
    </div>

    <div :style="rowStyle">
      <span :style="labelStyle">Est. travel time</span>
      <div>
        <template v-if="travelMinutes != null && estimationStage === 'done'">
          <strong>{{ travelMinutes }} min</strong>
          <span v-if="distanceKm != null" style="margin-left: 8px; color: #6b7280; font-size: 11px">
            · {{ distanceKm.toFixed(1) }} km
          </span>
          <span style="margin-left: 8px; color: #6b7280; font-size: 11px">
            · Mode: {{ isTransitSelected ? 'Public transport' : 'Driving' }}
          </span>
        </template>
        <template v-else>
          <em>{{ stageMessage }}</em>
          <div
            v-if="estimationStage === 'error'"
            style="margin-top: 4px; font-size: 11px; color: #6b7280"
          >
            Secure: {{ diag.secure ? 'yes' : 'no' }}, Framed: {{ diag.framed ? 'yes' : 'no' }},
            Policy allows: {{ diag.policyAllowsGeo ? 'yes' : 'no' }}, Maps loaded:
            {{ diag.mapsLoaded ? 'yes' : 'no' }}, Perm: {{ permState }}
          </div>
        </template>
      </div>
    </div>

    <div :style="rowStyle">
      <label :style="labelStyle" for="fuel">Vehicle fuel</label>
      <div>
        <select id="fuel" v-model="selectedFuel" :style="selectStyle" :disabled="carbonLoading">
          <option v-for="opt in fuelOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <div
          v-if="carbonLoading || carbonError"
          style="margin-top: 4px; font-size: 11px; color: #6b7280"
        >
          <template v-if="carbonLoading">Loading emission factors…</template>
          <template v-else>Using fallback factors ({{ carbonError }})</template>
        </div>
      </div>
    </div>

    <div :style="rowStyle">
      <span :style="labelStyle">Estimated carbon</span>
      <strong>{{ carbonText }}</strong>
    </div>

    <hr style="border: none; border-top: 1px solid #eceff1" />

    <div :style="outRowStyle">
      <div>Estimated arriving time</div>
      <strong>{{ formattedArrival }}</strong>
    </div>
    <div :style="outRowStyle">
      <div>Estimated status</div>
      <strong>{{ statusText }} ({{ busyPct }}%)</strong>
    </div>
    <div :style="outRowStyle">
      <div>Spot finding ETA</div>
      <strong>{{ searchEtaMins }} min</strong>
    </div>
    <div :style="outRowStyle">
      <div>Suggested departing time</div>
      <strong>{{ formattedDepart }}</strong>
    </div>

    <div :style="btnRowStyle">
      <button type="button" :style="btnSecondary" @click="onBack">Back</button>
      <button type="button" :style="btnPrimary" :disabled="travelMinutes == null" @click="onGoTo">
        Go To
      </button>
    </div>
  </div>
</template>
