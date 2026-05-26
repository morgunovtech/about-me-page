// Target registry. Each target implements { id, render(post,opts), publish(plan,cfg) }.
import { telegram } from './telegram.js';
import { linkedin } from './linkedin.js';

export const TARGETS = { telegram, linkedin };
export const getTarget = (id) => TARGETS[id] || null;
