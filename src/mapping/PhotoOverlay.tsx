import { useEffect, useRef, useState } from "react";
import { useApp } from "../common/AppContext";
import { photoRect } from "./photoCamera";
import { colorForConfidence } from "./confidence";
import { useView } from "./useMappingData";

/** The size of an element, kept up to date. */
const useSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
};

/**
 * A mapping session's photo over the 3D view, fitted inside it, with the
 * LEDs the camera found and the points picked so far. While picking a photo
 * point it takes the click; otherwise clicks go through to the view.
 */
export function PhotoOverlay() {
  const app = useApp();
  const tool = app.tool.kind === "mapping" ? app.tool : null;
  const view = useView(tool?.sessionKey ?? null, tool?.viewName ?? null);
  const { ref, size } = useSize();
  const mapping = app.mapping;

  const aspect = view ? view.imageWidth / view.imageHeight : 1;
  const rect = photoRect(size.width || 1, size.height || 1, aspect);
  const picking = tool?.step.kind === "pickPhoto";
  const pickingHouse = tool?.step.kind === "pickMesh";

  return (
    <div
      ref={ref}
      data-testid="photo-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {tool && view?.photoUrl ? (
        <div
          style={{
            position: "absolute",
            ...rect,
            pointerEvents: picking ? "auto" : "none",
            cursor: picking ? "crosshair" : undefined,
          }}
          onClick={(e) => {
            if (!picking) return;
            const box = e.currentTarget.getBoundingClientRect();
            app.sendTool({
              kind: "PHOTO_POINT",
              image: {
                u: (e.clientX - box.left) / box.width,
                v: (e.clientY - box.top) / box.height,
              },
            });
          }}
        >
          <img
            src={view.photoUrl}
            alt={`The ${view.name} view's photo of the house`}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              // Fainter while picking the house point, so the house shows.
              opacity: pickingHouse ? mapping.opacity * 0.4 : mapping.opacity,
            }}
          />
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
          >
            {mapping.showCapturedDots
              ? view.strings.flatMap((s) =>
                  s.points.map((point, index) =>
                    point ? (
                      <ellipse
                        key={`${s.nodeKey}-${index}`}
                        cx={point.u}
                        cy={point.v}
                        rx={2.5 / rect.width}
                        ry={2.5 / rect.height}
                        fill={colorForConfidence(point.confidence)}
                      />
                    ) : null,
                  ),
                )
              : null}
            {[
              ...tool.pairs.map((pair) => pair.image),
              ...(tool.step.kind === "pickMesh" ? [tool.step.image] : []),
            ].map((image, i) => (
              <ellipse
                key={`pair-${i}`}
                cx={image.u}
                cy={image.v}
                rx={6 / rect.width}
                ry={6 / rect.height}
                fill="none"
                stroke="#00e0ff"
                strokeWidth={2 / rect.height}
              />
            ))}
          </svg>
          {tool.pairs.map((pair, i) => (
            <div
              key={`label-${i}`}
              style={{
                position: "absolute",
                left: `${pair.image.u * 100}%`,
                top: `${pair.image.v * 100}%`,
                transform: "translate(8px, -18px)",
                color: "#00e0ff",
                fontSize: 12,
                fontWeight: 700,
                textShadow: "0 0 3px #000",
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
