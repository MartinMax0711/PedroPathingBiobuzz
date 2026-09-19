<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import type { Line, Point, SequenceItem, Settings } from "../../types";
  import {
    checkStartPose,
    getStartPresets,
    normalizeDeg,
    FIELD,
  } from "../../biobuzz/field";
  import {
    applyStartPose,
    firstSequencedLine,
    rotateProject180,
    startHeadingDeg,
  } from "../../biobuzz/transform";

  export let startPoint: Point;
  export let lines: Line[] = [];
  export let sequence: SequenceItem[] = [];
  export let settings: Settings;
  export let recordChange: () => void = () => {};
  /** Predicted path time in seconds (for the AUTO budget chip). */
  export let autoTime: number = 0;
  export let autoLimitSeconds: number = 30;

  // Robot footprint: rWidth runs along the heading, rHeight across it.
  $: robotLength = Number(settings?.rWidth) || 16;
  $: robotWidth = Number(settings?.rHeight) || 16;

  $: firstLine = firstSequencedLine(lines, sequence);
  $: firstLineName = firstLine
    ? firstLine.name || `Path ${lines.indexOf(firstLine) + 1}`
    : "";
  $: followsPath = firstLine?.endPoint?.heading === "tangential";
  $: effectiveHeading = normalizeDeg(startHeadingDeg(startPoint, lines, sequence));

  $: check = checkStartPose(
    Number(startPoint.x) || 0,
    Number(startPoint.y) || 0,
    effectiveHeading,
    robotLength,
    robotWidth,
  );
  $: errors = check.issues.filter((i) => i.severity === "error");
  $: warnings = check.issues.filter((i) => i.severity === "warning");

  $: presets = getStartPresets(robotLength, robotWidth);
  $: redPresets = presets.filter((p) => p.alliance === "red");
  $: bluePresets = presets.filter((p) => p.alliance === "blue");
  $: matchedPreset = presets.find(
    (p) =>
      Math.abs(p.x - startPoint.x) < 0.05 &&
      Math.abs(p.y - startPoint.y) < 0.05 &&
      Math.abs(normalizeDeg(p.headingDeg - effectiveHeading)) < 0.5,
  );

  $: autoSeconds = Math.max(0, Number(autoTime) || 0);
  $: autoLimit = Number(autoLimitSeconds) > 0 ? Number(autoLimitSeconds) : 30;
  $: autoOver = autoSeconds - autoLimit;

  // Heading input: shows the heading the robot actually starts with. While the
  // field is focused the draft is left alone so typing is never overwritten.
  let headingFocused = false;
  let headingDraft: number | null = 0;
  const round1 = (d: number) => Math.round(d * 10) / 10;
  $: if (!headingFocused) headingDraft = round1(effectiveHeading);
  $: headingEditable = !startPoint.locked && !followsPath;

  const clampField = (n: unknown) => {
    const num = Number(n);
    return Number.isFinite(num) ? Math.min(FIELD, Math.max(0, num)) : 0;
  };

  function setPose(pose: { x: number; y: number; headingDeg: number }) {
    const next = applyStartPose(startPoint, lines, sequence, pose);
    startPoint = next.startPoint;
    lines = next.lines;
  }

  /** Parse a number input; empty or partial input ("-", "") gives NaN. */
  const readNumber = (event: Event) => {
    const raw = (event.currentTarget as HTMLInputElement).value;
    return raw.trim() === "" ? NaN : Number(raw);
  };

  function handleHeadingInput(event: Event) {
    const deg = readNumber(event);
    if (!Number.isFinite(deg) || !headingEditable) return;
    setPose({ x: startPoint.x, y: startPoint.y, headingDeg: deg });
  }

  function commitHeading(event: Event) {
    const deg = readNumber(event);
    if (!Number.isFinite(deg) || !headingEditable) {
      headingDraft = round1(effectiveHeading);
      return;
    }
    const normalized = normalizeDeg(deg);
    headingDraft = normalized;
    setPose({ x: startPoint.x, y: startPoint.y, headingDeg: normalized });
    recordChange?.();
  }

  function commitPosition() {
    startPoint = {
      ...startPoint,
      x: clampField(startPoint.x),
      y: clampField(startPoint.y),
    };
    recordChange?.();
  }

  function applyPreset(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const preset = presets.find((p) => p.id === select.value);
    select.value = "";
    if (!preset || startPoint.locked) return;
    setPose({ x: preset.x, y: preset.y, headingDeg: preset.headingDeg });
    recordChange?.();
  }

  function switchAlliance() {
    if (startPoint.locked) return;
    const next = rotateProject180(startPoint, lines);
    startPoint = next.startPoint;
    lines = next.lines;
    recordChange?.();
  }

  const allianceName = (a: string | null) =>
    a === "red" ? "Red" : a === "blue" ? "Blue" : "";

  const inputClass =
    "pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none dark:bg-neutral-950 dark:border-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-500 dark:disabled:text-neutral-400";
</script>

