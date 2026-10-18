<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, useTemplateRef } from 'vue';
import { marked } from 'marked';
import {
  FileText,
  Eye,
  Edit3,
  Columns,
  Save,
  Clock,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  FolderOpen,
  Check
} from 'lucide-vue-next';
import { useStudioState } from '@/composables/useStudioState';
import {
  loadSessionNotes,
  saveSessionNotes,
  getActiveSessionInfo,
  subscribeToEvent,
  revealInFolder
} from '@/lib/tauriBridge';

type EditorViewMode = 'edit' | 'preview' | 'split';

const { recordingState, currentSessionId, lastRecordedSession } = useStudioState();

const noteContent = ref<string>('');
const viewMode = shallowRef<EditorViewMode>('split');
const isSaving = shallowRef<boolean>(false);
const saveStatus = shallowRef<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
const lastSavedTimestamp = shallowRef<string>('');
const activeSessionDir = shallowRef<string>('');
const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef');

// Recording session elapsed time counter for live timestamps
const recordingSeconds = shallowRef<number>(0);
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let unsubSessionStarted: (() => void) | null = null;

// Track active session identifier
const targetSessionId = computed(() => {
  return currentSessionId.value || lastRecordedSession.value?.id || null;
});

// Configure marked renderer for security and task lists
marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderedHtml = computed(() => {
  try {
    return marked.parse(noteContent.value || '*No notes yet. Type in the editor to get started.*') as string;
  } catch (err) {
    return `<div class="text-rose-400">Failed to render markdown: ${(err as Error).message}</div>`;
  }
});

// Elapsed time string formatting
const formattedElapsedTime = computed(() => {
  const m = Math.floor(recordingSeconds.value / 60);
  const s = recordingSeconds.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

// Document stats
const stats = computed(() => {
  const text = noteContent.value.trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const chars = text.length;
  const lines = text ? text.split('\n').length : 0;
  return { words, chars, lines };
});

async function refreshActiveSessionInfo() {
  const info = await getActiveSessionInfo();
  if (info.sessionId && !currentSessionId.value) {
    currentSessionId.value = info.sessionId;
  }
  if (info.sessionDir) {
    activeSessionDir.value = info.sessionDir;
  }
}

async function loadNotes() {
  await refreshActiveSessionInfo();
  const res = await loadSessionNotes(targetSessionId.value || undefined, activeSessionDir.value || undefined);
  if (res && typeof res.content === 'string') {
    // Only replace if content exists or current is empty
    if (res.content || !noteContent.value) {
      noteContent.value = res.content;
    }
    if (res.filePath) {
      activeSessionDir.value = res.filePath.replace(/[\\/]notes\.md$/, '');
    }
    saveStatus.value = 'saved';
  }
}

async function handleSave() {
  if (isSaving.value) return;
  isSaving.value = true;
  saveStatus.value = 'saving';

  try {
    const res = await saveSessionNotes(
      noteContent.value,
      targetSessionId.value || undefined,
      activeSessionDir.value || undefined
    );
    if (res.success) {
      saveStatus.value = 'saved';
      const now = new Date();
      lastSavedTimestamp.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (res.filePath) {
        activeSessionDir.value = res.filePath.replace(/[\\/]notes\.md$/, '');
      }
    } else {
      saveStatus.value = 'error';
    }
  } catch {
    saveStatus.value = 'error';
  } finally {
    isSaving.value = false;
  }
}

function triggerAutoSave() {
  saveStatus.value = 'unsaved';
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    handleSave();
  }, 1500);
}

// WYSIWYG text insertion helper
function insertMarkdown(before: string, after: string = '', defaultText: string = '') {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = noteContent.value.substring(start, end) || defaultText;

  const replacement = `${before}${selectedText}${after}`;
  const newText =
    noteContent.value.substring(0, start) +
    replacement +
    noteContent.value.substring(end);

  noteContent.value = newText;
  triggerAutoSave();

  // Restore cursor inside formatted tag
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
  }, 10);
}

