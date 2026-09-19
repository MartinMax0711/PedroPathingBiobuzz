<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import { formatTime } from "../../utils";

  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let percent: number;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean = true;
  export let markers: { percent: number; color: string; name: string }[] = [];
  // totalTime is in seconds
  export let totalTime: number = 0;
  /** Length of the AUTO period in seconds (BIOBUZZ: 30 s). */
  export let autoLimitSeconds: number = 30;

  $: elapsedSeconds = (percent / 100) * (totalTime || 0);
  $: autoLimit = Number(autoLimitSeconds) > 0 ? Number(autoLimitSeconds) : 30;
  $: overAuto = (totalTime || 0) > autoLimit;
  /** Fraction of the track where AUTO ends (only when the routine overruns). */
  $: autoFraction = overAuto ? autoLimit / totalTime : 1;
  $: elapsedPastAuto = overAuto && elapsedSeconds > autoLimit + 1e-6;

  /**
   * The range thumb is 20 px wide, so its centre travels from 10 px to
   * (width − 10 px). Place overlays with the same inset so they line up.
   */
  const trackLeft = (fraction: number) =>
    `calc(10px + (100% - 20px) * ${Math.min(1, Math.max(0, fraction))})`;
</script>

<div
  class="w-full bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex flex-row justify-start items-center gap-3 shadow-lg"
>
  <button
    title="Play/Pause"
    on:click={() => {
      if (playing) {
        pause();
      } else {
        play();
      }
    }}
  >
    {#if !playing}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-6 stroke-green-500"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
        />
      </svg>
    {:else}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-6 stroke-green-500"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15.75 5.25v13.5m-7.5-13.5v13.5"
        />
      </svg>
    {/if}
  </button>

  <!-- Loop Toggle Button -->
  <button
    title={loopAnimation ? "Disable Loop" : "Enable Loop"}
    on:click={() => {
      loopAnimation = !loopAnimation;
    }}
    class:opacity-100={loopAnimation}
    class:opacity-50={!loopAnimation}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
      class="size-6 stroke-blue-500"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  </button>

  <div class="w-full min-w-0 relative flex items-center h-5">
    {#if overAuto}
      <!-- AUTO overrun: shade the part of the routine past the AUTO period -->
      <div
        class="absolute z-0 inset-y-0 right-0 rounded-r-full bg-rose-500/20 dark:bg-rose-400/25 pointer-events-none"
        style="left: {trackLeft(autoFraction)}"
        aria-hidden="true"
      ></div>
    {/if}

    <input
      bind:value={percent}
      type="range"
      min="0"
      max="100"
      step="0.000001"
      class="relative z-[1] block w-full appearance-none slider focus:outline-none !bg-transparent"
      on:input={(e) => handleSeek(parseFloat(e.currentTarget.value))}
    />

    <!-- markers: small colored dots at the end of each path -->
    {#each markers as m}
      <div
        class="absolute z-[2] top-1/2"
        role="button"
        tabindex="0"
        on:click={() => handleSeek(m.percent)}
        on:keydown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleSeek(m.percent);
        }}
        style={`left: ${trackLeft(m.percent / 100)}; transform: translate(-50%, -50%); width: 12px; height: 12px; border-radius: 9999px; background: ${m.color}; box-shadow: 0 0 0 2px rgba(0,0,0,0.06); cursor: pointer;`}
        title={m.name}
        aria-label={m.name}
      ></div>
    {/each}

    {#if overAuto}
      <div
        class="absolute z-[2] -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-amber-500 pointer-events-none"
        style="left: {trackLeft(autoFraction)}"
        title="End of AUTO ({autoLimit} s)"
      ></div>
      <span
        class="absolute z-[2] -top-3.5 -translate-x-1/2 text-[9px] leading-none font-semibold tracking-wide text-amber-600 dark:text-amber-400 pointer-events-none select-none"
        style="left: {trackLeft(autoFraction)}"
      >
        AUTO
      </span>
    {/if}
  </div>

  <div
    class="flex items-center gap-2 ml-2 text-sm text-neutral-600 dark:text-neutral-300 whitespace-nowrap shrink-0 tabular-nums"
  >
    <div class={elapsedPastAuto ? "text-rose-600 dark:text-rose-400" : ""}>
      {formatTime(elapsedSeconds)} / {formatTime(totalTime || 0)}
    </div>
    <!-- Only an overrun is flagged here; the sidebar chip shows the AUTO budget. -->
    {#if totalTime > 0 && overAuto}
      <span
        class="px-1.5 py-0.5 text-xs rounded bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200"
        title="The routine is {(totalTime - autoLimit).toFixed(1)} s longer than the {autoLimit} s AUTO period"
      >
        +{(totalTime - autoLimit).toFixed(1)}s
      </span>
    {/if}
  </div>
</div>
