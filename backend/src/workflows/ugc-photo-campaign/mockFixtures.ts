import type {MockFixtures} from '../../providers/contracts';

/**
 * Mock 模式下照片心情图集工作流的可复现预置数据；键与 UGC_PHOTO_CAMPAIGN_FIXTURE_KEYS 对应。
 * 预置 3 张照片场景：Mock 端到端演示需上传 3 张投稿照片。
 */
export const UGC_PHOTO_CAMPAIGN_MOCK_FIXTURES: MockFixtures = {
  vision: {
    'ugc-photo-campaign.descriptions': {
      descriptions: [
        '清晨河面上的雾和独钓的小船',
        '夕阳下满载而归的渔船',
        '山间石桥上打伞的行人',
      ],
    },
  },
  text: {
    'ugc-photo-campaign.copy': {
      mood: '安静',
      titles: ['起雾的时候', '世界慢下来的样子', '吹了一下午的风'],
      body:
        '起雾的清晨，水面把世界调成了静音。\n一个人撑船，一个人看，谁也不打扰谁。\n傍晚的渔船回来，装着一天的收成，也装着一点疲倦。\n石桥上有人打伞走过，雨好像要下，又好像不下。\n这些瞬间凑在一起，就是一整天慢慢流动的痕迹。\n你上一次这样发呆，是什么时候？',
      tags: [
        '#慢生活',
        '#治愈系',
        '#氛围感',
        '#杂志感',
        '#胶片感',
        '#随手拍',
        '#出门看看',
        '#治愈',
        '#生活碎片',
        '#风景日记',
      ],
    },
  },
};
