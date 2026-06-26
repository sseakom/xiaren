import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, Button, Input } from '@tarojs/components';
import Taro, { usePageScroll, useShareAppMessage } from '@tarojs/taro';
import { Cell, PullToRefresh } from '@nutui/nutui-react-taro';
import '@nutui/nutui-react-taro/dist/es/packages/cell/style/style.css';
import '@nutui/nutui-react-taro/dist/es/packages/pulltorefresh/style/style.css';
import { UserService } from '@/services/user';
import { User, UserStats } from '@/types';
import AppIcon from '@/components/AppIcon';
import Skeleton from '@/components/Skeleton';
import { THEME_PRIMARY_COLOR } from '@/constants/theme';
import styles from './index.module.scss';

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const safeHex = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16),
  };
};

const withAlpha = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const mixWithWhite = (hex: string, weight: number) => {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * weight);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

const UserPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [avatarSrc, setAvatarSrc] = useState('');
  const [stats, setStats] = useState<UserStats>({
    ratingCount: 0,
    collectCount: 0,
    watchCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const themeStyle = {
    '--user-theme-primary': THEME_PRIMARY_COLOR,
    '--user-theme-primary-light': mixWithWhite(THEME_PRIMARY_COLOR, 0.2),
    '--user-theme-primary-soft': withAlpha(THEME_PRIMARY_COLOR, 0.12),
    '--user-theme-primary-shadow': withAlpha(THEME_PRIMARY_COLOR, 0.26),
    '--user-theme-primary-glass': withAlpha(THEME_PRIMARY_COLOR, 0.16),
    '--user-theme-primary-glass-strong': withAlpha(THEME_PRIMARY_COLOR, 0.24),
    '--user-theme-primary-border': withAlpha(THEME_PRIMARY_COLOR, 0.18),
  } as React.CSSProperties;

  useShareAppMessage(() => ({
    title: '我在玩「虾仁宇宙」，一起来吧',
    path: '/pages/user/index',
  }));

  const getEffectiveUser = useCallback((): User | null => {
    if (UserService.userInfo) return UserService.userInfo;
    if (UserService.openid) {
      const now = new Date();
      return {
        _id: UserService.openid,
        nickName: '微信用户',
        avatarUrl: '',
        created_at: now,
        updated_at: now,
      };
    }
    return null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await UserService.waitForReady();
      const nextUser = getEffectiveUser();
      setUser(nextUser);
      setAvatarSrc(nextUser ? await UserService.resolveFileUrl(nextUser.avatarUrl) : '');
      const s = await UserService.loadStats();
      setStats(s);
    } catch (err) {
      console.error('[User] 加载失败', err);
    } finally {
      setLoading(false);
    }
  }, [getEffectiveUser]);

  useEffect(() => {
    load();
  }, [load]);

  usePageScroll((event) => {
    setScrollTop(event.scrollTop);
  });

  const onRefresh = useCallback(async () => {
    await load();
  }, [load]);

  const goMyRatings = () => Taro.navigateTo({ url: '/pages/my-ratings/index' });
  const goMyCollections = () => Taro.navigateTo({ url: '/pages/my-collections/index' });
  const goWatched = () => Taro.navigateTo({ url: '/pages/my-collections/index?type=watched' });

  /** 微信一键登录：复用缓存 + 校验会话，未登录时才会真正走云函数 */
  const onLogin = async () => {
    try {
      Taro.showLoading({ title: '登录中…', mask: true });
      await UserService.silentLogin();
      await load();
      const effectiveUser = getEffectiveUser();
      if (!effectiveUser) {
        throw new Error('登录状态未就绪');
      }
      Taro.hideLoading();
      Taro.showToast({ title: '登录成功', icon: 'success' });
    } catch (err) {
      console.error('[User] 登录失败', err);
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' });
    } finally {
      Taro.hideLoading();
    }
  };

  /**
   * 手机号一键登录：用户点击带 open-type="getPhoneNumber" 的按钮后，微信弹出
   * 原生授权弹窗（"申请获取并验证您的手机号 / 158****0601 / 不允许 / 使用其它号码"）
   * 用户允许后回调到这里，用 cloudID 交给 phoneLogin 云函数解密手机号
   */
  const onGetPhoneNumber = async (e: any) => {
    // 微信回调 detail: { errMsg, encryptedData, iv, cloudID, code }
    const detail = e?.detail || {};
    if (detail.errMsg && !detail.errMsg.includes('ok')) {
      // 用户点了"不允许"或"使用其它号码" → 静默回退到微信登录
      console.log('[User] 用户取消手机号授权，回退到微信登录');
      await onLogin();
      return;
    }
    if (!detail.cloudID && !detail.encryptedData) {
      Taro.showToast({ title: '未获取到授权信息', icon: 'none' });
      return;
    }
    try {
      Taro.showLoading({ title: '登录中…', mask: true });
      const { phoneNumber } = await UserService.phoneLogin(detail);
      Taro.hideLoading();
      Taro.showToast({
        title: `已绑定 ${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}`,
        icon: 'success',
      });
      await load();
    } catch (err) {
      Taro.hideLoading();
      console.error('[User] 手机号登录失败', err);
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  };

  /** 选择微信头像（仅 button open-type="chooseAvatar" 回调） */
  const onChooseAvatar = async (e: any) => {
    const avatarUrl: string = e?.detail?.avatarUrl;
    if (!avatarUrl) return;
    try {
      Taro.showLoading({ title: '更新中…', mask: true });
      // 走 UserService.uploadAvatar，封装到 service 层
      const fileID = await UserService.uploadAvatar(avatarUrl);
      await UserService.updateProfile({
        nickName: user?.nickName || '微信用户',
        avatarUrl: fileID,
      });
      const nextUser = getEffectiveUser();
      setUser(nextUser);
      setAvatarSrc(await UserService.resolveFileUrl(fileID));
      Taro.hideLoading();
      Taro.showToast({ title: '头像已更新', icon: 'success' });
    } catch (err) {
      Taro.hideLoading();
      console.error('[User] 头像更新失败', err);
      Taro.showToast({ title: '头像更新失败', icon: 'none' });
    }
  };

  /** 昵称 input 失焦保存 */
  const onNicknameBlur = async (e: any) => {
    const nickName: string = (e?.detail?.value || '').trim();
    if (!nickName || nickName === user?.nickName) return;
    try {
      await UserService.updateProfile({
        nickName,
        avatarUrl: user?.avatarUrl || '',
      });
      const nextUser = getEffectiveUser();
      setUser(nextUser);
      setAvatarSrc(nextUser ? await UserService.resolveFileUrl(nextUser.avatarUrl) : '');
    } catch (err) {
      console.error('[User] 昵称更新失败', err);
    }
  };

  /** 退出登录（二次确认） */
  const onLogout = () => {
    Taro.showModal({
      title: '确认退出登录？',
      content: '退出后将清除本地登录状态，下次使用需重新微信授权。',
      confirmText: '退出',
      confirmColor: '#FF4D4F',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        UserService.logout();
        load();
        Taro.showToast({ title: '已退出登录', icon: 'success' });
      },
    });
  };


  return (
    <PullToRefresh
      className={styles.pullRefresh}
      scrollTop={scrollTop}
      onRefresh={onRefresh}
      completeDelay={300}
      threshold={72}
      headHeight={56}
      catchMove
    >
      <View className={styles.pageUser} style={themeStyle}>
      {/* 头部 */}
      <View className={styles.header}>
        <View className={styles.headerCard}>
          <View className={styles.userInfo}>
            {user ? (
              // 已登录：button 才能调起 chooseAvatar
              <Button
                className={styles.avatarBtn}
                openType="chooseAvatar"
                onChooseAvatar={onChooseAvatar}
              >
                <Image
                  className={styles.avatar}
                  src={avatarSrc || user.avatarUrl || 'https://picsum.photos/id/64/200/200'}
                  mode="aspectFill"
                />
              </Button>
            ) : (
              <Image
                className={styles.avatar}
                src="https://picsum.photos/id/64/200/200"
                mode="aspectFill"
              />
            )}
            <View className={styles.userMeta}>
              {user ? (
                <Input
                  className={styles.nickNameInput}
                  type="nickname"
                  value={user.nickName}
                  placeholder="点击设置昵称"
                  onBlur={onNicknameBlur}
                />
              ) : (
                <Text className={styles.nickName}>未登录</Text>
              )}
              <Text className={styles.userId}>
                ID: {user?._id?.slice(-6) || '未登录'}
              </Text>
              <Text className={styles.profileHint}>
                {user
                  ? '点击头像更新，昵称失焦后自动保存'
                  : '登录后可同步评分、收藏和看过记录'}
              </Text>
            </View>
            {
              user ? null : (
                <Button
                  className={styles.phoneLoginBtn}
                  openType="getPhoneNumber"
                  onGetPhoneNumber={onGetPhoneNumber}
                >
                  点击登录
                </Button>
              )
            }
          </View>

        </View>

        {/* 统计卡片 */}
        <Skeleton type="custom" height={120} width={100}>
          <View className={styles.statsCard}>
            <View className={styles.statItem} onClick={goMyRatings}>
              <Text className={styles.statNum}>{stats.ratingCount}</Text>
              <Text className={styles.statLabel}>我的评分</Text>
            </View>
            <View className={styles.statDivider} />
            <View className={styles.statItem} onClick={goMyCollections}>
              <Text className={styles.statNum}>{stats.collectCount}</Text>
              <Text className={styles.statLabel}>我的收藏</Text>
            </View>
            <View className={styles.statDivider} />
            <View className={styles.statItem} onClick={goWatched}>
              <Text className={styles.statNum}>{stats.watchCount}</Text>
              <Text className={styles.statLabel}>我看过的</Text>
            </View>
          </View>
        </Skeleton>
      </View>

      {/* 功能列表 */}
      <View className={styles.section}>
        <View className={styles.sectionHeading}>
          <Text className={styles.sectionTitle}>我的服务</Text>
          <Text className={styles.sectionDesc}>查看记录、管理投稿与账号操作</Text>
        </View>
        <View className={styles.menuList}>
          {user ? (
            <>
              <Cell
                className={styles.menuCell}
                onClick={() => Taro.navigateTo({ url: '/pages/animation-form/index?mode=create' })}
              >
                <View className={styles.menuCellContent}>
                  <View className={styles.menuIconWrap}>
                    <AppIcon name="add" size="36rpx" className={styles.menuIcon} />
                  </View>
                  <Text className={styles.menuText}>录入动画</Text>
                  <AppIcon name="arrowRight" size="20rpx" className={styles.menuArrow} />
                </View>
              </Cell>
              <Cell
                className={styles.menuCell}
                onClick={() => Taro.navigateTo({ url: '/pages/my-submissions/index' })}
              >
                <View className={styles.menuCellContent}>
                  <View className={styles.menuIconWrap}>
                    <AppIcon name="submission" size="36rpx" className={styles.menuIcon} />
                  </View>
                  <Text className={styles.menuText}>我的提交</Text>
                  <AppIcon name="arrowRight" size="20rpx" className={styles.menuArrow} />
                </View>
              </Cell>
              {UserService.isAdmin() && (
                <Cell
                  className={styles.menuCell}
                  onClick={() => Taro.navigateTo({ url: '/pages/review-list/index' })}
                >
                  <View className={styles.menuCellContent}>
                    <View className={styles.menuIconWrap}>
                      <AppIcon name="review" size="36rpx" className={styles.menuIcon} />
                    </View>
                    <Text className={styles.menuText}>审核中心</Text>
                    <AppIcon name="arrowRight" size="20rpx" className={styles.menuArrow} />
                  </View>
                </Cell>
              )}
              <Cell className={`${styles.menuCell} ${styles.menuCellDanger}`} onClick={onLogout}>
                <View className={styles.menuCellContent}>
                  <View className={`${styles.menuIconWrap} ${styles.menuIconWrapDanger}`}>
                    <AppIcon
                      name="logout"
                      size="36rpx"
                      className={`${styles.menuIcon} ${styles.menuIconDanger}`}
                    />
                  </View>
                  <Text className={`${styles.menuText} ${styles.menuTextDanger}`}>退出登录</Text>
                  <AppIcon name="arrowRight" size="20rpx" className={styles.menuArrow} />
                </View>
              </Cell>
            </>
          ) : null}
        </View>
      </View>
      </View>
    </PullToRefresh>
  );
};

export default UserPage;
