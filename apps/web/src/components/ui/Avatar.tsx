import { cn } from '../../lib/cn';

interface AvatarProps {
  name: string;
  initials: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
};

export function Avatar({ name, initials, avatarUrl, size = 'md' }: AvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn('rounded-full object-cover', SIZE_CLASSES[size])}
      />
    );
  }
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full brand-gradient font-semibold text-white',
        SIZE_CLASSES[size],
      )}
    >
      {initials}
    </div>
  );
}
