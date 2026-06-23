import { CloudService } from './cloud';
import { Rating, ScoreDistribution } from '@/types';
import { UserService } from './user';
import { fuzzyMatch, fuzzyRank } from '@/utils/fuzzy';

/**
 * 动画业务服务
 */
export const AnimationService = {
  /** 分页获取动画列表（按发布时间倒序） */
  async list(page = 0, pageSize = 20) {
    const res = await CloudService.db
      .collection('animations')
      .orderBy('publish_time', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get();
    return res.data;
  },

  /** 获取单个动画详情 */
  async getById(id: string) {
    // Taro 的 doc().get() 类型是 () => void | ({}) => Promise<IQuerySingleResult> 双重重载
    // 用 as any 强制走 Promise 重载 + 补 {} 满足"应传 1 个参数"
    const res = (await (CloudService.db.collection('animations').doc(id).get({} as any) as any)) as { data: any };
    return res.data;
  },

  /**
   * 模糊搜索（按标题、UP主）
   *  - DB 端用宽松 RegExp 拉一个候选集（200 条上限）
   *  - JS 端再按 fuzzyScore 排序（exact > prefix > includes > 字符有序 > 字符全包含）
   *  - 最后分页返回
   */
  async search(keyword: string, page = 0, pageSize = 20) {
    if (!keyword || !keyword.trim()) return [];
    const k = keyword.trim();
    // 关键词里有"非 ASCII"字符（中文等），放宽为"任一 token 命中"以扩大候选集
    const hasNonAscii = /[^\x00-\x7f]/.test(k);
    const pattern = hasNonAscii
      ? CloudService.db.RegExp({
          regexp: k.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
          options: 'i',
        })
      : CloudService.db.RegExp({ regexp: k, options: 'i' });
    const cmd = CloudService._;
    const res = await CloudService.db
      .collection('animations')
      .where(
        cmd.or([
          { title: pattern },
          { up_name: pattern },
        ]),
      )
      .orderBy('publish_time', 'desc')
      .limit(200)
      .get();
    // 客户端二次过滤（过滤掉非真模糊命中的）+ 排序
    const matched = (res.data || []).filter(
      (a: any) => fuzzyMatch(a.title, k) || fuzzyMatch(a.up_name, k),
    );
    const ranked = fuzzyRank(matched, k, (a: any) => a.title || a.up_name || '');
    return ranked.slice(page * pageSize, (page + 1) * pageSize);
  },
};

/**
 * 评分业务
 */
export const RatingService = {
  /** 获取用户对某动画的评分 */
  async getMyRating(animationId: string): Promise<number> {
    if (!UserService.openid) return 0;
    const res = await CloudService.db
      .collection('ratings')
      .where({ user_id: UserService.openid, animation_id: animationId })
      .get();
    if (res.data.length === 0) return 0;
    return (res.data[0] as Rating).score;
  },

  /** 提交评分 */
  async submit(animationId: string, score: number): Promise<{ newRating: boolean }> {
    if (!UserService.openid) throw new Error('未登录');
    const exist = await CloudService.db
      .collection('ratings')
      .where({ user_id: UserService.openid, animation_id: animationId })
      .get();
    const now = new Date();
    let newRating = false;
    if (exist.data.length > 0) {
      // exist.data[0]._id 类型是 DocumentId | undefined
      // 业务上存在就是有 _id，用 String() 收紧类型
      const docId = String(exist.data[0]._id);
      await CloudService.db.collection('ratings').doc(docId).update({
        data: { score, updated_at: now },
      });
    } else {
      await CloudService.db.collection('ratings').add({
        data: {
          user_id: UserService.openid,
          animation_id: animationId,
          score,
          created_at: now,
          updated_at: now,
        },
      });
      newRating = true;
    }
    // 触发贝叶斯评分计算
    CloudService.callFunction('calcScore', { animation_id: animationId }).catch(
      (err) => console.error('[Rating] calcScore failed', err),
    );
    return { newRating };
  },

  /** 获取用户全部评分 */
  async listByUser(limit = 50): Promise<Rating[]> {
    if (!UserService.openid) return [];
    const res = await CloudService.db
      .collection('ratings')
      .where({ user_id: UserService.openid })
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .get();
    return res.data as Rating[];
  },
};

/**
 * 收藏/看过 业务
 */
export const CollectionService = {
  async getStatus(animationId: string): Promise<{ isCollected: boolean; isWatched: boolean }> {
    if (!UserService.openid) return { isCollected: false, isWatched: false };
    const res = await CloudService.db
      .collection('collections')
      .where({ user_id: UserService.openid, animation_id: animationId })
      .get();
    let isCollected = false;
    let isWatched = false;
    (res.data as any[]).forEach((c) => {
      if (c.type === 'collect') isCollected = true;
      if (c.type === 'watched') isWatched = true;
    });
    return { isCollected, isWatched };
  },

  async toggle(animationId: string, type: 'collect' | 'watched', add: boolean) {
    if (!UserService.openid) throw new Error('未登录');
    const res = await CloudService.db
      .collection('collections')
      .where({ user_id: UserService.openid, animation_id: animationId, type })
      .get();
    if (add) {
      if (res.data.length === 0) {
        await CloudService.db.collection('collections').add({
          data: {
            user_id: UserService.openid,
            animation_id: animationId,
            type,
            created_at: new Date(),
          },
        });
      }
    } else {
      if (res.data.length > 0) {
        // res.data[0]._id 类型是 DocumentId | undefined，业务存在则有
        const docId = String(res.data[0]._id);
        // Taro 的 doc().remove() 类型是 () => void & ({}?) => Promise<...> 双重重载
        // 用 Promise<any> 包装强制走 Promise 分支，避免"await 无效"hint
        await new Promise<void>((resolve) => {
          (CloudService.db.collection('collections').doc(docId).remove({} as any) as any);
          resolve();
        });
      }
    }
  },

  async listByUser(type: 'collect' | 'watched', limit = 50) {
    if (!UserService.openid) return [];
    const res = await CloudService.db
      .collection('collections')
      .where({ user_id: UserService.openid, type })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    return res.data;
  },
};

/** 评分分布（贝叶斯计算） */
export const ScoreService = {
  async calc(animationId: string): Promise<{
    WR: number;
    R: number;
    v: number;
    C: number;
    distribution: ScoreDistribution;
  }> {
    try {
      // Taro 的 callFunction 类型没有泛型参数
      const res = (await CloudService.callFunction('calcScore', { animation_id: animationId })) as any;
      const result = res?.result as { success?: boolean } | undefined;
      if (result?.success) return result as any;
    } catch (err) {
      console.warn('[Score] calcScore fallback', err);
    }
    return { WR: 0, R: 0, v: 0, C: 3.5, distribution: {} };
  },
};
