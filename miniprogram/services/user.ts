import Taro from '@tarojs/taro';
import { CloudService } from './cloud';
import { User, UserStats } from '@/types';

const OPENID_CACHE_KEY = 'user_openid_cache';

/**
 * 全局用户信息管理
 * 替代原 app.js 中的 globalData
 */
class UserServiceImpl {
  openid = '';
  hasLogin = false;
  userInfo: User | null = null;
  userInfoReady = false;
  private listeners: Array<() => void> = [];

  /**
   * 启动时静默登录：优先复用已缓存的 openid + 有效微信会话，避免每次都重走 wxLogin
   * 会话失效时才回退到 wxLogin 换新 openid
   */
  async bootstrap() {
    try {
      await this.silentLogin();
    } catch (err) {
      console.warn('[User] 静默登录失败，等待用户主动登录', err);
    }
  }

  /**
   * 静默登录：缓存优先 + checkSession 校验
   * 1. 取本地缓存的 openid
   * 2. 调 wx.checkSession 校验微信会话是否还有效
   * 3. 有效则直接用缓存 openid 拉用户档案（不再走云函数）
   * 4. 无效或无缓存才走 wxLogin 换新
   */
  async silentLogin(): Promise<void> {
    const cached = Taro.getStorageSync(OPENID_CACHE_KEY) as string | undefined;
    if (cached) {
      try {
        await Taro.checkSession();
        // 会话仍有效，直接复用 openid
        this.openid = cached;
        this.hasLogin = true;
        await this.fetchUserInfo();
        return;
      } catch {
        // 会话失效，清掉缓存走完整流程
        Taro.removeStorageSync(OPENID_CACHE_KEY);
      }
    }
    await this.wxLogin();
  }

  /**
   * 微信一键登录：调 wx.login 拿临时 code，交给云函数换 openid
   * 成功后会同步读取/创建用户档案，并把 openid 缓存到本地
   */
  async wxLogin(): Promise<void> {
    const code = await Taro.login();
    if (!code || !code.code) {
      throw new Error('wx.login 未返回 code');
    }
    const res = await CloudService.callFunction('login', {
      code: code.code,
    });
    const result = (res.result || {}) as { openid?: string };
    if (!result.openid) {
      throw new Error('云函数 login 未返回 openid');
    }
    this.openid = result.openid;
    this.hasLogin = true;
    // 缓存 openid，下次启动可直接复用
    Taro.setStorageSync(OPENID_CACHE_KEY, result.openid);
    await this.fetchUserInfo();
  }

  /**
   * 手机号一键登录
   * 入参是 <Button open-type="getPhoneNumber"> 的回调 detail
   *   { encryptedData, iv, cloudID, code? }
   * 云函数 phoneLogin 用 cloudID 解出真实手机号，作为用户主键 upsert
   * 返回值：{ phoneNumber, openid }，写入本地状态与缓存
   */
  async phoneLogin(detail: {
    encryptedData?: string;
    iv?: string;
    cloudID?: string;
    code?: string;
  }): Promise<{ phoneNumber: string; openid: string }> {
    if (!detail || (!detail.cloudID && !detail.encryptedData)) {
      throw new Error('未获取到手机号授权信息');
    }
    const res = await CloudService.callFunction('phoneLogin', detail);
    const result = (res.result || {}) as { phoneNumber?: string; openid?: string };
    if (!result.phoneNumber || !result.openid) {
      throw new Error('云函数 phoneLogin 未返回手机号');
    }
    this.openid = result.openid;
    this.hasLogin = true;
    // 同步缓存（用 openid 作为下次静默登录的 key）
    Taro.setStorageSync(OPENID_CACHE_KEY, result.openid);
    // 手机号额外缓存一份，供后续业务使用
    Taro.setStorageSync('user_phone_cache', result.phoneNumber);
    await this.fetchUserInfo();
    return { phoneNumber: result.phoneNumber, openid: result.openid };
  }

  /** 退出登录：清缓存 + 清状态 */
  logout() {
    this.openid = '';
    this.hasLogin = false;
    this.userInfo = null;
    this.userInfoReady = false;
    Taro.removeStorageSync(OPENID_CACHE_KEY);
    Taro.removeStorageSync('user_phone_cache');
    this.emit();
  }

