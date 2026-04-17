import type { SVGProps } from 'react';

type CatRole = 'seller' | 'buyer';

interface PixelCatProps extends SVGProps<SVGSVGElement> {
  role: CatRole;
}

/**
 * Hand-drawn pixel cat on a 16x16 grid, upscaled via SVG.
 * Seller cat = cream/accent. Buyer cat = pink/soft.
 * Facing direction is flipped for buyer so the two cats face each other.
 */
export function PixelCat({ role, className, ...props }: PixelCatProps) {
  const body = role === 'seller' ? '#FFD700' : '#FFC3C3';
  const shade = role === 'seller' ? '#CCAC00' : '#E89292';
  const ink = '#353B51';

  // 16x16 grid, facing right by default
  const pixels: Array<[number, number, string]> = [
    // ears
    [2, 3, ink], [3, 3, body], [4, 3, ink],
    [10, 3, ink], [11, 3, body], [12, 3, ink],
    // head row 4
    [3, 4, ink], [4, 4, body], [5, 4, body], [6, 4, body], [7, 4, body], [8, 4, body], [9, 4, body], [10, 4, body], [11, 4, ink],
    // head row 5 (eyes)
    [3, 5, ink], [4, 5, body], [5, 5, ink], [6, 5, body], [7, 5, body], [8, 5, body], [9, 5, ink], [10, 5, body], [11, 5, ink],
    // head row 6 (cheeks + nose)
    [3, 6, ink], [4, 6, body], [5, 6, body], [6, 6, body], [7, 6, ink], [8, 6, body], [9, 6, body], [10, 6, body], [11, 6, ink],
    // head row 7 (mouth)
    [3, 7, ink], [4, 7, body], [5, 7, body], [6, 7, body], [7, 7, body], [8, 7, body], [9, 7, body], [10, 7, body], [11, 7, ink],
    // neck
    [4, 8, ink], [5, 8, body], [6, 8, body], [7, 8, body], [8, 8, body], [9, 8, body], [10, 8, ink],
    // body
    [3, 9, ink], [4, 9, body], [5, 9, body], [6, 9, shade], [7, 9, body], [8, 9, body], [9, 9, body], [10, 9, body], [11, 9, ink],
    [3, 10, ink], [4, 10, body], [5, 10, body], [6, 10, shade], [7, 10, shade], [8, 10, body], [9, 10, body], [10, 10, body], [11, 10, ink],
    [3, 11, ink], [4, 11, body], [5, 11, body], [6, 11, body], [7, 11, body], [8, 11, body], [9, 11, body], [10, 11, body], [11, 11, ink],
    [3, 12, ink], [4, 12, body], [5, 12, body], [6, 12, body], [7, 12, body], [8, 12, body], [9, 12, body], [10, 12, body], [11, 12, ink],
    // legs
    [3, 13, ink], [4, 13, body], [5, 13, ink], [6, 13, body], [7, 13, body], [8, 13, body], [9, 13, ink], [10, 13, body], [11, 13, ink],
    [3, 14, ink], [4, 14, ink], [9, 14, ink], [10, 14, ink], [11, 14, ink],
    // tail (right side)
    [12, 8, ink], [12, 9, body], [13, 9, body], [13, 10, ink], [12, 10, ink],
  ];

  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      style={{ transform: role === 'buyer' ? 'scaleX(-1)' : undefined }}
      aria-hidden="true"
      {...props}
    >
      {pixels.map(([x, y, c], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={c} />
      ))}
    </svg>
  );
}
