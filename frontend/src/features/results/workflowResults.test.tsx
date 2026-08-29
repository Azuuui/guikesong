import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {GenerateResult} from '../../../../shared/types';
import {makeOriginalIpResult, makeTravelGuideResult, makeUgcPhotoCampaignResult, makeXhsAtlasResult} from '../../test/fixtures';
import {downloadPage} from '../generation/downloads';
import {ResultDetail} from './ResultDetail';

vi.mock('../generation/downloads', async () => {
  const actual = await vi.importActual<typeof import('../generation/downloads')>('../generation/downloads');
  return {...actual, downloadPage: vi.fn()};
});

const downloadPageMock = vi.mocked(downloadPage);

const CREATED_AT = '2026-08-29T10:00:00.000Z';
const USER_PROMPT = '贵州夏季避暑宣传';

function renderResult(result: GenerateResult) {
  render(
    <MemoryRouter>
      <ResultDetail
        createdAt={CREATED_AT}
        onRegenerate={vi.fn()}
        result={result}
        source="current"
        userPrompt={USER_PROMPT}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  downloadPageMock.mockReset().mockResolvedValue(undefined);
});

describe('原创 IP 结果页', () => {
  it('渲染四张正式图缩略图并默认选中品牌主视觉', () => {
    renderResult(makeOriginalIpResult());

    const thumbnails = screen.getByLabelText('页面缩略图');
    expect(within(thumbnails).getByRole('button', {name: '品牌主视觉 1'})).toHaveAttribute('aria-pressed', 'true');
    expect(within(thumbnails).getByRole('button', {name: '识别系统 2'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '商品包装 3'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '场景应用 4'})).toBeInTheDocument();

    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByAltText('贵州夏季避暑宣传第 1 页')).toBeInTheDocument();
    expect(within(preview).getByRole('button', {name: '下载此页'})).toBeInTheDocument();
  });

  it('包含可选总览页时追加总览图缩略图', () => {
    renderResult(makeOriginalIpResult({pageCount: 5}));

    const thumbnails = screen.getByLabelText('页面缩略图');
    expect(within(thumbnails).getByRole('button', {name: '总览图 5'})).toBeInTheDocument();
    expect(within(thumbnails).getAllByRole('button')).toHaveLength(5);
  });

  it('显示单标题、正文与标签', () => {
    renderResult(makeOriginalIpResult());

    const panel = screen.getByLabelText('生成文案');
    expect(within(panel).getByRole('heading', {name: '标题', level: 2})).toBeInTheDocument();
    expect(within(panel).queryByRole('heading', {name: '候选标题'})).not.toBeInTheDocument();
    expect(within(panel).getByText('贵州夏季避暑宣传')).toBeInTheDocument();
    expect(within(panel).getByText('面向年轻游客的夏季避暑内容。')).toBeInTheDocument();
    expect(within(panel).getByText('贵州旅行')).toBeInTheDocument();
    expect(within(panel).getByText('夏季避暑')).toBeInTheDocument();
  });

  it('partial 结果显示部分完成状态与提示', () => {
    renderResult(makeOriginalIpResult({failedIndexes: [3]}));

    expect(screen.getByText('部分完成 3/4')).toBeInTheDocument();
    expect(screen.getByText('部分页面未生成成功')).toBeInTheDocument();
    expect(screen.getByText('3 页成功，1 页未生成成功。素材包只含成功图和完整文案。')).toBeInTheDocument();
  });

  it('失败页显示错误且成功页仍可下载', async () => {
    const user = userEvent.setup();
    renderResult(makeOriginalIpResult({failedIndexes: [3]}));

    const thumbnails = screen.getByLabelText('页面缩略图');
    await user.click(within(thumbnails).getByRole('button', {name: '场景应用 4，未生成成功'}));
    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByText('该页面暂时未生成成功。')).toBeInTheDocument();
    expect(within(preview).queryByRole('button', {name: '下载此页'})).not.toBeInTheDocument();

    await user.click(within(thumbnails).getByRole('button', {name: '品牌主视觉 1'}));
    await user.click(within(preview).getByRole('button', {name: '下载此页'}));
    expect(downloadPageMock).toHaveBeenCalledTimes(1);
    expect(downloadPageMock.mock.calls[0][0]).toMatchObject({id: 'page-1', status: 'succeeded'});
  });
});

