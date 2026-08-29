import type {MockFixtures} from '../../providers/contracts';

/** Mock 模式下手绘攻略工作流的可复现预置数据；键与 TRAVEL_GUIDE_FIXTURE_KEYS 对应。 */
export const TRAVEL_GUIDE_MOCK_FIXTURES: MockFixtures = {
  text: {
    'travel-guide.trip': {
      trip: {
        destination: '成都',
        days: 2,
        vibe: '一座把慢刻进烟火里的城市',
        toc_note: '两天一夜：古城漫游 + 熊猫与市井，照着走就行',
      },
      cover: {
        title_line1: '成都',
        title_line2: '两天一夜漫游',
        subtitle: '一座来了就不想走的城市',
        top_spots: [
          {name: '宽窄巷子', one_liner: '青砖灰瓦里的老成都生活标本'},
          {name: '人民公园', one_liner: '一杯盖碗茶坐一下午的本地日常'},
          {name: '大熊猫繁育研究基地', one_liner: '早上去看熊猫最活跃的干饭现场'},
          {name: '武侯祠', one_liner: '三国迷的红墙竹影打卡地'},
          {name: '锦里', one_liner: '灯笼亮起来后的川西夜市感'},
          {name: '东郊记忆', one_liner: '老厂房改的文艺聚集地'},
        ],
      },
      days: [
        {
          day: 1,
          theme: '古城漫游',
          slogan: '把一天过慢，才算来过成都',
          route: [
            {
              order: 1,
              spot: '人民公园',
              desc: '本地人的晨间客厅，鹤鸣茶社的竹椅盖碗茶一坐就是半天。来这里先学成都的慢。',
              illustration: '竹椅盖碗茶与采耳师傅',
              feature: '市井茶馆',
              hours: '以现场公告为准',
              ticket: '免费',
              recommend: '点一杯素毛峰配钟水饺，看大爷下棋',
            },
            {
              order: 2,
              spot: '宽窄巷子',
              desc: '清代街区改的步行巷，三条巷子各有性格。游客多但巷子深处仍有安静铺子。',
              illustration: '青砖灰瓦的老巷门洞',
              feature: '清代街巷',
              hours: '全天开放',
              ticket: '免费',
              recommend: '早上九点前拍照基本没人',
            },
            {
              order: 3,
              spot: '武侯祠',
              desc: '诸葛亮的家庙，红墙夹道是全成都最出片的机位。三国迷可以待足两小时。',
              illustration: '红墙竹影小径',
              feature: '三国圣地',
              hours: '以现场公告为准',
              ticket: '以现场为准',
              recommend: '红墙竹影在惠陵旁，上午顺光',
            },
            {
              order: 4,
              spot: '锦里',
              desc: '武侯祠旁的川西夜市街，天黑灯笼亮起才最好看。晚饭加夜逛一站解决。',
              illustration: '红灯笼下的川西街市',
              feature: '川西夜市',
              hours: '以现场公告为准',
              ticket: '免费',
              recommend: '张飞牛肉和三大炮边走边吃',
            },
          ],
          links: [
            {from: 1, to: 2, mode: '步行', duration: '约15min'},
            {from: 2, to: 3, mode: '公交', duration: '约20min'},
            {from: 3, to: 4, mode: '步行', duration: '约3min'},
          ],
          tips: [
            '第一天别排太满，茶馆本身就是行程',
            '武侯祠下午四点后旅行团少很多',
            '穿好走的鞋，今天全程靠腿',
          ],
        },
        {
          day: 2,
          theme: '熊猫与市井',
          slogan: '看完熊猫再嗦碗粉，此行圆满',
          route: [
            {
              order: 1,
              spot: '大熊猫繁育研究基地',
              desc: '全球最大的熊猫家，早上的熊猫最活跃。开园就冲月亮产房。',
              illustration: '啃竹子的圆滚滚熊猫',
              feature: '熊猫专属',
              hours: '以现场公告为准',
              ticket: '以现场为准',
              recommend: '七点半排队入园直奔月亮产房',
            },
            {
              order: 2,
              spot: '东郊记忆',
              desc: '红砖厂房改的艺术区，展览和小店都好逛。适合消磨等高铁前的半天。',
              illustration: '红砖厂房与涂鸦墙',
              feature: '文艺园区',
              hours: '全天开放',
              ticket: '免费',
              recommend: '中央火车头是必拍机位',
            },
            {
              order: 3,
              spot: '建设路小吃街',
              desc: '电子科大旁的学生胃天堂，一整条街都是老字号。',
              illustration: '冒着热气的小吃摊',
              feature: '小吃聚集',
              hours: '以现场公告为准',
              ticket: '免费',
              recommend: '蛋烘糕和傅记排骨二选一必排',
            },
            {
              order: 4,
              spot: '望平街香香巷',
              desc: '藏在巷子里的成都味收尾站，一条窄巷全是馆子。',
              illustration: '挂满灯笼的窄巷招牌',
              feature: '本地食巷',
              hours: '以现场公告为准',
              ticket: '免费',
              recommend: '何四孃冷锅串串收尾最稳',
            },
          ],
          links: [
            {from: 1, to: 2, mode: '地铁', duration: '约40min'},
            {from: 2, to: 3, mode: '地铁', duration: '约25min'},
            {from: 3, to: 4, mode: '步行', duration: '约12min'},
          ],
          tips: [
            '熊猫基地要趁早，九点后熊猫开始睡',
            '第二天行李可寄存酒店前台',
            '返程高铁留出四十分钟地铁时间',
          ],
        },
      ],
      transport: {
        arrival: [
          {way: '天府机场→市区', detail: '地铁18号线直达，约40分钟'},
          {way: '双流机场→市区', detail: '地铁10号线转3号线，约30分钟'},
          {way: '高铁成都东站', detail: '地铁2号线覆盖主要景点，约20分钟到春熙路'},
        ],
        local: [
          {way: '地铁', detail: '景点覆盖率高，扫码乘车最方便'},
          {way: '共享单车', detail: '老城区巷子多，短途骑车比打车快'},
          {way: '出租车', detail: '起步价友好，高峰期留意拥堵'},
          {way: '景区直通车', detail: '宽窄巷子、熊猫基地有官方直通车'},
        ],
        pitfall: '别在景区门口上"黑车"，用打车软件叫车更稳',
        slogan: '落地不慌，市内不赶',
      },
      stay: {
        areas: [
          {
            area: '春熙路太古里',
            fit: '首次来成都的游客',
            why: '地铁2/3号线交汇，去哪都方便，晚上下楼就是商圈',
          },
          {
            area: '宽窄巷子周边',
            fit: '喜欢老城氛围的慢游党',
            why: '步行可达人民公园和宽窄巷子，早上能赶人少时段',
          },
          {
            area: '成都东站周边',
            fit: '行程紧凑的过夜中转',
            why: '赶早班高铁不折腾，往返机场也顺路',
          },
        ],
        tiers: [
          {tier: '经济', range: '连锁酒店为主，交通便利的地段性价比高'},
          {tier: '舒适', range: '设计感酒店和老宅改造民宿，体验感最好'},
          {tier: '品质', range: '太古里商圈高星酒店，服务与位置都在线'},
        ],
        logic: '首次来选春熙路，二刷选宽窄巷子周边，中转过夜选成都东站周边',
        slogan: '住对地方，每天多睡半小时',
      },
      food: {
        items: [
          {name: '钟水饺', eat: '红油甜辣口的窄皮水饺', where: '人民公园附近的百年老字号'},
          {name: '蛋烘糕', eat: '边烘边吃的成都传统小点心', where: '建设路小吃街现做现卖'},
          {name: '冷锅串串', eat: '不冒烟的红油串串，随取随吃', where: '香香巷的孃孃店最稳'},
          {name: '甜水面', eat: '粗面配甜辣复合酱，一根管饱', where: '洞子口老字号排队那家'},
          {name: '三大炮', eat: '糯米团砸出的三声脆响', where: '锦里入口现做现卖'},
          {name: '盖碗茶', eat: '素毛峰配瓜子，坐一下午', where: '人民公园鹤鸣茶社'},
          {name: '麻辣兔头', eat: '麻辣入骨的追剧神器', where: '双流老妈兔头各分店'},
        ],
        slogan: '辣是底线，慢是灵魂',
      },
    },
    'travel-guide.copy': {
      titles: [
        '成都两天一夜这样走，人均不到600',
        '成都懒人攻略：跟着手绘地图走就行',
        '第一次去成都，照这篇走不踩坑',
      ],
      body:
        '周末逃离计划，成都真的太适合了。\n整理成了一套手绘攻略：封面是值得去的全景，中间是每日路线图，还有交通住宿美食三张专题，建议收藏。\n宽窄巷子的清晨和熊猫的干饭现场，图里见。\n照着 Day1 走基本不用动脑。\n去过成都的来补充一条～',
      tags: [
        '#旅行攻略',
        '#旅行清单',
        '#成都旅行',
        '#成都旅游攻略',
        '#成都美食',
        '#周末去哪儿',
        '#两天一夜',
        '#城市漫游',
        '#四川旅行',
      ],
    },
  },
  search: {
    'travel-guide.search': {
      results: [
        {
          title: '成都两天一夜经典路线（2026最新）',
          content:
            '宽窄巷子建议早上九点前入园人少；大熊猫繁育研究基地开园即入直奔月亮产房，下午熊猫多在睡觉。',
          link: 'https://example.com/chengdu-2d1n',
          media: '马蜂窝',
          publishDate: '2026-07-12',
        },
        {
          title: '成都地铁直达景点盘点',
          content: '地铁2号线串联人民公园、春熙路、成都东站；熊猫基地可乘3号线转景区摆渡车。',
          link: 'https://example.com/chengdu-metro',
          media: '成都发布',
          publishDate: '2026-06-30',
        },
        {
          title: '鹤鸣茶社营业时间与人均',
          content: '人民公园鹤鸣茶社营业时间约7:00-22:00，盖碗茶人均30元起，旺季午后需等位。',
          link: 'https://example.com/heming-tea',
          media: '大众点评',
          publishDate: '2026-05-18',
        },
      ],
    },
  },
};
