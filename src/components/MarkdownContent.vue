<script setup>
/**
 * The markdown renderer.
 *
 * The reference renders the model's replies, its thinking and the report
 * through one markdown component, and sanitises the result before it reaches
 * the DOM.
 */
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import DOMPurify from "dompurify";

const props = defineProps({
  source: { type: String, default: "" }
});

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true
}).use(anchor, { permalink: anchor.permalink.linkInsideHeader({ symbol: "¶" }) });

const html = computed(() =>
  DOMPurify.sanitize(md.render(props.source || ""), {
    ADD_ATTR: ["target", "rel"]
  })
);
</script>

<template>
  <div class="content-text-markdown" v-html="html" />
</template>

<style scoped>
.content-text-markdown {
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--foreground);
  word-break: break-word;
}

.content-text-markdown :deep(p) {
  margin: 0 0 8px 0;
}

.content-text-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.content-text-markdown :deep(pre) {
  margin: 8px 0;
  padding: 10px;
  border-radius: 6px;
  background-color: var(--button-hover);
  overflow-x: auto;
  font-size: 0.82rem;
  line-height: 1.55;
}

.content-text-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.84em;
}

.content-text-markdown :deep(:not(pre) > code) {
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--button-hover);
}

.content-text-markdown :deep(ul),
.content-text-markdown :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}

.content-text-markdown :deep(h1),
.content-text-markdown :deep(h2),
.content-text-markdown :deep(h3),
.content-text-markdown :deep(h4) {
  margin: 12px 0 6px 0;
  font-size: 1em;
  font-weight: 700;
}

.content-text-markdown :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.82rem;
}

.content-text-markdown :deep(th),
.content-text-markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 8px;
}

.content-text-markdown :deep(a) {
  color: var(--accent);
}
</style>
