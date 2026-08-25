import type { PsPostRow } from "../modules/pspost/psPost.types.js";

/**
 * 테스트용 인메모리 `psPost` 저장소.
 *
 * 기존 Java 테스트가 H2 인메모리 DB 로 확보하던 "실제 저장/조회까지 도는 통합 테스트"를
 * 외부 의존 없이 재현하기 위한 최소 구현이다.
 * 서비스가 실제로 호출하는 Prisma 메서드만 지원한다.
 */

type CreateArgs = {
  data: Partial<PsPostRow>;
  select?: Record<string, boolean>;
};

type FindManyArgs = {
  orderBy?: { createdAt?: "asc" | "desc" };
  skip?: number;
  take?: number;
};

type WhereId = { where: { id: bigint } };

type UpdateArgs = WhereId & {
  data: Partial<PsPostRow>;
  select?: Record<string, boolean>;
};

function pick(row: PsPostRow, select?: Record<string, boolean>) {
  if (!select) return { ...row };

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key as keyof PsPostRow];
  }
  return out;
}

export function createFakePrisma() {
  const rows: PsPostRow[] = [];
  let nextId = 1n;

  const psPost = {
    async create({ data, select }: CreateArgs) {
      const row: PsPostRow = {
        id: nextId++,
        title: data.title ?? null,
        site: data.site ?? null,
        problemNumber: data.problemNumber ?? null,
        link: data.link ?? null,
        level: data.level ?? null,
        language: data.language ?? null,
        solution: data.solution ?? null,
        contentMd: data.contentMd ?? null,
        isSolved: data.isSolved ?? null,
        createdAt: data.createdAt ?? new Date(),
      };

      rows.push(row);
      return pick(row, select);
    },

    async findMany({ orderBy, skip = 0, take }: FindManyArgs = {}) {
      let result = [...rows];

      if (orderBy?.createdAt) {
        const dir = orderBy.createdAt === "desc" ? -1 : 1;
        result.sort((a, b) => {
          const at = a.createdAt?.getTime() ?? 0;
          const bt = b.createdAt?.getTime() ?? 0;
          // 같은 밀리초에 생성된 행의 순서를 결정적으로 만들기 위해 id 를 보조 기준으로 쓴다.
          if (at !== bt) return (at - bt) * dir;
          return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * dir;
        });
      }

      result = result.slice(skip, take == null ? undefined : skip + take);
      return result.map((r) => ({ ...r }));
    },

    async count() {
      return rows.length;
    },

    async findUnique({ where, select }: WhereId & { select?: Record<string, boolean> }) {
      const row = rows.find((r) => r.id === where.id);
      return row ? pick(row, select) : null;
    },

    async update({ where, data, select }: UpdateArgs) {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`No PsPost found for id=${where.id}`);

      Object.assign(row, data);
      return pick(row, select);
    },

    async delete({ where }: WhereId) {
      const index = rows.findIndex((r) => r.id === where.id);
      if (index < 0) throw new Error(`No PsPost found for id=${where.id}`);

      const [removed] = rows.splice(index, 1);
      return { ...removed };
    },
  };

  return {
    psPost,
    async $disconnect() {},
    /** 테스트 편의용 — 저장된 원본 행 확인 */
    _rows: rows,
  };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
