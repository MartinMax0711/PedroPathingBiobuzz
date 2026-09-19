<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import type { Point, Line, Shape, Settings, SequenceItem, PathChain } from "../types";
  import { onMount, onDestroy } from "svelte";
  import {
    showRuler,
    showProtractor,
    showGrid,
    protractorLockToRobot,
    gridSize,
    currentFilePath,
    isUnsaved,
    snapToGrid,
    dualPathMode,
    activePaths,
  } from "../stores";
  import {
    DEFAULT_PATH_COLOR,
    getDefaultStartPoint,
    getDefaultLines,
    getDefaultShapes,
  } from "../config";
  import FileManager from "./FileManager.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ExportCodeDialog from "./components/ExportCodeDialog.svelte";
  import MultiplePathsDialog from "./components/MultiplePathsDialog.svelte";
  import { calculatePathTime, formatTime } from "../utils";
  import html2canvas from "html2canvas";
  import {
    CENTER,
    checkStartPose,
    getStartPresets,
    normalizeDeg,
    type Alliance,
    type StartPreset,
  } from "../biobuzz/field";
  import {
    applyStartPose,
    rotateProject180,
    startHeadingDeg,
  } from "../biobuzz/transform";

  export let loadFile: (evt: any) => any;
  /**
   * App's single project loader (validation, obstacle fallback, file settings,
   * chain repair, undo history). The File Manager opens files through it.
   */
  export let openProject:
    | ((data: unknown, name: string, filePath?: string | null) => Promise<boolean>)
    | null = null;

  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];
  export let pathChains: PathChain[] = [];
  export let secondStartPoint: Point | null = null;
  export let secondLines: Line[] = [];
  export let secondShapes: Shape[] = [];
  export let secondSequence: SequenceItem[] = [];
  export let percent: number = 0;
  export let robotWidth: number;
  export let robotHeight: number;
  export let settings: Settings;

  export let saveProject: () => any;
  export let saveFileAs: () => any;
  export let undoAction: () => any;
  export let redoAction: () => any;
  export let recordChange: () => any;
  export let canUndo: boolean;
  export let canRedo: boolean;
  export let optimizeAllLines: () => Promise<void>;
  export let optimizingAll: boolean = false;
  export let twoElement: HTMLDivElement | null = null;
  export let playing: boolean = false;
  export let play: () => void;
  export let pause: () => void;
  export let exportPathAsGif: () => Promise<void>;

  let fileManagerOpen = false;
  let settingsOpen = false;
  let exportMenuOpen = false;
  let exportDialogOpen = false;
  let exportDialog: ExportCodeDialog;
  let multiplePathsDialogOpen = false;
  // Hide sequential export UI by default; backend generator remains available
  const showSequentialExport = false;

  let saveDropdownOpen = false;
  let saveDropdownRef: HTMLElement;
  let saveButtonRef: HTMLElement;

  let exportMenuRef: HTMLElement;
  let exportButtonRef: HTMLElement;

  let biobuzzMenuOpen = false;
  let biobuzzMenuRef: HTMLElement;
  let biobuzzButtonRef: HTMLElement;

  let selectedGridSize = 12;
  const gridSizeOptions = [0, 1, 3, 6, 12, 24];

  // Ensure File Manager and Export dialog are mutually exclusive
  $: if (fileManagerOpen && exportDialogOpen) {
    exportDialogOpen = false;
  }

  type NavMenu = "save" | "export" | "biobuzz";

  /** Open one navbar dropdown (or close it if it is already open); the others close. */
  function toggleMenu(menu: NavMenu) {
    const next = {
      save: menu === "save" && !saveDropdownOpen,
      export: menu === "export" && !exportMenuOpen,
      biobuzz: menu === "biobuzz" && !biobuzzMenuOpen,
    };
    saveDropdownOpen = next.save;
    exportMenuOpen = next.export;
    biobuzzMenuOpen = next.biobuzz;
  }

  $: currentFileName = $currentFilePath
    ? $currentFilePath.split(/[\\/]/).pop() || ""
    : "";

  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: elapsedSeconds = (percent / 100) * (timePrediction?.totalTime || 0);

  // ---- BIOBUZZ: 30 s AUTO period indicator --------------------------------
  $: autoLimit = Math.max(1, Number(settings?.autoPeriodSeconds) || 30);
  $: totalSeconds = timePrediction?.totalTime ?? 0;
  $: autoOver = totalSeconds - autoLimit;
  $: autoFits = autoOver <= 0;
  $: autoTitle = autoFits
    ? `Fits the ${autoLimit} s AUTO period with ${(-autoOver).toFixed(1)} s to spare.`
    : `${autoOver.toFixed(1)} s longer than the ${autoLimit} s AUTO period. ` +
      `Shorten the paths or waits so the routine ends before AUTO does.`;

  // ---- BIOBUZZ: alliance + start presets ----------------------------------
  $: startLocked = !!startPoint?.locked;
  $: robotLength = settings?.rWidth ?? robotWidth ?? 16;
  $: robotAcross = settings?.rHeight ?? robotHeight ?? 16;
  $: currentStartHeading = startPoint
    ? startHeadingDeg(startPoint, lines, sequence)
    : 90;
  $: startCheck = startPoint
    ? checkStartPose(
        startPoint.x,
        startPoint.y,
        currentStartHeading,
        robotLength,
        robotAcross,
      )
    : null;
  $: currentAlliance = (startCheck?.alliance ??
    (startPoint && startPoint.x < CENTER ? "red" : "blue")) as Alliance;
  $: otherAlliance = (currentAlliance === "red" ? "blue" : "red") as Alliance;
  $: startErrors = startCheck
    ? startCheck.issues.filter((i) => i.severity === "error")
    : [];
  $: startWarnings = startCheck
    ? startCheck.issues.filter((i) => i.severity === "warning")
    : [];
  $: startCheckTitle = startCheck
    ? startCheck.issues.length === 0
      ? "Legal starting pose (G304 / R102)"
      : startCheck.issues.map((i) => `• ${i.message}`).join("\n")
    : "";

  $: startPresets = getStartPresets(robotLength, robotAcross);
  $: redPresets = startPresets.filter((p) => p.alliance === "red");
  $: bluePresets = startPresets.filter((p) => p.alliance === "blue");
  // Same match as StartingPointSection.matchedPreset: position and heading.
  $: activePresetId =
    startPoint &&
    startPresets.find(
      (p) =>
        Math.abs(p.x - startPoint.x) <= 0.05 &&
        Math.abs(p.y - startPoint.y) <= 0.05 &&
        Math.abs(normalizeDeg(p.headingDeg - currentStartHeading)) < 0.5,
    )?.id;

  /** Compact labels for the preset grid, e.g. "Audience wall · by HIVE" -> "Audience · HIVE". */
  function presetShortLabel(p: StartPreset) {
    if (/alliance/i.test(p.id)) return "Alliance wall";
    return p.label.replace(/\s+wall\b/i, "").replace(/\bby\s+/i, "");
  }

  function presetTitle(p: StartPreset) {
    return `${p.description}\n(${p.x.toFixed(2)}, ${p.y.toFixed(2)}) · ${p.headingDeg}°`;
  }

  function switchAlliance() {
    if (!startPoint || startPoint.locked) return;
    const rotated = rotateProject180(startPoint, lines);
    startPoint = rotated.startPoint;
    lines = rotated.lines;
    if (recordChange) recordChange();
  }

  function applyPreset(preset: StartPreset) {
    if (!startPoint || startPoint.locked) return;
    const next = applyStartPose(startPoint, lines, sequence, preset);
    startPoint = next.startPoint;
    lines = next.lines;
    if (recordChange) recordChange();
  }

  // ---- BIOBUZZ: field overlay toggles -------------------------------------
  type OverlayKey =
    | "showTileLabels"
    | "showFieldLabels"
    | "showZoneLabels"
    | "showAprilTags"
    | "showStartCheck";

  const overlayToggles: { key: OverlayKey; label: string; hint: string }[] = [
    { key: "showTileLabels", label: "Tile labels", hint: "A1–F6" },
    { key: "showFieldLabels", label: "Wall labels", hint: "Audience · Red · Blue" },
    { key: "showZoneLabels", label: "Zone labels", hint: "HIVE · GARDEN" },
    { key: "showAprilTags", label: "AprilTag IDs", hint: "CELL tags" },
    { key: "showStartCheck", label: "G304 start check", hint: "Start outline" },
  ];

  function toggleOverlay(key: OverlayKey) {
    settings = { ...settings, [key]: !settings[key] };
  }

  // ---- BIOBUZZ: fixed field obstacles -------------------------------------
  $: biobuzzShapeIds = new Set(getDefaultShapes().map((s) => s.id));
  $: biobuzzShapesPresent = (shapes || []).filter((s) =>
    biobuzzShapeIds.has(s.id),
  ).length;

  /** Put the HIVE frame + FLOWERS back; obstacles the user added are kept. */
  function restoreBiobuzzObstacles() {
    const defaults = getDefaultShapes();
    const ids = new Set(defaults.map((s) => s.id));
    shapes = [...defaults, ...(shapes || []).filter((s) => !ids.has(s.id))];
    if (recordChange) recordChange();
  }

  const GAME_MANUAL_URL = "https://ftc-resources.firstinspires.org/ftc/game/manual";

  const menuItemClass =
    "flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60 focus-visible:!bg-neutral-100 dark:focus-visible:!bg-neutral-700/60 disabled:opacity-50 disabled:cursor-not-allowed";
  const menuHeaderClass =
    "flex items-center justify-between gap-2 px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";
  const menuDividerClass = "my-1 border-t border-neutral-200 dark:border-neutral-700";

  function presetButtonClass(p: StartPreset, active: boolean) {
    const base =
      "w-full min-w-0 flex items-center justify-between gap-1 px-1.5 py-1 rounded-md border text-[11px] leading-4 font-medium text-left transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed";
    if (p.alliance === "red") {
      return `${base} ${
        active
          ? "border-red-400 !bg-red-100 text-red-800 ring-1 ring-red-400/50 dark:border-red-400/70 dark:!bg-red-500/25 dark:text-red-200"
          : "border-red-200 bg-red-50 text-red-700 hover:!bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:!bg-red-500/20"
      }`;
    }
    return `${base} ${
      active
        ? "border-blue-400 !bg-blue-100 text-blue-800 ring-1 ring-blue-400/50 dark:border-blue-400/70 dark:!bg-blue-500/25 dark:text-blue-200"
        : "border-blue-200 bg-blue-50 text-blue-700 hover:!bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:!bg-blue-500/20"
    }`;
  }

  onMount(() => {
    const unsubscribeGridSize = gridSize.subscribe((value) => {
      selectedGridSize = value;
    });

    return () => {
      unsubscribeGridSize();
    };
  });

  function cycleGridSize() {
    if (!$showGrid) {
      // Grid is off, turn it on with first non-zero size
      showGrid.set(true);
      selectedGridSize = gridSizeOptions[1]; // Start at 1, not 0
      gridSize.set(selectedGridSize);
    } else {
      // Grid is on, cycle to next size or turn off
      const currentIndex = gridSizeOptions.indexOf(selectedGridSize);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= gridSizeOptions.length) {
        // We're at the last size, turn off
        showGrid.set(false);
      } else {
        // Move to next size
        selectedGridSize = gridSizeOptions[nextIndex];
        gridSize.set(selectedGridSize);
        // If grid size is 0, hide the grid
        if (selectedGridSize === 0) {
          showGrid.set(false);
        }
      }
    }
  }

  function handleExport(format: "java" | "points" | "sequential") {
    exportMenuOpen = false;
    fileManagerOpen = false; // ensure file manager is closed before opening export dialog
    exportDialog.openWithFormat(format);
  }

  async function exportFieldAsImage() {
    exportMenuOpen = false;
    if (!twoElement) {
      alert("Canvas not ready. Please try again.");
      return;
    }

    try {
      // Use html2canvas to capture the entire field including background, paths, and robots
      const canvas = await html2canvas(twoElement, {
        backgroundColor: null,
        scale: 2, // 2x resolution for better quality
        logging: false,
        useCORS: true, // Allow cross-origin images
        allowTaint: true,
      });

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const fileName = $currentFilePath
            ? $currentFilePath.split(/[\/\\]/).pop()?.replace(/\.pp$/, "")
            : "field";
          link.download = `${fileName}_field.png`;
          link.href = downloadUrl;
          link.click();
          URL.revokeObjectURL(downloadUrl);
        } else {
          alert("Failed to create image blob.");
        }
      });
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export field as image: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  function resetPath() {
    // Default start for the configured robot size, so it is G304-legal.
    startPoint = getDefaultStartPoint(robotLength, robotAcross);
    lines = getDefaultLines(robotLength, robotAcross);
    sequence = lines.map((ln) => ({
      kind: "path",
      lineId: ln.id!,
    }));
    // One fresh chain holding every path, so code exports include them.
    pathChains = [
      {
        id: `chain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: "Main Chain",
        color: DEFAULT_PATH_COLOR,
        lineIds: lines.map((ln) => ln.id!),
      },
    ];
    shapes = getDefaultShapes();
  }

  function handleResetPathWithConfirmation() {
    // Check if there's unsaved work
    const hasChanges = $isUnsaved || lines.length > 1 || shapes.length > 0;

    let message = "Are you sure you want to reset the path?\n\n";

    if (hasChanges) {
      if ($currentFilePath) {
        message += `This will reset "${$currentFilePath.split(/[\\/]/).pop()}" to the default path.`;
      } else {
        message += "This will reset your current work to the default path.";
      }

      if ($isUnsaved) {
        message += "\n\n⚠ WARNING: You have unsaved changes that will be lost!";
      }
    } else {
      message += "This will reset to the default starting path.";
    }

    message += "\n\nClick OK to reset, or Cancel to keep your current path.";

    if (confirm(message)) {
      resetPath();
      if (recordChange) recordChange();
    }
  }

  $: if (settings) {
    settings.rHeight = robotHeight;
    settings.rWidth = robotWidth;
  }

  /**
   * True when the click happened inside one of the given elements. Uses the
   * event path captured at dispatch, so it still works when Svelte has already
   * re-rendered (and detached) the clicked node, e.g. a toggled checkmark.
   */
  function clickedInside(event: MouseEvent, ...els: (HTMLElement | undefined | null)[]) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return els.some(
      (el) => !!el && (path.includes(el) || el.contains(event.target as Node)),
    );
  }

  function handleClickOutside(event: MouseEvent) {
    if (saveDropdownOpen && !clickedInside(event, saveDropdownRef, saveButtonRef)) {
      saveDropdownOpen = false;
    }
    if (exportMenuOpen && !clickedInside(event, exportMenuRef, exportButtonRef)) {
      exportMenuOpen = false;
    }
    if (biobuzzMenuOpen && !clickedInside(event, biobuzzMenuRef, biobuzzButtonRef)) {
      biobuzzMenuOpen = false;
    }
  }

  // Handle Escape key to close the dropdowns
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (saveDropdownOpen || exportMenuOpen || biobuzzMenuOpen) {
      const returnFocus = biobuzzMenuOpen
        ? biobuzzButtonRef
        : exportMenuOpen
          ? exportButtonRef
          : saveButtonRef;
      saveDropdownOpen = false;
      exportMenuOpen = false;
      biobuzzMenuOpen = false;
      returnFocus?.focus();
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  type GlowButtonEl = HTMLElement & { dataset: DOMStringMap & { prevOverflow?: string } };

  function handleOptimizeEnter(event: MouseEvent) {
    const el = event.currentTarget as GlowButtonEl;
    el.style.background =
      "linear-gradient(120deg, #ff5f6d, #ffc371, #47e1a8, #5f8bff, #c471ed, #f64f59)";
    el.style.backgroundSize = "400% 400%";
    el.style.animation = "rainbow-glow 1.2s ease infinite";
    el.style.boxShadow =
      "0 0 18px rgba(255,255,255,0.9), 0 0 40px rgba(255,255,255,0.45)";
    el.dataset.prevOverflow = el.style.overflow;
    el.style.overflow = "hidden";
  }

  function handleOptimizeMove(event: MouseEvent) {
    const el = event.currentTarget as GlowButtonEl;
    const rect = el.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    el.style.backgroundPosition = `${xPct}% ${yPct}%`;
  }

  function handleOptimizeLeave(event: MouseEvent) {
    const el = event.currentTarget as GlowButtonEl;
    el.style.background = "";
    el.style.backgroundPosition = "";
    el.style.animation = "";
    el.style.boxShadow = "0 0 8px rgba(255,255,255,0.2)";
    el.style.overflow = el.dataset.prevOverflow || "hidden";
  }
</script>

{#if fileManagerOpen}
  <FileManager
    bind:isOpen={fileManagerOpen}
    bind:startPoint
    bind:lines
    bind:shapes
    bind:sequence
    bind:pathChains
    bind:secondStartPoint
    bind:secondLines
    bind:secondShapes
    bind:secondSequence
    {settings}
    {openProject}
  />
{/if}

<ExportCodeDialog
  bind:this={exportDialog}
  bind:isOpen={exportDialogOpen}
  bind:startPoint
  bind:lines
  bind:sequence
  bind:pathChains
/>

<SettingsDialog bind:isOpen={settingsOpen} bind:settings />

<div
  data-testid="navbar"
  class="absolute top-0 left-0 w-full bg-neutral-50 dark:bg-neutral-900 shadow-md flex flex-row justify-between items-center gap-3 px-4 2xl:px-6 py-4 border-b-[0.75px] border-[#f5b301] whitespace-nowrap"
>
  <!-- Title -->
  <!-- min-w-0 + overflow-hidden: on narrow screens the title gives way
       (truncates / clips) instead of running under the actions. -->
  <div class="font-semibold flex flex-col justify-start items-start min-w-0 overflow-hidden">
    <div class="flex flex-row items-center gap-2 min-w-0 max-w-full">
      <!-- File manager button -->
      <button
        title="File Manager"
        class="shrink-0"
        on:click={() => {
          exportDialogOpen = false;
          fileManagerOpen = true;
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      </button>

      <!-- With a file open, "Visualizer" gives its room to the file name on
           narrower screens and the file name is what truncates. -->
      <span
        class="truncate min-w-0 {currentFileName ? 'shrink-0' : ''}"
        title="Pedro Pathing Visualizer"
        >Pedro Pathing<span class={currentFileName ? "hidden min-[1700px]:inline" : ""}
          >&nbsp;Visualizer</span
        ></span
      >
      <!-- BIOBUZZ edition badge (just the hexagon below 1400px) -->
      <span
        class="shrink-0 inline-flex items-center gap-1 px-1 min-[1400px]:px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-400/40"
        title="BIOBUZZ edition · FIRST Tech Challenge 2026–2027 season"
      >
        <svg viewBox="0 0 24 24" class="size-3 fill-amber-500" aria-hidden="true">
          <path d="M12 2.5 20.25 7.25v9.5L12 21.5l-8.25-4.75v-9.5z" />
        </svg>
        <span class="sr-only min-[1400px]:not-sr-only">BIOBUZZ</span>
      </span>
      {#if !currentFileName}
        <span
          class="hidden min-[1700px]:inline shrink-0 text-xs font-normal text-neutral-500 dark:text-neutral-400"
        >
          FTC 2026–27
        </span>
      {/if}
      <!-- GitHub Repo Link (moved next to title) -->
      <a
        target="_blank"
        rel="noreferrer"
        title="GitHub repo"
        href="https://github.com/MartinMax0711/PedroPathingBiobuzz"
        class="shrink-0"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 30 30"
          class="size-6 dark:fill-white"
        >
          <path
            d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"
          ></path>
        </svg>
      </a>
      {#if currentFileName}
        <span class="shrink-0 text-neutral-400 font-light text-sm mx-1">/</span>
        <span
          class="flex items-center min-w-[2.5rem] text-sm font-normal text-neutral-600 dark:text-neutral-300"
          title={currentFileName}
        >
          <span class="truncate">{currentFileName}</span>
          {#if $isUnsaved}
            <span class="shrink-0 text-amber-500 font-bold ml-1" title="Unsaved changes"
              >*</span
            >
          {/if}
        </span>
      {/if}
    </div>
  </div>

  <!-- Actions -->
  <div class="flex flex-row justify-end items-center gap-2 min-[1800px]:gap-4 shrink-0">
    <div class="flex items-center gap-2 min-[1800px]:gap-3">
      <!-- time estimate -->
      <div
        class="flex items-center gap-2 text-sm tabular-nums"
        title="Elapsed / total time · path length {(timePrediction?.totalDistance ?? 0).toFixed(0)} in"
      >
        <div class="text-neutral-600 dark:text-neutral-300">
            {#if timePrediction && timePrediction.totalTime > 0}
              {formatTime(elapsedSeconds)} / {formatTime(timePrediction.totalTime)}
            {:else}
              {formatTime(0)} / {formatTime(0)}
            {/if}
        </div>
        <!-- On narrower screens the distance gives way to the title / open file's name -->
        <div
          class="text-neutral-500 dark:text-neutral-400 {currentFileName
            ? 'hidden min-[1700px]:block'
            : 'hidden min-[1400px]:block'}"
        >
            ({(timePrediction?.totalDistance ?? 0).toFixed(0)} in)
        </div>
        <!-- BIOBUZZ AUTO period: only flagged here when the routine overruns
             (the sidebar always shows the detailed "AUTO x / 30 s" chip). -->
        {#if !autoFits}
          <span
            class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[11px] leading-4 font-semibold tracking-wide bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300"
            title={autoTitle}
            aria-label={autoTitle}
            data-testid="auto-indicator"
          >
            AUTO +{autoOver.toFixed(1)} s
          </span>
        {/if}
      </div>

      <button
        class="relative px-3 py-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-200/80 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 rounded-full shadow-sm hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Optimize all paths"
        on:click={optimizeAllLines}
        disabled={optimizingAll}
        style="box-shadow: 0 0 8px rgba(255,255,255,0.2)"
        on:mouseenter={handleOptimizeEnter}
        on:mousemove={handleOptimizeMove}
        on:mouseleave={handleOptimizeLeave}
      >
        {optimizingAll ? "Optimizing All…" : "Optimize All"}
      </button>

      <!-- Undo / Redo -->
      <div class="flex items-center gap-2">
        <button
          title="Undo"
          on:click={undoAction}
          disabled={!canUndo}
          class:opacity-50={!canUndo}
          class="disabled:cursor-not-allowed transition-all duration-250 hover:scale-105 active:scale-98"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 1 1 0 12h-3"
            />
          </svg>
        </button>
        <button
          title="Redo"
          on:click={redoAction}
          disabled={!canRedo}
          class:opacity-50={!canRedo}
          class="disabled:cursor-not-allowed transition-all duration-250 hover:scale-105 active:scale-98"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 9l6 6m0 0-6 6m6-6H9a6 6 0 1 1 0-12h3"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-1 min-[1800px]:mx-3"
      aria-hidden="true"
    ></div>

    <!-- Snap to grid toggle -->
    {#if $showGrid}
      <button
        title={$snapToGrid ? "Disable Snap to Grid" : "Enable Snap to Grid"}
        on:click={() => snapToGrid.update((v) => !v)}
        class:text-green-500={$snapToGrid && $showGrid}
        class:text-gray-400={!$showGrid}
        class:opacity-50={!$showGrid}
        disabled={!$showGrid}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <!-- When snapped, show magnet icon -->
          <path
            d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"
          ></path>
          <path d="m5 8 4 4"></path>
          <path d="m12 15 4 4"></path>

          <!-- If the snap is disabled, turn the icon grey, not white -->
          {#if !$snapToGrid}
            <line x1="23" y1="23" x2="1" y2="1"></line>
          {/if}
        </svg>
      </button>
    {/if}

    <!-- Grid toggle -->
    <button
      title={$showGrid ? `Grid: ${selectedGridSize}" (click to cycle)` : "Toggle Grid"}
      on:click={cycleGridSize}
      class:text-blue-500={$showGrid}
      class="relative"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="3" y1="15" x2="21" y2="15"></line>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="15" y1="3" x2="15" y2="21"></line>
      </svg>
      {#if $showGrid}
        <span class="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-semibold whitespace-nowrap">
          {selectedGridSize}"
        </span>
      {/if}
    </button>

    <!-- Ruler toggle -->
    <button
      title="Toggle Ruler"
      on:click={() => showRuler.update((v) => !v)}
      class:text-blue-500={$showRuler}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z"
        ></path>
        <path d="m14.5 12.5 2-2"></path>
        <path d="m11.5 9.5 2-2"></path>
        <path d="m8.5 6.5 2-2"></path>
        <path d="m17.5 15.5 2-2"></path>
      </svg>
    </button>

    <!-- Protractor lock to robot toggle -->
    {#if $showProtractor}
      <button
        title={$protractorLockToRobot
          ? "Unlock Protractor from Robot"
          : "Lock Protractor to Robot"}
        on:click={() => protractorLockToRobot.update((v) => !v)}
        class:text-amber-500={$protractorLockToRobot}
      >
        {#if $protractorLockToRobot}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          </svg>
        {/if}
      </button>
    {/if}

    <!-- Protractor toggle -->

    <button
      title="Toggle Protractor"
      on:click={() => showProtractor.update((v) => !v)}
      class:text-blue-500={$showProtractor}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 21a9 9 0 1 1 0-18c2.52 0 4.93 1 6.74 2.74L21 8"></path>
        <path d="M12 3v6l3.7 2.7"></path>
      </svg>
    </button>

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-1 min-[1800px]:mx-3"
      aria-hidden="true"
    ></div>

    <!-- Multiple Paths Toggle -->
    <button
      title="Manage Multiple Paths Visualization"
      on:click={() => (multiplePathsDialogOpen = true)}
      class="relative px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md {$activePaths.length >
      0
        ? 'bg-purple-500 text-white hover:!bg-purple-600'
        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:!bg-neutral-300 dark:hover:!bg-neutral-600'}"
      aria-label="Multiple Paths"
    >
      <div class="flex items-center gap-1.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
        <span class="hidden 2xl:inline">Multiple Paths</span>
        {#if $activePaths.length > 0}
          <span class="ml-1 px-1.5 py-0.5 bg-white/20 text-xs font-bold rounded">{$activePaths.length}</span>
        {/if}
      </div>
    </button>

    <!-- BIOBUZZ game menu: alliance switch, legal start presets, field overlays -->
    <div class="relative">
      <button
        bind:this={biobuzzButtonRef}
        title="BIOBUZZ tools: alliance, start positions, field overlays"
        on:click={() => toggleMenu("biobuzz")}
        class="relative px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md text-neutral-700 dark:text-neutral-200 {biobuzzMenuOpen
          ? '!bg-neutral-300 dark:!bg-neutral-600 shadow-md'
          : 'bg-neutral-200 dark:bg-neutral-700 hover:!bg-neutral-300 dark:hover:!bg-neutral-600'}"
        aria-haspopup="menu"
        aria-expanded={biobuzzMenuOpen}
        data-testid="biobuzz-menu-trigger"
      >
        <div class="flex items-center gap-1.5">
          <!-- Honeycomb -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
            class="size-5"
            aria-hidden="true"
          >
            <path
              d="M12 4 15.98 6.3v4.6L12 13.2 8.02 10.9V6.3z"
              class="fill-amber-400 stroke-amber-600 dark:stroke-amber-300"
            />
            <path d="M8.02 10.9 12 13.2v4.6l-3.98 2.3-3.98-2.3v-4.6z" />
            <path d="M15.98 10.9 19.96 13.2v4.6l-3.98 2.3L12 17.8v-4.6z" />
          </svg>
          <span>BIOBUZZ</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-4 transition-transform duration-200"
            class:rotate-180={biobuzzMenuOpen}
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {#if biobuzzMenuOpen}
        <div
          bind:this={biobuzzMenuRef}
          class="absolute right-0 mt-2 w-80 bg-white dark:bg-neutral-800 rounded-md shadow-lg py-1 z-50 border border-neutral-200 dark:border-neutral-700 max-h-[calc(100vh-5.5rem)] overflow-y-auto overscroll-contain whitespace-normal"
          role="menu"
          aria-label="BIOBUZZ tools"
          data-testid="biobuzz-menu"
        >
          <!-- Alliance -->
          <div class={menuHeaderClass}>
            <span>Alliance</span>
            <span
              class="inline-flex items-center gap-1 normal-case tracking-normal font-medium text-neutral-600 dark:text-neutral-300"
              title={startCheck?.alliance
                ? `The start pose is fully on the ${currentAlliance} half`
                : "The start pose crosses the centre line; guessing from its x position"}
            >
              <span
                class="size-2 rounded-full {currentAlliance === 'red'
                  ? 'bg-red-500'
                  : 'bg-blue-500'}"
              ></span>
              {currentAlliance === "red" ? "Red" : "Blue"} start
            </span>
          </div>
          <button
            class={menuItemClass}
            role="menuitem"
            disabled={startLocked}
            data-testid="switch-alliance"
            title={startLocked
              ? "Unlock the starting point to move the path"
              : `Rotate the start, every path and control point 180° to the ${otherAlliance} side`}
            on:click={switchAlliance}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 shrink-0 {otherAlliance === 'blue'
                ? 'text-blue-500'
                : 'text-red-500'}"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
            <div class="flex flex-col">
              <span class="font-medium">
                Switch to {otherAlliance === "blue" ? "Blue" : "Red"} alliance
              </span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                Rotate every path 180° around the field centre
              </span>
            </div>
          </button>

          <div class={menuDividerClass}></div>

          <!-- Start position presets -->
          <div class={menuHeaderClass}>
            <span>Start position</span>
            {#if startCheck}
              <span
                class="inline-flex items-center gap-1 normal-case tracking-normal font-medium {startErrors.length
                  ? 'text-rose-600 dark:text-rose-400'
                  : startWarnings.length
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'}"
                title={startCheckTitle}
              >
                {#if startErrors.length}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5" aria-hidden="true">
                    <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
                  </svg>
                  G304 · {startErrors.length} issue{startErrors.length === 1 ? "" : "s"}
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5" aria-hidden="true">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" />
                  </svg>
                  G304 legal
                {/if}
              </span>
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-2 px-3 pt-0.5 pb-2">
            {#each [{ label: "Red", dot: "bg-red-500", presets: redPresets }, { label: "Blue", dot: "bg-blue-500", presets: bluePresets }] as group (group.label)}
              <div class="flex flex-col gap-1 min-w-0">
                <div
                  class="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400"
                >
                  <span class="size-1.5 rounded-full {group.dot}"></span>
                  {group.label}
                </div>
                {#each group.presets as preset (preset.id)}
                  {@const active = activePresetId === preset.id}
                  <button
                    class={presetButtonClass(preset, active)}
                    role="menuitemradio"
                    aria-checked={active}
                    data-testid="preset-{preset.id}"
                    disabled={startLocked}
                    title={startLocked
                      ? "Unlock the starting point to use a preset"
                      : presetTitle(preset)}
                    on:click={() => applyPreset(preset)}
                  >
                    <span class="truncate">{presetShortLabel(preset)}</span>
                    {#if active}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="size-3.5 shrink-0"
                        aria-hidden="true"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    {/if}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
          {#if startLocked}
            <div
              class="mx-4 mb-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5 shrink-0" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clip-rule="evenodd" />
              </svg>
              Starting point is locked
            </div>
          {/if}

          <div class={menuDividerClass}></div>

          <!-- Field overlay toggles -->
          <div class={menuHeaderClass}><span>Field overlay</span></div>
          {#each overlayToggles as toggle (toggle.key)}
            {@const on = !!settings?.[toggle.key]}
            <button
              class="{menuItemClass} !py-1.5"
              role="menuitemcheckbox"
              aria-checked={on}
              data-testid="overlay-{toggle.key}"
              on:click={() => toggleOverlay(toggle.key)}
            >
              <span
                class="size-4 shrink-0 rounded border flex items-center justify-center transition-colors {on
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-white border-neutral-300 text-transparent dark:bg-neutral-900 dark:border-neutral-600'}"
                aria-hidden="true"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3">
                  <path
                    fill-rule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </span>
              <span class="flex-1">{toggle.label}</span>
              <span class="text-[11px] text-neutral-400 dark:text-neutral-500">{toggle.hint}</span>
            </button>
          {/each}

          <div class={menuDividerClass}></div>

          <!-- Field -->
          <div class={menuHeaderClass}><span>Field</span></div>
          <button
            class={menuItemClass}
            role="menuitem"
            data-testid="restore-obstacles"
            title="Put back the locked HIVE frame rails and FLOWERS (your own obstacles are kept)"
            on:click={restoreBiobuzzObstacles}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 shrink-0"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            <div class="flex flex-col">
              <span class="font-medium">Restore BIOBUZZ obstacles</span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                HIVE frame + 4 FLOWERS · {biobuzzShapesPresent}/{biobuzzShapeIds.size} on the field
              </span>
            </div>
          </button>
          <a
            class={menuItemClass}
            role="menuitem"
            href={GAME_MANUAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the official FTC game manual in a new tab"
            on:click={() => (biobuzzMenuOpen = false)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 shrink-0"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            <span class="flex-1 font-medium">Game manual (PDF)</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-3.5 shrink-0 text-neutral-400"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      {/if}
    </div>

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-1 min-[1800px]:mx-3"
      aria-hidden="true"
    ></div>

    <div class="flex items-center gap-2 min-[1800px]:gap-3">
      <!-- Load trajectory from file -->
      <input
        id="file-input"
        type="file"
        accept=".pp"
        on:change={loadFile}
        class="hidden"
      />
      <label
        for="file-input"
        title="Load trajectory from a .pp file"
        class="cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
      </label>

      <!-- Save dropdown -->
      <div class="relative">
        <button
          bind:this={saveButtonRef}
          title="Save options"
          on:click={() => toggleMenu("save")}
          class="flex items-center gap-1 px-1 2xl:px-2 py-1 rounded transition-colors duration-250"
          aria-haspopup="menu"
          aria-expanded={saveDropdownOpen}
          aria-label="Save options"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9"
            />
          </svg>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-4 transition-transform duration-200"
            class:rotate-180={saveDropdownOpen}
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        <!-- Dropdown menu -->
        {#if saveDropdownOpen}
          <div
            bind:this={saveDropdownRef}
            class="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-800 rounded-md shadow-lg py-1 z-50 border border-neutral-200 dark:border-neutral-700 whitespace-normal"
            role="menu"
          >
            <!-- Save option -->
            <button
              on:click={() => {
                saveProject();
                saveDropdownOpen = false;
              }}
              class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60"
              role="menuitem"
              title="Save to current file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 shrink-0 self-start mt-0.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9"
                />
              </svg>
              <div class="flex flex-col">
                <span class="font-medium">Save</span>
                <span class="text-xs text-neutral-500 dark:text-neutral-400">
                  {#if $currentFilePath}
                    Overwrite the current project file in app storage ({$currentFilePath.split(/[\/]/).pop()})
                  {:else}
                    No project file open — saves into the app's file storage (File Manager) as a new file
                  {/if}
                </span>
              </div>
            </button>

            <!-- Save As option -->
            <button
              on:click={() => {
                saveFileAs();
                saveDropdownOpen = false;
              }}
              class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60"
              role="menuitem"
              title="Save as new file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 shrink-0 self-start mt-0.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M17 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2m3-4H9a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1m-1 4l-3 3m0 0l-3-3m3 3V3"
                />
              </svg>
              <div class="flex flex-col">
                <span class="font-medium">Save As</span>
                <span class="text-xs text-neutral-500 dark:text-neutral-400">
                  Save a copy under a new name — to your computer and the File Manager
                </span>
              </div>
            </button>
          </div>
        {/if}
      </div>

      <div class="relative">
        <button
          bind:this={exportButtonRef}
          title="Export path"
          on:click={() => toggleMenu("export")}
          class="flex items-center gap-1 px-1 2xl:px-2 py-1 rounded"
          aria-haspopup="menu"
          aria-expanded={exportMenuOpen}
          aria-label="Export options"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
            />
          </svg>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-4 transition-transform duration-200"
            class:rotate-180={exportMenuOpen}
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {#if exportMenuOpen}
          <div
            bind:this={exportMenuRef}
            class="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg py-1 z-50 border border-neutral-200 dark:border-neutral-700"
            role="menu"
          >
            <button
              on:click={() => handleExport("java")}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60"
              role="menuitem"
            >
              Java Code
            </button>
            <button
              on:click={() => handleExport("points")}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60"
              role="menuitem"
            >
              Points Array
            </button>
            {#if showSequentialExport}
              <button
                on:click={() => handleExport("sequential")}
                class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60"
              role="menuitem"
              >
                Sequential Command
              </button>
            {/if}
            <button
              on:click={exportFieldAsImage}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60"
              role="menuitem"
            >
              Field as Image
            </button>
            <button
              on:click={async () => {
                exportMenuOpen = false;
                await exportPathAsGif();
              }}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 transition-colors duration-150 hover:!bg-neutral-100 dark:hover:!bg-neutral-700/60"
              role="menuitem"
            >
              Path Animation as GIF
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-1 min-[1800px]:mx-3"
      aria-hidden="true"
    ></div>

    <div class="flex items-center gap-3">
      <!-- Delete/Reset path -->
      <button
        title="Delete/Reset path"
        on:click={handleResetPathWithConfirmation}
        class="relative group"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="red"
          class="size-6 stroke-red-500 hover:stroke-red-600 transition-colors"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>

        <!-- Tooltip for better UX -->
        <div
          class="absolute hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs rounded text-center whitespace-normal max-w-[12rem] shadow-md"
        >
          Reset path to default (with confirmation)
        </div>
      </button>

      <!-- Settings button -->
      <button title="Open Settings" on:click={() => (settingsOpen = true)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><circle cx="12" cy="12" r="3"></circle><path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          ></path></svg
        >
      </button>
    </div>
  </div>
</div>

<MultiplePathsDialog bind:isOpen={multiplePathsDialogOpen} />

<style>
  @keyframes rainbow-glow {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }
</style>
