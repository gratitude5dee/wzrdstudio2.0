/**
 * Strict Connection Validation Hook
 * 
 * Provides comprehensive validation for edge connections in the compute graph.
 * This hook ensures connections are validated at CREATION time (not just save time)
 * to prevent invalid edges from ever being added to the graph.
 */

import { useCallback } from 'react';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import { 
  type Port,
  type EdgeDefinition,
} from '@/types/computeFlow';
import { isTypeCompatible, validateConnection } from '@/utils/edgeValidation';

export interface StrictValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  suggestedFix?: {
    action: 'use_fallback_port' | 'remove_existing' | 'change_type';
    details: string;
  };
}

export interface ConnectionCandidate {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

/**
 * Hook providing strict validation for node connections
 * 
 * @example
 * ```tsx
 * const { validateNewEdge, canConnect, getCompatiblePorts } = useStrictConnectionValidation();
 * 
 * const handleConnect = (connection) => {
 *   const result = validateNewEdge(
 *     connection.source,
 *     connection.sourceHandle,
 *     connection.target,
 *     connection.targetHandle
 *   );
 *   
 *   if (!result.valid) {
 *     toast.error(result.error);
 *     return;
 *   }
 *   
 *   addEdge(connection);
 * };
 * ```
 */
export function useStrictConnectionValidation() {
  const { nodeDefinitions, edgeDefinitions } = useComputeFlowStore();
  
  /**
   * Validates a potential new edge with comprehensive checks
   */
  const validateNewEdge = useCallback((
    sourceNodeId: string,
    sourcePortId: string | null,
    targetNodeId: string,
    targetPortId: string | null
  ): StrictValidationResult => {
    if (!sourcePortId) {
      return { 
        valid: false, 
        error: 'Source port ID is required',
      };
    }
    if (!targetPortId) {
      return { 
        valid: false, 
        error: 'Target port ID is required',
      };
    }

    const sourceNode = nodeDefinitions.find(n => n.id === sourceNodeId);
    if (!sourceNode) {
      return { 
        valid: false, 
        error: `Source node not found: ${sourceNodeId}`,
      };
    }

    const targetNode = nodeDefinitions.find(n => n.id === targetNodeId);
    if (!targetNode) {
      return { 
        valid: false, 
        error: `Target node not found: ${targetNodeId}`,
      };
    }

    const sourcePort = sourceNode.outputs?.find(p => p.id === sourcePortId);
    if (!sourcePort) {
      const fallbackPort = sourceNode.outputs?.[0];
      if (fallbackPort) {
        return {
          valid: false,
          error: `Source port '${sourcePortId}' not found on node '${sourceNode.label}'`,
          suggestedFix: {
            action: 'use_fallback_port',
            details: `Use output port '${fallbackPort.id}' instead`
          }
        };
      }
      return {
        valid: false,
        error: `Source node '${sourceNode.label}' has no output ports`,
      };
    }

    const targetPort = targetNode.inputs?.find(p => p.id === targetPortId);
    if (!targetPort) {
      const fallbackPort = targetNode.inputs?.[0];
      if (fallbackPort) {
        return {
          valid: false,
          error: `Target port '${targetPortId}' not found on node '${targetNode.label}'`,
          suggestedFix: {
            action: 'use_fallback_port',
            details: `Use input port '${fallbackPort.id}' instead`
          }
        };
      }
      return {
        valid: false,
        error: `Target node '${targetNode.label}' has no input ports`,
      };
    }

    const warnings: string[] = [];
    if (sourcePort.position === 'left' || sourcePort.position === 'top') {
      warnings.push('Source port appears to be an input port based on position');
    }
    if (targetPort.position === 'right' || targetPort.position === 'bottom') {
      warnings.push('Target port appears to be an output port based on position');
    }

    const canonicalResult = validateConnection({
      sourceNode,
      sourcePort,
      targetNode,
      targetPort,
      existingEdges: edgeDefinitions,
    });

    if (!canonicalResult.valid) {
      return {
        valid: false,
        error: canonicalResult.error,
        warnings: warnings.length > 0 ? warnings : undefined,
        suggestedFix:
          canonicalResult.error?.includes('already connected')
            ? {
                action: 'remove_existing',
                details: 'Remove the existing connection and try again.',
              }
            : undefined,
      };
    }

    return { 
      valid: true, 
      warnings: warnings.length > 0 ? warnings : undefined 
    };
  }, [nodeDefinitions, edgeDefinitions]);
  
  /**
   * Quick check if two nodes can be connected (any ports)
   */
  const canConnect = useCallback((
    sourceNodeId: string,
    targetNodeId: string
  ): boolean => {
    const sourceNode = nodeDefinitions.find(n => n.id === sourceNodeId);
    const targetNode = nodeDefinitions.find(n => n.id === targetNodeId);
    
    if (!sourceNode || !targetNode) return false;
    if (sourceNodeId === targetNodeId) return false;
    
    // Check if any output can connect to any input
    for (const output of sourceNode.outputs || []) {
      for (const input of targetNode.inputs || []) {
        if (isTypeCompatible(output.datatype, input.datatype)) {
          return true;
        }
      }
    }
    
    return false;
  }, [nodeDefinitions]);
  
  /**
   * Get all compatible target ports for a given source port
   */
  const getCompatiblePorts = useCallback((
    sourceNodeId: string,
    sourcePortId: string
  ): Array<{ nodeId: string; port: Port; reason: string }> => {
    const sourceNode = nodeDefinitions.find(n => n.id === sourceNodeId);
    if (!sourceNode) return [];
    
    const sourcePort = sourceNode.outputs?.find(p => p.id === sourcePortId);
    if (!sourcePort) return [];
    
    const compatible: Array<{ nodeId: string; port: Port; reason: string }> = [];
    
    for (const targetNode of nodeDefinitions) {
      if (targetNode.id === sourceNodeId) continue;
      
      for (const targetPort of targetNode.inputs || []) {
        if (isTypeCompatible(sourcePort.datatype, targetPort.datatype)) {
          // Check if not already connected (for cardinality: 1)
          const existingConnection = edgeDefinitions.find(
            e => e.target.nodeId === targetNode.id && e.target.portId === targetPort.id
          );
          
          if (targetPort.cardinality === 'n' || !existingConnection) {
            const reason = sourcePort.datatype === targetPort.datatype
              ? 'Exact type match'
              : sourcePort.datatype === 'text'
                ? 'Text is universally compatible'
                : targetPort.datatype === 'any'
                  ? 'Target accepts any type'
                  : 'Compatible types';
            
            compatible.push({
              nodeId: targetNode.id,
              port: targetPort,
              reason
            });
          }
        }
      }
    }
    
    return compatible;
  }, [nodeDefinitions, edgeDefinitions]);
  
  /**
   * Validates an entire edge definition object
   */
  const validateEdgeDefinition = useCallback((edge: EdgeDefinition): StrictValidationResult => {
    return validateNewEdge(
      edge.source.nodeId,
      edge.source.portId,
      edge.target.nodeId,
      edge.target.portId
    );
  }, [validateNewEdge]);
  
  /**
   * Validates a batch of edges (for import/paste operations)
   */
  const validateEdgeBatch = useCallback((
    edges: EdgeDefinition[]
  ): { valid: EdgeDefinition[]; invalid: Array<{ edge: EdgeDefinition; error: string }> } => {
    const valid: EdgeDefinition[] = [];
    const invalid: Array<{ edge: EdgeDefinition; error: string }> = [];
    
    for (const edge of edges) {
      const result = validateEdgeDefinition(edge);
      if (result.valid) {
        valid.push(edge);
      } else {
        invalid.push({ edge, error: result.error || 'Unknown validation error' });
      }
    }
    
    return { valid, invalid };
  }, [validateEdgeDefinition]);
  
  return {
    validateNewEdge,
    validateEdgeDefinition,
    validateEdgeBatch,
    canConnect,
    getCompatiblePorts,
  };
}

export default useStrictConnectionValidation;
