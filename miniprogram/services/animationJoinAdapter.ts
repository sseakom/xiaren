import { Animation, Collection, Rating, Submission } from '@/types';

type AnimationMapLoader = (bvids: string[]) => Promise<Map<string, Animation>>;

export async function enrichRatingsWithAnimations(
  list: Rating[],
  includeAnim: boolean,
  loadAnimationMap: AnimationMapLoader,
): Promise<Rating[]> {
  if (!includeAnim || list.length === 0) return list;
  const animMap = await loadAnimationMap(list.map((item) => item.animation_bvid));
  return list.map((item) => {
    const anim = animMap.get(item.animation_bvid);
    if (!anim) return item;
    return {
      ...item,
      animTitle: anim.title,
      animCover: anim.cover,
      animBvid: anim.bvid,
    };
  });
}

export async function enrichCollectionsWithAnimations(
  list: Collection[],
  includeAnim: boolean,
  loadAnimationMap: AnimationMapLoader,
): Promise<Collection[]> {
  if (!includeAnim || list.length === 0) return list;
  const animMap = await loadAnimationMap(list.map((item) => item.animation_bvid));
  return list.map((item) => {
    const anim = animMap.get(item.animation_bvid);
    if (!anim) return item;
    return {
      ...item,
      title: anim.title,
      up_name: anim.up_name,
      cover: anim.cover,
      bvid: anim.bvid,
    };
  });
}

export async function enrichSubmissionsWithTargets(
  list: Submission[],
  loadAnimationMap: AnimationMapLoader,
): Promise<Submission[]> {
  if (list.length === 0) return list;
  const animMap = await loadAnimationMap(list.map((item) => String(item.target_bvid || '')));
  return list.map((item) => {
    if (!item.target_bvid) return item;
    const target = animMap.get(String(item.target_bvid));
    if (!target) return item;
    return {
      ...item,
      target: {
        _id: target._id,
        title: target.title,
        bvid: target.bvid,
        up_name: target.up_name,
        cover: target.cover,
        duration: target.duration,
        tag: target.tag,
      },
    };
  });
}