// Line-based insertion helper (lists, headings, quotes)
function insertLinePrefix(prefix: string) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const fullText = noteContent.value;

  const lineStart = fullText.lastIndexOf('\n', start - 1) + 1;
  const newText =
    fullText.substring(0, lineStart) +
    prefix +
    fullText.substring(lineStart);

  noteContent.value = newText;
  triggerAutoSave();

  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, end + prefix.length);
  }, 10);
}

// Insert live recording session timestamp
function insertTimestamp() {
  const tag = `**[${formattedElapsedTime.value}]** `;
  insertMarkdown(tag, '', '');
}

async function handleOpenSessionFolder() {
  if (activeSessionDir.value) {
    await revealInFolder(activeSessionDir.value).catch(() => {});
  }
}

function handleKeydown(e: KeyboardEvent) {
  // Ctrl+S / Cmd+S save
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    handleSave();
    return;
  }

  // Tab key indents 2 spaces in textarea
  if (e.key === 'Tab' && document.activeElement === textareaRef.value) {
    e.preventDefault();
    insertMarkdown('  ', '', '');
  }
}

// Live timer during recording
watch(
  recordingState,
  (state) => {
    if (state === 'recording') {
      if (!elapsedTimer) {
        elapsedTimer = setInterval(() => {
          recordingSeconds.value++;
        }, 1000);
      }
    } else if (state === 'idle') {
      recordingSeconds.value = 0;
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
    } else if (state === 'paused') {
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
    }
  },
  { immediate: true }
);

// When session starts, reload or ensure target directory updates
watch(currentSessionId, (newId) => {
  if (newId) {
    loadNotes();
  }
});