  private async fetchOpenid() {
    if (this.openid) return;
    try {
      const res = await CloudService.callFunction('login');
      const result = (res.result || {}) as { openid?: string };
      this.openid = result.openid || '';
      this.hasLogin = !!this.openid;
      console.log('[User] openid:', this.openid);
      if (this.openid) await this.fetchUserInfo();
    } catch (err) {
      console.error('[User] login 调用失败', err);
    }
  }

  private async fetchUserInfo() {
    try {
      // Taro 类型 get() 有 void / Promise 两套重载，传入空对象以命中 Promise 重载
      // doc().get() 在微信云开发中：用户存在 → { data: User }，用户不存在 → { data: null }
      // 用 withTimeout 防止 SDK 卡死（默认 8s 兜底）
      const res = (await CloudService.withTimeout(
        CloudService.db.collection('users').doc(this.openid).get({} as any) as any,
        'users.doc.get',
        8000,
      )) as { data: User | User[] | null };
      const list = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
      if (list.length > 0) {
        this.userInfo = list[0];
        this.userInfoReady = true;
        this.emit();
        return;
      }
      // 用户不存在 → 创建（upsert 模式：doc().set() 已存在不会报错）
      await this.upsertUser({ nickName: '', avatarUrl: '' });
    } catch (err) {
      console.error('[User] fetchUserInfo failed', err);
      // 兜底：避免无 userInfo 卡死 UI
      const now = new Date();
      this.userInfo = {
        _id: this.openid,
        nickName: '',
        avatarUrl: '',
        created_at: now,
        updated_at: now,
      };
      this.userInfoReady = true;
      this.emit();
    }
  }

  /**
   * 用 upsert 模式创建/更新用户：doc().set() + 已存在不报错
   * 避免 add() 撞主键的问题（E11000 duplicate key）
   */
  private async upsertUser(profile: { nickName: string; avatarUrl: string }) {
    const now = new Date();
    try {
      await CloudService.withTimeout(
        CloudService.db.collection('users').doc(this.openid).set({
          data: {
            _id: this.openid,
            nickName: profile.nickName,
            avatarUrl: profile.avatarUrl,
            created_at: now,
            updated_at: now,
          },
        } as any) as any,
        'users.doc.set',
        8000,
      );
      this.userInfo = {
        _id: this.openid,
        ...profile,
        created_at: now,
        updated_at: now,
      };
      this.userInfoReady = true;
      this.emit();
    } catch (err: any) {
      // 即便 upsert 失败也不抛出，避免阻塞登录流
      console.error('[User] upsertUser failed', err);
    }
  }

  async updateProfile(profile: { nickName: string; avatarUrl: string }) {
    if (!this.openid) await this.fetchOpenid();
    try {
      await CloudService.db.collection('users').doc(this.openid).update({
        data: {
          nickName: profile.nickName,
          avatarUrl: profile.avatarUrl,
          updated_at: new Date(),
        },
      });
      if (this.userInfo) {
        this.userInfo = { ...this.userInfo, ...profile };
      }
    } catch (err) {
      console.error('[User] updateProfile failed', err);
    }
  }

  /** 加载统计（评分数/收藏数） */
  async loadStats(): Promise<UserStats> {
    if (!this.openid) {
      return { ratingCount: 0, collectCount: 0 };
    }
    try {
      const [ratingRes, collectRes] = await Promise.all([
        CloudService.db.collection('ratings').where({ user_id: this.openid }).count(),
        CloudService.db.collection('collections')
          .where({ user_id: this.openid, type: 'collect' })
          .count(),
      ]);
      return {
        ratingCount: ratingRes.total || 0,
        collectCount: collectRes.total || 0,
      };
    } catch (err) {
      console.error('[User] loadStats failed', err);
      return { ratingCount: 0, collectCount: 0 };
    }
  }

  /** 等待 userInfo 就绪 */
  waitForReady(timeoutMs = 5000): Promise<void> {
    if (this.userInfoReady) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.off(check);
        resolve();
      }, timeoutMs);
      const check = () => {
        if (this.userInfoReady) {
          clearTimeout(timer);
          resolve();
        }
      };
      this.on(check);
      check();
    });
  }

  on(fn: () => void) {
    this.listeners.push(fn);
  }
  off(fn: () => void) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const UserService = new UserServiceImpl();
