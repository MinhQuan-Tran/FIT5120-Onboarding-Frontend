<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'MapControls',
  props: { initialLgaVisible: { type: Boolean, default: false } },
  emits: ['toggle-lga'],
  data() {
    return {
      lgaVisible: this.initialLgaVisible,

      containerStyle: {
        background: '#fff',
        borderRadius: '2px',
        boxShadow: '0 2px 6px rgba(0,0,0,.3)',
        margin: '10px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
        font: '400 13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
        userSelect: 'none',
        padding: '8px',
      } as import('vue').CSSProperties,

      chipBaseStyle: {
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'pointer',
        borderRadius: '16px',
        padding: '6px 10px',
        lineHeight: '1',
        transition: 'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
      } as import('vue').CSSProperties,

      chipActiveStyle: {
        background: '#1a73e8',
        color: '#fff',
        boxShadow: 'inset 0 0 0 1px #1a73e8',
      } as import('vue').CSSProperties,

      chipInactiveStyle: {
        background: '#fff',
        color: '#1a73e8',
      } as import('vue').CSSProperties,
    };
  },
  watch: {
    lgaVisible(val: boolean) {
      this.$emit('toggle-lga', val);
    },
  },
  methods: {
    toggleLga() {
      this.lgaVisible = !this.lgaVisible;
    },

    onKeyActivate(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleLga();
      }
    },
  },
});
</script>

<template>
  <div id="app-control" :style="containerStyle">
    <div
      role="button"
      :aria-pressed="lgaVisible"
      tabindex="0"
      :style="[chipBaseStyle, lgaVisible ? chipActiveStyle : chipInactiveStyle]"
      @click="toggleLga"
      @keydown="onKeyActivate"
      title="Toggle Melbourne LGA"
    >
      Melbourne LGA
    </div>

    <!-- Add more chips later by copying the block above and wiring new emits -->
  </div>
</template>
