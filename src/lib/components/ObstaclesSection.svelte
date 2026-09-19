<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import type { Shape } from "../../types";
  import {
    createTriangle,
    OBSTACLE_COLOR_CHOICES,
    findObstacleColor,
    obstacleKind,
    isBiobuzzObstacle,
  } from "../../utils";
  import { getDefaultShapes } from "../../config/defaults";
  import { snapToGrid, showGrid, gridSize } from "../../stores";

  export let shapes: Shape[];
  export let collapsedObstacles: boolean[];
  export let recordChange: () => void = () => {};
  /** Whole obstacle list open/closed (collapsed by default so paths stay close). */
  export let open = false;

  const FIELD_MAX = 141.5;

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  // Compact summary shown while the list is collapsed.
  const KIND_META = [
    { kind: "hive-frame", label: "HIVE frame", swatch: "#52525b" },
    { kind: "flower", label: "FLOWER", swatch: "#d97706" },
    { kind: "custom", label: "Custom", swatch: "" },
  ] as const;

  $: summary = KIND_META.map((meta) => {
    const members = shapes.filter((s) => obstacleKind(s) === meta.kind);
    return {
      ...meta,
      count: members.length,
      swatch: meta.swatch || members[0]?.color || "#dc2626",
    };
  }).filter((g) => g.count > 0);
  $: allLocked = shapes.length > 0 && shapes.every((s) => s.locked);
  $: lockedCount = shapes.filter((s) => s.locked).length;

  const defaultsJson = JSON.stringify(getDefaultShapes());
  $: biobuzzIntact =
    JSON.stringify(shapes.filter((s) => isBiobuzzObstacle(s))) === defaultsJson;

  $: allItemsCollapsed = collapsedObstacles.every((c) => c);

  function commit() {
    shapes = shapes;
    recordChange?.();
  }

  function toggleOpen() {
    open = !open;
  }

  function toggleObstacle(index: number) {
    collapsedObstacles[index] = !collapsedObstacles[index];
    collapsedObstacles = [...collapsedObstacles]; // Force reactivity
  }

  function toggleAllObstacles() {
    const allCollapsed = collapsedObstacles.every((c) => c);
    collapsedObstacles = collapsedObstacles.map(() => !allCollapsed);
  }

  function setPresetColor(index: number, color: string) {
    const choice = OBSTACLE_COLOR_CHOICES.find((c) => c.color === color);
    if (!choice) return;
    shapes[index] = { ...shapes[index], color: choice.color, fillColor: choice.fill };
    commit();
  }

  function toggleLock(index: number) {
    shapes[index] = { ...shapes[index], locked: !shapes[index].locked };
    commit();
  }

  function addVertex(index: number) {
    const shape = shapes[index];
    if (shape.locked) return;
    shape.vertices = [...shape.vertices, { x: 50, y: 50 }];
    commit();
  }

  function removeVertex(index: number, vertexIdx: number) {
    const shape = shapes[index];
    if (shape.locked || shape.vertices.length <= 3) return;
    shape.vertices = shape.vertices.filter((_, i) => i !== vertexIdx);
    commit();
  }

  function commitVertex(index: number, vertexIdx: number) {
    const v = shapes[index].vertices[vertexIdx];
    const clamp = (n: unknown) => {
      const num = Number(n);
      return Number.isFinite(num) ? Math.min(FIELD_MAX, Math.max(0, num)) : 0;
    };
    v.x = clamp(v.x);
    v.y = clamp(v.y);
    commit();
  }

  function removeShape(index: number) {
    shapes = shapes.filter((_, i) => i !== index);
    collapsedObstacles = collapsedObstacles.filter((_, i) => i !== index);
    recordChange?.();
  }

  function addShape() {
    shapes = [...shapes, createTriangle(shapes)];
    // Open the new obstacle so its vertices can be edited right away.
    collapsedObstacles = [...collapsedObstacles, false];
    open = true;
    recordChange?.();
  }

  /** Put the six BIOBUZZ field obstacles back; custom obstacles are kept. */
  function restoreBiobuzz() {
    const custom = shapes.filter((s) => !isBiobuzzObstacle(s));
    shapes = [...getDefaultShapes(), ...custom];
    collapsedObstacles = shapes.map(() => true);
    recordChange?.();
  }

  const inputClass =
    "pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none";
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
  <div class="flex items-center gap-2 w-full">
    <button
      on:click={toggleOpen}
      class="flex items-center gap-2 font-semibold px-2 py-1 rounded transition-colors duration-250"
      title="{open ? 'Hide' : 'Show'} obstacles"
      aria-expanded={open}
      data-testid="obstacles-toggle"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-4 transition-transform {open ? 'rotate-90' : 'rotate-0'}"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m8.25 4.5 7.5 7.5-7.5 7.5"
        />
      </svg>
      Obstacles ({shapes.length})
    </button>

    {#if open && shapes.length > 0}
      <button
        on:click={toggleAllObstacles}
        class="ml-auto px-2 py-1 rounded text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
        title="{allItemsCollapsed ? 'Show' : 'Hide'} the vertices of every obstacle"
      >
        {allItemsCollapsed ? "Expand all" : "Collapse all"}
      </button>
    {/if}
  </div>

  {#if !open}
    <!-- Collapsed: one-line summary, aligned with the header text -->
    <div class="flex flex-row flex-wrap items-center gap-1.5 pl-8 text-xs">
      {#if shapes.length === 0}
        <span class="text-neutral-500 dark:text-neutral-400">No obstacles</span>
        <button
          on:click={restoreBiobuzz}
          class="font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
          title="Add the six BIOBUZZ field obstacles (2 HIVE frame rails, 4 FLOWERS)"
        >
          Restore BIOBUZZ
        </button>
      {:else}
        {#each summary as group (group.kind)}
          <span
            class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >
            <span
              class="size-2 rounded-full shrink-0"
              style="background-color: {group.swatch}"
            ></span>
            {group.label} ×{group.count}
          </span>
        {/each}
        {#if lockedCount > 0}
          <span
            class="inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400"
            title={allLocked
              ? "All obstacles are fixed field elements (unlock one to edit it)"
              : `${lockedCount} of ${shapes.length} obstacles are fixed`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5 stroke-yellow-500"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
            {allLocked ? "fixed" : `${lockedCount} fixed`}
          </span>
        {/if}
      {/if}
    </div>
  {:else}
    {#each shapes as shape, shapeIdx}
      {@const preset = findObstacleColor(shape.color)}
      <div
        class="flex flex-col w-full justify-start items-start gap-1 p-2 border rounded-md border-neutral-300 dark:border-neutral-600 mt-2"
      >
        <div class="flex flex-row w-full justify-between items-center gap-2">
          <div class="flex flex-row items-center gap-2 min-w-0 flex-1">
            <button
              on:click={() => toggleObstacle(shapeIdx)}
              class="flex items-center gap-2 font-medium text-sm px-2 py-1 rounded transition-colors duration-250 shrink-0 whitespace-nowrap tabular-nums"
              title="{collapsedObstacles[shapeIdx]
                ? 'Expand'
                : 'Collapse'} obstacle"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                stroke="currentColor"
                class="size-4 transition-transform {collapsedObstacles[shapeIdx]
                  ? 'rotate-0'
                  : 'rotate-90'}"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
              Obstacle {shapeIdx + 1}
            </button>

            <input
              bind:value={shape.name}
              placeholder="Obstacle {shapeIdx + 1}"
              title={shape.name}
              on:change={commit}
              class="{inputClass} text-sm font-medium min-w-0 flex-1 max-w-[15rem]"
            />

            <span
              class="size-3.5 rounded-full shrink-0 border border-black/10 dark:border-white/20"
              style="background-color: {shape.color}"
              title="Obstacle colour"
            ></span>
            <select
              class="rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] px-2 py-1 text-sm font-medium shrink-0"
              value={preset ? preset.color : shape.color}
              on:change={(e) => setPresetColor(shapeIdx, e.currentTarget.value)}
              title="Obstacle colour"
            >
              {#if !preset}
                <option value={shape.color}>Custom</option>
              {/if}
              {#each OBSTACLE_COLOR_CHOICES as c}
                <option value={c.color}>{c.label}</option>
              {/each}
            </select>
          </div>

          <div class="flex flex-row items-center gap-1 shrink-0">
            <!-- Lock/Unlock (same icon + style as paths) -->
            <button
              title={shape.locked
                ? "Unlock obstacle (allow editing its vertices)"
                : "Lock obstacle"}
              on:click|stopPropagation={() => toggleLock(shapeIdx)}
              class="p-1 rounded transition-colors duration-250"
            >
              {#if shape.locked}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  stroke="currentColor"
                  class="size-4 stroke-yellow-500"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  stroke="currentColor"
                  class="size-4 stroke-gray-400"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              {/if}
            </button>

            <button
              title="Add Vertex"
              class:invisible={shape.locked}
              disabled={shape.locked}
              on:click={() => addVertex(shapeIdx)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                class="size-4 stroke-green-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </button>
            <button title="Remove Obstacle" on:click={() => removeShape(shapeIdx)}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                class="size-4 stroke-red-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </button>
          </div>
        </div>

        {#if !collapsedObstacles[shapeIdx]}
          {#each shape.vertices as vertex, vertexIdx}
            <div class="flex flex-row justify-start items-center gap-2">
              <div class="font-bold text-sm w-5 text-right tabular-nums">
                {vertexIdx + 1}:
              </div>
              <div class="font-extralight text-sm">X:</div>
              <input
                bind:value={vertex.x}
                type="number"
                min="0"
                max="141.5"
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                title={shape.locked ? "Obstacle locked" : snapToGridTitle}
                disabled={shape.locked}
                on:change={() => commitVertex(shapeIdx, vertexIdx)}
                class="{inputClass} w-24 text-sm disabled:cursor-not-allowed disabled:text-neutral-500 dark:disabled:text-neutral-400"
              />
              <div class="font-extralight text-sm">Y:</div>
              <input
                bind:value={vertex.y}
                type="number"
                min="0"
                max="141.5"
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                title={shape.locked ? "Obstacle locked" : snapToGridTitle}
                disabled={shape.locked}
                on:change={() => commitVertex(shapeIdx, vertexIdx)}
                class="{inputClass} w-24 text-sm disabled:cursor-not-allowed disabled:text-neutral-500 dark:disabled:text-neutral-400"
              />
              {#if $snapToGrid && $showGrid && !shape.locked}
                <span class="text-xs text-green-500" title="Snapping enabled"
                  >✓</span
                >
              {/if}
              {#if shape.vertices.length > 3 && !shape.locked}
                <button
                  title="Remove Vertex"
                  on:click={() => removeVertex(shapeIdx, vertexIdx)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={2}
                    class="size-4 stroke-red-500"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
          {#if shape.locked}
            <p class="pl-7 text-xs text-neutral-500 dark:text-neutral-400">
              {isBiobuzzObstacle(shape) ? "Fixed BIOBUZZ field element" : "Locked"} —
              unlock to move its vertices.
            </p>
          {/if}
        {/if}
      </div>
    {/each}

    <div class="flex flex-row items-center gap-4 mt-2">
      <button
        on:click={addShape}
        class="font-semibold text-red-500 text-sm flex flex-row justify-start items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <p>Add Obstacle</p>
      </button>

      <button
        on:click={restoreBiobuzz}
        disabled={biobuzzIntact}
        class="font-semibold text-amber-600 dark:text-amber-400 text-sm flex flex-row justify-start items-center gap-1 disabled:opacity-40 disabled:cursor-default"
        title={biobuzzIntact
          ? "The BIOBUZZ field obstacles are already in place"
          : "Restore the six BIOBUZZ field obstacles (custom obstacles are kept)"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.9h3.9"
          />
        </svg>
        <p>Restore BIOBUZZ</p>
      </button>
    </div>
  {/if}
</div>
