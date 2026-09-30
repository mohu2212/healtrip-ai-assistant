import { Module } from '@nestjs/common';
import {
  DoctorsController,
  HospitalsController,
  SpecialtiesController,
} from './catalog.controllers.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';

@Module({
  controllers: [SpecialtiesController, DoctorsController, HospitalsController],
  providers: [CatalogRepository, CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
