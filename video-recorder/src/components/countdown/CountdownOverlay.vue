<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { playCountdownTone } from '../../lib/audioTone';

const emit = defineEmits<{
  (e: 'complete'): void;
  (e: 'cancel'): void;
}>();

const count = ref<number | 'ACTION'>(3);
let timeouts: ReturnType<typeof setTimeout>[] = [];

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('cancel');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);

  // Play initial metronome beep
  playCountdownTone('tick');

  timeouts.push(
    setTimeout(() => {
      count.value = 2;
      playCountdownTone('tick');
    }, 1000)
  );

  timeouts.push(
    setTimeout(() => {
      count.value = 1;
      playCountdownTone('tick');
    }, 2000)
  );

  timeouts.push(
    setTimeout(() => {
      count.value = 'ACTION';
      playCountdownTone('go');
    }, 3000)
  );

  timeouts.push(
    setTimeout(() => {
      emit('complete');
    }, 3700)
  );
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  timeouts.forEach(clearTimeout);
});
</script>

<template>
  <div
    @click="emit('cancel')"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm cursor-pointer select-none"
  >
    <transition
      name="countdown-pop"
      mode="out-in"
    >
      <div
        :key="count"
        class="flex flex-col items-center"
      >
        <span
          class="font-black tracking-tighter"
          :class="[
            count === 'ACTION'
              ? 'text-6xl md:text-8xl text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-400 to-amber-300 drop-shadow-[0_10px_25px_rgba(239,68,68,0.6)]'
              : 'text-8xl md:text-9xl text-white font-mono drop-shadow-[0_10px_30px_rgba(255,255,255,0.4)]'
          ]"
        >
          {{ count }}
        </span>
      </div>
    </transition>

    <p class="mt-8 text-xs font-mono tracking-widest text-gray-300 uppercase opacity-80">
      Click anywhere or press Esc to cancel
    </p>
  </div>
</template>

<style scoped>
.countdown-pop-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.countdown-pop-leave-active {
  transition: all 0.25s ease-in;
}
.countdown-pop-enter-from {
  opacity: 0;
  transform: scale(2.2);
  filter: blur(8px);
}
.countdown-pop-leave-to {
  opacity: 0;
  transform: scale(0.6);
  filter: blur(6px);
}
</style>
