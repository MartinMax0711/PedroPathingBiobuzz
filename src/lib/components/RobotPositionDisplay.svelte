<!-- Modified for the BIOBUZZ Edition (FTC 2026-2027); based on Pedro-Pathing/Visualizer f54357e. -->
<script lang="ts">
  import type { BasePoint } from "../../types";
  import { normalizeDeg } from "../../biobuzz/field";

  export let robotXY: BasePoint;
  /** Screen rotation of the robot (the negated field heading). */
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;

  /** Field heading in degrees, normalised to (-180, 180] with no "-0". */
  function displayHeading(screenDeg: number): number {
    if (!Number.isFinite(screenDeg)) return 0;
    let deg = Math.round(normalizeDeg(-screenDeg));
    if (deg === -180) deg = 180;
    return deg === 0 ? 0 : deg; // drops -0
  }

  $: heading = displayHeading(robotHeading);
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
  <div class="font-semibold">Current Robot Position</div>
  <div class="flex flex-row justify-start items-center gap-2 tabular-nums">
    <div class="font-extralight">X:</div>
    <div class="w-16">{x.invert(robotXY.x).toFixed(3)}</div>
    <div class="font-extralight">Y:</div>
    <div class="w-16">{y.invert(robotXY.y).toFixed(3)}</div>
    <div class="font-extralight">Heading:</div>
    <div>{heading}&deg;</div>
  </div>
</div>
