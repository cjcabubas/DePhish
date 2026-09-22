// Public compatibility entry point; orchestration and risk policy are separate services.
export { linkRisk } from './riskService.js';
export { orchestrateScan } from './scanOrchestrator.js';
import { orchestrateScan } from './scanOrchestrator.js';
export async function assessScan(input, dependencies) {
  return (await orchestrateScan(input, dependencies)).report;
}
