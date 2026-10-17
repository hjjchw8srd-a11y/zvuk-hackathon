import { useMemo } from "react";
import { generateQRCodeMatrix } from "@/lib/qrcode.js";

/**
 * Renders a standard, scannable QR Code as a vector SVG.
 *
 * @param {Object} props
 * @param {string} props.value - Text or URL to encode in the QR code
 * @param {number} [props.size=80] - Size in pixels (width and height)
 * @param {string} [props.fgColor="#000000"] - Foreground color of dark modules
 * @param {string} [props.bgColor="#ffffff"] - Background color (set "transparent" to skip)
 * @param {number} [props.margin=2] - Quiet zone margin in modules
 * @param {string} [props.className=""] - Additional CSS classes
 */
export function QRCode({
  value,
  size = 80,
  fgColor = "#000000",
  bgColor = "#ffffff",
  margin = 2,
  className = "",
}) {
  const { matrix, viewBoxSize } = useMemo(() => {
    if (!value) return { matrix: [], viewBoxSize: 0 };
    try {
      const m = generateQRCodeMatrix(value, "M");
      const vSize = m.length + margin * 2;
      return { matrix: m, viewBoxSize: vSize };
    } catch (e) {
      console.warn("Failed to generate QR code for value:", value, e);
      return { matrix: [], viewBoxSize: 0 };
    }
  }, [value, margin]);

  if (!matrix.length) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-neutral-800 text-xs text-neutral-400 rounded-lg ${className}`}
      >
        —
      </div>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      shapeRendering="crispEdges"
      className={className}
      aria-label="QR-код"
      role="img"
    >
      {bgColor && bgColor !== "transparent" && (
        <rect width={viewBoxSize} height={viewBoxSize} fill={bgColor} />
      )}
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={c + margin}
              y={r + margin}
              width={1}
              height={1}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
}

export default QRCode;
