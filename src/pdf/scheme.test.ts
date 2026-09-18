import { describe, expect, it } from 'vitest';
import {
  buildScheme,
  countSchemeBoxes,
  MERGE_TOLERANCE,
  mergeScheme,
  parseScheme,
  schemeToRedactionMap,
  serializeScheme,
  validateSchemeMatch,
  SCHEME_FORMAT,
  SCHEME_VERSION,
  SchemeError,
} from './scheme';
import type { RedactionMap } from '../types';

const HASH = 'a'.repeat(64);
const SIZES = [
  { width: 612, height: 792 },
  { width: 792, height: 612 },
];

const redactions: RedactionMap = {
  1: [{ id: 'b1', x1: 10, y1: 20, x2: 110, y2: 70, review: 'approved' }],
  2: [
    { id: 'b2', x1: 0, y1: 0, x2: 50, y2: 50, review: 'pending' },
    { id: 'b3', x1: 100.5, y1: 300.25, x2: 200, y2: 400, review: 'needs-adjustment' },
  ],
};

function build() {
  return buildScheme(HASH, 'secret.pdf', 2, SIZES, redactions);
}

const parse = (s: ReturnType<typeof build>) => parseScheme(serializeScheme(s));

describe('buildScheme / 序列化往返', () => {
  it('每页一条记录（含无遮盖页），页码连续从 1 开始', () => {
    const s = buildScheme(HASH, 'x.pdf', 3, [
      { width: 100, height: 200 },
      { width: 100, height: 200 },
      { width: 100, height: 200 },
    ], { 2: [{ id: 'a', x1: 1, y1: 1, x2: 2, y2: 2, review: 'pending' }] });
    expect(s.pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(s.pages[0].boxes).toEqual([]);
    expect(s.pages[2].boxes).toEqual([]);
    expect(s.pages[1].boxes).toHaveLength(1);
    expect(s.format).toBe(SCHEME_FORMAT);
    expect(s.version).toBe(SCHEME_VERSION);
    expect(s.sourceHash).toBe(HASH);
    expect(s.numPages).toBe(3);
  });

  it('越界坐标被夹回页面范围，退化矩形不写入', () => {
    const map: RedactionMap = {
      1: [
        { id: 'ok', x1: -5, y1: 10, x2: 700, y2: 500, review: 'pending' }, // 夹到 [0,10]-[612,500]
        { id: 'degenerate', x1: 10, y1: 10, x2: 10, y2: 40, review: 'pending' }, // 宽 0，丢弃
      ],
    };
    const s = buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], map);
    expect(s.pages[0].boxes).toEqual([{ x1: 0, y1: 10, x2: 612, y2: 500, review: 'pending' }]);
  });

  it('序列化后可无损解析，矩形坐标与复核状态一致', () => {
    const s = parse(build());
    expect(s.pages[0].boxes).toEqual([{ x1: 10, y1: 20, x2: 110, y2: 70, review: 'approved' }]);
    expect(s.pages[1].boxes).toHaveLength(2);
    expect(s.pages[1].boxes[0].review).toBe('pending');
    expect(s.pages[1].boxes[1].review).toBe('needs-adjustment');
    expect(countSchemeBoxes(s)).toBe(3);
  });

  it('导出版本为当前版本（v2），每个框都带复核状态', () => {
    const s = build();
    expect(s.version).toBe(2);
    for (const p of s.pages) for (const b of p.boxes) expect(b.review).toBeDefined();
  });
});

