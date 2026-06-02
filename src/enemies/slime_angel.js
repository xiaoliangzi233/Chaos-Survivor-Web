import { SlimeEnemy, slimeProfile } from "./slime_shared.js";

export class SlimeAngel extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, slimeProfile("large", { fixedVariant: "angel", hopSpeed: 1.95, trailSize: 11 }));
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.46);
  }
}
