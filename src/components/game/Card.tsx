import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CardProps {
  value: number;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

export const Card: React.FC<CardProps> = ({
  value,
  onClick,
  disabled = false,
  size = 'md',
  animate = false,
}) => {
  const sizes = {
    sm: 'w-12 h-16 text-xl',
    md: 'w-16 h-24 text-2xl',
    lg: 'w-20 h-28 text-3xl',
  };

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  return (
    <motion.div
      className={cn(
        'relative rounded-xl flex items-center justify-center font-bold cursor-pointer transition-all select-none',
        sizes[size],
        disabled
          ? 'bg-[#1a1a2e] text-gray-600 cursor-not-allowed'
          : 'bg-gradient-to-br from-white to-gray-100 text-[#0f0f1a] hover:scale-105 hover:shadow-lg hover:shadow-[#00d9ff]/20',
        onClick && !disabled && 'min-w-[44px] min-h-[44px]'
      )}
      onClick={handleClick}
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      initial={animate ? { scale: 0, rotate: -180 } : false}
      animate={animate ? { scale: 1, rotate: 0 } : false}
      transition={
        animate
          ? {
              type: 'spring',
              stiffness: 260,
              damping: 20,
            }
          : undefined
      }
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#00d9ff]/10 to-[#68d391]/10 opacity-0 hover:opacity-100 transition-opacity" />
      <span className="relative z-10">{value}</span>
    </motion.div>
  );
};
