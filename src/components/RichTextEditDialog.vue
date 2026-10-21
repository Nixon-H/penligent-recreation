<script setup>
/**
 * Rich-text editor.
 *
 * The reference edits TACTICS library entries with a TipTap editor that
 * carries the table extensions and a Save / Download pair. This reproduces
 * that editor, its toolbar and its two buttons.
 */
import { ref, watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogStore } from "@/stores/dialog";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CircleX, Download, Save, Bold, Italic, List, TableIcon } from "lucide-vue-next";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const dialogStore = useDialogStore();
const noticeStore = useNoticeStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close", "saved"]);

const props = defineProps({
  entry: { type: Object, default: null }
});

const editor = useEditor({
  extensions: [
    StarterKit,
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader
  ],
  content: "",
  editorProps: {
    attributes: {
      spellcheck: "false",
      class: "tiptap"
    }
  }
});

watch(
  () => props.entry,
  (entry) => {
    if (!editor.value) return;
    editor.value.commands.setContent(entry?.content || entry?.description || "");
  },
  { immediate: true }
);

onBeforeUnmount(() => editor.value?.destroy());

function save() {
  if (!editor.value) return;
  emit("saved", { ...props.entry, content: editor.value.getHTML() });
  noticeStore.info(t("edit.保存"), t("report.报告保存成功"));
}

function download() {
  if (!editor.value) return;
  const blob = new Blob([editor.value.getHTML()], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${props.entry?.name || "tactic"}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">
            <span>{{ entry?.name || entry?.title }}</span>
          </div>
          <div class="header-actions">
            <button class="icon-button" title="Bold" @click="editor?.chain().focus().toggleBold().run()">
              <Bold :size="14" />
            </button>
            <button class="icon-button" title="Italic" @click="editor?.chain().focus().toggleItalic().run()">
              <Italic :size="14" />
            </button>
            <button class="icon-button" title="List" @click="editor?.chain().focus().toggleBulletList().run()">
              <List :size="14" />
            </button>
            <button
              class="icon-button"
              title="Table"
              @click="editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()"
            >
              <TableIcon :size="14" />
            </button>
            <button class="icon-button" :title="t('edit.下载')" @click="download">
              <Download :size="14" />
            </button>
            <button class="icon-button" title="Save" @click="save">
              <Save :size="14" />
            </button>
            <CircleX class="close-button" :size="18" @click="emit('close')" />
          </div>
        </div>

        <div class="editor-content">
          <EditorContent :editor="editor" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-container {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.container {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #00000080;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 30px;
  box-sizing: border-box;
}

.content {
  width: min(720px, 92vw);
  max-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border);
  background-color: var(--background);
  border-radius: 10px;
  padding: 18px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.header .title {
  font-size: 1.05rem;
  font-weight: 700;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: none;
  color: var(--foreground);
  cursor: pointer;
}

.icon-button:hover {
  background-color: var(--button-hover);
}

.close-button {
  cursor: pointer;
  margin-left: 4px;
}

.editor-content {
  flex: 1;
  min-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 10px;
}

.editor-content :deep(.tiptap) {
  outline: none;
  min-height: 280px;
  font-size: 0.9rem;
  line-height: 1.6;
}

.editor-content :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: "";
  float: left;
  height: 0;
  pointer-events: none;
}

.editor-content :deep(.tiptap table) {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  margin: 8px 0;
}

.editor-content :deep(.tiptap td),
.editor-content :deep(.tiptap th) {
  border: 1px solid var(--border);
  padding: 4px 6px;
  vertical-align: top;
  position: relative;
}

.editor-content :deep(.tiptap th) {
  background-color: var(--border);
  font-weight: 700;
}

.editor-content :deep(.tiptap .selectedCell::after) {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(64, 128, 255, 0.14);
  pointer-events: none;
}
</style>
