import Taro from '@tarojs/taro';
import { CloudService } from './cloud';
import { User, UserStats } from '@/types';

const OPENID_CACHE_KEY = 'user_openid_cache';
const PHONE_CACHE_KEY = 'user_phone_cache';

/**
 * 全局用户信息管理
 *  - 所有 DB 读 / 写 走云函数 userService（action: getInfo / upsert / updateProfile / loadStats）
 *  - 替代原 app.js 中的 globalData
 */
class UserServiceImpl {
  openid = '';
  hasLogin = false;
  userInfo: User | null = null;
  userInfoReady = false;
  private initReady = false;
  private listeners: Array<() => void> = [];

  private buildLocalUser(profile: Partial<User> = {}): User {
    const now = new Date();
    return {
      _id: this.openid,
      nickName: profile.nickName ?? this.userInfo?.nickName ?? '',
      avatarUrl: profile.avatarUrl ?? this.userInfo?.avatarUrl ?? '',
      created_at: profile.created_at ?? this.userInfo?.created_at ?? now,
      updated_at: profile.updated_at ?? now,
      is_admin: profile.is_admin ?? this.userInfo?.is_admin ?? false,
    };
  }

  private setLoginState(openid: string) {
    this.openid = openid;
    this.hasLogin = true;
    Taro.setStorageSync(OPENID_CACHE_KEY, openid);
  }

  private setResolvedUserInfo(profile: Partial<User> = {}) {
    this.userInfo = this.buildLocalUser(profile);
    this.userInfoReady = true;
    this.emit();
    return this.userInfo;
  }

  private async callUserService<T = Record<string, any>>(
    action: string,
    payload: Record<string, any> = {},
  ): Promise<T | null> {
    const res = (await CloudService.callFunction('userService', {
      action,
      ...payload,
    })) as any;
    return (res?.result as T | undefined) ?? null;
  }

  /**
   * 启动时静默登录：优先复用已缓存的 openid + 有效微信会话，避免每次都重走 wxLogin
   * 会话失效时才回退到 wxLogin 换新 openid
   */
  async bootstrap() {
    this.initReady = false;
    this.userInfoReady = false;
    this.emit();
    try {
      await this.silentLogin();
    } catch (err) {
      console.warn('[User] 静默登录失败，等待用户主动登录', err);
      this.openid = '';
      this.hasLogin = false;
      this.userInfo = null;
    } finally {
      this.initReady = true;
      if (!this.hasLogin) {
        this.userInfoReady = true;
      }
      this.emit();
    }
  }

  /**
   * 静默登录：缓存优先 + checkSession 校验
   * 1. 取本地缓存的 openid
   * 2. 调 wx.checkSession 校验微信会话是否还有效
   * 3. 有效则直接复用 openid 拉用户档案（走云函数 userService.getInfo）
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
    this.setLoginState(result.openid);
    await this.fetchUserInfo();
  }

  /**
   * 手机号一键登录
   * 入参是 <Button open-type="getPhoneNumber"> 的回调 detail
   *   { cloudID }
   * 仅支持 cloudID 路径（微信云开发自动解密）。encryptedData/iv 兜底已移除（死代码）。
   * 云函数 phoneLogin 用 cloudID 解出真实手机号，作为用户主键 upsert
   * 返回值：{ phoneNumber, openid }，写入本地状态与缓存
   */
  async phoneLogin(detail: {
    cloudID?: string;
  }): Promise<{ phoneNumber: string; openid: string }> {
    if (!detail || !detail.cloudID) {
      throw new Error('未获取到手机号授权信息（cloudID）');
    }
    const res = await CloudService.callFunction('phoneLogin', detail);
    const result = (res.result || {}) as { phoneNumber?: string; openid?: string };
    if (!result.phoneNumber || !result.openid) {
      throw new Error('云函数 phoneLogin 未返回手机号');
    }
    this.setLoginState(result.openid);
    // 手机号额外缓存一份，供后续业务使用
    Taro.setStorageSync(PHONE_CACHE_KEY, result.phoneNumber);
    await this.fetchUserInfo();
    return { phoneNumber: result.phoneNumber, openid: result.openid };
  }

  /** 退出登录：清缓存 + 清状态 */
  logout() {
    this.openid = '';
    this.hasLogin = false;
    this.userInfo = null;
    this.userInfoReady = true;
    this.initReady = true;
    Taro.removeStorageSync(OPENID_CACHE_KEY);
    Taro.removeStorageSync(PHONE_CACHE_KEY);
    this.emit();
  }

