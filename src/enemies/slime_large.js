import { SLIME_PROFILES, SlimeEnemy } from "./slime_shared.js";

export class SlimeLarge extends SlimeEnemy {
  constructor(config, x, y) {
    super(config, x, y, SLIME_PROFILES.large);
  }
}
