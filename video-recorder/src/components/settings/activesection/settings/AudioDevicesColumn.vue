<script setup lang="ts">
import { Mic, Check, RefreshCw } from 'lucide-vue-next';
import { useStudioState } from '@/composables/useStudioState';
import { useMediaDevices } from '@/composables/useMediaDevices';

const props = defineProps<{
  audioVolume: number;
}>();

const { selectedMicId, isMicMuted, isSysAudioMuted } = useStudioState();
const { microphones, liveMicLevel, refreshDevices, startMicMeter } = useMediaDevices();
</script>

<template>
  <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div
          class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Mic class="w-4 h-4" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-white">3. Audio Input Devices</h3>
          <p class="text-[11px] text-white/50">Microphones & system audio monitor</p>
        </div>
      </div>
      <button @click="refreshDevices(true)"
        class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
        title="Rescan Microphones">
        <RefreshCw class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Microphone Device List -->
    <div class="space-y-1.5">
      <label class="text-[10px] font-mono uppercase text-white/50 block">Microphone Input</label>
      <div class="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
        <button v-for="mic in microphones" :key="mic.deviceId"
          @click="selectedMicId = mic.deviceId; isMicMuted = false; startMicMeter(mic.deviceId)" :class="[
            'w-full px-3.5 py-2.5 rounded-xl text-left text-xs flex items-center justify-between border transition',
            selectedMicId === mic.deviceId
              ? 'bg-emerald-500/20 border-emerald-400/50 text-white font-semibold'
              : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
          ]">
          <span class="truncate pr-2">{{ mic.label }}</span>
          <Check v-if="selectedMicId === mic.deviceId" class="w-4 h-4 text-emerald-400 shrink-0" />
        </button>
      </div>
    </div>

    <!-- Live Mic Level Meter & Mute Controls -->
    <div class="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
      <div class="flex items-center justify-between text-xs">
        <span class="text-white/70 flex items-center gap-1.5">
          <Mic class="w-3.5 h-3.5 text-emerald-400" />
          <span>Mic Input Gain</span>
        </span>
        <button @click="isMicMuted = !isMicMuted"
          :class="['px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition', isMicMuted ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300']">
          {{ isMicMuted ? 'Muted' : 'Active' }}
        </button>
      </div>
      <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div class="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-100"
          :style="{ width: isMicMuted ? '0%' : `${Math.max(12, Math.round((liveMicLevel || props.audioVolume) * 100))}%` }" />
      </div>

      <div class="flex items-center justify-between text-xs pt-1">
        <span class="text-white/70">System Desktop Audio Loopback</span>
        <button @click="isSysAudioMuted = !isSysAudioMuted"
          :class="['px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition', isSysAudioMuted ? 'bg-white/10 text-white/40' : 'bg-sky-500/20 text-sky-300']">
          {{ isSysAudioMuted ? 'Disabled' : 'Enabled' }}
        </button>
      </div>
    </div>
  </div>
</template>
