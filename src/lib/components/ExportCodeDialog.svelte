<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import type { Point, Line, SequenceItem, PathChain } from "../../types";
  import Highlight from "svelte-highlight";
  import java from "svelte-highlight/languages/java";
  import kotlin from "svelte-highlight/languages/kotlin";
  import plaintext from "svelte-highlight/languages/plaintext";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { currentFilePath } from "../../stores";
  import {
    generateJavaCode,
    generateKotlinCode,
    generatePointsArray,
    generateSequentialCommandCode,
    type CodeExportMode,
  } from "../../utils/codeExporter";
  import { CENTER, normalizeDeg } from "../../biobuzz/field";
  import { rotateProject180, startHeadingDeg } from "../../biobuzz/transform";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let pathChains: PathChain[] = [];

  type ExportFormat = "java" | "kotlin" | "points" | "sequential";

  const FORMAT_LABELS: Record<ExportFormat, string> = {
    java: "Java",
    kotlin: "Kotlin",
    points: "Points",
    sequential: "Commands",
  };

  const MODE_OPTIONS: { value: CodeExportMode; label: string; hint: string }[] = [
    {
      value: "coordinates",
      label: "Paths only",
      hint: "PathChain assignments to paste into an existing constructor.",
    },
    {
      value: "class",
      label: "Paths class",
      hint: "A Paths class with the start pose and every path chain.",
    },
    {
      value: "full",
      label: "Full OpMode",
      hint: "A complete autonomous OpMode whose state machine runs the sequence (paths and waits) in order.",
    },
  ];

  let exportMode: CodeExportMode = "class";
  let exportFormat: ExportFormat = "java";
  // The Commands (SolversLib) export is only offered when the navbar asks for it.
  let showSequentialTab = false;
  let otherAlliance = false;
  let sequentialClassName = "AutoPath";
  let exportedCode = "";
  let currentLanguage: typeof java | typeof kotlin | typeof plaintext = java;
  let copied = false;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  $: formats = (showSequentialTab
    ? ["java", "kotlin", "points", "sequential"]
    : ["java", "kotlin", "points"]) as ExportFormat[];

  // Path data as it will be exported (optionally rotated 180° for the other alliance).
  function exportSource(): { startPoint: Point; lines: Line[] } {
    return otherAlliance ? rotateProject180(startPoint, lines) : { startPoint, lines };
  }
  $: exportData = otherAlliance
    ? rotateProject180(startPoint, lines)
    : { startPoint, lines };

  $: drawnAlliance = (startPoint?.x ?? 0) < CENTER ? "Red" : "Blue";
  $: exportAlliance = otherAlliance
    ? drawnAlliance === "Red"
      ? "Blue"
      : "Red"
    : drawnAlliance;

  // Compact UI number: 8 -> "8", 61.754 -> "61.75".
  const uiNumber = (value: number) =>
    String(Math.round((Number(value) || 0) * 100) / 100).replace(/^-0$/, "0");

  $: startSummary = exportData?.startPoint
    ? `(${uiNumber(exportData.startPoint.x)}, ${uiNumber(exportData.startPoint.y)}, ${uiNumber(
        normalizeDeg(startHeadingDeg(exportData.startPoint, exportData.lines, sequence)),
      )}°)`
    : "";

  $: modeHint = MODE_OPTIONS.find((m) => m.value === exportMode)?.hint ?? "";

  $: isCode = exportFormat === "java" || exportFormat === "kotlin";

  $: downloadName =
    exportFormat === "sequential"
      ? `${/^[0-9]/.test(sequentialClassName) ? "Auto" : ""}${sequentialClassName || "AutoPath"}.java`
      : isCode && exportMode === "full"
        ? `PedroAutonomous.${exportFormat === "kotlin" ? "kt" : "java"}`
        : "";

  $: lineCount = exportedCode ? exportedCode.split("\n").length : 0;

  function classNameFromFile(path: string | null): string | null {
    const fileName = path?.split(/[\\/]/).pop();
    if (!fileName) return null;
    return fileName.replace(/\.pp$/i, "").replace(/[^a-zA-Z0-9]/g, "_");
  }

  // Follow the open file's name unless the user typed their own class name.
  $: if ($currentFilePath) {
    const baseName = classNameFromFile($currentFilePath);
    if (baseName && sequentialClassName === "AutoPath") {
      sequentialClassName = baseName;
    }
  }

  async function regenerate() {
    const run = ++generation;
    let code = "";
    let language: typeof java | typeof kotlin | typeof plaintext = plaintext;
    try {
      const { startPoint: sp, lines: ls } = exportSource();
      if (exportFormat === "java") {
        code = await generateJavaCode(sp, ls, exportMode, pathChains, { sequence });
        language = java;
      } else if (exportFormat === "kotlin") {
        code = await generateKotlinCode(sp, ls, exportMode, pathChains, { sequence });
        language = kotlin;
      } else if (exportFormat === "points") {
        code = generatePointsArray(sp, ls);
        language = plaintext;
      } else {
        code = await generateSequentialCommandCode(sp, ls, sequentialClassName, sequence);
        language = java;
      }
    } catch (error) {
      console.error("Export failed:", error);
      code = "// Error generating code. Please check the console for details.";
      language = plaintext;
    }
    // Ignore results that finished after a newer request.
    if (run !== generation) return;
    exportedCode = code;
    currentLanguage = language;
  }

  export async function openWithFormat(format: ExportFormat) {
    if (format === "sequential") {
      showSequentialTab = true;
      const baseName = classNameFromFile($currentFilePath);
      if (baseName) sequentialClassName = baseName;
    }
    exportFormat = format;
    copied = false;
    await regenerate();
    isOpen = true;
  }

  function selectFormat(format: ExportFormat) {
    if (format === exportFormat) return;
    exportFormat = format;
    copied = false;
    regenerate();
  }

  function selectMode(mode: CodeExportMode) {
    if (mode === exportMode) return;
    exportMode = mode;
    copied = false;
    regenerate();
  }

  function toggleAlliance() {
    otherAlliance = !otherAlliance;
    copied = false;
    regenerate();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(exportedCode || "");
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  }

  function downloadCode() {
    if (!downloadName) return;
    const blob = new Blob([exportedCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function close() {
    isOpen = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (isOpen && e.key === "Escape") close();
  }

  const segmentBase =
    "px-3 py-1 text-sm rounded-md transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400";
  const segmentOn =
    "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white font-semibold shadow-sm";
  const segmentOff =
    "text-neutral-600 dark:text-neutral-300 hover:!bg-white/60 dark:hover:!bg-neutral-700/60";
</script>

<svelte:head>
  {@html codeStyle}
</svelte:head>

<svelte:window on:keydown={onKeydown} />

{#if isOpen}
  <div
    transition:fade={{ duration: 500, easing: cubicInOut }}
    class="bg-black bg-opacity-25 flex flex-col justify-center items-center absolute top-0 left-0 w-full h-full z-[1005] p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="export-code-title"
    tabindex="-1"
  >
    <div
      transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
      class="flex flex-col justify-start items-stretch p-5 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-4xl gap-3 max-h-[90vh] shadow-xl border border-transparent dark:border-neutral-800"
      role="document"
    >
      <!-- Header -->
      <div class="flex flex-row justify-between items-center w-full">
        <div class="flex items-baseline gap-3 min-w-0">
          <h2
            id="export-code-title"
            class="text-xl font-semibold text-neutral-900 dark:text-white"
          >
            Export Code
          </h2>
          <span class="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            Pedro Pathing 2.x ·
            <span class="font-semibold text-amber-700 dark:text-amber-300"
              >BIOBUZZ Edition</span
            >
          </span>
        </div>
        <button
          on:click={close}
          aria-label="Close export dialog"
          class="p-1 rounded transition-colors duration-250"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6 text-neutral-700 dark:text-neutral-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Options -->
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div
          class="inline-flex items-center rounded-lg bg-neutral-100 dark:bg-neutral-800 p-0.5 border border-neutral-200 dark:border-neutral-700"
          role="tablist"
          aria-label="Export format"
        >
          {#each formats as format}
            <button
              role="tab"
              aria-selected={exportFormat === format}
              class="{segmentBase} {exportFormat === format ? segmentOn : segmentOff}"
              on:click={() => selectFormat(format)}
            >
              {FORMAT_LABELS[format]}
            </button>
          {/each}
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          {#if isCode}
            <div
              class="inline-flex items-center rounded-lg bg-neutral-100 dark:bg-neutral-800 p-0.5 border border-neutral-200 dark:border-neutral-700"
              role="radiogroup"
              aria-label="Export mode"
            >
              {#each MODE_OPTIONS as mode}
                <button
                  role="radio"
                  aria-checked={exportMode === mode.value}
                  title={mode.hint}
                  class="{segmentBase} {exportMode === mode.value ? segmentOn : segmentOff}"
                  on:click={() => selectMode(mode.value)}
                >
                  {mode.label}
                </button>
              {/each}
            </div>
          {:else if exportFormat === "sequential"}
            <label
              for="class-name"
              class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
            >
              Class name
              <input
                id="class-name"
                type="text"
                bind:value={sequentialClassName}
                on:input={regenerate}
                class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none w-40"
                placeholder="AutoPath"
              />
            </label>
          {/if}

          <label
            class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer select-none"
            title="BIOBUZZ is 180° rotationally symmetric: (x, y) → (141.5 − x, 141.5 − y), heading + 180°. The drawing is not changed."
          >
            <input
              type="checkbox"
              checked={otherAlliance}
              on:change={toggleAlliance}
              class="size-4 accent-amber-500 cursor-pointer"
            />
            Other alliance
            <span
              class="px-1.5 py-0.5 rounded text-[11px] font-semibold leading-none border"
              class:alliance-red={exportAlliance === "Red"}
              class:alliance-blue={exportAlliance === "Blue"}
            >
              {exportAlliance}
            </span>
          </label>
        </div>
      </div>

      {#if isCode}
        <p class="text-xs text-neutral-500 dark:text-neutral-400 -mt-1">
          {modeHint}
          <span class="whitespace-nowrap">
            Start pose
            <span
              class="font-mono px-1 py-px rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200"
              >{startSummary}</span
            >, angles in <span class="font-mono">Math.toRadians(…)</span>.
          </span>
        </p>
      {/if}

      <!-- Code -->
      <div
        class="relative w-full flex-1 min-h-0 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-[#282b2e] export-code"
      >
        <Highlight language={currentLanguage} code={exportedCode} class="w-full" />
      </div>

      <!-- Footer -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {#if isCode && exportMode === "full"}
            Save as <span class="font-mono">TeamCode/src/main/java/org/firstinspires/ftc/teamcode/{downloadName}</span>
          {:else if exportFormat === "points"}
            Start point, control points and end points in path order (inches).
          {:else}
            {lineCount} lines
          {/if}
        </p>
        <div class="flex items-center gap-2">
          {#if downloadName}
            <button
              on:click={downloadCode}
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-md hover:!bg-neutral-200 dark:hover:!bg-neutral-700 transition-colors duration-200"
              title="Download {downloadName}"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Download
            </button>
          {/if}
          <button
            on:click={copyCode}
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white rounded-md transition-colors duration-200 {copied
              ? 'bg-green-600 hover:!bg-green-600'
              : 'bg-green-500 hover:!bg-green-600'}"
            title="Copy code to clipboard"
          >
            {#if copied}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2.5"
                stroke="currentColor"
                class="size-4"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Copied
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                />
              </svg>
              Copy
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .alliance-red {
    color: #b91c1c;
    background-color: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.4);
  }
  .alliance-blue {
    color: #1d4ed8;
    background-color: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.4);
  }
  :global(.dark) .alliance-red {
    color: #fca5a5;
  }
  :global(.dark) .alliance-blue {
    color: #93c5fd;
  }
  .export-code :global(pre) {
    margin: 0;
    min-height: 100%;
  }
  .export-code :global(pre code.hljs) {
    padding: 1rem 1.25rem;
    font-size: 0.8125rem;
    line-height: 1.55;
    tab-size: 4;
  }
</style>
