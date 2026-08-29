import type {MockFixtures} from '../../providers/contracts';

/** Mock 模式下小红书图鉴工作流的可复现预置数据；键与 XHS_ATLAS_FIXTURE_KEYS 对应。 */
export const XHS_ATLAS_MOCK_FIXTURES: MockFixtures = {
  text: {
    'xhs-atlas.list': {
      meta: {
        user_title: '贵阳的12种美食',
        count: 12,
        measure_word: '种',
        domain_type: '美食盘点',
        org_dimension: '按食用场景（早餐到宵夜）',
        theme_word: '美食',
        field_labels: ['怎么吃', '避坑'],
        motif: '一碗热气',
        palette: '美食暖橙',
        page_slogans: [
          '从早餐到宵夜的口福清单',
          '翻页之前先收藏',
          '越往后越好吃的都在图里',
          '夜宵党直接看最后一张',
          '每一张都值得亲自打卡',
          '吃遍贵阳，从这张图开始',
        ],
      },
      cover: {
        title_line1: '贵阳的',
        title_line2: '12种美食',
        highlight_word: '12种',
        sticky_note: '一共12种，从早吃到晚',
        bottom_slogan: '收藏这份清单，吃遍贵阳街头',
      },
      items: [
        {no: '01', tag: '早餐', name: '肠旺面', line1: '一碗红油里的贵阳早晨', line2: '先喝汤再吃面，血旺最后拌开', punch: '七点前去老店不用排长队', illustration_hint: '一碗红油肠旺面'},
        {no: '02', tag: '早餐', name: '牛肉粉', line1: '清汤党在贵阳的顶配选择', line2: '加一份卤牛筋，口感直接翻倍', punch: '认准花溪黄牛骨汤底', illustration_hint: '一碗清汤牛肉粉'},
        {no: '03', tag: '小吃', name: '丝娃娃', line1: '贵阳人的素菜春卷自由', line2: '素菜丝自己包，蘸水是灵魂', punch: '蘸水要加糊辣椒才地道', illustration_hint: '一张薄饼卷素菜丝'},
        {no: '04', tag: '小吃', name: '恋爱豆腐果', line1: '名字最浪漫的街头小吃', line2: '对半折开，夹折耳根蘸水', punch: '趁烫吃，凉了会有豆腥', illustration_hint: '一块烤金黄的豆腐'},
        {no: '05', tag: '小吃', name: '洋芋粑', line1: '土豆的贵阳式高光时刻', line2: '外层煎脆再蘸干辣椒面', punch: '街头小摊现煎的最好吃', illustration_hint: '一个煎土豆饼'},
        {no: '06', tag: '小吃', name: '烤脑花', line1: '夜宵摊的勇气挑战', line2: '锡纸烤透再撒折耳根碎', punch: '配蒜蓉辣椒解腻最稳', illustration_hint: '一勺锡纸烤脑花'},
        {no: '07', tag: '正餐', name: '酸汤鱼', line1: '红酸汤煮出的一口开胃', line2: '先喝汤再下鱼，蘸水配腐乳', punch: '凯里酸汤底的鱼最正', illustration_hint: '一锅红酸汤鱼'},
        {no: '08', tag: '正餐', name: '辣子鸡', line1: '糍粑辣椒炒出的干香', line2: '鸡块要炒到边角微焦', punch: '比川版更黏糊更下饭', illustration_hint: '一盘红油辣子鸡'},
        {no: '09', tag: '正餐', name: '糟辣脆哨', line1: '一碗粉面的隐藏灵魂', line2: '脆哨最后撒，保持酥脆', punch: '肥瘦三七开的脆哨最香', illustration_hint: '一撮金黄脆哨'},
        {no: '10', tag: '甜品', name: '玫瑰冰浆', line1: '夜市里的解辣救星', line2: '冰沙打得越细越挂碗', punch: '加糯米的版本更顶饱', illustration_hint: '一杯粉色冰沙'},
        {no: '11', tag: '甜品', name: '冰粉', line1: '辣到极限后的及时雨', line2: '红糖水搅匀再舀着吃', punch: '花生碎葡萄干是经典配置', illustration_hint: '一碗透明冰粉'},
        {no: '12', tag: '宵夜', name: '烙锅', line1: '一锅烙出来的深夜社交', line2: '食材蘸湿辣椒面再下锅烙', punch: '洋芋和臭豆腐必点', illustration_hint: '一口冒油的平底烙锅'},
      ],
    },
    'xhs-atlas.copy': {
      titles: ['贵阳12种美食全收录🤤', '跟着吃就对了！贵阳美食12连击', '本地人带路：贵阳12种必吃美食'],
      body:
        '去贵阳到底吃什么？这篇一次讲清楚。\n整理成了一套图：封面是12种美食全景图鉴，后面两页是逐条详解，建议先收藏再慢慢看。\n肠旺面的红油早晨、丝娃娃的素菜自由、烙锅的深夜烟火气，图里见。\n转发给饭搭子，照着吃就对了。\n你的No.1是哪一个？评论区聊聊～',
      tags: [
        '#干货分享',
        '#美食探店',
        '#贵阳美食',
        '#贵阳旅游',
        '#贵州旅行',
        '#美食攻略',
        '#街头小吃',
        '#探店清单',
        '#12种美食',
        '#早餐吃什么',
        '#夜宵推荐',
      ],
    },
  },
};
