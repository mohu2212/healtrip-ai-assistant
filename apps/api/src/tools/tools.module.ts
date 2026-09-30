import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { assessUrgencyTool } from './definitions/assess-urgency.tool.js';
import { createCatalogTools } from './definitions/catalog.tools.js';
import { ToolRegistry } from './tool-registry.js';

/** Builds the agent's toolset. The order is fixed so tool definitions are stable across requests. */
export function createToolRegistry(catalog: CatalogService): ToolRegistry {
  return new ToolRegistry([assessUrgencyTool, ...createCatalogTools(catalog)]);
}

@Module({
  imports: [CatalogModule],
  providers: [{ provide: ToolRegistry, inject: [CatalogService], useFactory: createToolRegistry }],
  exports: [ToolRegistry],
})
export class ToolsModule {}
