import { Controller, Get, Query } from '@nestjs/common';
import { LostArkService } from './lostark.service';

@Controller('api/lostark')
export class LostArkController {
  constructor(private readonly lostArkService: LostArkService) {}

  @Get('character-info')
  async getPlayerInfo(@Query('name') name: string) {
    return await this.lostArkService.getPlayerInfo(name);
  }
}