  /**
   * 调云函数 userService.action='getInfo' 读取用户档案
   * 失败时降级：先尝试 upsert 一条空档案，再读一次；再失败兜底返回空 User，不阻塞登录流
   */
  private async fetchUserInfo() {
    if (!this.openid) return;
    try {
      const result = await this.callUserService<{ success?: boolean; data?: User; error?: string }>(
        'getInfo',
      );
      if (result?.success && result.data) {
        this.setResolvedUserInfo(result.data);
        return;
      }
      // getInfo 没成功 → 主动 upsert 一条空档案（不抛错）
      const user = await this.upsertUser({ nickName: '', avatarUrl: '' });
      if (user) return;
    } catch (err) {
      console.error('[User] fetchUserInfo failed', err);
    }
    // 最后兜底：即使云端建档失败，也保持前端登录态不丢
    this.setResolvedUserInfo();
  }

  /**
   * 用云函数 userService.action='upsert' 创建/更新用户档案
   * 避免客户端 add() 撞主键的问题（E11000 duplicate key）
   */
  private async upsertUser(profile: { nickName: string; avatarUrl: string }): Promise<User | null> {
    if (!this.openid) return null;
    try {
      const result = await this.callUserService<{ success?: boolean; data?: User; error?: string }>(
        'upsert',
        { profile },
      );
      if (result?.success && result.data) {
        return this.setResolvedUserInfo(result.data);
      }
    } catch (err) {
      console.error('[User] upsertUser failed', err);
    }
    return null;
  }

  /** 局部更新用户档案（昵称 / 头像） */
  async updateProfile(profile: { nickName: string; avatarUrl: string }) {
    if (!this.openid) return;
    try {
      const result = await this.callUserService<{ success?: boolean; error?: string }>(
        'updateProfile',
        { profile },
      );
      if (!result?.success) {
        console.error('[User] updateProfile failed', result?.error);
        return;
      }
      this.setResolvedUserInfo({ ...this.userInfo, ...profile });
    } catch (err) {
      console.error('[User] updateProfile failed', err);
    }
  }

  /**
   * 上传微信临时头像到云存储，返回永久 fileID
   * 入参：chooseAvatar 回调里的 avatarUrl（微信返回的临时路径）
   */
  async uploadAvatar(tempFilePath: string): Promise<string> {
    if (!this.openid || !tempFilePath) {
      throw new Error('缺少 openid 或头像临时路径');
    }
    const res = await Taro.cloud.uploadFile({
      cloudPath: `avatar/${this.openid}_${Date.now()}.jpg`,
      filePath: tempFilePath,
    });
    if (!res?.fileID) {
      throw new Error('云存储 uploadFile 未返回 fileID');
    }
    return res.fileID;
  }

  async resolveFileUrl(fileUrl: string): Promise<string> {
    if (!fileUrl) return '';
    if (!fileUrl.startsWith('cloud://')) return fileUrl;
    try {
      const res = await Taro.cloud.getTempFileURL({
        fileList: [fileUrl],
      });
      const tempFile = Array.isArray(res.fileList) ? res.fileList[0] : null;
      if (typeof tempFile === 'string') {
        return tempFile;
      }
      return tempFile?.tempFileURL || fileUrl;
    } catch (err) {
      console.error('[User] resolveFileUrl failed', err);
      return fileUrl;
    }
  }

  /** 加载统计（评分数/收藏数/看过数）—— 走云函数 userService.action='loadStats' */
  async loadStats(): Promise<UserStats> {
    if (!this.openid) {
      return { ratingCount: 0, collectCount: 0, watchCount: 0 };
    }
    try {
      const result = await this.callUserService<
        | { success?: boolean; ratingCount?: number; collectCount?: number; watchCount?: number; error?: string }
      >('loadStats');
      if (result?.success) {
        return {
          ratingCount: result.ratingCount || 0,
          collectCount: result.collectCount || 0,
          watchCount: result.watchCount || 0,
        };
      }
    } catch (err) {
      console.error('[User] loadStats failed', err);
    }
    return { ratingCount: 0, collectCount: 0, watchCount: 0 };
  }

  /** 等待 userInfo 就绪 */
  waitForReady(timeoutMs = 5000): Promise<void> {
    if (this.userInfoReady || this.initReady) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.off(check);
        resolve();
      }, timeoutMs);
      const check = () => {
        if (this.userInfoReady || this.initReady) {
          clearTimeout(timer);
          resolve();
        }
      };
      this.on(check);
      check();
    });
  }

  /**
   * 是否管理员
   * 注意：userInfo 必须在调用前就绪（waitForReady 之后），
   * 否则会被误判为 false
   */
  isAdmin(): boolean {
    return !!this.userInfo?.is_admin;
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
