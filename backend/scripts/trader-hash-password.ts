/**
 * /trader 로그인 비밀번호 해시 생성기.
 *
 *   npm run trader:hash-password
 *
 * 비밀번호는 셸 기록에 남지 않도록 인자가 아니라 표준입력으로 받는다.
 * 출력된 해시를 TRADER_ADMIN_PASSWORD_HASH 에 넣는다 (평문은 어디에도 저장하지 않는다).
 */
import { hashPassword } from "../src/modules/trader/traderAuth.service.js";

/**
 * 터미널에서 입력한 글자를 화면에 보이지 않게 한 줄 읽는다.
 * readline 의 내부 메서드(_writeToOutput)는 Node 버전마다 달라서(Node 24 에는 없다)
 * raw 모드로 직접 읽는다.
 */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    let value = "";
    const done = (err?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return done();
        if (ch === "\u0003") return done(new Error("취소했다")); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  const a = await askHidden("비밀번호 (12자 이상): ");
  const b = await askHidden("한 번 더: ");
  if (a !== b) throw new Error("두 입력이 다르다");
  return a;
}

const hash = await hashPassword(await readPassword());
process.stdout.write(`${hash}\n`);
