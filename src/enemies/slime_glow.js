import { SlimeEnemy, slimeProfile } from "./slime_shared.js";

export class SlimeGlow extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, slimeProfile("small", { fixedVariant: "glow", trailSize: 8, idleBounce: 2.2 }));
  }
}
