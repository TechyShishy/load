/**
 * Test stub for focus-trap-react.
 * jsdom has no tabbable elements, so the real FocusTrap throws on activation.
 * This passthrough renders children directly without any focus management.
 */
import React from 'react';

interface FocusTrapProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

const FocusTrap = ({ children }: FocusTrapProps) => <>{children}</>;
export default FocusTrap;
