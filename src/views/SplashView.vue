<script setup>
/**
 * Splash screen.
 *
 * Reproduces the reference's `dist/splash.html`: a 320px dot-matrix logo on a
 * #1a1a1a background with the caption "INITIALIZING PENLIGENT". The reference
 * animates the 45 circles with GSAP; this reconstruction uses CSS keyframes
 * for the same staggered entrance and wave so that no extra runtime
 * dependency is required.
 */
const DOTS = [
  [116, 152, 11.5], [116, 184, 10.2], [116, 216, 8.8], [116, 248, 7.5],
  [144, 136, 12.5], [144, 168, 11.2], [144, 200, 9.8], [144, 232, 8.5], [144, 264, 7.2],
  [172, 120, 13.5], [172, 152, 12.2], [172, 184, 10.8], [172, 216, 9.5],
  [172, 248, 8.2], [172, 280, 6.8],
  [200, 104, 14], [200, 136, 12.8], [200, 168, 11.5], [200, 200, 10.2],
  [200, 232, 8.8], [200, 264, 7.5], [200, 296, 6.2],
  [228, 120, 13.5], [228, 152, 12.2], [228, 184, 10.8], [228, 216, 9.5],
  [228, 248, 8.2], [228, 280, 6.8],
  [256, 136, 12.5], [256, 168, 11.2], [256, 200, 9.8], [256, 232, 8.5], [256, 264, 7.2],
  [284, 152, 11.5], [284, 184, 10.2], [284, 216, 8.8], [284, 248, 7.5]
];
</script>

<template>
  <div class="logo-animation-container dark">
    <svg class="logo-svg" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <circle
        v-for="(dot, index) in DOTS"
        :key="index"
        class="logo-dot"
        :cx="dot[0]"
        :cy="dot[1]"
        :r="dot[2]"
        fill="#888"
        :style="{ animationDelay: index * 0.012 + 's' }"
      />
    </svg>
    <div class="loading-text">INITIALIZING PENLIGENT</div>
  </div>
</template>

<style scoped>
.logo-animation-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  transition: background-color 0.5s;
  position: relative;
}

.logo-animation-container.dark {
  background-color: #1a1a1a;
}

.logo-animation-container.light {
  background-color: #fff;
}

.logo-svg {
  width: 320px;
  height: 320px;
}

.logo-dot {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: dot-in 1.5s expo.out forwards, dot-wave 0.8s 2s sine.inOut infinite alternate;
}

@keyframes dot-in {
  from {
    opacity: 0;
    transform: scale(0);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes dot-wave {
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

.loading-text {
  position: absolute;
  bottom: 40px;
  color: #888;
  font-size: 13px;
  letter-spacing: 2px;
  opacity: 0;
  animation: text-in 1s 1.4s ease forwards;
}

@keyframes text-in {
  to {
    opacity: 1;
  }
}
</style>
