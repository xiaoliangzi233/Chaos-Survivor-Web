import { BaseEnemy } from "./BaseEnemy.js";

const CLOTHING_VARIANTS = ["street", "worker", "runner", "hazard", "security"];

export class Zombie extends BaseEnemy {
  constructor(config, x, y) {
    super(config, x, y);
    const roll = Math.random();
    this.clothingVariant = roll > 0.9985 ? "scientist" : CLOTHING_VARIANTS[Math.floor(roll * CLOTHING_VARIANTS.length)] || "street";
  }
}
