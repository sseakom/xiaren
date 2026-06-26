// cloudfunctions/collection/index.js
// 收藏 / 看过 业务统一入口。
// 入参：{ action, ...payload }
//   - action: 'getStatus'   payload: { animation_bvid }       → { success, isCollected, isWatched }
//   - action: 'toggle'      payload: { animation_bvid, type, add } → { success, isCollected, isWatched }
//   - action: 'listMy'      payload: { type, limit?, offset?, include_anim? }
//       include_anim=true 时，附带返回动画基础信息（title/up_name/cover/bvid）
//       返回：{ success, data: Collection[], total }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/** 解析分页参数：limit 限制 1~100，offset >= 0 */
function parsePagination(limit, offset) {
  return {
    limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
    offset: Math.max(Number(offset) || 0, 0),
  };
}

/** 校验 type 合法性 */
function ensureType(t) {
  return t === 'collect' || t === 'watched' ? t : null;
}

async function getAnimationByBvid(animationBvid) {
  if (!animationBvid) return null;
  const res = await db.collection('animations').where({ bvid: String(animationBvid) }).limit(1).get();
  return (res.data && res.data[0]) || null;
}

async function findCollections(openid, animationBvid, type) {
  const res = await db
    .collection('collections')
    .where({
      user_id: openid,
      animation_bvid: String(animationBvid),
      ...(type ? { type } : {}),
    })
    .limit(type ? 1 : 2)
    .get();
  return res.data || [];
}

async function getStatus(animationBvid) {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, error: '未登录' };
  if (!animationBvid) return { success: false, error: '缺少 animation_bvid' };
  try {
    const records = await findCollections(openid, animationBvid);
    let isCollected = false;
    let isWatched = false;
    records.forEach((c) => {
      if (c.type === 'collect') isCollected = true;
      if (c.type === 'watched') isWatched = true;
    });
    return { success: true, isCollected, isWatched };
  } catch (err) {
    console.error('[collection.getStatus] 失败', err);
    return { success: false, error: err.message };
  }
}

async function toggle(animationBvid, type, add) {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, error: '未登录' };
  const t = ensureType(type);
  if (!animationBvid || !t) {
    return { success: false, error: '参数错误' };
  }
  try {
    const animation = await getAnimationByBvid(animationBvid);
    if (!animation) {
      return { success: false, error: '动画不存在' };
    }
    const existing = await findCollections(openid, animationBvid, t);
    if (add) {
      if (existing.length === 0) {
        await db.collection('collections').add({
          data: {
            user_id: openid,
            animation_bvid: String(animationBvid),
            type: t,
            created_at: new Date(),
          },
        });
      }
    } else if (existing.length > 0) {
      await Promise.all(
        existing.map((item) => db.collection('collections').doc(String(item._id)).remove()),
      );
    }
    return getStatus(animationBvid);
  } catch (err) {
    console.error('[collection.toggle] 失败', err);
    return { success: false, error: err.message };
  }
}

async function listMy(type, limit, offset, includeAnim) {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, error: '未登录' };
  const t = ensureType(type);
  if (!t) return { success: false, error: 'type 非法' };
  const { limit: lim, offset: off } = parsePagination(limit, offset);
  try {
    // 1) 先 count 出总数
    const cnt = await db
      .collection('collections')
      .where({ user_id: openid, type: t })
      .count();
    const total = cnt.total || 0;
    // 2) 分页取 collections
    const res = await db
      .collection('collections')
      .where({ user_id: openid, type: t })
      .orderBy('created_at', 'desc')
      .skip(off)
      .limit(lim)
      .get();
    const data = res.data || [];
    // 3) include_anim=true 时，一次性查所有关联动画（去掉 N+1）
    if (includeAnim && data.length > 0) {
      const bvids = Array.from(new Set(data.map((c) => String(c.animation_bvid || '')).filter(Boolean)));
      const results =
        bvids.length > 0
          ? [
              await db
                .collection('animations')
                .where({ bvid: _.in(bvids) })
                .limit(bvids.length)
                .field({ _id: true, title: true, up_name: true, cover: true, bvid: true })
                .get(),
            ]
          : [];
      const animMapByBvid = new Map();
      results.forEach((resItem) => {
        (resItem.data || []).forEach((a) => {
          if (a.bvid) animMapByBvid.set(String(a.bvid), a);
        });
      });
      data.forEach((c) => {
        const a = animMapByBvid.get(String(c.animation_bvid || ''));
        if (a) {
          c.title = a.title;
          c.up_name = a.up_name;
          c.cover = a.cover;
          c.bvid = a.bvid;
        }
      });
    }
    return { success: true, data, total };
  } catch (err) {
    console.error('[collection.listMy] 失败', err);
    return { success: false, error: err.message };
  }
}

exports.main = async (event /*, context*/) => {
  const action = event && event.action;
  switch (action) {
    case 'getStatus':
      return getStatus(event.animation_bvid);
    case 'toggle':
      return toggle(event.animation_bvid, event.type, !!event.add);
    case 'listMy':
      return listMy(event.type, event.limit, event.offset, !!event.include_anim);
    default:
      return { success: false, error: `未知 action: ${action}` };
  }
};