onMounted(() => {
  loadNotes();
  window.addEventListener('keydown', handleKeydown);

  unsubSessionStarted = subscribeToEvent<{ sessionId: string }>('session_started', (payload) => {
    if (payload?.sessionId) {
      currentSessionId.value = payload.sessionId;
      loadNotes();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (elapsedTimer) clearInterval(elapsedTimer);
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  if (unsubSessionStarted) unsubSessionStarted();
});
</script>

<template>
  <div class="w-full h-full flex flex-col bg-[#0b0d14] text-zinc-100 font-sans select-none overflow-hidden">
    <!-- Top Header Bar -->
    <header class="h-13 shrink-0 px-4 bg-[#111420]/95 backdrop-blur border-b border-white/10 flex items-center justify-between z-20">
      <!-- Session Indicator & Title -->
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
          <FileText class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-xs font-bold text-white tracking-wide truncate">Session Notes</h1>
            <span
              v-if="recordingState === 'recording'"
              class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-400/30 flex items-center gap-1"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
              <span>REC {{ formattedElapsedTime }}</span>
            </span>
            <span
              v-else-if="targetSessionId"
              class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-zinc-400 border border-white/10 truncate max-w-[140px]"
              :title="targetSessionId"
            >
              {{ targetSessionId }}
            </span>
            <span
              v-else
              class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400/80 border border-amber-400/20"
            >
              Draft Mode
            </span>
          </div>
        </div>
      </div>

      <!-- Center: View Mode Switcher (Edit / Preview / Split) -->
      <div class="flex items-center bg-black/40 p-0.5 rounded-xl border border-white/10">
        <button
          type="button"
          @click="viewMode = 'edit'"
          :class="[
            'h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition',
            viewMode === 'edit'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          ]"
          title="Edit Markdown (Ctrl+1)"
        >
          <Edit3 class="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>

        <button
          type="button"
          @click="viewMode = 'preview'"
          :class="[
            'h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition',
            viewMode === 'preview'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          ]"
          title="Preview HTML (Ctrl+2)"
        >
          <Eye class="w-3.5 h-3.5" />
          <span>Preview</span>
        </button>

        <button
          type="button"
          @click="viewMode = 'split'"
          :class="[
            'h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition',
            viewMode === 'split'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          ]"
          title="Side-by-Side Split View (Ctrl+3)"
        >
          <Columns class="w-3.5 h-3.5" />
          <span>Split</span>
        </button>
      </div>

      <!-- Right: Action Buttons (Timestamp + Save) -->
      <div class="flex items-center gap-2">
        <!-- Timestamp Button -->
        <button
          type="button"
          @click="insertTimestamp"
          class="h-7 px-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 text-xs font-medium flex items-center gap-1 transition"
          title="Insert Current Timestamp"
        >
          <Clock class="w-3 h-3" />
          <span>+ Time</span>
        </button>

        <!-- Save Button -->
        <button
          type="button"
          @click="handleSave"
          :disabled="isSaving"
          :class="[
            'h-7 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm',
            saveStatus === 'saved'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/30'
              : 'bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-amber-500/20'
          ]"
          title="Save Notes to Session Folder (Ctrl+S)"
        >
          <component :is="saveStatus === 'saved' ? Check : Save" class="w-3.5 h-3.5" />
          <span>{{ saveStatus === 'saved' ? 'Saved' : (isSaving ? 'Saving...' : 'Save') }}</span>
        </button>
      </div>
    </header>

    <!-- WYSIWYG Formatting Ribbon (Visible in Edit & Split modes) -->
    <div
      v-if="viewMode !== 'preview'"
      class="h-10 shrink-0 px-3 bg-[#131724] border-b border-white/5 flex items-center gap-1 overflow-x-auto text-zinc-300 select-none z-10"
    >
      <button
        type="button"
        @click="insertMarkdown('**', '**', 'bold text')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Bold (**text**)"
      >
        <Bold class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertMarkdown('*', '*', 'italic text')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Italic (*text*)"
      >
        <Italic class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertMarkdown('~~', '~~', 'strikethrough text')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Strikethrough (~~text~~)"
      >
        <Strikethrough class="w-3.5 h-3.5" />
      </button>

      <div class="h-4 w-px bg-white/10 mx-1"></div>

      <button
        type="button"
        @click="insertLinePrefix('# ')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition text-xs font-bold"
        title="Heading 1 (# Heading)"
      >
        <Heading1 class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertLinePrefix('## ')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition text-xs font-bold"
        title="Heading 2 (## Heading)"
      >
        <Heading2 class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertLinePrefix('### ')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition text-xs font-bold"
        title="Heading 3 (### Heading)"
      >
        <Heading3 class="w-3.5 h-3.5" />
      </button>

      <div class="h-4 w-px bg-white/10 mx-1"></div>

      <button
        type="button"
        @click="insertLinePrefix('- ')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Bullet List (- Item)"
      >
        <List class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertLinePrefix('1. ')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Numbered List (1. Item)"
      >
        <ListOrdered class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertLinePrefix('- [ ] ')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Task Checkbox (- [ ] Task)"
      >
        <CheckSquare class="w-3.5 h-3.5 text-emerald-400" />
      </button>

      <div class="h-4 w-px bg-white/10 mx-1"></div>

      <button
        type="button"
        @click="insertLinePrefix('> ')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Quote Block (> Quote)"
      >
        <Quote class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertMarkdown('`', '`', 'code')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Inline Code (`code`)"
      >
        <Code class="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        @click="insertMarkdown('```\n', '\n```', 'code block')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition text-[11px] font-mono"
        title="Code Block (``` ... ```)"
      >
        { }
      </button>

      <button
        type="button"
        @click="insertLinePrefix('\n---\n')"
        class="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center transition"
        title="Divider (---)"
      >
        <Minus class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Main Editor / Preview Canvas Area -->
    <main class="flex-1 min-h-0 flex overflow-hidden relative">
      <!-- Edit Mode Pane -->
      <div
        v-show="viewMode === 'edit' || viewMode === 'split'"
        :class="[
          'h-full flex flex-col min-w-0 transition-all',
          viewMode === 'split' ? 'w-1/2 border-r border-white/10' : 'w-full'
        ]"
      >
        <textarea
          ref="textareaRef"
          v-model="noteContent"
          @input="triggerAutoSave"
          placeholder="# Session Notes&#10;&#10;Write markdown notes during this recording session...&#10;- Agenda items&#10;- Key discussions&#10;- Action items"
          class="w-full h-full p-4 bg-transparent resize-none outline-none font-mono text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 select-text overflow-y-auto"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- Preview Mode Pane -->
      <div
        v-show="viewMode === 'preview' || viewMode === 'split'"
        :class="[
          'h-full flex flex-col min-w-0 overflow-y-auto p-4 transition-all bg-[#0e111a]/40 select-text',
          viewMode === 'split' ? 'w-1/2' : 'w-full'
        ]"
      >
        <div class="prose-dark" v-html="renderedHtml"></div>
      </div>
    </main>

    <!-- Bottom Status Bar -->
    <footer class="h-8 shrink-0 px-3 bg-[#111420] border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400 select-none">
      <!-- Left: File / Session Location -->
      <div class="flex items-center gap-2 truncate max-w-[65%]">
        <span class="w-2 h-2 rounded-full" :class="saveStatus === 'saved' ? 'bg-emerald-400' : 'bg-amber-400'"></span>
        <span class="truncate font-mono text-zinc-300" :title="activeSessionDir ? `${activeSessionDir}/notes.md` : 'Draft storage'">
          {{ activeSessionDir ? `${activeSessionDir}/notes.md` : 'Draft (Saved automatically on session start)' }}
        </span>
        <button
          v-if="activeSessionDir"
          type="button"
          @click="handleOpenSessionFolder"
          class="p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
          title="Open Session Folder"
        >
          <FolderOpen class="w-3 h-3" />
        </button>
      </div>

      <!-- Right: Stats & Save State -->
      <div class="flex items-center gap-3 shrink-0 font-mono">
        <span>{{ stats.words }} words</span>
        <span>{{ stats.lines }} lines</span>
        <span class="text-zinc-500">|</span>
        <span v-if="lastSavedTimestamp" class="text-zinc-400">Saved {{ lastSavedTimestamp }}</span>
        <span v-else-if="saveStatus === 'unsaved'" class="text-amber-400">Unsaved changes</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Dark Markdown Preview Styling */