describe('图鉴结果页', () => {
  it('封面优先：默认选中封面', () => {
    renderResult(makeXhsAtlasResult());

    const thumbnails = screen.getByLabelText('页面缩略图');
    expect(within(thumbnails).getByRole('button', {name: '封面 1'})).toHaveAttribute('aria-pressed', 'true');
    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByAltText('贵阳美食图鉴第 1 页')).toBeInTheDocument();
  });

  it('动态渲染封面与正文页缩略图', () => {
    renderResult(makeXhsAtlasResult({pageCount: 4}));

    const thumbnails = screen.getByLabelText('页面缩略图');
    expect(within(thumbnails).getByRole('button', {name: '封面 1'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '正文页 2'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '正文页 3'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '正文页 4'})).toBeInTheDocument();
  });

  it('显示 3 个候选标题且各自可复制', () => {
    renderResult(makeXhsAtlasResult());

    const panel = screen.getByLabelText('生成文案');
    expect(within(panel).getByRole('heading', {name: '候选标题', level: 2})).toBeInTheDocument();
    for (const title of ['贵阳美食图鉴来了', '12种贵阳必吃美食', '收藏这份贵阳美食清单']) {
      expect(within(panel).getByText(title)).toBeInTheDocument();
    }
    expect(within(panel).getByRole('button', {name: '复制候选标题 1'})).toBeInTheDocument();
    expect(within(panel).getByRole('button', {name: '复制候选标题 2'})).toBeInTheDocument();
    expect(within(panel).getByRole('button', {name: '复制候选标题 3'})).toBeInTheDocument();
  });

  it('显示正文与标签', () => {
    renderResult(makeXhsAtlasResult());

    const panel = screen.getByLabelText('生成文案');
    expect(within(panel).getByText('按场景整理的贵阳美食清单正文。')).toBeInTheDocument();
    expect(within(panel).getByText('#贵阳美食')).toBeInTheDocument();
    expect(within(panel).getByText('#干货分享')).toBeInTheDocument();
  });

  it('显示清单元信息与条目', () => {
    renderResult(makeXhsAtlasResult());

    const panel = screen.getByLabelText('生成文案');
    expect(within(panel).getByRole('heading', {name: '清单', level: 2})).toBeInTheDocument();
    expect(within(panel).getByText('贵阳的12种美食 · 共12种 · 美食盘点 · 按食用场景')).toBeInTheDocument();
    expect(within(panel).getByText('01 美食1')).toBeInTheDocument();
    expect(within(panel).getByText('怎么吃：第1行文案')).toBeInTheDocument();
    expect(within(panel).getByText('避坑：第1行提示')).toBeInTheDocument();
    expect(within(panel).getByText('金句1')).toBeInTheDocument();
    expect(within(panel).getAllByText('早餐')).toHaveLength(6);
    expect(within(panel).getAllByText('小吃')).toHaveLength(6);
  });

  it('partial：失败封面显示错误且成功正文页仍可下载', async () => {
    const user = userEvent.setup();
    renderResult(makeXhsAtlasResult({failedIndexes: [0]}));

    expect(screen.getByText('部分完成 1/2')).toBeInTheDocument();
    const thumbnails = screen.getByLabelText('页面缩略图');
    expect(within(thumbnails).getByRole('button', {name: '封面 1，未生成成功'})).toHaveAttribute('aria-pressed', 'true');
    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByText('该页面暂时未生成成功。')).toBeInTheDocument();

    await user.click(within(thumbnails).getByRole('button', {name: '正文页 2'}));
    await user.click(within(preview).getByRole('button', {name: '下载此页'}));
    expect(downloadPageMock).toHaveBeenCalledWith(expect.objectContaining({id: 'page-2', status: 'succeeded'}));
  });

  it('复制候选标题后写入剪贴板并显示反馈', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
    renderResult(makeXhsAtlasResult());

    await user.click(screen.getByRole('button', {name: '复制候选标题 2'}));

    expect(writeText).toHaveBeenCalledWith('12种贵阳必吃美食');
    expect(await screen.findByText('已复制')).toBeInTheDocument();
  });
});

