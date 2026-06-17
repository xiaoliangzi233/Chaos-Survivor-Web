import { BaseEnemy } from "./BaseEnemy.js";

const CLOTHING_VARIANTS = ["street", "worker", "runner", "hazard", "security", "medic", "engineer", "janitor", "prisoner", "courier", "lab_guard", "chemist", "mechanic"];

export class Zombie extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    if (this.variantIndex != null && this.variantIndex >= 0) {
      this.clothingVariant = CLOTHING_VARIANTS[this.variantIndex % CLOTHING_VARIANTS.length] || "street";
    } else {
      const roll = Math.random();
      this.clothingVariant = roll > 0.9985 ? "scientist" : CLOTHING_VARIANTS[Math.floor(roll * CLOTHING_VARIANTS.length)] || "street";
    }
  }
}