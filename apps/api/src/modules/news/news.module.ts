import { Module } from '@nestjs/common';

import { CitiesModule } from '../cities/cities.module.js';
import { NewsController } from './news.controller.js';
import { NewsIngestService } from './news-ingest.service.js';
import { NewsIngestTask } from './news-ingest.task.js';
import { NewsService } from './news.service.js';

@Module({
  imports: [CitiesModule],
  controllers: [NewsController],
  providers: [NewsService, NewsIngestService, NewsIngestTask],
})
export class NewsModule {}
