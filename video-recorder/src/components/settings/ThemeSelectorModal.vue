<script setup lang="ts">
import { X, Check, Palette } from 'lucide-vue-next';
import { useTheme } from '../../composables/useTheme';
import { THEME_LIST, StudioTheme } from '../../themes';

const { currentTheme, setTheme } = useTheme();

function handleSelectTheme(themeId: StudioTheme) {
  setTheme(themeId);
}
</script>

<template>
  <div
    class="w-full max-w-2xl rounded-3xl bg-[#0e111a] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
    <!-- Header -->
    <div class="px-6 py-5 border-b border-white/10 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-rose-400">
          <Palette class="w-5 h-5" />
        </div>
        <div>
          <h3 class="text-base font-bold text-white tracking-tight">Studio Theme & Appearance</h3>
          <p class="text-xs text-white/50">Select your preferred desktop overlay design aesthetic</p>
        </div>
      </div>
    </div>

    <!-- Theme Cards Grid -->
    <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto">
      <div v-for="t in THEME_LIST" :key="t.id" @click="handleSelectTheme(t.id)" :class="[
        'relative p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between group',
        currentTheme === t.id
          ? 'border-white/40 bg-white/10 ring-2 ring-offset-2 ring-offset-[#0e111a] shadow-xl'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
      ]" :style="currentTheme === t.id ? { borderColor: t.accentColor } : {}">
        <!-- Active Check Indicator -->
        <div v-if="currentTheme === t.id"
          class="absolute top-3.5 right-3.5 w-6 h-6 rounded-full flex items-center justify-center shadow"
          :style="{ backgroundColor: t.accentColor }">
          <Check class="w-3.5 h-3.5 text-black stroke-[3]" />
        </div>

        <div>
          <!-- Badge & Tagline -->
          <div class="flex items-center gap-2 mb-2">
            <span
              :class="['px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border', t.badgeClass]">
              {{ t.badge }}
            </span>
          </div>

          <h4 class="text-sm font-bold text-white group-hover:text-white/90">
            {{ t.name }}
          </h4>
          <div class="text-[11px] font-medium text-white/50 mb-2">
            {{ t.tagline }}
          </div>
          <p class="text-xs text-white/60 leading-relaxed mb-4">
            {{ t.description }}
          </p>
        </div>

        <!-- Color Swatch Strip -->
        <div class="flex items-center gap-1.5 pt-3 border-t border-white/5">
          <span v-for="(c, idx) in t.previewColors" :key="idx"
            class="w-5 h-5 rounded-md shadow-inner border border-white/10" :style="{ backgroundColor: c }"></span>
          <span class="text-[10px] font-mono text-white/40 ml-auto">
            {{ currentTheme === t.id ? 'ACTIVE' : 'SELECT' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-6 py-4 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs text-white/50">
      <span>Themes update all floating overlay windows in real time</span>
    </div>
  </div>
</template>
