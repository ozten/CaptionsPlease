import React, { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCurrentFrame, getRemotionEnvironment } from "remotion";
import { CaptionTimingData, CaptionPosition, PositionKeyframe } from "../types";

interface ControlPanelProps {
  captionData: CaptionTimingData;
  position: CaptionPosition;
  keyframes: PositionKeyframe[];
  onPositionChange: (position: CaptionPosition) => void;
  onKeyframesChange: (keyframes: PositionKeyframe[]) => void;
  onEmphasisToggle: (wordIndex: number) => void;
  onBackToProjects?: () => void;
  projectName?: string;
}

const SAVE_SERVER_URL = "http://localhost:3333/save";

export const ControlPanel: React.FC<ControlPanelProps> = ({
  captionData,
  position,
  keyframes,
  onPositionChange,
  onKeyframesChange,
  onEmphasisToggle,
  onBackToProjects,
  projectName,
}) => {
  const currentFrame = useCurrentFrame();
  const environment = getRemotionEnvironment();
  const [activeTab, setActiveTab] = useState<"position" | "keyframes" | "emphasis">("position");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Create portal container on mount
  useEffect(() => {
    const containerId = "caption-control-panel-root";
    let container = document.getElementById(containerId);

    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      document.body.appendChild(container);
    }

    setPortalContainer(container);

    return () => {
      // Don't remove on unmount - other instances might use it
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const response = await fetch(SAVE_SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionKeyframes: keyframes,
          position: position,
        }),
      });
      if (response.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch (e) {
      console.error("Save failed:", e);
      setSaveStatus("error");
    }
  }, [keyframes, position]);

  const handleAddKeyframe = useCallback(() => {
    const newKeyframe: PositionKeyframe = {
      frame: currentFrame,
      x: Math.round(position.x),
      y: Math.round(position.y),
    };
    const filtered = keyframes.filter((k) => k.frame !== currentFrame);
    const updated = [...filtered, newKeyframe].sort((a, b) => a.frame - b.frame);
    onKeyframesChange(updated);
  }, [currentFrame, position, keyframes, onKeyframesChange]);

  const handleDeleteKeyframe = useCallback((frame: number) => {
    const updated = keyframes.filter((k) => k.frame !== frame);
    onKeyframesChange(updated);
  }, [keyframes, onKeyframesChange]);

  const handleUpdateKeyframe = useCallback((frame: number, x: number, y: number) => {
    const updated = keyframes.map((k) =>
      k.frame === frame ? { ...k, x, y } : k
    );
    onKeyframesChange(updated);
  }, [keyframes, onKeyframesChange]);

  const frameToTime = (frame: number) => {
    const seconds = frame / captionData.fps;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  const saveButtonText = {
    idle: `SAVE (${keyframes.length} keyframes)`,
    saving: "Saving...",
    saved: "Saved!",
    error: "Error - Retry",
  }[saveStatus];

  // Never render controls during actual video rendering
  // Don't render until portal container is ready
  if (environment.isRendering || !portalContainer) {
    return null;
  }

  const panel = (
    <div style={panelStyle}>
      {/* Project header with back button */}
      {onBackToProjects && (
        <div style={projectHeaderStyle}>
          <button style={backButtonStyle} onClick={onBackToProjects}>
            ← Projects
          </button>
          {projectName && <span style={projectNameStyle}>{projectName}</span>}
        </div>
      )}

      {/* Save button - always visible */}
      <button
        style={{
          ...saveButtonStyle,
          backgroundColor: saveStatus === "saved" ? "#00CC66" :
                          saveStatus === "error" ? "#CC4444" : "#00FF88",
        }}
        onClick={handleSave}
        disabled={saveStatus === "saving"}
      >
        {saveButtonText}
      </button>

      <div style={headerStyle}>
        Frame: {currentFrame} ({frameToTime(currentFrame)})
      </div>

      <div style={tabsStyle}>
        <button
          style={activeTab === "position" ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab("position")}
        >
          Position
        </button>
        <button
          style={activeTab === "keyframes" ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab("keyframes")}
        >
          Keyframes ({keyframes.length})
        </button>
        <button
          style={activeTab === "emphasis" ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab("emphasis")}
        >
          Emphasis
        </button>
      </div>

      {activeTab === "position" && (
        <div style={contentStyle}>
          <div style={sliderRowStyle}>
            <label style={labelStyle}>X: {position.x.toFixed(0)}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={position.x}
              onChange={(e) =>
                onPositionChange({ ...position, x: Number(e.target.value) })
              }
              style={sliderStyle}
            />
          </div>
          <div style={sliderRowStyle}>
            <label style={labelStyle}>Y: {position.y.toFixed(0)}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={position.y}
              onChange={(e) =>
                onPositionChange({ ...position, y: Number(e.target.value) })
              }
              style={sliderStyle}
            />
          </div>
          <button style={addButtonStyle} onClick={handleAddKeyframe}>
            + Add Keyframe at Frame {currentFrame}
          </button>
        </div>
      )}

      {activeTab === "keyframes" && (
        <div style={contentStyle}>
          {keyframes.length === 0 ? (
            <div style={emptyStyle}>
              No keyframes yet. Use Position tab to add.
            </div>
          ) : (
            <div style={keyframeListStyle}>
              {keyframes.map((kf) => (
                <div key={kf.frame} style={keyframeItemStyle}>
                  <div style={keyframeHeaderStyle}>
                    <span style={keyframeTimeStyle}>
                      Frame {kf.frame} ({frameToTime(kf.frame)})
                    </span>
                    <button
                      style={deleteButtonStyle}
                      onClick={() => handleDeleteKeyframe(kf.frame)}
                    >
                      ×
                    </button>
                  </div>
                  <div style={keyframeControlsStyle}>
                    <label style={smallLabelStyle}>X: {kf.x}</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={kf.x}
                      onChange={(e) =>
                        handleUpdateKeyframe(kf.frame, Number(e.target.value), kf.y)
                      }
                      style={smallSliderStyle}
                    />
                    <label style={smallLabelStyle}>Y: {kf.y}</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={kf.y}
                      onChange={(e) =>
                        handleUpdateKeyframe(kf.frame, kf.x, Number(e.target.value))
                      }
                      style={smallSliderStyle}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "emphasis" && (
        <div style={contentStyle}>
          <div style={wordListStyle}>
            {/* Use words from pages (source of truth for rendering) instead of allWords */}
            {captionData.pages.flatMap((page) => page.words).map((word, idx) => (
              <span
                key={`${word.originalIndex}-${idx}`}
                style={{
                  ...wordChipStyle,
                  backgroundColor: word.isEmphasis ? "#00FF88" : "#444",
                  color: word.isEmphasis ? "#000" : "#fff",
                }}
                onClick={() => onEmphasisToggle(word.originalIndex)}
                title={`Click to toggle (index: ${word.originalIndex})`}
              >
                {word.word}
              </span>
            ))}
          </div>
          <div style={hintStyle}>
            Green = emphasized. Click to toggle.
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(panel, portalContainer);
};

// Styles
const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 50,
  left: 290,
  width: 300,
  backgroundColor: "#1a1a1a",
  borderRadius: 8,
  padding: 16,
  fontFamily: "system-ui, sans-serif",
  fontSize: 15,
  color: "#fff",
  zIndex: 99999,
  maxHeight: "calc(100vh - 120px)",
  overflowY: "auto",
  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
  border: "1px solid #333",
};

const saveButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  backgroundColor: "#00FF88",
  border: "none",
  borderRadius: 6,
  color: "#000",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 15,
  marginBottom: 16,
};

const headerStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#888",
  marginBottom: 12,
  textAlign: "center",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 16,
};

const tabStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  backgroundColor: "#333",
  border: "none",
  borderRadius: 6,
  color: "#aaa",
  cursor: "pointer",
  fontSize: 13,
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  backgroundColor: "#00FF88",
  color: "#000",
  fontWeight: 600,
};

const contentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const sliderRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#aaa",
};

const sliderStyle: React.CSSProperties = {
  width: "100%",
  height: 24,
  accentColor: "#00FF88",
};

const addButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  backgroundColor: "#444",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#666",
  textAlign: "center",
  padding: 20,
};

const keyframeListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxHeight: 300,
  overflowY: "auto",
};

const keyframeItemStyle: React.CSSProperties = {
  backgroundColor: "#222",
  borderRadius: 6,
  padding: 12,
};

const keyframeHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
};

const keyframeTimeStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#00FF88",
  fontWeight: 600,
};

const deleteButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  backgroundColor: "#ff4444",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
};

const keyframeControlsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "50px 1fr",
  gap: 8,
  alignItems: "center",
};

const smallLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#888",
};

const smallSliderStyle: React.CSSProperties = {
  width: "100%",
  accentColor: "#00FF88",
  height: 20,
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  textAlign: "center",
  marginTop: 8,
};

const wordListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  maxHeight: 350,
  overflowY: "auto",
  padding: 4,
};

const wordChipStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.15s",
};

const projectHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
  paddingBottom: 12,
  borderBottom: "1px solid #333",
};

const backButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "#333",
  border: "none",
  borderRadius: 6,
  color: "#00FF88",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const projectNameStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#888",
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
