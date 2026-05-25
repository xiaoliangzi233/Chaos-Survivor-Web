import { SLIME_PROFILES, SlimeEnemy } from "./slime_shared.js";

export class SlimeMedium extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, SLIME_PROFILES.medium);
  }
}
