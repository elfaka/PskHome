import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LostArkController } from './lostark.controller';
import { LostArkService } from './lostark.service';

@Module({
  imports: [HttpModule], // Axios HttpModule을 가져옴
  controllers: [LostArkController], // 컨트롤러 연결
  providers: [LostArkService], // 서비스 연결
})
export class LostArkModule {}
