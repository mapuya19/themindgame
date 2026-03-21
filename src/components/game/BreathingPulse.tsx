import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BreathingPulseProps {
  active: boolean;
  intensity?: 'low' | 'medium' | 'high';
}

export const BreathingPulse: React.FC<BreathingPulseProps> = ({
  active,
  intensity = 'medium',
}) => {
  const intensityConfig = {
    low: {
      scale: 1.1,
      duration: 4,
      opacity: 0.3,
    },
    medium: {
      scale: 1.2,
      duration: 3,
      opacity: 0.4,
    },
    high: {
      scale: 1.3,
      duration: 2,
      opacity: 0.5,
    },
  };

  const config = intensityConfig[intensity];

  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
      {active && (
        <>
          {/* Main Pulse */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0,217,255,0.15) 0%, rgba(104,211,145,0.05) 50%, transparent 70%)',
            }}
            animate={{
              scale: [1, config.scale, 1],
              opacity: [config.opacity * 0.5, config.opacity, config.opacity * 0.5],
            }}
            transition={{
              duration: config.duration,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Secondary Pulse (delayed) */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(104,211,145,0.1) 0%, rgba(0,217,255,0.05) 50%, transparent 70%)',
            }}
            animate={{
              scale: [1, config.scale * 1.1, 1],
              opacity: [config.opacity * 0.3, config.opacity * 0.8, config.opacity * 0.3],
            }}
            transition={{
              duration: config.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: config.duration / 2,
            }}
          />

          {/* Ambient Glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(0,217,255,0.03) 0%, transparent 50%)',
            }}
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: config.duration * 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </>
      )}
    </div>
  );
};
