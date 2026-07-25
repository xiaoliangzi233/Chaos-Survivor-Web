import { BaseEnemy } from "./BaseEnemy.js";

export const ZOMBIE_CLOTHING_VARIANTS = Object.freeze([
  "street", "worker", "runner", "hazard", "security", "medic", "engineer",
  "janitor", "prisoner", "courier", "lab_guard", "chemist", "mechanic",
]);
export const ZOMBIE_VISUAL_VARIANTS = Object.freeze([...ZOMBIE_CLOTHING_VARIANTS, "scientist"]);

export class Zombie extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    const roll = Math.random();
    this.clothingVariant = roll > 0.9985 ? "scientist" : ZOMBIE_CLOTHING_VARIANTS[Math.floor(roll * ZOMBIE_CLOTHING_VARIANTS.length)] || "street";
  }
}