<div class="flex flex-col w-full justify-start items-start gap-1">
  <div class="flex items-center justify-between w-full gap-2 flex-wrap">
    <div class="font-semibold flex items-center gap-2">
      Starting Point
      <button
        title={startPoint.locked
          ? "Unlock Starting Point"
          : "Lock Starting Point"}
        on:click|stopPropagation={() => {
          startPoint.locked = !startPoint.locked;
          startPoint = { ...startPoint }; // Force reactivity
        }}
        class="p-1 rounded transition-colors duration-250"
      >
        {#if startPoint.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-yellow-500"
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
            class="size-5 stroke-gray-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>
    </div>

    <div class="flex items-center gap-2">
      <button
        on:click={switchAlliance}
        disabled={startPoint.locked}
        class="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-200 dark:hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        title={startPoint.locked
          ? "Starting point locked"
          : "Mirror the start and every path to the other alliance (180° field rotation)"}
      >
        ⇄ Switch alliance
      </button>
      <select
        value=""
        on:change={applyPreset}
        disabled={startPoint.locked}
        class="max-w-[10rem] px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
        title={startPoint.locked
          ? "Starting point locked"
          : "Move the robot to a legal BIOBUZZ starting pose (G304)"}
      >
        <option value="" disabled>BIOBUZZ start…</option>
        <optgroup label="Red alliance">
          {#each redPresets as p (p.id)}
            <option value={p.id} title={p.description}>{p.label}</option>
          {/each}
        </optgroup>
        <optgroup label="Blue alliance">
          {#each bluePresets as p (p.id)}
            <option value={p.id} title={p.description}>{p.label}</option>
          {/each}
        </optgroup>
      </select>
    </div>
  </div>

  <div class="flex flex-row flex-wrap justify-start items-center gap-x-2 gap-y-1">
    <span class="font-extralight">X:</span>
    <input
      bind:value={startPoint.x}
      on:change={commitPosition}
      min="0"
      max="141.5"
      type="number"
      class="{inputClass} w-28"
      step="0.1"
      disabled={startPoint.locked}
    />
    <span class="font-extralight">Y:</span>
    <input
      bind:value={startPoint.y}
      on:change={commitPosition}
      min="0"
      max="141.5"
      type="number"
      class="{inputClass} w-28"
      step="0.1"
      disabled={startPoint.locked}
    />
    <span class="font-extralight ml-1">Heading:</span>
    <div class="flex items-center gap-1">
      <input
        bind:value={headingDraft}
        on:focus={() => (headingFocused = true)}
        on:blur={() => {
          headingFocused = false;
          headingDraft = round1(effectiveHeading);
        }}
        on:input={handleHeadingInput}
        on:change={commitHeading}
        min="-180"
        max="180"
        type="number"
        step="1"
        class="{inputClass} w-20"
        disabled={!headingEditable}
        title={followsPath
          ? `${firstLineName} uses tangential heading, so the robot starts facing along the path. Switch it to Linear or Constant to set the start heading here.`
          : "Start heading in degrees (0° = toward the blue wall, 90° = away from the audience)"}
      />
      <span class="font-extralight">&deg;</span>
    </div>
    {#if followsPath}
      <span
        class="text-xs text-neutral-500 dark:text-neutral-400"
        title="{firstLineName} uses tangential heading"
      >
        follows {firstLineName}
      </span>
    {/if}
  </div>

  <!-- G304 legality + AUTO budget -->
  <div class="flex flex-row flex-wrap items-center gap-2 mt-1 text-xs">
    {#if check.ok}
      <span
        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
        title="Starting pose meets G304 / R102 for a {robotLength} × {robotWidth} in robot (L × W: length front↔back along the heading × width side↔side)"
      >
        ✓ Legal start · {allianceName(check.alliance)}
      </span>
    {:else}
      <span
        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200"
        title="Starting pose breaks G304 / R102 for a {robotLength} × {robotWidth} in robot (L × W: length front↔back along the heading × width side↔side). See the reasons below."
      >
        ✗ Start not legal
      </span>
    {/if}

    <span
      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium tabular-nums {autoOver > 0
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'}"
      title={autoOver > 0
        ? `The routine runs ${autoOver.toFixed(1)} s longer than the ${autoLimit} s AUTO period`
        : `The routine fits in the ${autoLimit} s AUTO period (${(autoLimit - autoSeconds).toFixed(1)} s to spare)`}
    >
      AUTO {autoSeconds.toFixed(1)} / {autoLimit} s{#if autoOver > 0}<span
          class="font-semibold">&nbsp;· +{autoOver.toFixed(1)} s over</span
        >{/if}
    </span>

    {#if matchedPreset}
      <span
        class="text-neutral-500 dark:text-neutral-400 truncate"
        title={matchedPreset.description}
      >
        {matchedPreset.label}
      </span>
    {/if}
  </div>

  {#if errors.length || warnings.length}
    <ul class="flex flex-col gap-0.5 text-xs pl-1">
      {#each errors as issue (issue.message)}
        <li class="flex items-start gap-1.5 text-rose-700 dark:text-rose-300">
          <span class="mt-[0.45rem] size-1 rounded-full bg-current shrink-0"></span>
          <span>{issue.message}</span>
        </li>
      {/each}
      {#each warnings as issue (issue.message)}
        <li class="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
          <span class="mt-[0.45rem] size-1 rounded-full bg-current shrink-0"></span>
          <span>{issue.message}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
