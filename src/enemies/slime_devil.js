import { SlimeEnemy, slimeProfile } from "./slime_shared.js";

export class SlimeDevil extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, slimeProfile("small", { fixedVariant: "devil", hopSpeed: 3.05, landBurst: 3 }));
  }
}
