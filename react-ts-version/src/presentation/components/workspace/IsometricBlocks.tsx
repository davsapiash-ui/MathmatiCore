

// Isometric Grid Configuration
const DX = 7;
const DY = -3.5;
const DZ = -8;

interface Point { x: number; y: number; }

const getPoint = (x: number, y: number, z: number): Point => ({
  x: x * DX + y * -DX,
  y: x * DY + y * DY + z * DZ,
});

const formatPolygon = (p1: Point, p2: Point, p3: Point, p4: Point) => 
  `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`;

interface BlockColors {
  top: string;
  front: string; // Right face
  side: string;  // Left face
}

const COLORS: Record<string, BlockColors> = {
  one: { top: '#FFFFFF', front: '#FFFDD0', side: '#E6E4BB' },
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
}

export function IsoBlock({ w = 1, d = 1, h = 1, type, className = '' }: BlockProps) {
  const colors = COLORS[type];

  // Vertices
  const p0 = getPoint(0, 0, 0); // Bottom Front
  const pX = getPoint(w, 0, 0); // Bottom Right
  const pY = getPoint(0, d, 0); // Bottom Left

  const pZ = getPoint(0, 0, h); // Top Front
  const pXZ = getPoint(w, 0, h); // Top Right
  const pYZ = getPoint(0, d, h); // Top Left
  const pXYZ = getPoint(w, d, h); // Top Back

  const leftFace = formatPolygon(p0, pY, pYZ, pZ);
  const rightFace = formatPolygon(p0, pX, pXZ, pZ);
  const topFace = formatPolygon(pZ, pXZ, pXYZ, pYZ);

  const minX = pYZ.x - 2; 
  const maxX = pXZ.x + 2;
  const minY = pXYZ.y - 2;
  const maxY = p0.y + 2;
  
  const width = maxX - minX;
  const height = maxY - minY;

  // Grid Lines
  const gridLines = [];
  
  if (type === 'ten' && h === 10) {
    for (let i = 1; i < 10; i++) {
      const zLine = getPoint(0, 0, i);
      const zLineLeft = getPoint(0, 1, i);
      const zLineRight = getPoint(1, 0, i);
      
      gridLines.push(<line key={`l1-${i}`} x1={zLine.x} y1={zLine.y} x2={zLineLeft.x} y2={zLineLeft.y} stroke="rgba(255,255,255,0.4)" strokeWidth="0.75" />);
      gridLines.push(<line key={`l2-${i}`} x1={zLine.x} y1={zLine.y} x2={zLineRight.x} y2={zLineRight.y} stroke="rgba(255,255,255,0.4)" strokeWidth="0.75" />);
    }
  }

  if (type === 'hundred' && w === 10 && d === 10) {
    for (let i = 1; i < 10; i++) {
      const p1X = getPoint(i, 0, 1);
      const p2X = getPoint(i, 10, 1);
      gridLines.push(<line key={`hx-${i}`} x1={p1X.x} y1={p1X.y} x2={p2X.x} y2={p2X.y} stroke="rgba(255,255,255,0.3)" strokeWidth="0.75" />);
      
      const p1Y = getPoint(0, i, 1);
      const p2Y = getPoint(10, i, 1);
      gridLines.push(<line key={`hy-${i}`} x1={p1Y.x} y1={p1Y.y} x2={p2Y.x} y2={p2Y.y} stroke="rgba(255,255,255,0.3)" strokeWidth="0.75" />);
    }
  }

  return (
    <svg 
      className={`overflow-visible drop-shadow-md ${className}`} 
      viewBox={`${minX} ${minY} ${width} ${height}`}
      style={{ width: `${width * 2}px`, height: `${height * 2}px` }}
    >
      <polygon points={leftFace} fill={colors.side} />
      <polygon points={rightFace} fill={colors.front} />
      <polygon points={topFace} fill={colors.top} />
      {gridLines}
    </svg>
  );
}

export const BlockOne = ({ className }: { className?: string }) => <IsoBlock w={1} d={1} h={1} type="one" className={className} />;
export const BlockTen = ({ className }: { className?: string }) => <IsoBlock w={1} d={1} h={10} type="ten" className={className} />;
export const BlockHundred = ({ className }: { className?: string }) => <IsoBlock w={10} d={10} h={1} type="hundred" className={className} />;
export const BlockThousand = ({ className }: { className?: string }) => <IsoBlock w={10} d={10} h={10} type="thousand" className={className} />;