describe('手绘攻略结果页', () => {
  it('封面优先：默认选中封面并渲染专题页缩略图', () => {
    renderResult(makeTravelGuideResult());

    const thumbnails = screen.getByLabelText('页面缩略图');
    expect(within(thumbnails).getByRole('button', {name: '封面 1'})).toHaveAttribute('aria-pressed', 'true');
    expect(within(thumbnails).getByRole('button', {name: '第1天路线'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '第2天路线'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '交通页 4'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '住宿页 5'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '美食页 6'})).toBeInTheDocument();
    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByAltText('成都手绘攻略第 1 页')).toBeInTheDocument();
  });

  it('显示 3 个候选标题、正文与标签', () => {
    renderResult(makeTravelGuideResult());

    const panel = screen.getByLabelText('生成文案');
    expect(within(panel).getByRole('heading', {name: '候选标题', level: 2})).toBeInTheDocument();
    for (const title of ['成都两日手绘攻略', '成都慢游手册', '收藏这份成都攻略']) {
      expect(within(panel).getByText(title)).toBeInTheDocument();
    }
    expect(within(panel).getByText('按天整理的成都行程正文。')).toBeInTheDocument();
    expect(within(panel).getByText('#成都')).toBeInTheDocument();
    expect(within(panel).getByText('#手绘攻略')).toBeInTheDocument();
  });

  it('显示行程概览与按天路线', () => {
    renderResult(makeTravelGuideResult());

    const panel = screen.getByLabelText('生成文案');
    expect(within(panel).getByRole('heading', {name: '行程概览', level: 2})).toBeInTheDocument();
    expect(within(panel).getByText('成都 · 2 天 · 市井与松弛')).toBeInTheDocument();
    expect(within(panel).getByText('第 1 天 · 老城漫步')).toBeInTheDocument();
    expect(within(panel).getByText('第 2 天 · 近郊风景')).toBeInTheDocument();
    expect(within(panel).getByText('1. 人民公园 · 慢逛半日')).toBeInTheDocument();
    expect(within(panel).getByText('景区打车排队久')).toBeInTheDocument();
  });

  it('partial：失败路线页显示错误且成功封面仍可下载', async () => {
    const user = userEvent.setup();
    renderResult(makeTravelGuideResult({failedIndexes: [1]}));

    expect(screen.getByText('部分完成 5/6')).toBeInTheDocument();
    const thumbnails = screen.getByLabelText('页面缩略图');
    await user.click(within(thumbnails).getByRole('button', {name: '第1天路线，未生成成功'}));
    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByText('该页面暂时未生成成功。')).toBeInTheDocument();

    await user.click(within(thumbnails).getByRole('button', {name: '封面 1'}));
    await user.click(within(preview).getByRole('button', {name: '下载此页'}));
    expect(downloadPageMock).toHaveBeenCalledWith(expect.objectContaining({id: 'page-1', status: 'succeeded'}));
  });
});

describe('游客返图结果页', () => {
  it('渲染逐张海报缩略图并默认选中第一张', () => {
    renderResult(makeUgcPhotoCampaignResult());

    const thumbnails = screen.getByLabelText('页面缩略图');
    expect(within(thumbnails).getByRole('button', {name: '海报 1'})).toHaveAttribute('aria-pressed', 'true');
    expect(within(thumbnails).getByRole('button', {name: '海报 2'})).toBeInTheDocument();
    expect(within(thumbnails).getByRole('button', {name: '海报 3'})).toBeInTheDocument();
    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByAltText('游客投稿海报第 1 页')).toBeInTheDocument();
  });

  it('显示 3 个候选标题、活动主题、共同情绪、正文与标签', () => {
    renderResult(makeUgcPhotoCampaignResult());

    const panel = screen.getByLabelText('生成文案');
    expect(within(panel).getByRole('heading', {name: '候选标题', level: 2})).toBeInTheDocument();
    for (const title of ['夏天的风', '把夏天收进相册', '风吹过的地方']) {
      expect(within(panel).getByText(title)).toBeInTheDocument();
    }
    expect(within(panel).getByRole('heading', {name: '活动主题', level: 2})).toBeInTheDocument();
    expect(within(panel).getByText('夏日征集')).toBeInTheDocument();
    expect(within(panel).getByText('清爽明亮')).toBeInTheDocument();
    expect(within(panel).getByText('整组照片的共同情绪正文。')).toBeInTheDocument();
    expect(within(panel).getByText('#夏天')).toBeInTheDocument();
    expect(within(panel).getByText('#心情图集')).toBeInTheDocument();
  });

  it('复制共同情绪后写入剪贴板并显示反馈', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
    renderResult(makeUgcPhotoCampaignResult());

    await user.click(screen.getByRole('button', {name: '复制共同情绪'}));

    expect(writeText).toHaveBeenCalledWith('清爽明亮');
    expect(await screen.findByText('已复制')).toBeInTheDocument();
  });

  it('partial：失败海报显示错误且成功海报仍可下载', async () => {
    const user = userEvent.setup();
    renderResult(makeUgcPhotoCampaignResult({failedIndexes: [0]}));

    expect(screen.getByText('部分完成 2/3')).toBeInTheDocument();
    const thumbnails = screen.getByLabelText('页面缩略图');
    // 默认跳过失败页，选中第一张成功海报。
    expect(within(thumbnails).getByRole('button', {name: '海报 2'})).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(thumbnails).getByRole('button', {name: '海报 1，未生成成功'}));
    const preview = screen.getByLabelText('页面预览');
    expect(within(preview).getByText('该页面暂时未生成成功。')).toBeInTheDocument();

    await user.click(within(thumbnails).getByRole('button', {name: '海报 2'}));
    await user.click(within(preview).getByRole('button', {name: '下载此页'}));
    expect(downloadPageMock).toHaveBeenCalledWith(expect.objectContaining({id: 'page-2', status: 'succeeded'}));
  });
});
