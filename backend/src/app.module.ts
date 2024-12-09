import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LostArkModule } from './lostark/lostark.module';
@Module({
  imports: [
    LostArkModule,
    ConfigModule.forRoot({isGlobal: true}),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