describe('parseScheme 结构校验（格式损坏）', () => {
  const expectFormatError = (text: string, part?: string) => {
    try {
      parseScheme(text);
      throw new Error('应当抛出 SchemeError');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemeError);
      expect((e as SchemeError).kind).toBe('format');
      if (part) expect((e as Error).message).toContain(part);
    }
  };

  it('JSON 语法错误', () => {
    expectFormatError('{not json', 'JSON');
  });

  it('顶层不是对象 / 为数组', () => {
    expectFormatError('123');
    expectFormatError('[]');
    expectFormatError('null');
  });

  it('format 标识缺失或不符', () => {
    const s = build() as unknown as Record<string, unknown>;
    delete s.format;
    expectFormatError(JSON.stringify(s), 'format');
    s.format = 'something-else';
    expectFormatError(JSON.stringify(s), 'format');
  });

  it('版本不支持', () => {
    const s = build() as unknown as Record<string, unknown>;
    s.version = 99;
    expectFormatError(JSON.stringify(s), '版本');
  });

  it('v2 方案的遮盖框复核状态缺失或非法时拒绝导入', () => {
    const missing = JSON.parse(JSON.stringify(build()));
    delete missing.pages[0].boxes[0].review;
    expectFormatError(JSON.stringify(missing), '复核状态');

    const invalid = JSON.parse(JSON.stringify(build()));
    invalid.pages[0].boxes[0].review = 'maybe';
    expectFormatError(JSON.stringify(invalid), '复核状态');
  });

  it('v1 旧版方案（无复核状态字段）仍可导入，遮盖一律默认为待复核', () => {
    const v1 = JSON.parse(JSON.stringify(build()));
    v1.version = 1;
    for (const p of v1.pages) for (const b of p.boxes) delete b.review;
    const s = parseScheme(JSON.stringify(v1));
    expect(s.version).toBe(1);
    for (const p of s.pages) {
      for (const b of p.boxes) expect(b.review).toBe('pending');
    }
    // 文档匹配与替换应用不受影响
    expect(() => validateSchemeMatch(s, HASH, SIZES)).not.toThrow();
    const map = schemeToRedactionMap(s);
    expect(map[1][0].review).toBe('pending');
    expect(map[2][1].review).toBe('pending');
  });

  it('哈希不是 64 位十六进制', () => {
    const s = build() as unknown as Record<string, unknown>;
    s.sourceHash = 'XYZ';
    expectFormatError(JSON.stringify(s), '哈希');
    s.sourceHash = 'A'.repeat(64); // 大写也拒绝，导出恒为小写
    expectFormatError(JSON.stringify(s), '哈希');
  });

  it('页数无效或与页面条目数不一致', () => {
    const s = build() as unknown as Record<string, unknown>;
    s.numPages = 0;
    expectFormatError(JSON.stringify(s), '页数');
    const s2 = build() as unknown as Record<string, unknown>;
    s2.numPages = 1;
    expectFormatError(JSON.stringify(s2), '不一致');
  });

  it('页面记录页码不连续、尺寸无效、boxes 非数组均拒绝', () => {
    const s = build();
    const broken1 = JSON.parse(JSON.stringify(s));
    broken1.pages[1].page = 5;
    expectFormatError(JSON.stringify(broken1), '页码');

    const broken2 = JSON.parse(JSON.stringify(s));
    broken2.pages[0].width = -1;
    expectFormatError(JSON.stringify(broken2), '尺寸');

    const broken3 = JSON.parse(JSON.stringify(s));
    broken3.pages[0].boxes = null;
    expectFormatError(JSON.stringify(broken3), '遮盖框');
  });

  it('遮盖框坐标缺失 / 非数字 / NaN / 颠倒 / 零宽均拒绝', () => {
    const boxCases: unknown[] = [
      { y1: 1, x2: 2, y2: 3 },
      { x1: '1', y1: 1, x2: 2, y2: 3 },
      { x1: NaN, y1: 1, x2: 2, y2: 3 },
      { x1: 2, y1: 1, x2: 2, y2: 3 }, // 零宽
      { x1: 5, y1: 6, x2: 2, y2: 3 }, // 颠倒
    ];
    for (const b of boxCases) {
      const broken = JSON.parse(JSON.stringify(build()));
      broken.pages[0].boxes.push(b);
      expectFormatError(JSON.stringify(broken));
    }
  });
});

