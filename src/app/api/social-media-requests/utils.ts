import { FieldValue } from 'firebase-admin/firestore';
import { serializeDocument } from '@/lib/server/firestore';
import type { SocialMediaRequest } from '@/lib/types';

export function mapSocialMediaRequest(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): SocialMediaRequest {
  return serializeDocument<SocialMediaRequest>(id, data);
}

export function compareSocialMediaRequestsByCreatedAtDesc(a: SocialMediaRequest, b: SocialMediaRequest) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

export function cleanSocialMediaPayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
}

export function buildSocialMediaUpdatePayload(data: Record<string, unknown>) {
  const updateData: Record<string, unknown> = {
    ...cleanSocialMediaPayload(data),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.contentType === 'Reel') {
    updateData.isWebReplication = FieldValue.delete();
    updateData.storyUrl = FieldValue.delete();
    updateData.storyCta = FieldValue.delete();
    updateData.storyTagClient = FieldValue.delete();
    updateData.storyTagHandle = FieldValue.delete();
    updateData.carouselSlides = FieldValue.delete();
  } else if (data.contentType === 'Story') {
    updateData.reelCopy = FieldValue.delete();
    updateData.reelCollaboration = FieldValue.delete();
    updateData.reelCollabHandle = FieldValue.delete();
    updateData.carouselSlides = FieldValue.delete();
  } else if (data.contentType === 'Carrusel') {
    updateData.isWebReplication = FieldValue.delete();
    updateData.storyUrl = FieldValue.delete();
    updateData.storyCta = FieldValue.delete();
    updateData.storyTagClient = FieldValue.delete();
    updateData.storyTagHandle = FieldValue.delete();
    updateData.reelCopy = FieldValue.delete();
  }

  return updateData;
}
