/** Series styling by slot position: baseline is grey and dashed; scenarios use distinct hues. */
export const SLOT_COLORS = ['var(--s0)', 'var(--s1)', 'var(--s2)', 'var(--s3)'];
export const slotColor = (i: number) => SLOT_COLORS[i % SLOT_COLORS.length];
