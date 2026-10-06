import type { Dimensions, PackingItem, PackingPlan, Placement, Risk, Suitcase } from './models';

/** 装箱单上一件已装物品的行数据；编号按引擎摆放顺序从 1 连续生成。 */
export interface PackedEntry {
  number: number;
  item: PackingItem;
  placement: Placement;
  /** 实际摆放方向，例如「原向」或「竖放（长↔高）」。 */
  orientation: string;
  /** 摆放位置描述，含坐标原点说明与所在层高。 */
  location: string;
}

/** 未装入物品的行数据，保留引擎给出的原因。 */
export interface OmittedEntry {
  number: number;
  item: PackingItem;
  reason: string;
  mustHave: boolean;
}

/**
 * 打印装箱单：在发起打印那一刻对方案与物品信息做的不可变快照。
 * 打印准备期间切换策略或编辑清单都不会影响这里的数据。
 */
export interface PackingSheet {
  plan: PackingPlan;
  suitcase: Suitcase;
  items: PackingItem[];
  risks: Risk[];
  packed: PackedEntry[];
  omitted: OmittedEntry[];
  /** 必带但未装入的物品，单独标明。 */
  missingMustHave: OmittedEntry[];
  generatedAt: number;
}

type Axis = 'length' | 'width' | 'height';

const AXES: Axis[] = ['length', 'width', 'height'];
const AXIS_LABEL: Record<Axis, string> = { length: '长', width: '宽', height: '高' };

/** 找到放置后各箱轴分别取自物品原始哪个轴，并生成可核对的方向描述。 */
export function describeOrientation(item: Dimensions, placed: Dimensions): string {
  const permutation = AXES.map((boxAxis) =>
    AXES.find((sourceAxis) => item[sourceAxis] === placed[boxAxis]) ?? boxAxis,
  );
  const sizeText = `放置尺寸 ${placed.length}×${placed.width}×${placed.height} cm（原尺寸 ${item.length}×${item.width}×${item.height} cm）`;
  if (permutation.join(',') === 'length,width,height') return `原向摆放，${sizeText}`;
  const mapping = `箱长取原${AXIS_LABEL[permutation[0]]}、箱宽取原${AXIS_LABEL[permutation[1]]}、箱高取原${AXIS_LABEL[permutation[2]]}`;
  return `旋转摆放（${mapping}），${sizeText}`;
}

/** 以物品中心高度判断所在层：0–33% 下层、33–66% 中层、其余上层。 */
export function describeZone(placement: Placement, suitcase: Suitcase): string {
  const centerRatio = (placement.z + placement.dimensions.height / 2) / suitcase.height;
  if (centerRatio <= 1 / 3) return '下层';
  if (centerRatio <= 2 / 3) return '中层';
  return '上层';
}

function describeLocation(placement: Placement, suitcase: Suitcase): string {
  const zone = describeZone(placement, suitcase);
  return `原点（左下后角）长向 ${round1(placement.x)}、宽向 ${round1(placement.y)}、高起 ${round1(placement.z)} cm · ${zone}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 依据当前方案构建打印装箱单。调用方应在用户发起打印时一次性传入方案、物品、
 * 行李箱与风险结果并冻结返回值；之后界面上的任何变更都不得回写这份单据。
 */
export function buildPackingSheet(plan: PackingPlan, suitcase: Suitcase, items: PackingItem[], risks: Risk[], now: () => number = Date.now): PackingSheet {
  const byId = new Map(items.map((item) => [item.id, item]));

  const packed: PackedEntry[] = plan.placements.map((placement, index) => {
    const item = byId.get(placement.itemId);
    const fallback: PackingItem = {
      id: placement.itemId, name: `物品 ${placement.itemId}`, category: '',
      length: placement.dimensions.length, width: placement.dimensions.width, height: placement.dimensions.height,
      weight: 0, priority: 2, mustHave: false,
    };
    const resolved = item ?? fallback;
    return {
      number: index + 1,
      item: resolved,
      placement,
      orientation: describeOrientation(resolved, placement.dimensions),
      location: describeLocation(placement, suitcase),
    };
  });

  const omitted: OmittedEntry[] = plan.unplaced.map(({ item, reason }, index) => ({
    number: index + 1,
    item,
    reason,
    mustHave: item.mustHave,
  }));
  const missingMustHave = omitted.filter((entry) => entry.mustHave);

  return {
    plan,
    suitcase,
    items,
    risks,
    packed,
    omitted,
    missingMustHave,
    generatedAt: now(),
  };
}

export function formatPrintedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
