import type { VenueType } from '../types';
import { galleryModel } from './gallery';
import { museumModel } from './museum';
import type { VenueModel } from './types';

const REGISTRY: Record<VenueType, VenueModel> = {
  gallery: galleryModel,
  museum: museumModel,
};

export function getVenueModel(venue: VenueType): VenueModel {
  return REGISTRY[venue];
}

export type { VenueModel } from './types';
