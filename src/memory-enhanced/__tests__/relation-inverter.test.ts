import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getInverseRelationType, 
  hasKnownInverse, 
  registerInverseRelation 
} from '../lib/relation-inverter.js';

describe('Relation Inverter', () => {
  describe('getInverseRelationType', () => {
    it('should return known inverse relations', () => {
      expect(getInverseRelationType('created')).toBe('created by');
      expect(getInverseRelationType('created by')).toBe('created');
      expect(getInverseRelationType('contains')).toBe('contained in');
      expect(getInverseRelationType('contained in')).toBe('contains');
      expect(getInverseRelationType('uses')).toBe('used by');
      expect(getInverseRelationType('used by')).toBe('uses');
      expect(getInverseRelationType('manages')).toBe('managed by');
      expect(getInverseRelationType('managed by')).toBe('manages');
      expect(getInverseRelationType('owns')).toBe('owned by');
      expect(getInverseRelationType('owned by')).toBe('owns');
      expect(getInverseRelationType('modifies')).toBe('modified by');
      expect(getInverseRelationType('modified by')).toBe('modifies');
      expect(getInverseRelationType('updates')).toBe('updated by');
      expect(getInverseRelationType('updated by')).toBe('updates');
    });

    it('should handle case insensitivity for known relations', () => {
      expect(getInverseRelationType('Created')).toBe('created by');
      expect(getInverseRelationType('CREATED BY')).toBe('created');
      expect(getInverseRelationType('CoNtAiNs')).toBe('contained in');
    });

    it('should strip " by" suffix for unknown relations ending with by', () => {
      expect(getInverseRelationType('liked by')).toBe('liked');
      expect(getInverseRelationType('reviewed by')).toBe('reviewed');
    });

    it('should add "(inverse)" suffix for unknown relations without by', () => {
      expect(getInverseRelationType('likes')).toBe('likes (inverse)');
      expect(getInverseRelationType('reviews')).toBe('reviews (inverse)');
      expect(getInverseRelationType('custom-relation')).toBe('custom-relation (inverse)');
    });

    it('should preserve original casing except for map lookups', () => {
      expect(getInverseRelationType('MyCustom By')).toBe('MyCustom');
      expect(getInverseRelationType('MyRelation')).toBe('MyRelation (inverse)');
    });
  });

  describe('hasKnownInverse', () => {
    it('should return true for known relation types', () => {
      expect(hasKnownInverse('created')).toBe(true);
      expect(hasKnownInverse('created by')).toBe(true);
      expect(hasKnownInverse('contains')).toBe(true);
      expect(hasKnownInverse('contained in')).toBe(true);
      expect(hasKnownInverse('uses')).toBe(true);
      expect(hasKnownInverse('used by')).toBe(true);
      expect(hasKnownInverse('manages')).toBe(true);
      expect(hasKnownInverse('managed by')).toBe(true);
      expect(hasKnownInverse('owns')).toBe(true);
      expect(hasKnownInverse('owned by')).toBe(true);
      expect(hasKnownInverse('modifies')).toBe(true);
      expect(hasKnownInverse('modified by')).toBe(true);
      expect(hasKnownInverse('updates')).toBe(true);
      expect(hasKnownInverse('updated by')).toBe(true);
    });

    it('should return false for unknown relation types', () => {
      expect(hasKnownInverse('likes')).toBe(false);
      expect(hasKnownInverse('reviews')).toBe(false);
      expect(hasKnownInverse('custom-relation')).toBe(false);
      expect(hasKnownInverse('unknown')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(hasKnownInverse('Created')).toBe(true);
      expect(hasKnownInverse('CREATED BY')).toBe(true);
      expect(hasKnownInverse('CoNtAiNs')).toBe(true);
      expect(hasKnownInverse('LIKES')).toBe(false);
    });
  });

  describe('registerInverseRelation', () => {
    it('should register new inverse relation pair bidirectionally', () => {
      // Before registration
      expect(hasKnownInverse('teaches')).toBe(false);
      expect(hasKnownInverse('taught by')).toBe(false);

      // Register the pair
      registerInverseRelation('teaches', 'taught by');

      // After registration - both should be known
      expect(hasKnownInverse('teaches')).toBe(true);
      expect(hasKnownInverse('taught by')).toBe(true);

      // Both directions should work
      expect(getInverseRelationType('teaches')).toBe('taught by');
      expect(getInverseRelationType('taught by')).toBe('teaches');
    });

    it('should handle case insensitivity in registration', () => {
      registerInverseRelation('Supervises', 'Supervised By');

      expect(hasKnownInverse('supervises')).toBe(true);
      expect(hasKnownInverse('supervised by')).toBe(true);
      expect(getInverseRelationType('supervises')).toBe('Supervised By');
      expect(getInverseRelationType('supervised by')).toBe('Supervises');
    });

    it('should allow overwriting existing relations', () => {
      // Register initial mapping
      registerInverseRelation('supports', 'supported by');
      expect(getInverseRelationType('supports')).toBe('supported by');

      // Overwrite with new mapping
      registerInverseRelation('supports', 'gets support from');
      expect(getInverseRelationType('supports')).toBe('gets support from');
      expect(getInverseRelationType('gets support from')).toBe('supports');
    });

    it('should work with multiple custom registrations', () => {
      registerInverseRelation('mentors', 'mentored by');
      registerInverseRelation('collaborates with', 'collaborates with');
      registerInverseRelation('reports to', 'has report');

      expect(getInverseRelationType('mentors')).toBe('mentored by');
      expect(getInverseRelationType('mentored by')).toBe('mentors');
      expect(getInverseRelationType('collaborates with')).toBe('collaborates with');
      expect(getInverseRelationType('reports to')).toBe('has report');
      expect(getInverseRelationType('has report')).toBe('reports to');
    });
  });

  describe('Behavioral Integration', () => {
    it('should maintain consistency across all functions', () => {
      // Register a new relation
      registerInverseRelation('influences', 'influenced by');

      // Verify it's known
      expect(hasKnownInverse('influences')).toBe(true);
      expect(hasKnownInverse('influenced by')).toBe(true);

      // Verify inverses work correctly
      expect(getInverseRelationType('influences')).toBe('influenced by');
      expect(getInverseRelationType('influenced by')).toBe('influences');

      // Double inversion should return original
      const original = 'influences';
      const inverse = getInverseRelationType(original);
      const doubleInverse = getInverseRelationType(inverse);
      expect(doubleInverse).toBe(original);
    });

    it('should handle symmetric relations correctly', () => {
      registerInverseRelation('partner with', 'partner with');

      expect(hasKnownInverse('partner with')).toBe(true);
      expect(getInverseRelationType('partner with')).toBe('partner with');
    });
  });
});