describe('validateSchemeMatch 文档匹配', () => {
  const expectMismatch = (
    s: ReturnType<typeof build>,
    hash: string,
    sizes: { width: number; height: number }[],
    part?: string,
  ) => {
    try {
      validateSchemeMatch(s, hash, sizes);
      throw new Error('应当抛出 SchemeError');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemeError);
      expect((e as SchemeError).kind).toBe('mismatch');
      if (part) expect((e as Error).message).toContain(part);
    }
  };

  it('哈希一致、页数尺寸一致时通过', () => {
    expect(() => validateSchemeMatch(build(), HASH, SIZES)).not.toThrow();
  });

  it('源文件哈希不符 → 文档不匹配（不是格式错误）', () => {
    expectMismatch(build(), 'b'.repeat(64), SIZES, '哈希');
  });

  it('页数不符', () => {
    expectMismatch(build(), HASH, [SIZES[0]], '页数');
  });

  it('某页尺寸不符', () => {
    expectMismatch(
      build(),
      HASH,
      [SIZES[0], { width: 792, height: 613 }],
      '第 2 页尺寸',
    );
  });

  it('矩形超出页面边界（结构合法但文档不匹配）', () => {
    const s = build();
    s.pages[0].boxes.push({ x1: 10, y1: 10, x2: 612.5, y2: 50, review: 'pending' });
    // 超出 0.01 容差
    expectMismatch(s, HASH, SIZES, '边界');
  });

  it('矩形仅越界 0.01 点容差以内仍通过', () => {
    const s = build();
    s.pages[0].boxes.push({ x1: 0, y1: 0, x2: 612 + MERGE_TOLERANCE, y2: 50, review: 'pending' });
    expect(() => validateSchemeMatch(s, HASH, SIZES)).not.toThrow();
  });

  it('结构错误与文档不匹配是两种不同错误类别', () => {
    const format = parseScheme.bind(null, '{bad');
    let fErr: unknown;
    try {
      format();
    } catch (e) {
      fErr = e;
    }
    let mErr: unknown;
    try {
      validateSchemeMatch(build(), 'c'.repeat(64), SIZES);
    } catch (e) {
      mErr = e;
    }
    expect((fErr as SchemeError).kind).toBe('format');
    expect((mErr as SchemeError).kind).toBe('mismatch');
  });
});

describe('应用方案：替换', () => {
  it('替换后只包含方案中的遮盖，id 全部重新生成，复核状态随方案保留', () => {
    const s = parse(build());
    const map = schemeToRedactionMap(s);
    expect(Object.keys(map).sort()).toEqual(['1', '2']);
    expect(map[1]).toHaveLength(1);
    expect(map[2]).toHaveLength(2);
    expect(map[1][0].id).not.toBe('b1');
    expect(map[2][0].x1).toBe(0);
    expect(map[1][0].review).toBe('approved');
    expect(map[2][0].review).toBe('pending');
    expect(map[2][1].review).toBe('needs-adjustment');
  });

  it('空方案替换为空 map', () => {
    const s = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {}));
    expect(schemeToRedactionMap(s)).toEqual({});
  });
});

