<script setup>
/**
 * Report dialog.
 *
 * The reference opens the report as a dialog (`openDialog("report")`) from
 * the centre header, not as a route, so the recreation does the same.
 */
import { CircleX } from "lucide-vue-next";
import ReportView from "@/views/ReportView.vue";

const dialogStore = useDialogStore();
/** The backdrop closes the dialog, as the reference does. */
function onBackdrop() {
  dialogStore.closeDialog();
}

const emit = defineEmits(["close"]);
</script>

<template>
  <div class="dialog-container">
    <div class="container" @click="onBackdrop">
      <div class="content" @click.stop>
        <div class="header">
          <div class="title">Report</div>
          <CircleX class="close-button" :size="20" @click="emit('close')" />
        </div>
        <div class="body">
          <ReportView />
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
  width: min(900px, 94vw);
  height: min(760px, calc(100vh - 60px));
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
  font-size: 1.1rem;
  font-weight: 700;
}

.close-button {
  cursor: pointer;
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
