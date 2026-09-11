// LinkedIn target — interface stub. Implements the Target shape so adding it
// later is one file + the registry entry; no behavior yet. LinkedIn rules differ
// (no markdown, plain text + line breaks + emoji + hashtags, hook in line 1
// before the "see more" fold), so render() will get its own plan builder then.
export const linkedin = {
  id: 'linkedin',
  render() {
    return { target: 'linkedin', mode: 'stub', warnings: ['LinkedIn target not implemented yet'], messages: [] };
  },
  async publish() {
    return { ok: false, error: 'linkedin: not implemented', refs: [] };
  },
};
