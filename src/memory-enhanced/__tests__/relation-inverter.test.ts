import { describe, it, expect, beforeEach } from 'vitest';
import { getInverseRelationType, hasKnownInverse, registerInverseRelation } from '../lib/relation-inverter.js';

describe('Relation Inverter', () => {
  describe('hasKnownInverse', () => {
    it('should return true for known inverse relations', () => {
      expect(hasKnownInverse('created')).toBe(true);
      expect(hasKnownInverse('created by')).toBe(true);
      expect(hasKnownInverse('contains')).toBe(true);
      expect(hasKnownInverse('uses')).toBe(true);
    });

    it('should return false for unknown relations', () => {
      expect(hasKnownInverse('unknown_relation')).toBe(false);
      expect(hasKnownInverse('some other relation')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(hasKnownInverse('CREATED')).toBe(true);
      expect(hasKnownInverse('Created')).toBe(true);
    });
  });

  describe('registerInverseRelation', () => {
    it('should register a custom inverse relation mapping', () => {
      // Arrange
      const relationType = 'custom_test_relation';
      const inverse = 'custom_test_inverse';

      // Act
      registerInverseRelation(relationType, inverse);

      // Assert
      expect(hasKnownInverse(relationType)).toBe(true);
      expect(getInverseRelationType(relationType)).toBe(inverse);
      expect(getInverseRelationType(inverse)).toBe(relationType);
    });

    it('should register bidirectional mappings', () => {
      // Arrange
      const relationType = 'leads';
      const inverse = 'led by';

      // Act
      registerInverseRelation(relationType, inverse);

      // Assert - both directions should work
      expect(getInverseRelationType(relationType)).toBe(inverse);
      expect(getInverseRelationType(inverse)).toBe(relationType);
    });
  });

  describe('getInverseRelationType - edge cases', () => {
    it('should handle relations ending with " by"', () => {
      // This tests the heuristic for unknown relations
      const result = getInverseRelationType('tested by');
      expect(result).toBe('tested');
    });

    it('should add "(inverse)" for unknown relations without " by"', () => {
      const result = getInverseRelationType('unknown_relation_type');
      expect(result).toBe('unknown_relation_type (inverse)');
    });
  });
});
