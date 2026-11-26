/**
 * /trader 로그인 비밀번호 해시 생성기.
 *
 *   npm run trader:hash-password
 *
 * 비밀번호는 셸 기록에 남지 않도록 인자가 아니라 표준입력으로 받는다.
 * 출력된 해시를 TRADER_ADMIN_PASSWORD_HASH 에 넣는다 (평문은 어디에도 저장하지 않는다).
 */
import { createInterface } from "node:readline/promises";

import { hashPassword } from "../src/modules/trader/traderAuth.service.js";

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  // 입력한 글자가 화면에 보이지 않게 한다
  const out = rl as unknown as { _writeToOutput: (s: string) => void };
  const write = out._writeToOutput.bind(rl);
  let muted = false;
  out._writeToOutput = (s: string) => {
    if (!muted) write(s);
  };
  const ask = async (q: string) => {
    process.stderr.write(q);
    muted = true;
    const v = await rl.question("");
    muted = false;
    process.stderr.write("\n");
    return v;
  };
  const a = await ask("비밀번호 (12자 이상): ");
  const b = await ask("한 번 더: ");
  rl.close();
  if (a !== b) throw new Error("두 입력이 다르다");
  return a;
}

const hash = await hashPassword(await readPassword());
process.stdout.write(`${hash}\n`);
