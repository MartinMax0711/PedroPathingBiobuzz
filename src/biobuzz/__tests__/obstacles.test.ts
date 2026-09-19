import { describe, expect, it } from "vitest";
import {
  isBiobuzzObstacle,
  obstacleKind,
  shortObstacleName,
  upgradeBiobuzzObstacles,
} from "../../utils/shapes";
import { getBiobuzzObstacles } from "../field";

describe("BIOBUZZ obstacle grouping", () => {
  const obstacles = getBiobuzzObstacles();

  it("groups the rails and the four legs as HIVE frame", () => {
    const kinds = obstacles.map((s) => `${s.id}:${obstacleKind(s)}`);
    expect(kinds).toEqual([
      "hive-frame-red:hive-frame",
      "hive-frame-blue:hive-frame",
      "hive-leg-red-audience:hive-frame",
      "hive-leg-red-rear:hive-frame",
      "hive-leg-blue-audience:hive-frame",
      "hive-leg-blue-rear:hive-frame",
      "flower-rear:flower",
      "flower-blue:flower",
      "flower-audience:flower",
      "flower-red:flower",
    ]);
    expect(obstacles.every(isBiobuzzObstacle)).toBe(true);
    expect(isBiobuzzObstacle({ id: "triangle-3" })).toBe(false);
    expect(isBiobuzzObstacle({ id: "hive-leg-custom" })).toBe(false);
  });

  it("gives the legs short badge names", () => {
    expect(shortObstacleName("hive-leg-red-audience")).toBe("HIVE leg · Red side (audience)");
    expect(shortObstacleName("hive-leg-blue-rear")).toBe("HIVE leg · Blue side (rear)");
    expect(shortObstacleName("hive-frame-blue")).toBe("HIVE frame · Blue side");
    expect(shortObstacleName("flower-red")).toBe("FLOWER · Red wall");
    expect(shortObstacleName("triangle-3", "My box")).toBe("My box");
  });

  it("adds the legs to projects saved before they were modelled", () => {
    const custom = { id: "triangle-7", vertices: [], color: "#dc2626", fillColor: "#ff6b6b" };
    const old = [...obstacles.filter((s) => !s.id.startsWith("hive-leg-")), custom];
    const upgraded = upgradeBiobuzzObstacles(old);
    expect(upgraded.map((s) => s.id)).toEqual([...obstacles.map((s) => s.id), "triangle-7"]);
    // Current projects, custom fields and projects without the rails are untouched.
    expect(upgradeBiobuzzObstacles(obstacles)).toBe(obstacles);
    const customOnly = [custom];
    expect(upgradeBiobuzzObstacles(customOnly)).toBe(customOnly);
  });
});
