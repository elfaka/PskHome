import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { map } from 'rxjs/operators';

@Injectable()
export class LostArkService {
  private readonly apiKey = process.env.LOSTARK_API_KEY;
  private readonly apiUrl = 'https://developer-lostark.game.onstove.com'; // LostArk API 기본 URL

  constructor(private readonly httpService: HttpService) {}

  async getPlayerInfo(playerName: string) {
    const url = `${this.apiUrl}/armories/characters/${playerName}`;
    return this.httpService
      .get(url, {
        headers: {
          accept: `application/json`,
          Authorization: `Bearer ${this.apiKey}`,
        },
      })
      .pipe(map((response) => response.data))
      .toPromise();
  }
}