describe('应用方案：合并去重（按页，容差 0.01）', () => {
  it('无重复时全部追加（复核状态随方案保留），现有遮盖保持不变', () => {
    const s = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'in', x1: 300, y1: 300, x2: 400, y2: 400, review: 'approved' }],
    }));
    const base: RedactionMap = {
      1: [{ id: 'old', x1: 10, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    };
    const { map, added, skipped, tightened } = mergeScheme(base, s);
    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(tightened).toBe(0);
    expect(map[1]).toHaveLength(2);
    expect(map[1][0].id).toBe('old');
    expect(map[1][0].review).toBe('pending');
    expect(map[1][1].review).toBe('approved');
  });

  it('坐标完全相同的矩形按页去重', () => {
    const s = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'dup', x1: 10, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    }));
    const base: RedactionMap = {
      1: [{ id: 'old', x1: 10, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    };
    const { map, added, skipped } = mergeScheme(base, s);
    expect(added).toBe(0);
    expect(skipped).toBe(1);
    expect(map[1]).toHaveLength(1);
    expect(map[1][0].id).toBe('old');
  });

  it('重复框保留较严格的复核状态（需调整 > 待复核 > 已通过）', () => {
    // 现有「已通过」，方案同位置框「待复核」→ 结果收紧为待复核
    const sPending = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'in', x1: 10, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    }));
    const baseApproved: RedactionMap = {
      1: [{ id: 'old', x1: 10, y1: 10, x2: 60, y2: 60, review: 'approved' }],
    };
    const r1 = mergeScheme(baseApproved, sPending);
    expect(r1.added).toBe(0);
    expect(r1.tightened).toBe(1);
    expect(r1.map[1][0].review).toBe('pending');

    // 现有「待复核」，方案同位置框「已通过」→ 保持较严格的待复核，不计入收紧
    const sApproved = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'in', x1: 10, y1: 10, x2: 60, y2: 60, review: 'approved' }],
    }));
    const basePending: RedactionMap = {
      1: [{ id: 'old', x1: 10, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    };
    const r2 = mergeScheme(basePending, sApproved);
    expect(r2.tightened).toBe(0);
    expect(r2.map[1][0].review).toBe('pending');

    // 任一侧为「需调整」时结果必为需调整
    const sAdjust = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'in', x1: 10, y1: 10, x2: 60, y2: 60, review: 'needs-adjustment' }],
    }));
    const r3 = mergeScheme(baseApproved, sAdjust);
    expect(r3.map[1][0].review).toBe('needs-adjustment');
    expect(r3.tightened).toBe(1);
    const r4 = mergeScheme(
      { 1: [{ id: 'old', x1: 10, y1: 10, x2: 60, y2: 60, review: 'needs-adjustment' }] },
      sApproved,
    );
    expect(r4.map[1][0].review).toBe('needs-adjustment');
    expect(r4.tightened).toBe(0);
  });

  it('四角差值均在 0.01 容差内视为重复；任一坐标超出即保留', () => {
    const near: RedactionMap = {
      1: [{ id: 'old', x1: 10, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    };
    const sNear = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'in', x1: 10.009, y1: 9.999, x2: 60.01, y2: 59.995, review: 'pending' }],
    }));
    expect(mergeScheme(near, sNear).added).toBe(0);

    const far: RedactionMap = {
      1: [{ id: 'old', x1: 10, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    };
    const sFar = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'in', x1: 10.02, y1: 10, x2: 60, y2: 60, review: 'pending' }],
    }));
    expect(mergeScheme(far, sFar).added).toBe(1);
  });

  it('去重按页进行：不同页上相同坐标不算重复', () => {
    const s = parse(buildScheme(HASH, 'x.pdf', 2, SIZES, {
      1: [{ id: 'a', x1: 1, y1: 1, x2: 2, y2: 2, review: 'pending' }],
      2: [{ id: 'b', x1: 1, y1: 1, x2: 2, y2: 2, review: 'pending' }],
    }));
    const base: RedactionMap = {
      1: [{ id: 'old', x1: 1, y1: 1, x2: 2, y2: 2, review: 'pending' }],
    };
    const { map, added, skipped } = mergeScheme(base, s);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(map[1]).toHaveLength(1);
    expect(map[2]).toHaveLength(1);
  });

  it('方案内部彼此重复的矩形也只保留一个', () => {
    const s = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [
        { id: 'a', x1: 1, y1: 1, x2: 2, y2: 2, review: 'pending' },
        { id: 'b', x1: 1, y1: 1, x2: 2, y2: 2, review: 'pending' },
      ],
    }));
    // buildScheme 不过滤重复（导出时保留），合并时去重
    const { map, added } = mergeScheme({}, s);
    expect(added).toBe(1);
    expect(map[1]).toHaveLength(1);
  });

  it('不修改输入的现有 map（不可变更新，支撑撤销）', () => {
    const s = parse(buildScheme(HASH, 'x.pdf', 1, [SIZES[0]], {
      1: [{ id: 'in', x1: 9, y1: 9, x2: 99, y2: 99, review: 'pending' }],
    }));
    const base: RedactionMap = {
      1: [{ id: 'old', x1: 1, y1: 1, x2: 2, y2: 2, review: 'pending' }],
    };
    const snapshot = JSON.stringify(base);
    mergeScheme(base, s);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
