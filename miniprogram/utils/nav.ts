import Taro from '@tarojs/taro';
import { Animation } from '@/types';

export type DetailPreviewAnimation = Partial<Animation> & Pick<Animation, 'bvid'>;

const detailPreviewMap = new Map<string, DetailPreviewAnimation>();

function resolveDetailBvid(target: string | DetailPreviewAnimation) {
  return typeof target === 'string' ? target : target.bvid;
}

/** 跳转到动画详情页 */
export function goDetail(target: string | DetailPreviewAnimation) {
  const bvid = resolveDetailBvid(target);
  if (!bvid) return;
  if (typeof target !== 'string') {
    detailPreviewMap.set(bvid, target);
  }
  Taro.navigateTo({ url: `/sub-pages/detail/index?bvid=${encodeURIComponent(bvid)}` });
}

export function consumeDetailPreview(bvid: string) {
  if (!bvid) return null;
  const preview = detailPreviewMap.get(bvid) || null;
  if (preview) {
    detailPreviewMap.delete(bvid);
  }
  return preview;
}

/** 重启到首页（带 tabBar） */
export function goHome() {
  Taro.reLaunch({ url: '/pages/index/index' });
}

/** 跳转到搜索页 */
export function goSearch() {
  Taro.navigateTo({ url: '/pages/search/index' });
}
