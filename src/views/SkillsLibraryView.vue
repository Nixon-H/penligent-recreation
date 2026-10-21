<script setup>
/**
 * Skills Library.
 *
 * The reference calls this the 攻击技战法库 and stores each entry in the local
 * `ttp` table: a title, a type, a risk level, a detection priority and the
 * body fields (overview, detection method, WAF bypass points, how to confirm
 * the vulnerability, possible false positives, priority and notes). The list
 * can be searched and entries are edited with the rich-text editor.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { Search, Plus, Pencil, Trash2, CircleX } from "lucide-vue-next";
import RichTextEditDialog from "@/components/RichTextEditDialog.vue";
import { useNoticeStore } from "@/stores/notice";

const { t } = useI18n();
const noticeStore = useNoticeStore();

const entries = ref([]);
const query = ref("");
const selected = ref(null);
const editing = ref(null);
const loading = ref(false);

const LEVELS = ["low", "medium", "high", "critical"];

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return entries.value;
  return entries.value.filter((entry) =>
    [entry.title, entry.ttp_type, entry.overview, entry.ttp_level]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle))
  );
});

async function load() {
  loading.value = true;
  try {
    entries.value = await window.dbAPI.getAllTtps();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function create() {
  editing.value = {
    id: null,
    title: "",
    ttp_type: "注入攻击",
    ttp_level: "medium",
    ttp_priority: 5,
    overview: "",
    detection_method: "",
    waf_bypass: "",
    verification: "",
    false_positive: "",
    priority: "",
    notes: ""
  };
}

async function save(entry) {
  if (entry.id) {
    await window.dbAPI.updateTtp(entry.id, entry);
  } else {
    await window.dbAPI.addTtp(entry);
  }
  editing.value = null;
  await load();
  noticeStore.info(t("edit.保存"), t("report.报告保存成功"));
}

async function remove(entry) {
  await window.dbAPI.deleteTtp(entry.id);
  await load();
}
</script>

<template>
  <div class="skills-library">
    <div class="header">
      <div class="title">
        <span>{{ t("tactics-library.攻击技战法库") }}</span>
        <span class="subtitle">{{ t("tactics-library.漏洞检测、验证与利用技术参考") }}</span>
      </div>
      <div class="header-actions">
        <div class="search-box">
          <Search :size="13" />
          <input
            v-model="query"
            type="text"
            :placeholder="t('tactics-library.搜索技站法')"
          />
        </div>
        <button class="add-button" @click="create">
          <Plus :size="13" />
          <span>{{ t("tactics-library.新增") }}</span>
        </button>
        <button
          class="add-button"
          @click="$bus('penligent:tac-lib-create')"
        >
          <Plus :size="13" />
          <span>{{ t("tac-lib-create.新增技站法") }}</span>
        </button>
      </div>
    </div>

    <div class="body">
      <div v-if="loading" class="empty">Loading…</div>
      <div v-else-if="visible.length === 0" class="empty">
        {{ t("agent-skills-detection.暂无历史记录") }}
      </div>
      <div
        v-for="entry in visible"
        v-else
        :key="entry.id"
        class="entry"
        :class="{ selected: selected?.id === entry.id }"
        @click="selected = entry"
      >
        <div class="entry-head">
          <span class="entry-title">{{ entry.title }}</span>
          <span class="entry-level" :class="entry.ttp_level">{{ entry.ttp_level }}</span>
        </div>
        <div class="entry-meta">
          <span v-if="entry.ttp_type">{{ entry.ttp_type }}</span>
          <span v-if="entry.ttp_priority">{{ t("tactics-library.检测优先级") }}: {{ entry.ttp_priority }}</span>
        </div>
        <div class="entry-overview">{{ entry.overview }}</div>
        <div class="entry-actions">
          <button class="icon-button" @click.stop="editing = entry">
            <Pencil :size="13" />
          </button>
          <button class="icon-button" @click.stop="remove(entry)">
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="selected" class="detail">
      <div class="detail-title">{{ selected.title }}</div>
      <div class="detail-row">
        <span class="detail-label">{{ t("tactics-library.漏洞概述") }}</span>
        <span class="detail-value">{{ selected.overview || "—" }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t("tactics-library.检测方法") }}</span>
        <span class="detail-value">{{ selected.detection_method || "—" }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t("tactics-library.WAF与绕过点") }}</span>
        <span class="detail-value">{{ selected.waf_bypass || "—" }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t("tactics-library.确认漏洞存在的判断方式") }}</span>
        <span class="detail-value">{{ selected.verification || "—" }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t("tactics-library.可能的误判原因与二次验证方式") }}</span>
        <span class="detail-value">{{ selected.false_positive || "—" }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t("tactics-library.注意事项") }}</span>
        <span class="detail-value">{{ selected.notes || "—" }}</span>
      </div>
    </div>

    <RichTextEditDialog
      v-if="editing"
      :entry="editing"
      @close="editing = null"
      @saved="save"
    />
  </div>
</template>

<style scoped>
.skills-library {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 1.1rem;
  font-weight: 700;
}

.subtitle {
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
}

.search-box input {
  border: none;
  background: none;
  outline: none;
  color: var(--foreground);
  font-size: 0.8rem;
  width: 150px;
}

.add-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background-color: var(--button-bg);
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.8rem;
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.empty {
  padding: 16px;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}

.entry {
  position: relative;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
}

.entry.selected {
  border-color: var(--button-bg);
}

.entry-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 54px;
}

.entry-title {
  font-weight: 700;
  font-size: 0.85rem;
}

.entry-level {
  font-size: 0.65rem;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--border);
  text-transform: uppercase;
}

.entry-level.critical {
  border-color: #d64545;
}

.entry-level.high {
  border-color: #d68a2c;
}

.entry-meta {
  display: flex;
  gap: 10px;
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 2px;
}

.entry-overview {
  font-size: 0.78rem;
  color: var(--muted);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-actions {
  position: absolute;
  top: 5px;
  right: 6px;
  display: flex;
  gap: 3px;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: none;
  color: var(--foreground);
  cursor: pointer;
}

.detail {
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 9px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 34%;
  overflow-y: auto;
}

.detail-title {
  font-weight: 700;
}

.detail-row {
  display: flex;
  gap: 8px;
  font-size: 0.78rem;
}

.detail-label {
  flex: 0 0 160px;
  color: var(--muted);
}

.detail-value {
  flex: 1;
  word-break: break-word;
}
</style>
