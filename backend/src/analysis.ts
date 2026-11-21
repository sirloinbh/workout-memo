// Moved to shared/contract.ts (#452); re-exported so backend code keeps its imports.
export {
  type AnalysisSet,
  analyze,
  bodyPartMappingSchema,
  estimatedOneRepMax,
  type PersonalRecord,
} from './contract.js';
