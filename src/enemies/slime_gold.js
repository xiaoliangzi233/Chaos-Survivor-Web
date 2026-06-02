import { SlimeEnemy, slimeProfile } from "./slime_shared.js";

export class SlimeGold extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, slimeProfile("medium", { fixedVariant: "gold", hopSpeed: 2.1, landBurst: 5 }));
  }
}
