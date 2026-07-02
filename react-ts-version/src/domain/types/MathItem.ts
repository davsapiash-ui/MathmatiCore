export interface MathItem {
  id: string;
  type: 'one' | 'ten' | 'hundred' | 'thousand';
  value: number;
  x: number;
  y: number;
  isSpreading?: boolean;
  targetX?: number;
  targetY?: number;
}