:deep(.prose-dark) {
  color: #e4e4e7;
  font-family: inherit;
  line-height: 1.65;
  font-size: 0.875rem;
}

:deep(.prose-dark h1) {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.4rem;
  margin-top: 1rem;
  margin-bottom: 0.75rem;
}

:deep(.prose-dark h2) {
  font-size: 1.25rem;
  font-weight: 600;
  color: #f4f4f5;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding-bottom: 0.3rem;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

:deep(.prose-dark h3) {
  font-size: 1.1rem;
  font-weight: 600;
  color: #e4e4e7;
  margin-top: 0.75rem;
  margin-bottom: 0.35rem;
}

:deep(.prose-dark p) {
  margin-bottom: 0.75rem;
}

:deep(.prose-dark strong) {
  color: #ffffff;
  font-weight: 600;
}

:deep(.prose-dark em) {
  color: #d4d4d8;
  font-style: italic;
}

:deep(.prose-dark ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}

:deep(.prose-dark ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}

:deep(.prose-dark li) {
  margin-bottom: 0.25rem;
}

:deep(.prose-dark blockquote) {
  border-left: 3px solid #6366f1;
  padding-left: 0.75rem;
  margin-left: 0;
  margin-right: 0;
  margin-bottom: 0.75rem;
  color: #a1a1aa;
  font-style: italic;
}

:deep(.prose-dark code) {
  background-color: rgba(255, 255, 255, 0.08);
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-family: monospace;
  font-size: 0.8125rem;
  color: #f43f5e;
}

:deep(.prose-dark pre) {
  background-color: #05070c;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin-bottom: 0.75rem;
}

:deep(.prose-dark pre code) {
  background-color: transparent;
  padding: 0;
  color: #38bdf8;
  border-radius: 0;
}

:deep(.prose-dark hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 1rem 0;
}

:deep(.prose-dark a) {
  color: #818cf8;
  text-decoration: underline;
}

:deep(.prose-dark table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
}

:deep(.prose-dark th),
:deep(.prose-dark td) {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.4rem 0.6rem;
  text-align: left;
}

:deep(.prose-dark th) {
  background-color: rgba(255, 255, 255, 0.05);
  font-weight: 600;
  color: #ffffff;
}
</style>
