import type { UnitId } from '@lotr-tactics/sim';

/**
 * Per-unit changes to a portrait's framing (render.ts), for models whose head bone alone frames them
 * badly, such as those that crouch: `zoom` above 1 shows more of the model, `lift` moves the frame up
 * and `shift` moves it to the right. Each is in lengths of the model's torso, as render.ts frames it.
 */
export const PORTRAIT_FRAMING: Partial<Record<UnitId, { zoom?: number; lift?: number; shift?: number }>> = {
  // Orcs that hunch carry their heads low and forward of their hips.
  gorbag: { lift: -0.1 },
  grishnakh: { lift: -0.25 },
  lurtz: { lift: -0.15 },
  ugluk: { lift: -0.25 },
  gothmog: { lift: -0.2 },
  // Sharku rides a warg, low and leaning.
  sharku: { lift: -0.3 },
  sauron: { lift: -0.2 },
  // Treebeard is tall from his crown of leaves to his beard.
  treebeard: { zoom: 1.25, lift: -0.25 },
};
