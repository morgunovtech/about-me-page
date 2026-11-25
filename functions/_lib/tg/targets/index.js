// Target registry. Each target implements { id, render(post,opts), publish(plan,cfg) }.
// One target today. (A LinkedIn entry stood here as a stub that rendered nothing
// and published nothing; a new target is one file and one line of this registry.)
import { telegram } from './telegram.js';

export const TARGETS = { telegram };
export const getTarget = (id) => TARGETS[id] || null;
