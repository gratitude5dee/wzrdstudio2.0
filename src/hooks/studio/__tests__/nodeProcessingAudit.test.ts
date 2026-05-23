import { describe, expect, it } from 'vitest';

import {
  normalizeNodeKind,
  normalizeNodeStatus,
  isGeneratorKind,
  isPassThroughKind,
  isExecutionExcludedKind,
  getNodeExecutionDisposition,
  EXECUTABLE_GENERATOR_NODE_KINDS,
  PASS_THROUGH_NODE_KINDS,
} from '@/lib/compute/contract';
import { NODE_TYPE_CONFIGS } from '@/types/computeFlow';
import {
  validateStatusTransition,
  getValidNextStatuses,
} from '@/types/nodeStatusMachine';

describe('Node Processing Audit', () => {
  describe('Generator node kinds have proper execution support', () => {
    it.each(['Text', 'Prompt', 'Image', 'Video', 'Audio'] as const)(
      '%s kind is recognized as a generator',
      (kind) => {
        expect(isGeneratorKind(kind)).toBe(true);
        expect(getNodeExecutionDisposition(kind)).toBe('generator');
      }
    );

    it.each(['Text', 'Prompt', 'Image', 'Video', 'Audio'] as const)(
      '%s has a port configuration in NODE_TYPE_CONFIGS',
      (kind) => {
        const config = NODE_TYPE_CONFIGS[kind];
        expect(config).toBeDefined();
        expect(config.outputs.length).toBeGreaterThan(0);
      }
    );
  });

  describe('Pass-through node kinds relay data correctly', () => {
    it.each(['Upload', 'Transform', 'Combine', 'Output', 'Model', 'Gateway', 'ImageEdit'] as const)(
      '%s kind is recognized as pass-through',
      (kind) => {
        expect(isPassThroughKind(kind)).toBe(true);
        expect(getNodeExecutionDisposition(kind)).toBe('passthrough');
      }
    );

    it('Output node has an input port for receiving data', () => {
      const config = NODE_TYPE_CONFIGS['Output'];
      expect(config).toBeDefined();
      expect(config.inputs.length).toBeGreaterThan(0);
      expect(config.inputs[0].datatype).toBe('any');
    });

    it('Transform node has both input and output ports', () => {
      const config = NODE_TYPE_CONFIGS['Transform'];
      expect(config).toBeDefined();
      expect(config.inputs.length).toBeGreaterThan(0);
      expect(config.outputs.length).toBeGreaterThan(0);
    });
  });

  describe('Excluded node kinds', () => {
    it('comment kind is execution-excluded', () => {
      expect(isExecutionExcludedKind('comment')).toBe(true);
      expect(getNodeExecutionDisposition('comment')).toBe('excluded');
    });
  });

  describe('Status lifecycle transitions', () => {
    it('idle → queued is valid', () => {
      const result = validateStatusTransition('idle', 'queued');
      expect(result.valid).toBe(true);
    });

    it('queued → running is valid', () => {
      const result = validateStatusTransition('queued', 'running');
      expect(result.valid).toBe(true);
    });

    it('running → succeeded is valid', () => {
      const result = validateStatusTransition('running', 'succeeded');
      expect(result.valid).toBe(true);
    });

    it('running → failed is valid', () => {
      const result = validateStatusTransition('running', 'failed');
      expect(result.valid).toBe(true);
    });

    it('idle → running is INVALID (must go through queued)', () => {
      const result = validateStatusTransition('idle', 'running');
      expect(result.valid).toBe(false);
    });

    it('idle has valid next statuses including queued', () => {
      const validNext = getValidNextStatuses('idle');
      expect(validNext).toContain('queued');
    });

    it('full lifecycle idle → queued → running → succeeded', () => {
      expect(validateStatusTransition('idle', 'queued').valid).toBe(true);
      expect(validateStatusTransition('queued', 'running').valid).toBe(true);
      expect(validateStatusTransition('running', 'succeeded').valid).toBe(true);
    });

    it('full lifecycle idle → queued → running → failed → idle', () => {
      expect(validateStatusTransition('idle', 'queued').valid).toBe(true);
      expect(validateStatusTransition('queued', 'running').valid).toBe(true);
      expect(validateStatusTransition('running', 'failed').valid).toBe(true);
      expect(validateStatusTransition('failed', 'idle').valid).toBe(true);
    });
  });

  describe('Node kind normalization', () => {
    it('normalizes legacy kind aliases', () => {
      expect(normalizeNodeKind('text')).toBe('Text');
      expect(normalizeNodeKind('image')).toBe('Image');
      expect(normalizeNodeKind('video')).toBe('Video');
      expect(normalizeNodeKind('audio')).toBe('Audio');
      expect(normalizeNodeKind('prompt')).toBe('Prompt');
      expect(normalizeNodeKind('text_to_image')).toBe('Image');
      expect(normalizeNodeKind('image_to_video')).toBe('Video');
      expect(normalizeNodeKind('audio_generate')).toBe('Audio');
    });

    it('normalizes status aliases', () => {
      expect(normalizeNodeStatus('completed')).toBe('succeeded');
      expect(normalizeNodeStatus('processing')).toBe('running');
      expect(normalizeNodeStatus('error')).toBe('failed');
      expect(normalizeNodeStatus('cancelled')).toBe('canceled');
      expect(normalizeNodeStatus('pending')).toBe('queued');
      expect(normalizeNodeStatus(undefined)).toBe('idle');
      expect(normalizeNodeStatus(null)).toBe('idle');
    });
  });

  describe('All canonical generator kinds are covered', () => {
    it('EXECUTABLE_GENERATOR_NODE_KINDS includes all expected kinds', () => {
      const kinds = [...EXECUTABLE_GENERATOR_NODE_KINDS];
      expect(kinds).toContain('Text');
      expect(kinds).toContain('Prompt');
      expect(kinds).toContain('Image');
      expect(kinds).toContain('Video');
      expect(kinds).toContain('Audio');
    });

    it('every generator kind has port configs', () => {
      for (const kind of EXECUTABLE_GENERATOR_NODE_KINDS) {
        expect(NODE_TYPE_CONFIGS[kind]).toBeDefined();
      }
    });

    it('every pass-through kind has port configs', () => {
      for (const kind of PASS_THROUGH_NODE_KINDS) {
        expect(NODE_TYPE_CONFIGS[kind]).toBeDefined();
      }
    });
  });
});
