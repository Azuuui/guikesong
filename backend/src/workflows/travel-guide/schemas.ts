import {z} from 'zod';
import type {TravelGuideCopy, TravelGuideTrip} from '../../../../shared/workflows';
import {ApiError} from '../../http/apiError';

const nonEmpty = z.string().min(1);

/** 天数边界（见《生产线设计-目的地手绘旅游攻略》六、边界与校验）。 */
export const MIN_DAYS = 1;
export const MAX_DAYS = 3;

const routeStopSchema = z.object({
  order: z.number().int().min(1),
  spot: nonEmpty,
  desc: nonEmpty,
  illustration: nonEmpty,
  feature: nonEmpty,
  hours: nonEmpty,
  ticket: nonEmpty,
  recommend: nonEmpty,
});

const routeLinkSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
  mode: nonEmpty,
  duration: nonEmpty,
});

const dayPlanSchema = z.object({
  day: z.number().int().min(1),
  theme: nonEmpty,
  slogan: nonEmpty,
  route: z.array(routeStopSchema).min(4).max(6),
  links: z.array(routeLinkSchema).min(1),
  tips: z.array(nonEmpty).length(3),
});

const rawTripSchema = z.object({
  trip: z.object({
    destination: nonEmpty,
    days: z.number().int().min(1).max(9),
    vibe: nonEmpty,
    toc_note: nonEmpty,
  }),
  cover: z.object({
    title_line1: nonEmpty,
    title_line2: nonEmpty,
    subtitle: nonEmpty,
    top_spots: z.array(z.object({name: nonEmpty, one_liner: nonEmpty})).min(5).max(8),
  }),
  days: z.array(dayPlanSchema).min(1).max(9),
  transport: z.object({
    arrival: z.array(z.object({way: nonEmpty, detail: nonEmpty})).min(2).max(3),
    local: z.array(z.object({way: nonEmpty, detail: nonEmpty})).min(3).max(4),
    pitfall: nonEmpty,
    slogan: nonEmpty,
  }),
  stay: z.object({
    areas: z.array(z.object({area: nonEmpty, fit: nonEmpty, why: nonEmpty})).min(2).max(3),
    tiers: z.array(z.object({tier: nonEmpty, range: nonEmpty})).length(3),
    logic: nonEmpty,
    slogan: nonEmpty,
  }),
  food: z.object({
    items: z.array(z.object({name: nonEmpty, eat: nonEmpty, where: nonEmpty})).min(6).max(8),
    slogan: nonEmpty,
  }),
});

const rawCopySchema = z.object({
  titles: z.array(nonEmpty).min(1),
  body: nonEmpty,
  tags: z.array(nonEmpty).min(1),
});

function invalid(message: string): ApiError {
  return new ApiError(502, message, 'TRIP_INVALID');
}

export interface ParsedTravelGuideTrip {
  readonly trip: TravelGuideTrip;
  readonly warnings: string[];
}

/**
 * 解析并校验提示词一输出的行程 JSON。
 * 校验：结构完整、天数与天数数组长一致、每日路线 4~6 点、序号连续、
 * links 引用有效点位、名称不重复。通过后映射为共享契约的驼峰类型。
 * 天数超过 3 钳制为 3（丢弃多余天并打 warning）；天数小于 1 抛业务错误触发重试。
 */
export function parseTravelGuideTrip(value: unknown, destination: string): ParsedTravelGuideTrip {
  const result = rawTripSchema.safeParse(value);
  if (!result.success) {
    throw invalid('行程数据无效，请重试');
  }
  const raw = result.data;

  const problems: string[] = [];
  if (raw.days.length !== raw.trip.days) {
    problems.push('天数与行程天数不一致');
  }
  const daysSequential = raw.days.every((day, index) => day.day === index + 1);
  if (!daysSequential) {
    problems.push('天数序号不连续');
  }

  const topSpotNames = raw.cover.top_spots.map(spot => spot.name);
  if (new Set(topSpotNames).size !== topSpotNames.length) {
    problems.push('封面景点名重复');
  }
  const foodNames = raw.food.items.map(item => item.name);
  if (new Set(foodNames).size !== foodNames.length) {
    problems.push('美食名重复');
  }

  for (const day of raw.days) {
    const sequential = day.route.every((stop, index) => stop.order === index + 1);
    if (!sequential) {
      problems.push(`第 ${day.day} 天路线序号不连续`);
    }
    const spotNames = day.route.map(stop => stop.spot);
    if (new Set(spotNames).size !== spotNames.length) {
      problems.push(`第 ${day.day} 天景点名重复`);
    }
    const validLink = day.links.every(
      link =>
        link.from <= day.route.length &&
        link.to <= day.route.length &&
        link.from !== link.to,
    );
    if (!validLink) {
      problems.push(`第 ${day.day} 天交通衔接引用了不存在的点位`);
    }
  }

  if (problems.length > 0) {
    throw invalid(`行程数据无效：${problems.join('；')}，请重试`);
  }

  // 天数钳制：>3 收敛为 3，多余天数丢弃并打 warning
  const warnings: string[] = [];
  let days = raw.days;
  if (raw.trip.days > MAX_DAYS) {
    warnings.push(`模型建议游玩 ${raw.trip.days} 天，已按上限收敛为 ${MAX_DAYS} 天，多余行程未展示`);
    days = raw.days.slice(0, MAX_DAYS);
  }
  if (raw.trip.destination !== destination) {
    warnings.push(`模型输出的目的地与输入不一致，已按输入"${destination}"渲染`);
  }

  return {
    trip: {
      destination,
      days: days.length,
      vibe: raw.trip.vibe,
      tocNote: raw.trip.toc_note,
      cover: {
        titleLine1: raw.cover.title_line1,
        titleLine2: raw.cover.title_line2,
        subtitle: raw.cover.subtitle,
        topSpots: raw.cover.top_spots.map(spot => ({
          name: spot.name,
          oneLiner: spot.one_liner,
        })),
      },
      dayPlans: days.map(day => ({
        day: day.day,
        theme: day.theme,
        slogan: day.slogan,
        route: day.route,
        links: day.links,
        tips: day.tips,
      })),
      transport: {
        arrival: raw.transport.arrival,
        local: raw.transport.local,
        pitfall: raw.transport.pitfall,
        slogan: raw.transport.slogan,
      },
      stay: {
        areas: raw.stay.areas,
        tiers: raw.stay.tiers,
        logic: raw.stay.logic,
        slogan: raw.stay.slogan,
      },
      food: {
        items: raw.food.items,
        slogan: raw.food.slogan,
      },
    },
    warnings,
  };
}

/** 解析提示词四输出的发布文案。 */
export function parseTravelGuideCopy(value: unknown): TravelGuideCopy {
  const result = rawCopySchema.safeParse(value);
  if (!result.success) {
    throw new ApiError(502, '发布文案数据无效，请重试', 'COPY_INVALID');
  }
  return result.data;
}
