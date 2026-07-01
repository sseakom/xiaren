import React from 'react';
import {
  Add,
  ArrowRightSmall,
  Check,
  Checked,
  Close,
  Edit,
  Failure,
  Heart,
  HeartF,
  Home,
  Link,
  List,
  Message,
  Phone,
  Search,
  Service,
  Star,
  User,
  Video,
} from '@nutui/icons-react-taro';

export type AppIconName =
  | 'add'
  | 'arrowRight'
  | 'close'
  | 'collection'
  | 'collectionFilled'
  | 'danmaku'
  | 'edit'
  | 'empty'
  | 'home'
  | 'link'
  | 'list'
  | 'logout'
  | 'movie'
  | 'phone'
  | 'rating'
  | 'review'
  | 'search'
  | 'submission'
  | 'user'
  | 'watched'
  | 'watchedFilled';

type IconComponent = React.ComponentType<{
  className?: string;
  color?: string;
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}>;

const ICON_MAP: Record<AppIconName, IconComponent> = {
  add: Add,
  arrowRight: ArrowRightSmall,
  close: Close,
  collection: Heart,
  collectionFilled: HeartF,
  danmaku: Message,
  edit: Edit,
  empty: Message,
  home: Home,
  link: Link,
  list: List,
  logout: Failure,
  movie: Video,
  phone: Phone,
  rating: Star,
  review: Service,
  search: Search,
  submission: List,
  user: User,
  watched: Check,
  watchedFilled: Checked,
};

export interface AppIconProps {
  name: AppIconName;
  size?: string | number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = '1em',
  color = 'currentColor',
  className,
  style,
}) => {
  const Icon = ICON_MAP[name];

  return (
    <Icon
      className={className}
      color={color}
      width={size}
      height={size}
      style={style}
    />
  );
};

export default AppIcon;
