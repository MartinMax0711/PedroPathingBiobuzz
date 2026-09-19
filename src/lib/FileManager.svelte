<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts" context="module">

</script>

<script lang="ts">
  import { onMount, afterUpdate, onDestroy } from "svelte";

  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import type {
    FileInfo,
    Point,
    Line,
    Shape,
    SequenceItem,
    PathChain,
    Settings,
  } from "../types";
  import * as browserFileStore from "../utils/browserFileStore";
  import { currentFilePath, isUnsaved, dualPathMode, secondFilePath } from "../stores";
  import { isBiobuzzObstacle } from "../utils/shapes";
  import { PP_FILE_VERSION } from "../utils/file";
  import {
    saveAutoPathsDirectory,
    getSavedAutoPathsDirectory,
  } from "../utils/directorySettings";
  import NameDialog from "./components/NameDialog.svelte";
  import {
    CENTER,
    checkStartPose,
    rotatePoint180,
    type Alliance,
  } from "../biobuzz/field";
  import { rotateProject180, startHeadingDeg } from "../biobuzz/transform";
  import { DEFAULT_ROBOT_HEIGHT, DEFAULT_ROBOT_WIDTH } from "../config/defaults";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];
  export let pathChains: PathChain[] = [];
  export let secondStartPoint: Point | null = null;
  export let secondLines: Line[] = [];
  export let secondShapes: Shape[] = [];
  export let secondSequence: SequenceItem[] = [];
  /** Current settings, written into saved files like App's saves do. */
  export let settings: Settings | null = null;
  /**
   * App's project loader (validation, BIOBUZZ obstacle fallback, file
   * settings, chain repair, undo step). Resolves false if the file was
   * rejected (the loader has already told the user why).
   */
  export let openProject:
    | ((data: unknown, name: string, filePath?: string | null) => Promise<boolean>)
    | null = null;

  /** The project as a .pp file (the same fields App.saveFile writes). */
  function projectFileData(pathLines: Line[] = lines) {
    return {
      startPoint,
      lines: pathLines,
      shapes,
      sequence,
      pathChains,
      ...(settings ? { settings } : {}),
      version: PP_FILE_VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  let files: FileInfo[] = [];
  let selectedFile2: FileInfo | null = null;
  let loading = false;
  let newFileName = "";
  let creatingNewFile = false;
  let selectedFile: FileInfo | null = null;
  let errorMessage = "";
  let directoryStats = {
    totalFiles: 0,
    totalSize: 0,
    lastModified: new Date(),
  };

  // Add renaming state
  let renamingFile: FileInfo | null = null;
  let renameInputValue = "";

  // Add file type filtering
  const supportedFileTypes = [".pp"];

  // Name dialog state
  let nameDialogOpen = false;
  let nameDialogTitle = "";
  let nameDialogDefault = "";
  let pendingAllianceCopy: any = null;
  let pendingAllianceTarget: Alliance = "blue";



  // Helper to get error message from unknown error type
  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  // Normalize lines to ensure ids and wait fields exist
  function normalizeLines(input: Line[] = []): Line[] {
    return (input || []).map((line) => ({
      ...line,
      id: line.id || `line-${Math.random().toString(36).slice(2)}`,
      waitBeforeMs: Math.max(
        0,
        Number(line.waitBeforeMs ?? (line as any).waitBefore?.durationMs ?? 0),
      ),
      waitAfterMs: Math.max(
        0,
        Number(line.waitAfterMs ?? (line as any).waitAfter?.durationMs ?? 0),
      ),
      waitBeforeName:
        line.waitBeforeName ?? (line as any).waitBefore?.name ?? "",
      waitAfterName: line.waitAfterName ?? (line as any).waitAfter?.name ?? "",
    }));
  }

  // Normalize sequence data, falling back to path-only sequence if waits are missing
  function deriveSequence(data: any, normalizedLines: Line[]): SequenceItem[] {
    if (Array.isArray(data?.sequence) && data.sequence.length) {
      return data.sequence as SequenceItem[];
    }

    return normalizedLines.map((ln) => ({
      kind: "path",
      lineId: ln.id!,
    }));
  }

  // Debug logging
  console.log("[FileManager] Component initialized");

  async function loadDirectory() {
    loading = true;
    errorMessage = "";
    try {
      await refreshDirectory();
      // Re-select the open project so its file actions are ready straight away
      if (!selectedFile && $currentFilePath) {
        selectedFile = files.find((f) => f.path === $currentFilePath) ?? null;
      }
    } catch (error) {
      errorMessage = `Failed to load files: ${getErrorMessage(error)}`;
    } finally {
      loading = false;
    }
  }

  async function refreshDirectory() {
    try {
      // Get directory stats
      const stats = await browserFileStore.getDirectoryStats();
      if (stats) {
        directoryStats = {
          totalFiles: stats.totalFiles,
          totalSize: stats.totalSize,
          lastModified: new Date(stats.lastModified),
        };
      }

      // List files
      const allFiles = await browserFileStore.listFiles();

      // Filter for supported file types and add error handling
      files = allFiles
        .map((file) => {
          const fileExt = path.extname(file.name).toLowerCase();
          const isSupported = supportedFileTypes.includes(fileExt);

          return {
            name: file.name,
            path: file.path,
            size: file.size,
            modified: new Date((file as any).modified),
            error: isSupported ? undefined : `Unsupported file type: ${fileExt}`,
          } as FileInfo;
        })
        .filter((file) =>
          supportedFileTypes.includes(path.extname(file.name).toLowerCase()),
        );

      errorMessage = "";
    } catch (error) {
      errorMessage = `Error accessing files: ${getErrorMessage(error)}`;
      files = [];
    }
  }

  // Directory logic is not needed in browser mode
  function changeDirectory() {
    showToast("Directory selection is not available in browser mode.", "info");
  }

  // NEW: Start renaming a file
  function startRename(file: FileInfo) {
    renamingFile = file;
    renameInputValue = file.name.replace(/\.pp$/, "");
  }

  // NEW: Cancel renaming
  function cancelRename() {
    renamingFile = null;
    renameInputValue = "";
  }

  // NEW: Rename file
  async function renameFile() {
    if (!renamingFile) return;

    // Validate the new name
    const newName = renameInputValue.trim();
    if (!newName) {
      showToast("Please enter a file name", "warning");
      return;
    }

    const newFileName = newName.endsWith(".pp") ? newName : newName + ".pp";
    const newFilePath = newFileName;

    // Don't rename if same name
    if (newFilePath === renamingFile.path) {
      cancelRename();
      return;
    }

    // Validate file name format
    if (!/^[a-zA-Z0-9_\-. ]+\.pp$/.test(newFileName)) {
      showToast(
        "Invalid file name. Use only letters, numbers, underscores, dashes, and spaces.",
        "error",
      );
      return;
    }

    try {
      // Check if new file already exists
      const exists = await browserFileStore.fileExists(newFilePath);
      if (exists) {
        showToast(`File "${newFileName}" already exists`, "error");
        return;
      }

      // Perform the rename
      const result = await browserFileStore.renameFile(
        renamingFile.path,
        newFilePath,
      );

      if (result.success) {
        // Update selected file if it was the renamed one
        if (selectedFile && selectedFile.path === renamingFile.path) {
          selectedFile = {
            ...selectedFile,
            name: newFileName,
            path: newFilePath,
          };
          currentFilePath.set(newFilePath);
        }

        showToast(`Renamed to: ${newFileName}`, "success");
        await refreshDirectory();
        cancelRename();
      }
    } catch (error) {
      showToast(`Failed to rename: ${getErrorMessage(error)}`, "error");
    }
  }

  async function loadFile(file: FileInfo) {
    if (file.error) {
      showToast(`Cannot load file: ${file.error}`, "error");
      return;
    }

    try {
      const content = await browserFileStore.readFile(file.path);
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        data = null;
      }

      if (openProject) {
        // Same loader as the upload button: one behaviour for every open.
        const opened = await openProject(data, file.name, file.path);
        if (!opened) return;
      } else {
        const project = data as any;
        if (!project?.startPoint || !Array.isArray(project.lines) || !project.lines.length) {
          throw new Error("Invalid file format: missing required fields");
        }
        startPoint = project.startPoint;
        const normalizedLines = normalizeLines(project.lines);
        lines = normalizedLines;
        shapes = project.shapes || [];
        sequence = deriveSequence(project, normalizedLines);
        pathChains = project.pathChains || [];
        currentFilePath.set(file.path);
        isUnsaved.set(false);
      }

      selectedFile = file;

      showToast(`Loaded: ${file.name}`, "success");
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const message = errMsg.includes("Invalid file format")
        ? "Invalid file format. This may not be a valid path file."
        : `Error loading file: ${errMsg}`;

      showToast(message, "error");
      errorMessage = message;
    }
  }

  async function loadSecondFile(file: FileInfo) {
    if (file.error) {
      showToast(`Cannot load file: ${file.error}`, "error");
      return;
    }

    try {
      const content = await browserFileStore.readFile(file.path);
      const data = JSON.parse(content);

      // Validate the loaded data
      if (!data.startPoint || !data.lines) {
        throw new Error("Invalid file format: missing required fields");
      }

      // Update the second path state
      secondStartPoint = data.startPoint;
      const normalizedLines = normalizeLines(data.lines || []);
      secondLines = normalizedLines;
      secondShapes = data.shapes || [];
      secondSequence = deriveSequence(data, normalizedLines);

      // Update Global Store State
      secondFilePath.set(file.path);

      selectedFile2 = file;

      showToast(`Loaded second path: ${file.name}`, "success");
    } catch (error) {
      const errMsg = getErrorMessage(error);
      const message = errMsg.includes("Invalid file format")
        ? "Invalid file format. This may not be a valid path file."
        : `Error loading file: ${errMsg}`;

      showToast(message, "error");
      errorMessage = message;
    }
  }

  async function saveCurrentToFile() {
    if (!selectedFile) {
      showToast("No file selected", "error");
      return;
    }

    try {
      const content = JSON.stringify(projectFileData());

      await browserFileStore.writeFile(selectedFile.path, content);
      await refreshDirectory();

      isUnsaved.set(false);
      showToast(`Saved: ${selectedFile.name}`, "success");
    } catch (error) {
      errorMessage = `Failed to save file: ${getErrorMessage(error)}`;
      showToast("Failed to save file", "error");
    }
  }

  // Download current project as a .pp file to the user's computer (Save As...)
  function downloadCurrentToDisk() {
    try {
      const content = JSON.stringify(projectFileData(), null, 2);

      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const defaultName = selectedFile?.name || "path.pp";
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded: ${a.download}`, "success");
    } catch (error) {
      showToast(`Failed to download file: ${getErrorMessage(error)}`, "error");
    }
  }

  // If the browser supports the File System Access API, allow picking an existing local file and overwrite it.
  async function pickAndOverwriteLocalFile() {
    const win: any = window as any;
    if (!win.showOpenFilePicker) {
      showToast(
        "This browser does not support direct file overwrite. Use 'Download .pp' instead.",
        "warning",
      );
      return;
    }

    try {
      const [handle] = await win.showOpenFilePicker({
        types: [
          {
            description: "Path files",
            accept: { "application/json": [".pp", ".json"] },
          },
        ],
        excludeAcceptAllOption: false,
        multiple: false,
      });

      if (!handle) return;

      const writable = await handle.createWritable();

      const content = JSON.stringify(projectFileData(), null, 2);

      await writable.write(content);
      await writable.close();

      showToast(`Saved to local file: ${handle.name}`, "success");
    } catch (error) {
      console.error("File System API error:", error);
      showToast(`Failed to write local file: ${getErrorMessage(error)}`, "error");
    }
  }
  async function createNewFile() {
    if (!newFileName.trim()) {
      showToast("Please enter a file name", "warning");
      return;
    }

    const fileName = newFileName.endsWith(".pp")
      ? newFileName
      : newFileName + ".pp";
    const filePath = fileName;

    // Validate file name
    if (!/^[a-zA-Z0-9_\-. ]+\.pp$/.test(fileName)) {
      showToast(
        "Invalid file name. Use only letters, numbers, underscores, dashes, and spaces.",
        "error",
      );
      return;
    }

    try {
      // Check if file exists
      const exists = await browserFileStore.fileExists(filePath);
      if (exists) {
        if (!confirm(`File "${fileName}" already exists. Overwrite?`)) {
          return;
        }
      }

      const normalizedLines = normalizeLines(lines);
      const content = JSON.stringify(projectFileData(normalizedLines));

      await browserFileStore.writeFile(filePath, content);

      creatingNewFile = false;
      newFileName = "";
      await refreshDirectory();

      // Automatically "load" the new file into state
      selectedFile = files.find((f) => f.name === fileName) || null;
      if (selectedFile) {
        currentFilePath.set(selectedFile.path);
        isUnsaved.set(false);
        showToast(`Created: ${fileName}`, "success");
      }
    } catch (error) {
      console.error("Error creating file:", error);
      errorMessage = `Failed to create file: ${getErrorMessage(error)}`;
      showToast("Failed to create file", "error");
    }
  }

  async function deleteFile(file: FileInfo) {
    if (
      !confirm(
        `Are you sure you want to delete "${file.name}"?\nThis action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const pathToDelete = String(file.path || file.name).trim();

      // Try multiple variants in case keys differ (basename vs full path vs name)
      const candidates = [pathToDelete, file.name, path.basename(pathToDelete)];
      let deleted = false;
      for (const candidate of candidates) {
        try {
          if (!candidate) continue;
          const res = await browserFileStore.deleteFile(candidate);
          console.debug("Attempted delete of", candidate, "=>", res);
          if (res) {
            deleted = true;
            // Normalize selectedFile/path if it matched any candidate
            if (selectedFile && (selectedFile.path === candidate || selectedFile.name === candidate || selectedFile.name === file.name)) {
              selectedFile = null;
              currentFilePath.set(null);
            }
            break;
          }
        } catch (err) {
          console.warn("deleteFile attempt error for", candidate, err);
        }
      }

      if (!deleted) {
        const msg = `Could not delete file: ${file.name} (not found in cache)`;
        console.warn(msg, { tried: candidates });
        showToast(msg, "error");
        // Dump storage to console for debugging
        try {
          const raw = localStorage.getItem("biobuzz_pp_files");
          console.debug("biobuzz_pp_files content:", raw ? JSON.parse(raw) : raw);
        } catch (err) {
          console.warn("Failed to read biobuzz_pp_files localStorage", err);
        }
        await refreshDirectory();
        return;
      }

      await refreshDirectory();
      showToast(`Deleted: ${file.name}`, "success");
    } catch (error) {
      console.error("Error deleting file:", error);
      errorMessage = `Failed to delete file: ${getErrorMessage(error)}`;
      showToast("Failed to delete file", "error");
    }
  }

  // Debug helper: print raw storage entries to console and show toast
  function debugPrintStorage() {
    try {
      const raw = localStorage.getItem("biobuzz_pp_files");
      const parsed = raw ? JSON.parse(raw) : null;
      console.info("biobuzz_pp_files:", parsed);
      const count = parsed ? Object.keys(parsed).length : 0;
      showToast(`Storage contains ${count} file(s). See console for details.`, "info");
    } catch (err) {
      console.error("Failed to read biobuzz_pp_files", err);
      showToast("Failed to read storage (see console)", "error");
    }
  }

  async function duplicateFile() {
    if (!selectedFile) {
      showToast("No file selected to duplicate", "warning");
      return;
    }

    try {
      const content = await browserFileStore.readFile(selectedFile.path);
      const data = JSON.parse(content);

      // Add "Copy" suffix to the name in the data
      if (data.name) {
        data.name += " Copy";
      }

      const baseName = selectedFile.name.replace(/\.pp$/, "");
      let newFileName = `${baseName}_copy.pp`;
      let counter = 1;

      // Find a unique name
      while (
        await browserFileStore.fileExists(newFileName)
      ) {
        newFileName = `${baseName}_copy${counter}.pp`;
        counter++;
      }

      const newFilePath = newFileName;

      const normalizedLines = normalizeLines(data.lines || []);
      const sequenceData = deriveSequence(data, normalizedLines);
      await browserFileStore.writeFile(
        newFilePath,
        JSON.stringify(
          {
            ...data,
            lines: normalizedLines,
            sequence: sequenceData,
          },
          null,
          2,
        ),
      );
      await refreshDirectory();

      // Select and load the new file
      const newFile = files.find((f) => f.name === newFileName);
      if (newFile) {
        await loadFile(newFile);
      }

      showToast(`Duplicated: ${newFileName}`, "success");
    } catch (error) {
      console.error("Error duplicating file:", error);
      errorMessage = `Failed to duplicate file: ${getErrorMessage(error)}`;
      showToast("Failed to duplicate file", "error");
    }
  }

  /** Which alliance a saved path starts on (G304 check, falling back to the start x). */
  function allianceOfPath(data: any, pathLines: Line[], pathSequence: SequenceItem[]): Alliance {
    const sp: Point = data.startPoint;
    const length = Number(data.settings?.rWidth) || DEFAULT_ROBOT_WIDTH;
    const width = Number(data.settings?.rHeight) || DEFAULT_ROBOT_HEIGHT;
    const heading = startHeadingDeg(sp, pathLines, pathSequence);
    return checkStartPose(sp.x, sp.y, heading, length, width).alliance ??
      (sp.x < CENTER ? "red" : "blue");
  }

  /** "red_auto" -> "blue_auto", "Auto-RED" -> "Auto-BLUE", "close" -> "close_blue". */
  function allianceCopyName(baseName: string, from: Alliance, to: Alliance): string {
    const pattern = new RegExp(`(^|[_\\-\\s])(${from})(?=$|[_\\-\\s])`, "i");
    const swapped = baseName.replace(pattern, (_m, pre: string, word: string) => {
      const target =
        word === word.toUpperCase()
          ? to.toUpperCase()
          : word[0] === word[0].toUpperCase()
            ? to[0].toUpperCase() + to.slice(1)
            : to;
      return pre + target;
    });
    return swapped !== baseName ? swapped : `${baseName}_${to}`;
  }

  /**
   * BIOBUZZ is 180° rotationally symmetric, so the other alliance's version of
   * a path is the same path rotated about the field centre. The fixed field
   * obstacles are symmetric and stay as they are; obstacles the team drew
   * themselves rotate with the path.
   */
  async function duplicateForOtherAlliance() {
    if (!selectedFile) {
      showToast("No file selected to duplicate", "warning");
      return;
    }

    try {
      const content = await browserFileStore.readFile(selectedFile.path);
      const data = JSON.parse(content);
      if (!data.startPoint || !Array.isArray(data.lines)) {
        throw new Error("Invalid file format: missing required fields");
      }

      const normalizedLines = normalizeLines(data.lines);
      const sequenceData = deriveSequence(data, normalizedLines);
      const from = allianceOfPath(data, normalizedLines, sequenceData);
      const to: Alliance = from === "red" ? "blue" : "red";

      const rotated = rotateProject180(data.startPoint, normalizedLines);
      // Decide by identity, not lock state: the symmetric BIOBUZZ field
      // elements stay, every obstacle the team drew (locked or not) rotates.
      const rotatedShapes = Array.isArray(data.shapes)
        ? data.shapes.map((sh: Shape) =>
            !sh || isBiobuzzObstacle(sh) || !Array.isArray(sh.vertices)
              ? sh
              : { ...sh, vertices: sh.vertices.map((v) => rotatePoint180(v)) },
          )
        : data.shapes;

      pendingAllianceCopy = {
        ...data,
        startPoint: rotated.startPoint,
        lines: rotated.lines,
        shapes: rotatedShapes,
        sequence: sequenceData,
        timestamp: new Date().toISOString(),
      };
      pendingAllianceTarget = to;

      nameDialogTitle = `Name the ${to === "blue" ? "Blue" : "Red"} alliance copy`;
      nameDialogDefault = allianceCopyName(selectedFile.name.replace(/\.pp$/, ""), from, to);
      nameDialogOpen = true;
    } catch (error) {
      console.error("Error creating the other-alliance copy:", error);
      errorMessage = `Failed to create the other-alliance copy: ${getErrorMessage(error)}`;
      showToast("Failed to create the other-alliance copy", "error");
    }
  }

  async function handleAllianceCopyNameConfirm(userInput: string) {
    if (!pendingAllianceCopy) return;

    try {
      // Remove .pp extension if user added it
      userInput = userInput.replace(/\.pp$/, "");

      let newFileName = `${userInput}.pp`;
      let counter = 1;

      // Find a unique name if the chosen name already exists
      while (await browserFileStore.fileExists(newFileName)) {
        newFileName = `${userInput}${counter}.pp`;
        counter++;
      }

      await browserFileStore.writeFile(
        newFileName,
        JSON.stringify(pendingAllianceCopy, null, 2),
      );
      await refreshDirectory();

      // Select and load the new file
      const newFile = files.find((f) => f.name === newFileName);
      if (newFile) {
        await loadFile(newFile);
      }

      showToast(
        `Created ${newFileName} for the ${pendingAllianceTarget} alliance`,
        "success",
      );
    } catch (error) {
      console.error("Error saving the other-alliance copy:", error);
      errorMessage = `Failed to save the other-alliance copy: ${getErrorMessage(error)}`;
      showToast("Failed to save the other-alliance copy", "error");
    } finally {
      pendingAllianceCopy = null;
      nameDialogOpen = false;
    }
  }

  function handleAllianceCopyNameCancel() {
    pendingAllianceCopy = null;
    nameDialogOpen = false;
  }

  // Toast notification system
  function showToast(
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
  ) {
    // Create toast element
    const toast = document.createElement("div");
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-[1100] ${
      type === "success"
        ? "bg-green-500 text-white"
        : type === "error"
          ? "bg-red-500 text-white"
          : type === "warning"
            ? "bg-amber-500 text-white"
            : "bg-blue-500 text-white"
    }`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
      }
    }, 3000);
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDate(date: Date): string {
    return (
      new Date(date).toLocaleDateString() +
      " " +
      new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent) {
    if (!renamingFile) return;

    switch (event.key) {
      case "Enter":
        event.preventDefault();
        renameFile();
        break;
      case "Escape":
        event.preventDefault();
        cancelRename();
        break;
    }
  }

  onMount(() => {
    loadDirectory();
    window.addEventListener("keydown", handleKeyDown);
  });

  // Clean up event listener
  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });

  // Mock path.join for browser context
  const path = {
    join: (...parts: string[]) => parts.join("/"),
    basename: (filePath: string) => {
      const parts = filePath.split(/[\\/]/);
      return parts[parts.length - 1];
    },
    extname: (fileName: string) => {
      const match = fileName.match(/\.[^/.]+$/);
      return match ? match[0] : "";
    },
  };
</script>

<div class="fixed inset-0 z-[1010] flex" class:pointer-events-none={!isOpen}>
  <!-- Backdrop -->
  {#if isOpen}
    <div
      transition:fade={{ duration: 300 }}
      class="fixed inset-0 bg-black bg-opacity-50"
      on:click={() => (isOpen = false)}
      role="button"
      tabindex="0"
      aria-label="Close file manager backdrop"
      on:keydown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
          isOpen = false;
        }
      }}
    />
  {/if}

  <!-- Sidebar -->
  <div
    class="w-80 md:w-96 h-full bg-white dark:bg-neutral-900 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col"
    class:translate-x-0={isOpen}
    class:-translate-x-full={!isOpen}
  >
    <!-- Header -->
    <div
      class="flex-shrink-0 p-3 border-b border-neutral-200 dark:border-neutral-700"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-neutral-900 dark:text-white">
          Files
        </h2>
        <button
          on:click={() => (isOpen = false)}
          class="p-1 rounded transition-colors duration-250"
          title="Close"
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
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Error Message -->
      {#if errorMessage}
        <div
          class="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300"
        >
          ⚠ {errorMessage}
        </div>
      {/if}
      
    </div>

    <!-- New File Section -->
    <div
      class="flex-shrink-0 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700"
    >
      {#if creatingNewFile}
        <div class="space-y-2">
          <input
            bind:value={newFileName}
            placeholder="New file name (e.g. red_auto.pp)"
            class="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            on:keydown={(e) => e.key === "Enter" && createNewFile()}
          />
          <div class="flex gap-2">
            <button
              on:click={createNewFile}
              class="flex-1 px-3 py-1.5 text-sm bg-green-500 hover:!bg-green-600 text-white rounded-md transition-colors"
            >
              Create
            </button>
            <button
              on:click={() => {
                creatingNewFile = false;
                newFileName = "";
              }}
              class="flex-1 px-3 py-1.5 text-sm bg-neutral-500 hover:!bg-neutral-600 text-white rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          on:click={() => (creatingNewFile = true)}
          class="w-full px-3 py-1.5 text-sm bg-green-500 hover:!bg-green-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Save Current Path as New File
        </button>
      {/if}
    </div>

    <!-- File List -->
    <div class="flex-1 overflow-hidden">
      {#if loading}
        <div class="flex flex-col items-center justify-center h-32 gap-2">
          <div
            class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
          ></div>
          <div class="text-neutral-500 dark:text-neutral-400">
            Loading files...
          </div>
        </div>
      {:else if errorMessage && files.length === 0}
        <div class="flex flex-col items-center justify-center h-32 p-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1}
            stroke="currentColor"
            class="size-10 mx-auto mb-2 text-red-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div class="text-center text-xs text-neutral-600 dark:text-neutral-400">
            {errorMessage}
          </div>
        </div>
      {:else if files.length === 0}
        <div class="flex flex-col items-center justify-center h-32 p-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1}
            stroke="currentColor"
            class="size-10 mx-auto mb-2 opacity-50"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div class="text-center text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            No files yet
          </div>
          <button
            on:click={() => (creatingNewFile = true)}
            class="px-2 py-1 text-xs bg-green-500 hover:!bg-green-600 text-white rounded transition-colors"
          >
            Save Current Path
          </button>
        </div>
      {:else}
        <div class="h-full overflow-y-auto">
          <div
            class="sticky top-0 bg-white dark:bg-neutral-900 px-3 py-1 border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400"
          >
            Showing {files.length} file{files.length !== 1 ? "s" : ""}
          </div>

          {#each files as file (file.path)}
            <div
              class="px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-700 transition-colors duration-250 cursor-pointer file-item group"
              on:click={() => {
                if ($dualPathMode && selectedFile2?.path !== file.path && selectedFile?.path !== file.path) {
                  loadSecondFile(file);
                } else {
                  loadFile(file);
                }
              }}
              role="button"
              tabindex="0"
              on:keydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if ($dualPathMode && selectedFile2?.path !== file.path && selectedFile?.path !== file.path) {
                    loadSecondFile(file);
                  } else {
                    loadFile(file);
                  }
                }
              }}
              aria-label={`Open ${file.name}`}
              class:bg-blue-50={selectedFile?.path === file.path}
              class:dark:bg-blue-900={selectedFile?.path === file.path}
              class:bg-purple-50={selectedFile2?.path === file.path}
              class:dark:bg-purple-900={selectedFile2?.path === file.path}
            >
              {#if renamingFile?.path === file.path}
                <!-- Rename Input -->
                <div class="space-y-2">
                  <input
                    bind:value={renameInputValue}
                    class="w-full px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    on:keydown={(e) => {
                      if (e.key === "Enter") renameFile();
                      if (e.key === "Escape") cancelRename();
                    }}
                  />
                  <div class="flex gap-2">
                    <button
                      on:click|stopPropagation={renameFile}
                      class="px-2 py-1 text-xs bg-green-500 hover:!bg-green-600 text-white rounded transition-colors"
                    >
                      Save
                    </button>
                    <button
                      on:click|stopPropagation={cancelRename}
                      class="px-2 py-1 text-xs bg-neutral-500 hover:!bg-neutral-600 text-white rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <!-- Normal File Display -->
                <div class="flex items-center justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div
                      class="font-medium text-sm truncate text-neutral-900 dark:text-white"
                      title={file.name}
                    >
                      {file.name}
                      {#if file.error}
                        <span class="ml-2 text-xs text-red-500"
                          >({file.error})</span
                        >
                      {/if}
                    </div>
                    <div
                      class="text-xs text-neutral-500 dark:text-neutral-400 group-hover:block hidden"
                      title="{formatFileSize(file.size)} • {formatDate(file.modified)}"
                    >
                      {formatFileSize(file.size)} • {formatDate(file.modified)}
                    </div>
                  </div>

                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <!-- Rename Button -->
                    <button
                      on:click|stopPropagation={() => startRename(file)}
                      class="p-1.5 rounded hover:!bg-blue-500 hover:text-white transition-colors flex-shrink-0"
                      title="Rename file"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width={1.5}
                        stroke="currentColor"
                        class="size-4"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                    </button>

                    <!-- Delete Button -->
                    <button
                      on:click|stopPropagation={() => deleteFile(file)}
                      class="p-1.5 rounded hover:!bg-red-500 hover:text-white transition-colors flex-shrink-0"
                      title="Delete file"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width={1.5}
                        stroke="currentColor"
                        class="size-4"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Current File Actions -->
    {#if selectedFile}
      <div
        class="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-neutral-700 space-y-2 bg-neutral-50 dark:bg-neutral-950"
      >
        <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300 px-1">
          {selectedFile.name}
        </div>

        <!-- File Operations (Rename, Delete, Duplicate) -->
        <div class="grid grid-cols-3 gap-1">
          <button
            on:click={() => selectedFile && startRename(selectedFile)}
            class="px-2 py-1.5 text-xs bg-amber-500 hover:!bg-amber-600 text-white rounded transition-colors flex items-center justify-center gap-1"
            title="Rename this file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
          </button>

          <button
            on:click={() => selectedFile && deleteFile(selectedFile)}
            class="px-2 py-1.5 text-xs bg-red-500 hover:!bg-red-600 text-white rounded transition-colors flex items-center justify-center gap-1"
            title="Delete this file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </button>

          <button
            on:click={duplicateFile}
            class="px-2 py-1.5 text-xs bg-blue-500 hover:!bg-blue-600 text-white rounded transition-colors flex items-center justify-center gap-1"
            title="Duplicate this file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-3.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
              />
            </svg>
          </button>
        </div>

        <!-- Other-alliance copy (180° rotation) - Full Width -->
        <button
          on:click={duplicateForOtherAlliance}
          class="w-full px-3 py-2.5 text-sm font-medium bg-purple-500 hover:!bg-purple-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
          title="Copy this path rotated 180° about the field centre (red ↔ blue). BIOBUZZ is rotationally symmetric."
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
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          <span>Duplicate for other alliance</span>
        </button>

        <!-- Saving Operations -->
        <div class="space-y-1">
          <div class="text-xs font-medium text-neutral-600 dark:text-neutral-400 px-1">
            Save Options
          </div>
          <div class="grid grid-cols-2 gap-1">
            <button
              on:click={saveCurrentToFile}
              class="px-2 py-1.5 text-xs bg-emerald-600 hover:!bg-emerald-700 text-white rounded transition-colors flex items-center justify-center gap-1"
              disabled={!selectedFile}
              title="Save into selected file (overwrite)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5A2.25 2.25 0 0 1 5.25 5.25h13.5A2.25 2.25 0 0 1 21 7.5v9a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 16.5v-9zM7.5 11.25h9M7.5 14.25h6" />
              </svg>
              Overwrite
            </button>
            <button
              on:click={() => (creatingNewFile = true)}
              class="px-2 py-1.5 text-xs bg-green-500 hover:!bg-green-600 text-white rounded transition-colors flex items-center justify-center gap-1"
              title="Create new file and save"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
            <button
              on:click={downloadCurrentToDisk}
              class="px-2 py-1.5 text-xs bg-blue-600 hover:!bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-1"
              title="Download .pp to computer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0 3-3m-3 3-3-3M21 21H3" />
              </svg>
              Download
            </button>
            <button
              on:click={pickAndOverwriteLocalFile}
              class="px-2 py-1.5 text-xs bg-indigo-600 hover:!bg-indigo-700 text-white rounded transition-colors flex items-center justify-center gap-1"
              title="Save to local file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 12v6m0-6V6m0 6l3-3m-3 3-3-3" />
              </svg>
              Local
            </button>
          </div>
        </div>
      </div>
    {:else}
      <div
        class="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-neutral-700 text-center text-xs text-neutral-500 dark:text-neutral-400"
      >
        Select a file to manage
      </div>
    {/if}
  </div>
</div>

<NameDialog
  bind:isOpen={nameDialogOpen}
  title={nameDialogTitle}
  defaultValue={nameDialogDefault}
  placeholder="Enter name..."
  onConfirm={handleAllianceCopyNameConfirm}
  onCancel={handleAllianceCopyNameCancel}
/>

<style>
  /* Add smooth transitions */
  .file-item {
    transition: all 0.2s ease;
  }

  .file-item:hover {
    transform: translateX(2px);
  }
</style>
