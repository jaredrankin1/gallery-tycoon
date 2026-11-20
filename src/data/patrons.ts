// Jared's patron sheets (art/source/patrons/, sliced by tools/slice_patrons.py):
// 80 members of the public, one still pose each, drawn as hopping paper
// cutouts. Unlike the regulars' recoloured lookalikes, each is one of a kind.
export const PATRON_COUNT = 80;
export const PATRON_SPRITES = Array.from({ length: PATRON_COUNT }, (_, i) => `patron-${String(i + 1).padStart(2, '0')}`);
