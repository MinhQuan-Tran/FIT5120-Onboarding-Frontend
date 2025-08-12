<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'unoccupied' | 'occupied' | 'unknown';
  segment?: string;
  seenAt?: string;
  lat: number;
  lng: number;
  kerbsideId?: string;
  restrictions: Array<{
    label: string;
    days: string;
    start: string;
    finish: string;
    isActive?: boolean;
  }>;
  onBack?: () => void;
}>();

const emit = defineEmits<{
  (e: 'plan-to', payload: { address: string; lat: number; lng: number }): void;
}>();

const statusText = computed(() =>
  props.status === 'unoccupied'
    ? 'Unoccupied'
    : props.status === 'occupied'
      ? 'Occupied'
      : 'Status unknown',
);

const statusColor = computed(() =>
  props.status === 'unoccupied' ? '#2E7D32' : props.status === 'occupied' ? '#E53935' : '#6b7280',
);

const niceSeen = computed(() => (props.seenAt ? new Date(props.seenAt).toLocaleString() : '—'));

const planAddress = computed(() =>
  props.segment
    ? props.segment
    : props.kerbsideId
      ? `Kerbside ${props.kerbsideId}`
      : 'Selected location',
);

function onPlanTo() {
  emit('plan-to', {
    address: planAddress.value,
    lat: props.lat,
    lng: props.lng,
  });
}
</script>

<template>
  <div style="min-width: 260px; display: flex; flex-direction: column; gap: 10px; color: #222">
    <!-- Header (Back removed here) -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px">
      <div style="display: flex; align-items: center; gap: 8px">
        <div style="font-weight: 700; font-size: 14px; color: #1f2937">Parking bay</div>
        <span
          v-if="kerbsideId"
          style="
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 11px;
            color: #374151;
            background: #f3f4f6;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 2px 6px;
          "
        >
          ID: {{ kerbsideId }}
        </span>
      </div>
    </div>

    <div style="font-size: 13px; color: #6b7280">{{ segment || 'Selected location' }}</div>

    <div style="display: flex; align-items: center; gap: 8px">
      <span
        :style="{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '999px',
          background: statusColor,
          color: '#fff',
          fontSize: '12px',
          fontWeight: 600,
        }"
      >
        {{ statusText }}
      </span>
      <span style="font-size: 11px; color: #9aa1a9">Last seen: {{ niceSeen }}</span>
    </div>

    <div style="border-top: 1px solid #eceff1; margin: 4px 0"></div>

    <div>
      <div style="font-weight: 600; font-size: 13px; color: #444; margin-bottom: 6px">
        Restrictions
      </div>
      <ul
        style="
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        "
      >
        <li
          v-for="(r, idx) in restrictions"
          :key="idx"
          style="display: flex; align-items: center; gap: 8px; font-size: 12px"
        >
          <span
            :style="{
              display: 'inline-block',
              minWidth: '36px',
              textAlign: 'center',
              padding: '2px 6px',
              borderRadius: '6px',
              background: '#EEF2FF',
              color: '#3D5AFE',
              fontWeight: 700,
            }"
          >
            {{ r.label || '—' }}
          </span>
          <span style="color: #374151">
            {{ r.days || '—' }}
            <template v-if="r.start || r.finish">
              &nbsp;{{ r.start || '—' }}–{{ r.finish || '—' }}
            </template>
          </span>
          <span
            v-if="r.isActive"
            style="
              margin-left: auto;
              font-size: 11px;
              color: #2563eb;
              background: #dbeafe;
              padding: 2px 6px;
              border-radius: 999px;
            "
            title="Applies right now (Melbourne time)"
          >
            Now
          </span>
        </li>
      </ul>
      <div v-if="!restrictions?.length" style="font-size: 12px; color: #6b7280">
        No posted restrictions found.
      </div>
    </div>

    <div style="font-size: 11px; color: #9aa1a9">
      CoT signage times are local. “Now” is evaluated using Australia/Melbourne time.
    </div>

    <!-- Action row: Back + Plan To (like TripPlanner) -->
    <div style="display: flex; gap: 8px; justify-content: space-between; margin-top: 4px">
      <button
        type="button"
        @click="onBack?.()"
        style="
          background: #eceff1;
          color: #263238;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        "
      >
        Insights
      </button>

      <button
        type="button"
        @click="onPlanTo"
        style="
          background: #3d5afe;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        "
      >
        Plan To
      </button>
    </div>
  </div>
</template>
