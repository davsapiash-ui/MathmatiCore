



interface Point { x: number; y: number; }



interface BlockColors {
  top: string;
  front: string; // Right face
  side: string;  // Left face
}

const COLORS: Record<string, BlockColors> = {
  one: { top: '#FFFFFF', front: '#F5F5DC', side: '#EAEAD2' }, // Off-white more beige
  ten: { top: '#81C784', front: '#4CAF50', side: '#388E3C' },
  hundred: { top: '#3949AB', front: '#1A237E', side: '#000050' }, 
  thousand: { top: '#FFB74D', front: '#FF9800', side: '#F57C00' },
};

interface BlockProps {
  w?: number; // width in X
  d?: number; // depth in Y
  h?: number; // height in Z
  type: 'one' | 'ten' | 'hundred' | 'thousand';
  className?: string;
  scale?: number;
}

export function IsoBlock({ w = 1, d = 1, h = 1, type, className = '', scale = 1.2 }: BlockProps) {
  const colors = COLORS[type];
  const uX = 7;
  const uY = 3.5;
  const uZ = 8;
  const pad = 2;
  
  const width = (w + d) * uX;
  const height = (w + d) * uY + h * uZ;
  const svgWidth = width + pad * 2;
  const svgHeight = height + pad * 2;
  
  const O = { x: w * uX + pad, y: pad }; 
  const vX = { x: -uX, y: uY };
  const vY = { x: uX, y: uY };
  const vZ = { x: 0, y: uZ };
  
  const add = (p: Point, v: Point, s = 1): Point => ({ x: p.x + v.x * s, y: p.y + v.y * s });
  
  const P_left = add(O, vX, w);
  const P_right = add(O, vY, d);
  const P_front = add(P_left, vY, d); 
  const P_left_b = add(P_left, vZ, h);
  const P_right_b = add(P_right, vZ, h);
  const P_front_b = add(P_front, vZ, h);
  
  const pathStr = (points: Point[]) => `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`;

  // Determine grid line color based on type
  let gridColor = 'rgba(0,0,0,0.15)';
  if (type === 'ten') gridColor = 'rgba(0,0,0,0.2)';
  if (type === 'hundred') gridColor = 'rgba(255,255,255,0.25)';
  if (type === 'thousand') gridColor = 'rgba(0,0,0,0.25)';

  return (
    <svg 
      className={`overflow-visible drop-shadow-md ${className}`} 
      width={svgWidth} 
      height={svgHeight} 
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      style={{ width: `${svgWidth * scale}px`, height: `${svgHeight * scale}px` }}
    >
      <path d={pathStr([O, P_left, P_front, P_right])} fill={colors.top} stroke={gridColor} strokeWidth="1" strokeLinejoin="round"/>
      <path d={pathStr([P_left, P_front, P_front_b, P_left_b])} fill={colors.side} stroke={gridColor} strokeWidth="1" strokeLinejoin="round"/>
      <path d={pathStr([P_front, P_right, P_right_b, P_front_b])} fill={colors.front} stroke={gridColor} strokeWidth="1" strokeLinejoin="round"/>
      
      <g stroke={gridColor} strokeWidth="0.75" strokeLinecap="round">
        {/* Top Face Lines */}
        {[...Array(Math.max(0, w - 1))].map((_, i) => { const start = add(O, vX, i+1); const end = add(start, vY, d); return <line key={`tx-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(Math.max(0, d - 1))].map((_, i) => { const start = add(O, vY, i+1); const end = add(start, vX, w); return <line key={`ty-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {/* Left Face Lines */}
        {[...Array(Math.max(0, d - 1))].map((_, i) => { const start = add(P_left, vY, i+1); const end = add(start, vZ, h); return <line key={`lx-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(Math.max(0, h - 1))].map((_, i) => { const start = add(P_left, vZ, i+1); const end = add(start, vY, d); return <line key={`lz-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {/* Right Face Lines */}
        {[...Array(Math.max(0, w - 1))].map((_, i) => { const start = add(P_right, vX, i+1); const end = add(start, vZ, h); return <line key={`rx-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {[...Array(Math.max(0, h - 1))].map((_, i) => { const start = add(P_front, vZ, i+1); const end = add(P_right, vZ, i+1); return <line key={`rz-${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
      </g>
    </svg>
  );
}

export const BlockOne = ({ className, scale = 1.5 }: { className?: string; scale?: number }) => <IsoBlock w={1} d={1} h={1} type="one" className={className} scale={scale} />;
export const BlockTen = ({ className, scale = 1.2 }: { className?: string; scale?: number }) => <IsoBlock w={10} d={1} h={1} type="ten" className={className} scale={scale} />;
export const BlockHundred = ({ className, scale = 1.0 }: { className?: string; scale?: number }) => <IsoBlock w={10} d={10} h={1} type="hundred" className={className} scale={scale} />;
export const BlockThousand = ({ className, scale = 0.9 }: { className?: string; scale?: number }) => <IsoBlock w={10} d={10} h={10} type="thousand" className={className} scale={scale} />;

