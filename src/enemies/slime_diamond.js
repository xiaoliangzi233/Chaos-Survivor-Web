import { SlimeEnemy, slimeProfile } from "./slime_shared.js";

export class SlimeDiamond extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, slimeProfile("medium", { fixedVariant: "diamond", trailSize: 9, landBurst: 5 }));
    this.knockbackResistance = Math.max(this.knockbackResistance, 0.42);
  }
}
