import React from 'react';
import { MotionConfig, useReducedMotion } from 'framer-motion';

export default function ReducedMotionProvider({ children }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
