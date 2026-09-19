<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { normalizeDeg } from "../../biobuzz/field";
  export let endPoint: any;
  export let locked: boolean = false;
  const dispatch = createEventDispatcher();

  /** Commit a heading field: keep it in (-180, 180] and record the change. */
  function commitDeg(key: "startDeg" | "endDeg" | "degrees") {
    const value = Number(endPoint[key]);
    endPoint[key] = Number.isFinite(value) ? normalizeDeg(value) : 0;
    dispatch("commit");
  }
</script>

<select
  bind:value={endPoint.heading}
  on:change={() => {
    // Initialize missing properties based on the selected heading type
    if (endPoint.heading === "constant" && endPoint.degrees === undefined) {
      endPoint.degrees = 0;
    } else if (endPoint.heading === "linear") {
      if (endPoint.startDeg === undefined) endPoint.startDeg = 0;
      if (endPoint.endDeg === undefined) endPoint.endDeg = 0;
    } else if (endPoint.heading === "tangential") {
      if (endPoint.reverse === undefined) endPoint.reverse = false;
    }
    dispatch("change");
    // A mode switch is a finished edit: record it so undo/redo includes it.
    dispatch("commit");
  }}
  class=" rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28 text-sm"
  title="The heading style of the robot. 
With constant heading, the robot maintains the same heading throughout the line. 
With linear heading, heading changes linearly between given start and end angles. 
With tangential heading, the heading follows the direction of the line."
  disabled={locked}
>
  <option value="constant">Constant</option>
  <option value="linear">Linear</option>
  <option value="tangential">Tangential</option>
</select>

{#if endPoint.heading === "linear"}
  <div class="flex items-center gap-1">
    <span class="text-xs text-neutral-600 dark:text-neutral-400">Start:</span>
    <input
      class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
      step="1"
      type="number"
      min="-180"
      max="180"
      bind:value={endPoint.startDeg}
      on:input={() => dispatch("change")}
      on:blur={() => commitDeg("startDeg")}
      title="The heading the robot starts this line at (in degrees)"
      disabled={locked}
    />
    <span class="text-xs text-neutral-600 dark:text-neutral-400 ml-1">End:</span
    >
    <input
      class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
      step="1"
      type="number"
      min="-180"
      max="180"
      bind:value={endPoint.endDeg}
      on:input={() => dispatch("change")}
      on:blur={() => commitDeg("endDeg")}
      title="The heading the robot ends this line at (in degrees)"
      disabled={locked}
    />
  </div>
{:else if endPoint.heading === "constant"}
  <div class="flex items-center gap-1">
    <span class="text-xs text-neutral-600 dark:text-neutral-400">Deg:</span>
    <input
      class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
      step="1"
      type="number"
      min="-180"
      max="180"
      value={endPoint.degrees || 0}
      on:input={(e) => {
        const value = parseFloat(e.currentTarget.value);
        // Empty or partial input ("-") keeps the last valid value while typing.
        if (!isNaN(value)) endPoint.degrees = value;
        dispatch("change");
      }}
      on:blur={(e) => {
        const value = parseFloat(e.currentTarget.value);
        endPoint.degrees = isNaN(value) ? 0 : normalizeDeg(value);
        e.currentTarget.value = String(endPoint.degrees);
        dispatch("commit");
      }}
      title="The constant heading the robot maintains throughout this line (in degrees)"
      disabled={locked}
    />
  </div>
{:else if endPoint.heading === "tangential"}
  <p class="text-sm font-extralight">Reverse:</p>
  <input
    type="checkbox"
    bind:checked={endPoint.reverse}
    on:change={() => {
      dispatch("change");
      dispatch("commit");
    }}
    title="Reverse the direction the robot faces along the tangential path"
    disabled={locked}
  />
{/if}
