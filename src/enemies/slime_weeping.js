import { SlimeEnemy, slimeProfile } from "./slime_shared.js";

export class SlimeWeeping extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, slimeProfile("medium", { fixedVariant: "weeping", hopSpeed: 1.9, restTime: 0.36 }));
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.36);
  }
}
